import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { shimmerDuration } from '../services/CPUAccelerator';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Mic, MicOff, ChevronDown, CheckCircle2, Menu, ImagePlus, ExternalLink, X, ThumbsUp, ThumbsDown, FileText, Download, Bell } from 'lucide-react';
import { reportFeedback } from '../services/BrainService';
import { trackSuccess, trackError } from '../services/Analytics';
import { IS_ELECTRON } from '../services/Platform';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { InlineStarSphere } from './InlineStarSphere';
import { PlatformSidebar } from './PlatformSidebar';
import { StarSphereLoader } from './StarSphereLoader';
import { ChatThreadMeta } from '../services/ChatStorage';
import { UserProfile } from '../services/UserProfile';

interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  action?: any;
  isBrowserFeedback?: boolean;
  responseTimeMs?: number;
  imageBase64?: string;
  imagePreview?: string;
  sources?: WebSource[];
  followUps?: string[];
  generatedImage?: string;
  brainEntryId?: string;
  pdfDownload?: { url: string; filename: string };
}

interface PlatformViewProps {
  messages: Message[];
  onSubmit: (text: string, imageBase64?: string, imagePreview?: string) => void;
  voiceTranscript?: string;
  onVoiceTranscriptConsumed?: () => void;
  isAgentWorking: boolean;
  isListening: boolean;
  handleVoiceToggle: () => void;
  onOpenBrowser: () => void;
  agentMode?: 'chat' | 'browser' | null;
  chatThreads: ChatThreadMeta[];
  currentThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  userProfile: UserProfile | null;
  onEditProfile: () => void;
  onAddNewProfile: () => void;
  onOpenSettings: () => void;
  onOpenScheduler?: () => void;
  onOpenWorkspace?: () => void;
  onOpenVoiceChat?: () => void;
  onOpenApps?: () => void;
  onOpenGameGen?: () => void;
  onOpenOrbits?: () => void;
  orbitUnreadCount?: number;
  orbitThreadIds?: Set<string>;
  orbitTotalCount?: number;
  onSchedule?: (text: string) => void;
  agentStep?: number;
  agentTotalSteps?: number;
  agentCurrentAction?: string;
  onStopAgent?: () => void;
  /** Open a URL inside Bleumr's browser tab instead of externally */
  onNavigateInternal?: (url: string) => void;
}

