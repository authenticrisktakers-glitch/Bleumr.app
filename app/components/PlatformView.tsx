import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { shimmerDuration } from '../services/CPUAccelerator';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Mic, MicOff, ChevronDown, CheckCircle2, Menu, ImagePlus, ExternalLink, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { InlineStarSphere } from './InlineStarSphere';
import { PlatformSidebar } from './PlatformSidebar';
import { StarSphereLoader } from './StarSphereLoader';
import { ChatThreadMeta } from '../services/ChatStorage';
import { UserProfile } from '../services/UserProfile';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  action?: any;
  isBrowserFeedback?: boolean;
  responseTimeMs?: number;
  imageBase64?: string;
  imagePreview?: string;
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
  onSchedule?: (text: string) => void;
  agentStep?: number;
  agentTotalSteps?: number;
  agentCurrentAction?: string;
  onStopAgent?: () => void;
}

// Memoised message row — only re-renders if its own content changes
const MessageRow = memo(function MessageRow({
  msg,
  isLatestAssistant = false,
  isWorking = false,
  onRetry,
}: {
  msg: Message;
  isLatestAssistant?: boolean;
  isWorking?: boolean;
  onRetry?: () => void;
}) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
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
  onSchedule,
  agentStep = 0,
  agentTotalSteps = 50,
  agentCurrentAction = '',
  onStopAgent,
}: PlatformViewProps) {
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

  const inputRef = useRef<HTMLInputElement>(null);
  const hasStartedChat = messages.length > 0;

  // Refocus input as soon as JUMARI finishes responding
  useEffect(() => {
    if (!isAgentWorking) {
      inputRef.current?.focus();
    }
  }, [isAgentWorking]);

  // Append voice transcript to local input when App sends one
  useEffect(() => {
    if (voiceTranscript) {
      setInput(prev => prev + (prev ? ' ' : '') + voiceTranscript);
      onVoiceTranscriptConsumed?.();
    }
  }, [voiceTranscript]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if ((!trimmed && !attachedImage) || isAgentWorking) return;
    const img = attachedImage?.base64;
    const imgPreview = attachedImage?.preview;
    setInput('');
    setAttachedImage(null);
    onSubmit(trimmed || '(analyze this image)', img, imgPreview);
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

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] text-slate-200 font-sans overflow-hidden flex selection:bg-indigo-500/30 z-[9999]">

      {/* Background stars — memoised, never re-renders */}
      <div className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-1000 ${hasStartedChat ? 'opacity-50' : 'opacity-100'}`}>
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
        onSchedule={(text) => { onSchedule?.(text); }}
      />

      <div className="flex-1 flex flex-col relative z-10 w-full h-full">
        {/* Top Header */}
        <div className="h-16 flex items-center justify-between pr-4 shrink-0" style={{ paddingLeft: 80 }}>
          <div className="flex items-center">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors z-50 text-slate-400 hover:text-white"
              title="Toggle Sidebar"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 top-4 z-50">
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
                  onClick={onOpenBrowser}
                  title="Open Browser Workspace"
                >
                  <InlineStarSphere size={220} />
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
            className={`flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 lg:px-32 scrollbar-hide pb-32 transition-opacity duration-500 ${hasStartedChat ? 'opacity-100' : 'opacity-0'}`}
            style={{
              WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 200px), transparent calc(100% - 110px))',
              maskImage: 'linear-gradient(to bottom, black calc(100% - 200px), transparent calc(100% - 110px))',
            }}
          >
            <div className="max-w-3xl mx-auto w-full pt-8 flex flex-col gap-6">
              {(() => {
                // Find the last assistant message id — only that one gets an active sphere
                const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id;
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
                      <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center shrink-0 border border-blue-500/20">
                        <InlineStarSphere size={32} />
                      </div>
                      <div className="text-slate-500 text-sm animate-pulse">Thinking...</div>
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
        <div className="absolute bottom-0 w-full pb-6 pt-16 px-4" style={{
          background: 'linear-gradient(to top, rgba(10,10,10,0.72) 0%, rgba(10,10,10,0.35) 40%, transparent 100%)',
        }}>
          <div className="max-w-xl mx-auto w-full">

            {/* Outer ambient glow halo */}
            <div
              className="relative rounded-full"
              style={{
                filter: isFocused
                  ? 'drop-shadow(0 0 18px rgba(56,189,248,0.45)) drop-shadow(0 0 40px rgba(56,189,248,0.15))'
                  : 'drop-shadow(0 0 4px rgba(56,189,248,0.08))',
                transition: 'filter 0.55s cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              {/* Gradient border ring — panning shimmer when focused */}
              <div
                className={`rounded-full ${isFocused ? 'orbit-shimmer-border' : ''}`}
                style={{
                  padding: '1px',
                  '--shimmer-duration': shimmerDuration,
                  ...(isFocused ? {} : {
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(56,189,248,0.05) 50%, rgba(255,255,255,0.02) 100%)',
                  }),
                  transition: 'background 0.55s cubic-bezier(0.4,0,0.2,1)',
                } as React.CSSProperties}
              >
                {/* Glass pill body */}
                <form
                  onSubmit={handleSubmit}
                  className="relative flex items-center rounded-full overflow-hidden"
                  style={{
                    // Transparent glass pill — more see-through, less void
                    background: isFocused
                      ? 'rgba(0,0,0,0.10)'            // very light tint when typing
                      : 'rgba(255,255,255,0.02)',      // nearly invisible at rest
                    backdropFilter: 'blur(40px) saturate(180%) brightness(1.1)',
                    WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(1.1)',
                    // Inner specular: bright 1px top rim, faint bottom
                    boxShadow: isFocused
                      ? 'inset 0 1.5px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.04)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(255,255,255,0.03)',
                    transition: 'all 0.55s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  {/* Top caustic rim line */}
                  <div
                    className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none z-0"
                    style={{
                      background: isFocused
                        ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55) 30%, rgba(255,255,255,0.55) 70%, transparent)'
                        : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 35%, rgba(255,255,255,0.2) 65%, transparent)',
                      filter: 'blur(0.4px)',
                      transition: 'all 0.55s',
                    }}
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
                    style={{
                      color: isFocused ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.75)',
                      textShadow: isFocused ? '0 0 20px rgba(255,255,255,0.25)' : 'none',
                    }}
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

            <div className="text-center mt-4 text-[9px] text-white/25 tracking-wide">
              JUMARI 1.0 can make mistakes. Verify important information.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
});