// Memoised message row — only re-renders if its own content changes
const MessageRow = memo(function MessageRow({
  msg,
  isLatestAssistant = false,
  isWorking = false,
  onRetry,
  onFollowUp,
  onNavigateInternal,
}: {
  msg: Message;
  isLatestAssistant?: boolean;
  isWorking?: boolean;
  onRetry?: () => void;
  onFollowUp?: (q: string) => void;
  onNavigateInternal?: (url: string) => void;
}) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = React.useState(false);
  const [feedbackGiven, setFeedbackGiven] = React.useState<'up' | 'down' | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      // Clipboard write denied (PWA without user gesture) — silent fail
    });
  };

  if (msg.role === 'system' && !msg.isBrowserFeedback) return null;
  if (msg.role === 'system') {
    if (!msg.content.includes('Result:') && !msg.content.includes('Auto-corrected')) return null;
  }

  let displayContent = msg.content;
  if (msg.role === 'assistant' && msg.action) {
    if (msg.action.action === 'reply') {
      displayContent = msg.action.message;
    } else {
      return null;
    }
  }
  if (!displayContent) return null;
  displayContent = displayContent.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
  // Strip PDF tags so raw JSON isn't shown in chat
  displayContent = displayContent.replace(/<pdf>[\s\S]*?<\/pdf>/gi, '').trim();
  if (!displayContent) return null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] text-base leading-relaxed ${
        isUser
          ? 'bg-white/10 text-white rounded-3xl px-5 py-3'
          : 'text-slate-300'
      }`}>
        {isUser ? (
          <div className="flex flex-col gap-2">
            {(msg.imagePreview || msg.imageBase64) && (
              <img
                src={msg.imagePreview || `data:image/jpeg;base64,${msg.imageBase64}`}
                alt="attached"
                className="max-w-[220px] rounded-2xl border border-white/10 object-cover"
              />
            )}
            {displayContent && <span>{displayContent}</span>}
          </div>
        ) : (
          <div className="flex gap-4">
            <div
              className="shrink-0 mt-1 flex items-center justify-center transition-all duration-500 ease-out"
              style={{
                width: isLatestAssistant ? 32 : 16,
                height: isLatestAssistant ? 32 : 16,
                borderRadius: '50%',
                background: isLatestAssistant ? 'rgba(30,58,138,0.5)' : 'transparent',
                border: isLatestAssistant ? '1px solid rgba(59,130,246,0.2)' : 'none',
                transform: isWorking ? 'translateX(6px)' : 'translateX(0)',
                animation: isWorking ? 'spin 3s linear infinite' : 'none',
                marginTop: isLatestAssistant ? 4 : 12,
              }}
            >
              <InlineStarSphere size={32} active={isLatestAssistant} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="pt-1 prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-code:text-indigo-300 prose-headings:text-white prose-strong:text-white prose-table:text-sm prose-td:border prose-td:border-white/10 prose-th:border prose-th:border-white/10">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Render [1], [2] etc. as inline source badges
                    p({ children }: any) {
                      if (!msg.sources?.length) return <p>{children}</p>;
                      const processChildren = (kids: any): any => {
                        if (!Array.isArray(kids)) kids = [kids];
                        return kids.map((child: any, i: number) => {
                          if (typeof child !== 'string') return child;
                          const parts = child.split(/(\[\d+\])/g);
                          if (parts.length === 1) return child;
                          return parts.map((part: string, j: number) => {
                            const refMatch = part.match(/^\[(\d+)\]$/);
                            if (!refMatch) return part;
                            const idx = parseInt(refMatch[1]) - 1;
                            const src = msg.sources?.[idx];
                            if (!src) return part;
                            const domain = (() => { try { return new URL(src.url).hostname.replace('www.', ''); } catch { return ''; } })();
                            return (
                              <a
                                key={`${i}-${j}`}
                                href={src.url}
                                onClick={(e) => { e.preventDefault(); handleNavigate(src.url); }}
                                className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0 rounded-md bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.12] text-[10px] text-slate-400 hover:text-white transition-colors align-baseline no-underline cursor-pointer"
                                title={src.title}
                              >
                                <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" className="w-3 h-3 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                {domain.split('.').slice(-2, -1)[0] || domain}
                              </a>
                            );
                          });
                        });
                      };
                      return <p>{processChildren(children)}</p>;
                    },
                    a({ href, children, ...props }: any) {
                      return (
                        <a
                          href={href}
                          onClick={(e) => { if (href) { e.preventDefault(); handleNavigate(href); } }}
                          className="text-sky-400 hover:text-sky-300 underline cursor-pointer"
                          title={href}
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    },
                    code({ node, className, children, ...props }: any) {
                      const language = /language-(\w+)/.exec(className || '')?.[1] ?? '';
                      const isBlock = !props.inline;
                      const code = String(children).replace(/\n$/, '');
                      const isHtml = isBlock && (language === 'html' || (language === '' && code.trimStart().startsWith('<!DOCTYPE') || code.trimStart().startsWith('<html')));
                      if (isHtml) {
                        const openInBrowser = () => {
                          const tmpPath = `/tmp/orbit-preview-${Date.now()}.html`;
                          (window as any).orbit?.writeFile?.(tmpPath, code).then(() => {
                            (window as any).orbit?.browser?.open?.(`file://${tmpPath}`);
                          });
                        };
                        return (
                          <div className="not-prose relative rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]">
                            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/[0.03]">
                              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">HTML</span>
                              <button
                                onClick={openInBrowser}
                                className="flex items-center gap-1.5 text-[11px] text-sky-400 hover:text-sky-300 transition-colors font-medium"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open in Browser
                              </button>
                            </div>
                            <pre className="overflow-x-auto p-4 text-xs text-slate-300 font-mono leading-relaxed"><code>{code}</code></pre>
                          </div>
                        );
                      }
                      return isBlock
                        ? <pre className="overflow-x-auto rounded-lg bg-white/5 border border-white/10 p-4"><code className={className} {...props}>{children}</code></pre>
                        : <code className="text-indigo-300 bg-white/5 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>;
                    },
                  }}
                >{displayContent}</ReactMarkdown>
              </div>
              {msg.generatedImage && (
                <img
                  src={msg.generatedImage}
                  alt="Generated image"
                  className="rounded-xl max-w-full max-h-[512px] object-contain border border-white/10 shadow-lg mt-2"
                />
              )}
              {/* PDF Download Link */}
              {msg.pdfDownload && (
                <a
                  href={msg.pdfDownload.url}
                  download={msg.pdfDownload.filename}
                  className="flex items-center gap-3 mt-2 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all duration-200 group cursor-pointer no-underline"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-500/20 group-hover:bg-indigo-500/30 transition-colors">
                    <FileText className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="text-sm font-medium text-white truncate">{msg.pdfDownload.filename}</span>
                    <span className="text-[10px] text-slate-500">PDF Document — tap to download</span>
                  </div>
                  <Download className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                </a>
              )}
              {msg.responseTimeMs != null && (
                <div className="flex items-center gap-3 mt-0.5">
                  {/* Timer */}
                  <div className="flex items-center gap-1 text-[10px] text-slate-600 font-mono select-none">
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="opacity-50">
                      <circle cx="4.5" cy="4.5" r="3.5" stroke="currentColor" strokeWidth="1"/>
                      <path d="M4.5 2.5V4.5L5.8 5.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                    <span>{(msg.responseTimeMs / 1000).toFixed(1)}s</span>
                  </div>

                  {/* Copy */}
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors select-none"
                    title="Copy response"
                  >
                    {copied ? (
                      <>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="3.5" y="1" width="5.5" height="7" rx="1" stroke="currentColor" strokeWidth="1"/><rect x="1" y="3" width="5.5" height="7" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  {/* Retry */}
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors select-none"
                      title="Retry"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M8.5 5A3.5 3.5 0 1 1 6.5 2M6.5 1v2.5H9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span>Retry</span>
                    </button>
                  )}

                  {/* Thumbs Up / Down feedback */}
                  {!isUser && (
                    <>
                      <button
                        onClick={() => {
                          setFeedbackGiven('up');
                          if (msg.brainEntryId) reportFeedback(msg.brainEntryId, 'thumbs_up');
                          trackSuccess('feedback', 'thumbs_up');
                        }}
                        className={`flex items-center gap-0.5 text-[10px] transition-colors select-none ${
                          feedbackGiven === 'up' ? 'text-emerald-400' : 'text-slate-600 hover:text-emerald-400'
                        }`}
                        title="Good response"
                        disabled={feedbackGiven !== null}
                      >
                        <ThumbsUp size={10} />
                      </button>
                      <button
                        onClick={() => {
                          setFeedbackGiven('down');
                          if (msg.brainEntryId) reportFeedback(msg.brainEntryId, 'thumbs_down');
                          trackError('feedback', 'thumbs_down', msg.content?.slice(0, 100));
                        }}
                        className={`flex items-center gap-0.5 text-[10px] transition-colors select-none ${
                          feedbackGiven === 'down' ? 'text-red-400' : 'text-slate-600 hover:text-red-400'
                        }`}
                        title="Bad response"
                        disabled={feedbackGiven !== null}
                      >
                        <ThumbsDown size={10} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Web Sources — icon only */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {msg.sources.map((src, i) => {
                    const domain = (() => { try { return new URL(src.url).hostname.replace('www.', ''); } catch { return src.url; } })();
                    return (
                      <a
                        key={i}
                        href={src.url}
                        onClick={(e) => { e.preventDefault(); handleNavigate(src.url); }}
                        title={src.title || domain}
                        className="w-6 h-6 rounded-full bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                          alt={domain}
                          className="w-3.5 h-3.5 rounded-sm"
                          onError={(e) => { (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='7' fill='%23334155'/><text x='8' y='12' text-anchor='middle' font-size='10' fill='white'>${domain.charAt(0).toUpperCase()}</text></svg>`; }}
                        />
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Follow-up Questions */}
              {msg.followUps && msg.followUps.length > 0 && onFollowUp && (
                <div className="flex flex-col gap-1.5 mt-3">
                  {msg.followUps.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => onFollowUp(q)}
                      className="flex items-center gap-2 text-left text-[12px] text-slate-400 hover:text-white px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.10] transition-all duration-150"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-40">
                        <path d="M4 8l2.5-2L4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export const PlatformView = memo(function PlatformView({
  messages,
  onSubmit,
  voiceTranscript,
  onVoiceTranscriptConsumed,
  isAgentWorking,
  isListening,
  handleVoiceToggle,
  onOpenBrowser,
  agentMode,
  chatThreads,
  currentThreadId,
  onNewChat,
  onSelectThread,
  onDeleteThread,
  userProfile,
  onEditProfile,
  onAddNewProfile,
  onOpenSettings,
  onOpenScheduler,
  onOpenWorkspace,
  onOpenVoiceChat,
  onOpenApps,
  onOpenGameGen,
  onOpenOrbits,
  orbitUnreadCount = 0,
  orbitThreadIds,
  orbitTotalCount = 0,
  onSchedule,
  agentStep = 0,
  agentTotalSteps = 50,
  agentCurrentAction = '',
  onStopAgent,
  onNavigateInternal,
}: PlatformViewProps) {
  // ── Mini in-app browser (PWA) — opens source pages without leaving chat ──
  const [miniBrowserUrl, setMiniBrowserUrl] = useState<string | null>(null);
  const [miniBrowserLoading, setMiniBrowserLoading] = useState(false);

  const handleNavigate = (url: string) => {
    if (IS_ELECTRON) {
      // Electron: use native WebContentsView tabs
      onNavigateInternal?.(url);
    } else {
      // PWA: open mini browser overlay
      setMiniBrowserUrl(url);
      setMiniBrowserLoading(true);
    }
  };

  // ── Local input state — typing never touches App.tsx ──
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<{ base64: string; preview: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const liveAgent = 'JUMARI 1.0';
  const comingSoonAgents = ['Juzae Pro v1', 'Khali Proactive'];
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const userScrolledUpRef = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const hasStartedChat = messages.length > 0;

  // ── Track mobile virtual keyboard via visualViewport API ──
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kbHeight = window.innerHeight - vv.height;
      setKeyboardOffset(kbHeight > 50 ? kbHeight : 0);
      setViewportHeight(vv.height);
      // Auto-scroll chat to bottom when keyboard opens
      if (kbHeight > 50 && chatContainerRef.current && !userScrolledUpRef.current) {
        requestAnimationFrame(() => {
          chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
        });
      }
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Refocus input as soon as JUMARI finishes responding
  useEffect(() => {
    if (!isAgentWorking) {
      inputRef.current?.focus();
      // Reset scroll lock when response finishes so next message scrolls
      userScrolledUpRef.current = false;
    }
  }, [isAgentWorking]);

  // Append voice transcript to local input when App sends one
  useEffect(() => {
    if (voiceTranscript) {
      setInput(prev => prev + (prev ? ' ' : '') + voiceTranscript);
      onVoiceTranscriptConsumed?.();
    }
  }, [voiceTranscript]);

  // Detect if user has scrolled up (don't fight their scroll position)
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUpRef.current = distFromBottom > 150;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll — uses RAF-throttled scrollTop instead of competing scrollIntoView animations
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    if (scrollRafRef.current) return; // already scheduled
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = chatContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if ((!trimmed && !attachedImage) || isAgentWorking) return;
    const img = attachedImage?.base64;
    const imgPreview = attachedImage?.preview;
    setInput('');
    setAttachedImage(null);
    onSubmit(trimmed, img, imgPreview);
  }, [input, attachedImage, isAgentWorking, onSubmit]);

  const handleImageAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the data:image/xxx;base64, prefix — just keep the raw base64
      const base64 = dataUrl.split(',')[1];
      setAttachedImage({ base64, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, []);

  // ── Memoised heavy computations ──────────────────────────────────────────
  // Avoid recreating on every keystroke / state change
  const lastAssistantId = useMemo(
    () => [...messages].reverse().find(m => m.role === 'assistant')?.id,
    [messages]
  );

  // ── Memoised style objects (no GC churn on every render) ─────────────────
  const glowHaloStyle = useMemo<React.CSSProperties>(() => ({
    filter: isFocused
      ? 'drop-shadow(0 0 18px rgba(56,189,248,0.45)) drop-shadow(0 0 40px rgba(56,189,248,0.15))'
      : 'drop-shadow(0 0 4px rgba(56,189,248,0.08))',
    transition: 'filter 0.55s cubic-bezier(0.4,0,0.2,1)',
  }), [isFocused]);

  const borderRingStyle = useMemo<React.CSSProperties>(() => ({
    padding: '1px',
    '--shimmer-duration': shimmerDuration,
    ...(isFocused ? {} : {
      background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(56,189,248,0.05) 50%, rgba(255,255,255,0.02) 100%)',
    }),
    transition: 'background 0.55s cubic-bezier(0.4,0,0.2,1)',
  } as React.CSSProperties), [isFocused, shimmerDuration]);

  const glassFormStyle = useMemo<React.CSSProperties>(() => ({
    background: isFocused ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.02)',
    backdropFilter: 'blur(40px) saturate(180%) brightness(1.1)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(1.1)',
    boxShadow: isFocused
      ? 'inset 0 1.5px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.04)'
      : 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(255,255,255,0.03)',
    transition: 'background 0.55s cubic-bezier(0.4,0,0.2,1), box-shadow 0.55s cubic-bezier(0.4,0,0.2,1)',
  }), [isFocused]);

  const causticRimStyle = useMemo<React.CSSProperties>(() => ({
    background: isFocused
      ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55) 30%, rgba(255,255,255,0.55) 70%, transparent)'
      : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 35%, rgba(255,255,255,0.2) 65%, transparent)',
    filter: 'blur(0.4px)',
    transition: 'background 0.55s',
  }), [isFocused]);

  const inputTextStyle = useMemo<React.CSSProperties>(() => ({
    color: isFocused ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.75)',
  }), [isFocused]);

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] text-slate-200 font-sans overflow-hidden flex selection:bg-indigo-500/30 z-[9999]"
      style={{ height: keyboardOffset > 0 ? viewportHeight : undefined }}>

      {/* Background stars — memoised, never re-renders */}
      <div className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-1000 ${hasStartedChat ? 'opacity-60' : 'opacity-100'}`}>
        <StarSphereLoader />
      </div>

      <PlatformSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenBrowser={onOpenBrowser}
        chatThreads={chatThreads}
        currentThreadId={currentThreadId}
        onNewChat={onNewChat}
        onSelectThread={onSelectThread}
        onDeleteThread={onDeleteThread}
        userProfile={userProfile}
        onEditProfile={onEditProfile}
        onAddNewProfile={onAddNewProfile}
        onOpenSettings={onOpenSettings}
        onOpenScheduler={onOpenScheduler}
        onOpenWorkspace={onOpenWorkspace}
        onOpenVoiceChat={onOpenVoiceChat}
        onOpenApps={onOpenApps}
        onOpenGameGen={onOpenGameGen}
        onOpenOrbits={onOpenOrbits}
        orbitUnreadCount={orbitUnreadCount}
        orbitThreadIds={orbitThreadIds}
        orbitTotalCount={orbitTotalCount}
        onSchedule={(text) => { onSchedule?.(text); }}
      />

      <div className="flex-1 flex flex-col relative z-10 w-full h-full"
        style={{
          paddingTop: IS_ELECTRON ? undefined : 'env(safe-area-inset-top, 0px)',
          paddingBottom: IS_ELECTRON ? undefined : 'env(safe-area-inset-bottom, 0px)',
        }}>
        {/* Top Header */}
        <div className="flex items-center justify-between pr-4 shrink-0" style={{ paddingLeft: IS_ELECTRON ? 80 : 16, paddingTop: IS_ELECTRON ? 16 : 8, paddingBottom: 8, minHeight: IS_ELECTRON ? 64 : undefined }}>
          <div className="flex items-center">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors z-50 text-slate-400 hover:text-white"
              title="Toggle Sidebar"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 z-50" style={{ top: IS_ELECTRON ? 16 : 8 }}>
            <div className="relative">
              <button
                onClick={() => setIsAgentDropdownOpen(!isAgentDropdownOpen)}
                className="flex items-center justify-center gap-1.5 text-[#a1a1aa] hover:text-[#e4e4e7] transition-colors text-xs tracking-widest font-light uppercase cursor-pointer py-1.5 px-3 rounded-full hover:bg-white/5 backdrop-blur-sm"
              >
                <span>{liveAgent}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isAgentDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isAgentDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                    className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-52 flex flex-col z-50 py-1.5"
                    style={{
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)',
                      backdropFilter: 'blur(32px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.2)',
                      willChange: 'transform, opacity',
                    }}
                  >
                    {/* Active agent */}
                    <button
                      onClick={() => setIsAgentDropdownOpen(false)}
                      className="px-4 py-2.5 text-xs tracking-wider text-left flex items-center justify-between transition-colors rounded-xl mx-1"
                      style={{
                        color: 'rgba(165,180,252,0.95)',
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.08) 100%)',
                      }}
                    >
                      {liveAgent}
                      <CheckCircle2 className="w-3.5 h-3.5 opacity-80" />
                    </button>
                    {/* Divider */}
                    <div className="h-px mx-3 my-1" style={{ background: 'rgba(255,255,255,0.07)' }} />
                    {/* Coming soon agents */}
                    {comingSoonAgents.map(agent => (
                      <div
                        key={agent}
                        className="px-4 py-2.5 text-xs tracking-wider flex items-center justify-between cursor-default select-none mx-1 rounded-lg"
                        style={{ color: 'rgba(148,163,184,0.4)' }}
                      >
                        {agent}
                        <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'rgba(148,163,184,0.3)', textTransform: 'uppercase', fontWeight: 500 }}>Soon</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center justify-end w-12 z-50" />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">

          {/* Initial Big Sphere State */}
          <AnimatePresence>
            {!hasStartedChat && (
              <motion.div
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50 pb-32"
              >
                <motion.div
                  layoutId="main-sphere"
                  transition={{ duration: 0.8, type: 'spring', bounce: 0.2 }}
                  className="cursor-pointer pointer-events-auto hover:scale-[1.02] active:scale-[0.98] transition-transform duration-500 ease-out"
                  onClick={IS_ELECTRON ? onOpenBrowser : undefined}
                  title={IS_ELECTRON ? "Open Browser Workspace" : "Bleumr AI"}
                >
                  <InlineStarSphere size={typeof window !== 'undefined' && window.innerWidth < 640 ? 140 : 220} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Top fade mask */}
          {hasStartedChat && (
            <div
              className="absolute top-0 inset-x-0 h-14 pointer-events-none z-10"
              style={{ background: 'linear-gradient(to bottom, #0a0a0a 0%, transparent 100%)' }}
            />
          )}

          {/* Chat Messages */}
          <div
            ref={chatContainerRef}
            className={`flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 lg:px-32 scrollbar-hide transition-opacity duration-500 ${hasStartedChat ? 'opacity-100' : 'opacity-0'}`}
            style={{
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              paddingBottom: keyboardOffset > 0 ? 80 : 128,
              ...(keyboardOffset > 0 ? {} : {
                WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 200px), transparent calc(100% - 110px))',
                maskImage: 'linear-gradient(to bottom, black calc(100% - 200px), transparent calc(100% - 110px))',
              }),
            }}
          >
            <div className="max-w-3xl mx-auto w-full pt-8 flex flex-col gap-6">
              {/* lastAssistantId is memoised above — not recomputed on every render */}
              {(() => {
                return messages.map((msg, idx) => {
                  // Find the user message that triggered this assistant response
                  const prevUserMsg = msg.role === 'assistant'
                    ? [...messages].slice(0, idx).reverse().find(m => m.role === 'user')
                    : undefined;
                  return (
                    <MessageRow
                      key={msg.id}
                      msg={msg}
                      isLatestAssistant={msg.role === 'assistant' && msg.id === lastAssistantId}
                      isWorking={msg.role === 'assistant' && msg.id === lastAssistantId && isAgentWorking}
                      onRetry={msg.role === 'assistant' && msg.responseTimeMs != null && prevUserMsg && !isAgentWorking
                        ? () => onSubmit(prevUserMsg.content, prevUserMsg.imageBase64, prevUserMsg.imagePreview)
                        : undefined}
                      onFollowUp={msg.role === 'assistant' && !isAgentWorking ? (q) => onSubmit(q) : undefined}
                      onNavigateInternal={onNavigateInternal}
                    />
                  );
                });
              })()}

              {(() => {
                // Show "Thinking..." only while waiting for the first real token.
                // Once the assistant message starts streaming, hide it to avoid overlap.
                const lastMsg = messages[messages.length - 1];
                const responseStarted = lastMsg?.role === 'assistant' && !!lastMsg?.content;
                return isAgentWorking && !responseStarted ? (
                  <div className="flex justify-start">
                    <div className="flex gap-4 items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center shrink-0 border border-blue-500/20"
                        style={{ animation: 'spin 3s linear infinite' }}>
                        <InlineStarSphere size={32} active />
                      </div>
                      <div className="flex items-center gap-[3px] h-5">
                        {[0, 1, 2].map(i => (
                          <span
                            key={i}
                            className="inline-block w-[5px] h-[5px] rounded-full bg-slate-400"
                            style={{
                              animation: 'thinkingDot 1.4s ease-in-out infinite',
                              animationDelay: `${i * 0.2}s`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>
        </div>

        {/* ── Agent Status Bar ── */}
        <AnimatePresence>
          {isAgentWorking && agentMode === 'browser' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-2xl select-none"
              style={{
                background: 'rgba(10,10,18,0.85)',
                border: '1px solid rgba(99,102,241,0.25)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.08)',
                willChange: 'transform, opacity',
              }}
            >
              {/* Pulse dot */}
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </span>

              {/* Step counter */}
              <span className="text-[10px] font-mono text-indigo-400 shrink-0">
                {agentStep}/{agentTotalSteps}
              </span>

              {/* Divider */}
              <span className="w-px h-3 bg-white/10 shrink-0" />

              {/* Current action */}
              <span className="text-[11px] text-slate-300 max-w-[200px] truncate">
                {agentCurrentAction || 'Thinking...'}
              </span>

              {/* Stop button */}
              {onStopAgent && (
                <button
                  onClick={onStopAgent}
                  className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-medium text-red-400 hover:text-white hover:bg-red-500/20 transition-colors shrink-0"
                  title="Stop agent"
                >
                  <X className="w-3 h-3" />
                  Stop
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Liquid Glass Input Area ── */}
        <div className="absolute left-0 right-0 bottom-0 w-full px-4 z-30 transition-[padding] duration-200 ease-out" style={{
          paddingTop: keyboardOffset > 0 ? 8 : 16,
          paddingBottom: keyboardOffset > 0 ? 8 : '1.25rem',
          background: keyboardOffset > 0
            ? 'rgba(10,10,10,0.98)'
            : 'linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.6) 50%, transparent 100%)',
        }}>
          <div className="max-w-xl mx-auto w-full px-2 sm:px-0">

            {/* Outer ambient glow halo */}
            <div
              className="relative rounded-full"
              style={glowHaloStyle}
            >
              {/* Gradient border ring — panning shimmer when focused */}
              <div
                className={`rounded-full ${isFocused ? 'orbit-shimmer-border' : ''}`}
                style={borderRingStyle}
              >
                {/* Glass pill body */}
                <form
                  onSubmit={handleSubmit}
                  className="relative flex items-center rounded-full overflow-hidden"
                  style={glassFormStyle}
                >
                  {/* Top caustic rim line */}
                  <div
                    className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none z-0"
                    style={causticRimStyle}
                  />

                  {/* Diagonal glass refraction shimmer */}
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none z-0"
                    style={{
                      background: 'linear-gradient(130deg, rgba(255,255,255,0.06) 0%, transparent 45%, rgba(255,255,255,0.012) 100%)',
                      mixBlendMode: 'overlay',
                    }}
                  />

                  {/* Image attachment preview */}
                  {attachedImage && (
                    <div className="relative ml-3 shrink-0 z-10">
                      <img src={attachedImage.preview} className="w-9 h-9 rounded-lg object-cover border border-white/15" />
                      <button
                        type="button"
                        onClick={() => setAttachedImage(null)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-800 border border-white/20 flex items-center justify-center hover:bg-red-500/80 transition-colors"
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  )}

                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={isListening ? 'Listening...' : attachedImage ? 'Ask about this image...' : 'Ask Anything'}
                    className="relative z-10 w-full bg-transparent text-sm placeholder-white/20 py-2.5 pl-4 pr-28 outline-none disabled:opacity-50 transition-all duration-300"
                    style={inputTextStyle}
                    disabled={isAgentWorking}
                    autoFocus
                  />

                  {/* Hidden file input for images */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageAttach}
                  />

                  <div className="absolute right-2 z-10 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isAgentWorking}
                      className="p-1.5 rounded-full disabled:opacity-50 transition-colors text-white/30 hover:text-sky-300 hover:bg-white/5"
                      title="Attach image"
                    >
                      <ImagePlus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenVoiceChat?.()}
                      disabled={isAgentWorking}
                      className="p-1.5 rounded-full disabled:opacity-50 transition-colors text-white/30 hover:text-indigo-400 hover:bg-indigo-400/10"
                      title="Voice chat"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                    <button
                      type="submit"
                      disabled={(!input.trim() && !attachedImage) || isAgentWorking}
                      className="p-1.5 text-white/30 hover:text-sky-300 hover:bg-white/5 rounded-full disabled:opacity-25 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {keyboardOffset === 0 && (
              <div className="text-center mt-4 text-[9px] text-white/25 tracking-wide">
                JUMARI 1.0 can make mistakes. Verify important information.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Mini In-App Browser (PWA) ─────────────────────────────────── */}
      {miniBrowserUrl && (
        <div className="fixed inset-0 z-[99999] flex flex-col" style={{ background: '#0a0a0a' }}>
          {/* Top bar */}
          <div className="flex items-center gap-3 px-3 shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', paddingBottom: 8, background: '#111118', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {/* Close button */}
            <button
              onClick={() => { setMiniBrowserUrl(null); setMiniBrowserLoading(false); }}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            {/* URL bar */}
            <div className="flex-1 min-w-0 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08]">
              <div className="flex items-center gap-2">
                {miniBrowserLoading && (
                  <div className="w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                <span className="text-xs text-white/50 truncate">{(() => { try { return new URL(miniBrowserUrl).hostname; } catch { return miniBrowserUrl; } })()}</span>
              </div>
            </div>
            {/* Open in system browser */}
            <a
              href={miniBrowserUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors shrink-0"
              title="Open in browser"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 7.5V11a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 012 11V5a1.5 1.5 0 011.5-1.5H7" stroke="white" strokeWidth="1.2" strokeLinecap="round"/><path d="M9 1.5h3.5V5M6 8l5.5-5.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
          </div>
          {/* Iframe */}
          <div className="flex-1 relative">
            <iframe
              src={miniBrowserUrl}
              className="absolute inset-0 w-full h-full border-0"
              style={{ background: 'white' }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onLoad={() => setMiniBrowserLoading(false)}
              title="Source page"
            />
          </div>
        </div>
      )}

    </div>
  );
});
