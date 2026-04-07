import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, FolderOpen, Send, Sparkles, FileCode,
  ChevronDown, ChevronRight, Copy, Check, RotateCcw,
  FolderInput, Eye, Menu, Trash2, Plus, StopCircle,
  Paperclip, Image as ImageIcon, ExternalLink,
} from 'lucide-react';
import { runFileScout, runLintAgent, runRefactorAgent, runTestGenAgent } from '../services/CodeAgents';
import type { SubAgentResult, FileAccess } from '../services/CodeAgents';
import SubscriptionService from '../services/SubscriptionService';
import { usageBudget } from '../services/UsageBudget';
import { preacher } from '../services/Preacher';
import {
  loadBleumrConfig, formatConfigForPrompt,
  filterToolsForPlanMode, checkPlanModeBlock, PLAN_MODE_PROMPT,
  saveCodeSession, loadCodeSessionsMeta, loadCodeSession, deleteCodeSession,
  extractCodeMemories, getCodeContext,
  parseHooks, runHooks,
  parseSkills, matchSkillCommand, getSkillPrompt,
  parsePermissions, resolvePermission, formatDenyResult, hasCustomPermissions,
  createCheckpoint, loadCheckpoints, loadCheckpoint, deleteCheckpoint, clearCheckpoints,
  formatCheckpointTime,
} from '../services/CodeBleu';
import type { BleumrConfigResult, Hook, Skill, PermissionRuleSet, CheckpointMeta } from '../services/CodeBleu';

// ─── Extracted Code Bleu Engine Modules ──────────────────────────────────────
import type { CodingSession, AgentMessage } from './CodeBleu/types';
import { IMPORTANT_FILES, SOURCE_DIRS, IGNORE_DIRS, GROQ_MODELS } from './CodeBleu/constants';
import {
  getLang, msgId, shellSafe, safePath, fetchWithTimeout,
  extractSuggestions, pickModel, highlightCode, safeClipboardCopy,
} from './CodeBleu/utils';
import { ALL_TOOLS, TOOL_CAT, SHELL_CMD, pickTools } from './CodeBleu/tools';
import { groqFetch, streamGroqResponse } from './CodeBleu/api';
import {
  readDirRecursive, readFileFromHandle, writeFileFromHandle,
  readFileElectron, writeFileElectron, readDirElectronRecursive,
} from './CodeBleu/fileSystem';
import { buildPreviewFromFiles } from './CodeBleu/preview';

// ─── Types (re-exported for backward compat) ────────────────────────────────

interface CodingPageProps { onClose: () => void; apiKey?: string; }
interface ProjectFile { name: string; path: string; content: string; }

// (extracted to CodeBleu modules)

// → moved to ./CodeBleu/utils.ts, ./CodeBleu/tools.ts, ./CodeBleu/constants.ts
// REMOVED: extractSuggestions, pickModel, GROQ_MODELS, mkTool, TOOL_CAT, tagged,
//   ALL_TOOLS, shellSafe, safePath, fetchWithTimeout, SHELL_CMD, pickTools

/* extractSuggestions + pickModel + GROQ_MODELS → moved to ./CodeBleu/utils.ts & ./CodeBleu/constants.ts */

/* mkTool, TOOL_CAT, tagged, ALL_TOOLS, SHELL_CMD, pickTools → moved to ./CodeBleu/tools.ts */

// (ALL_TOOLS, shellSafe, safePath, fetchWithTimeout, SHELL_CMD, pickTools all removed
//  — now imported from ./CodeBleu/tools.ts and ./CodeBleu/utils.ts)

// ─── Code Bleu Logo SVG ─────────────────────────────────────────────────────

function CodeBleuLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cbl-left" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="cbl-right" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {/* Left bracket < */}
      <path d="M 40 8 L 8 50 L 40 92" stroke="url(#cbl-left)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      {/* Right bracket > */}
      <path d="M 60 8 L 92 50 L 60 92" stroke="url(#cbl-right)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      {/* Colon dots */}
      <circle cx="50" cy="36" r="5.5" fill="#818cf8" />
      <circle cx="50" cy="64" r="5.5" fill="#818cf8" />
    </svg>
  );
}

// → moved to ./CodeBleu/fileSystem.ts

// groqFetch, streamGroqResponse, readDirElectronRecursive, highlightCode,
// PREVIEW_CONSOLE_BRIDGE, buildPreviewFromFiles — all moved to ./CodeBleu/ modules
// (see api.ts, fileSystem.ts, utils.ts, preview.ts)

// IS_ELECTRON_ENV kept local — used by component
const IS_ELECTRON_ENV = typeof window !== 'undefined' && !!(window as any).orbit;

// highlightCode, PREVIEW_CONSOLE_BRIDGE, buildPreviewFromFiles → ./CodeBleu/utils.ts + preview.ts

// buildPreviewFromFiles → ./CodeBleu/preview.ts

// ─── Code Block Component ─────────────────────────────────────────────────────

function CodeBlock({ code, language, file, onCopy }: {
  code: string; language: string; file?: string; onCopy: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      background: 'rgba(0,0,0,0.4)',
      borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
      overflow: 'hidden', margin: '8px 0',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileCode size={12} style={{ color: '#6366f1', opacity: 0.7 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>
            {file || language}
          </span>
        </div>
        <button onClick={handleCopy} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
          borderRadius: 4, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 11, transition: 'color 0.15s',
        }}>
          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
      {/* Code */}
      <pre style={{
        margin: 0, padding: '12px 16px', overflow: 'auto', maxHeight: 400,
        fontSize: 12.5, lineHeight: 1.6,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        color: '#abb2bf',
      }}>
        <code dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }} />
      </pre>
    </div>
  );
}

// ─── Code Bleu Avatar (inline SVG — diamond face with eyes) ─────────────────

function CodeBleuAvatar({ size = 24, isThinking = false, isStreaming = false }: {
  size?: number;
  isThinking?: boolean;
  isStreaming?: boolean;
}) {
  const uid = React.useId().replace(/:/g, '');

  const animStyle: React.CSSProperties = isThinking
    ? { animation: 'cba-think 2.4s ease-in-out infinite', filter: 'drop-shadow(0 0 5px rgba(129,140,248,0.6))' }
    : isStreaming
    ? { animation: 'cba-stream 1.8s ease-in-out infinite', filter: 'drop-shadow(0 0 3px rgba(129,140,248,0.3))' }
    : { animation: 'cba-idle 3s ease-in-out infinite' };

  return (
    <div style={{ width: size, height: size, flexShrink: 0, transition: 'filter 0.3s', ...animStyle }}>
      <svg viewBox="0 0 100 100" width={size} height={size} fill="none">
        <defs>
          <linearGradient id={`cbg${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#a5b4fc" />
            <stop offset="100%" stopColor="#e0e7ff" />
          </linearGradient>
        </defs>
        {/* Top chevron ^ (open diamond — gap between top and bottom) */}
        <polyline points="14,50 50,16 86,50"
          stroke={`url(#cbg${uid})`} strokeWidth="9"
          strokeLinecap="round" strokeLinejoin="round" />
        {/* Bottom chevron V (smile) */}
        <polyline points="14,56 50,90 86,56"
          stroke={`url(#cbg${uid})`} strokeWidth="9"
          strokeLinecap="round" strokeLinejoin="round" />
        {/* Left eye — always blinks, faster when thinking */}
        <circle cx="37" cy="53" r="5.5" fill={`url(#cbg${uid})`}
          style={{ transformOrigin: '37px 53px', animation: `cba-blink ${isThinking ? '2s' : '4s'} ease-in-out infinite` }} />
        {/* Right eye — slight delay for natural feel */}
        <circle cx="63" cy="53" r="5.5" fill={`url(#cbg${uid})`}
          style={{ transformOrigin: '63px 53px', animation: `cba-blink ${isThinking ? '2s' : '4s'} ease-in-out infinite 0.1s` }} />
      </svg>
    </div>
  );
}

// Inject Code Bleu avatar keyframes once
const CBA_STYLE_ID = 'cba-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(CBA_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = CBA_STYLE_ID;
  style.textContent = `
    @keyframes cba-idle {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-1.5px) rotate(0deg); }
    }
    @keyframes cba-think {
      0% { transform: rotate(0deg) scale(1); }
      12% { transform: rotate(8deg) scale(1.08); }
      25% { transform: rotate(0deg) scale(1.04); }
      37% { transform: rotate(-8deg) scale(1.08); }
      50% { transform: rotate(0deg) scale(1); }
      62% { transform: rotate(6deg) scale(1.06); }
      75% { transform: rotate(0deg) scale(1.02); }
      87% { transform: rotate(-6deg) scale(1.06); }
      100% { transform: rotate(0deg) scale(1); }
    }
    @keyframes cba-stream {
      0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
      25% { transform: scale(1.03) rotate(2deg); opacity: 0.9; }
      50% { transform: scale(1.06) rotate(0deg); opacity: 0.85; }
      75% { transform: scale(1.03) rotate(-2deg); opacity: 0.9; }
    }
    @keyframes cba-blink {
      0%, 88%, 100% { transform: scaleY(1); }
      92% { transform: scaleY(0.05); }
      94% { transform: scaleY(1); }
      97% { transform: scaleY(0.05); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Activity Block (agent reads/writes files inline) ─────────────────────────

const ActivityBlock = memo(function ActivityBlock({ message }: { message: AgentMessage }) {
  const [collapsed, setCollapsed] = useState(true);

  // ── Thinking / status indicator (no expand/collapse) ──
  if (message.activity === 'thinking') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', margin: '4px 0',
          color: 'rgba(255,255,255,0.45)', fontSize: 12,
        }}
      >
        <span style={{
          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(255,255,255,0.35)', display: 'inline-block',
          animation: 'pulse-dot 1.2s ease-in-out infinite',
        }} />
        <span style={{ fontStyle: 'italic' }}>{message.content || 'Working...'}</span>
      </motion.div>
    );
  }

  const label = message.activity === 'reading' ? 'Read'
    : message.activity === 'writing' ? 'Wrote'
    : message.activity === 'analyzing' ? 'Analyzing'
    : 'Working';

  const accentColor = message.activity === 'writing' ? '#34d399' : '#6366f1';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ margin: '3px 0' }}
    >
      {/* Inline row — icon + label + file path — clickable to expand */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '3px 0', cursor: 'pointer',
          color: 'rgba(255,255,255,0.4)', fontSize: 12,
        }}
      >
        <span style={{
          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
          background: accentColor, display: 'inline-block', opacity: 0.7,
        }} />
        <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 500, fontSize: 11.5 }}>{label}</span>
        {message.files?.[0] && (
          <span style={{ color: 'rgba(255,255,255,0.25)', fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
            {message.files[0].path}
          </span>
        )}
        <span style={{ color: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center' }}>
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        </span>
      </div>

      <AnimatePresence>
        {!collapsed && message.files?.map((f, i) => (
          <motion.div
            key={i}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <pre style={{
              margin: '2px 0 2px 19px', padding: '6px 10px', overflow: 'auto', maxHeight: 250,
              fontSize: 11, lineHeight: 1.5, color: '#abb2bf',
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              background: 'rgba(0,0,0,0.25)', borderRadius: 6,
            }}>
              <code dangerouslySetInnerHTML={{ __html: highlightCode(f.content.slice(0, 3000), getLang(f.path)) }} />
              {f.content.length > 3000 && (
                <div style={{ color: 'rgba(255,255,255,0.2)', marginTop: 4, fontSize: 10 }}>
                  ... {f.content.length - 3000} more characters
                </div>
              )}
            </pre>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── Activity Group (collapses consecutive activities into compact summary) ──

const ActivityGroup = memo(function ActivityGroup({ items }: { items: AgentMessage[] }) {
  const [expanded, setExpanded] = useState(false);

  // Separate live thinking from completed activities
  const liveItems = items.filter(m => m.activity === 'thinking' && m.streaming);
  const completed = items.filter(m => !(m.activity === 'thinking' && m.streaming));

  // Build summary counts
  const writes = completed.filter(m => m.activity === 'writing');
  const reads = completed.filter(m => m.activity === 'reading');
  const other = completed.filter(m => m.activity !== 'writing' && m.activity !== 'reading' && m.activity !== 'thinking');

  const parts: string[] = [];
  if (writes.length > 0) parts.push(`Wrote ${writes.length} file${writes.length > 1 ? 's' : ''}`);
  if (reads.length > 0) parts.push(`Read ${reads.length} file${reads.length > 1 ? 's' : ''}`);
  if (other.length > 0) parts.push(`${other.length} step${other.length > 1 ? 's' : ''}`);
  const summary = parts.join(' · ') || `${completed.length} steps`;

  // If only live thinking items, just show the last one
  if (completed.length === 0 && liveItems.length > 0) {
    return <ActivityBlock message={liveItems[liveItems.length - 1]} />;
  }

  return (
    <div style={{ margin: '4px 0' }}>
      {/* Compact summary bar */}
      {completed.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            onClick={() => setExpanded(!expanded)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px', cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', fontSize: 11.5,
              background: expanded ? 'rgba(99,102,241,0.05)' : 'transparent',
              borderRadius: 8, transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = expanded ? 'rgba(99,102,241,0.05)' : 'transparent'; }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.3)', display: 'inline-block',
            }} />
            <span style={{ fontWeight: 500 }}>{summary}</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </span>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ overflow: 'hidden' }}
              >
                {completed.map(msg => (
                  <div key={msg.id} style={{ paddingLeft: 8 }}>
                    <ActivityBlock message={msg} />
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Live thinking indicator — always visible */}
      {liveItems.length > 0 && <ActivityBlock message={liveItems[liveItems.length - 1]} />}
    </div>
  );
});

// ─── Sub-Agent Block (shows sub-agent identity + result like Claude's UI) ────

const SUB_AGENT_META: Record<string, { color: string; label: string }> = {
  FileScout: { color: '#818cf8', label: 'Diamond' },
  LintCheck: { color: '#f59e0b', label: 'Troy' },
  Refactor:  { color: '#34d399', label: 'Dominic' },
  TestGen:   { color: '#06b6d4', label: 'TestGen' },
};

const SubAgentBlock = memo(function SubAgentBlock({ message }: { message: AgentMessage }) {
  const [expanded, setExpanded] = useState(false);
  const meta = SUB_AGENT_META[message.subAgent?.name ?? ''] ?? { color: '#818cf8', label: message.subAgent?.name ?? 'Agent' };
  const isRunning = message.subAgent?.status === 'running';
  const isError = message.subAgent?.status === 'error';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ margin: '4px 0' }}
    >
      {/* Inline row — no container, just icon + name + status */}
      <div
        onClick={() => !isRunning && message.content && setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 0', cursor: !isRunning && message.content ? 'pointer' : 'default',
        }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: meta.color, display: 'inline-block',
          animation: isRunning ? 'pulse-dot 1.2s ease-in-out infinite' : undefined,
        }} />
        <span style={{ color: meta.color, fontWeight: 600, fontSize: 12 }}>{meta.label}</span>
        {isRunning && (
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontStyle: 'italic' }}>working...</span>
        )}
        {!isRunning && !isError && message.content && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>done</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center' }}>
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </span>
          </>
        )}
        {isError && (
          <span style={{ color: 'rgba(239,68,68,0.5)', fontSize: 11 }}>failed</span>
        )}
      </div>

      {/* Expanded result — just indented text, no box */}
      <AnimatePresence>
        {expanded && message.content && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              paddingLeft: 20, paddingTop: 2, paddingBottom: 4,
              fontSize: 12.5, color: 'rgba(255,255,255,0.5)',
              lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}
          >
            {message.content}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── Message rendering (cached — only re-parses when content changes) ────────

const _parseCache = new Map<string, React.ReactNode[]>();
const PARSE_CACHE_MAX = 60;

function parseAssistantContent(content: string): React.ReactNode[] {
  const cached = _parseCache.get(content);
  if (cached) return cached;

  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) parts.push(<span key={`t${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>{text}</span>);
    }
    const lang = match[1] || 'plaintext';
    const code = match[2].trim();
    parts.push(
      <CodeBlock
        key={`c${match.index}`}
        code={code}
        language={lang}
        onCopy={(t) => {
          navigator.clipboard.writeText(t).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = t; ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          });
        }}
      />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) parts.push(<span key={`t${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>{text}</span>);
  }

  const result = parts.length ? parts : [<span key="0" style={{ whiteSpace: 'pre-wrap' }}>{content}</span>];

  // Evict oldest entries when cache grows too large
  if (_parseCache.size >= PARSE_CACHE_MAX) {
    const first = _parseCache.keys().next().value;
    if (first !== undefined) _parseCache.delete(first);
  }
  _parseCache.set(content, result);
  return result;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CodingPage({ onClose, apiKey }: CodingPageProps) {
  // ── State ──
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [slashPaletteOpen, setSlashPaletteOpen] = useState(false);
  const [slashPaletteIndex, setSlashPaletteIndex] = useState(0);
  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([]);
  const [checkpointPanelOpen, setCheckpointPanelOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<{ path: string; name: string }[]>([]);
  const [projectContext, setProjectContext] = useState<string>('');
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isElectronProject, setIsElectronProject] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [writtenFiles, setWrittenFiles] = useState<{ path: string; content: string }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessions, setSessions] = useState<CodingSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [showAutoWarning, setShowAutoWarning] = useState(false);
  const [attachedImages, setAttachedImages] = useState<{ name: string; dataUri: string; path: string }[]>([]);
  const [planMode, setPlanMode] = useState(false);
  const [bleumrConfig, setBleumrConfig] = useState<BleumrConfigResult | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortedRef = useRef(false);
  const agentRunningRef = useRef(false);
  const loopGenRef = useRef(0); // Generation counter — detects stale loops after session switch
  const mountedRef = useRef(true); // Unmount detection — prevents ghost state updates
  const projectPathRef = useRef<string | null>(null);
  const lastUserMsgRef = useRef('');
  const lastToolContextRef = useRef('');
  const hooksRef = useRef<Hook[]>([]);
  const skillsRef = useRef<Skill[]>([]);
  const permissionsRef = useRef<PermissionRuleSet>(parsePermissions(''));
  const pendingApprovalRef = useRef<((approved: boolean) => void) | null>(null);
  // Free-text feedback the user typed while a permission prompt was open. The
  // approval handler stashes it here, the loop's deny branch reads it back and
  // injects it into the next iteration so the agent actually sees what the
  // user said instead of just "denied".
  const denyFeedbackRef = useRef<string | null>(null);
  // Full LLM conversation history (including tool_use + tool_result blocks)
  // preserved across sendToAgent calls so the agent remembers EXACTLY what it
  // built last turn — file paths, command outputs, the lot. Without this the
  // model gets only the user/assistant text messages on the next turn and
  // loses all knowledge of which files it just created. Capped to the last 30
  // messages on save to prevent unbounded growth across long sessions.
  const prevConversationRef = useRef<any[]>([]);
  const sessionStartedRef = useRef(false);
  const runBuiltInCommandRef = useRef<((name: string) => boolean) | null>(null);

  const isElectron = typeof window !== 'undefined' && !!(window as any).orbit;

  // Unmount cleanup — stops ghost state updates from lingering async loops
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortedRef.current = true;
      // Best-effort session_end on unmount (e.g. user closes Code Bleu)
      if (hooksRef.current.length > 0 && sessionStartedRef.current) {
        const orbit = (window as any).orbit;
        const cwd = projectPathRef.current;
        if (orbit?.shellExec && cwd) {
          runHooks('session_end', {}, hooksRef.current, orbit.shellExec, cwd).catch(() => null);
        }
      }
    };
  }, []);

  // Keep projectPath ref in sync
  useEffect(() => { projectPathRef.current = projectPath; }, [projectPath]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount + load persisted sessions
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
    // Restore sessions from localStorage
    const savedMetas = loadCodeSessionsMeta();
    if (savedMetas.length > 0) {
      const restored: CodingSession[] = [];
      for (const meta of savedMetas.slice(0, 10)) {
        const full = loadCodeSession(meta.id);
        if (full) {
          restored.push({
            id: full.id, name: full.name, projectName: full.projectName,
            messages: full.messages, projectPath: full.projectPath,
            projectContext: '', projectFiles: full.projectFiles, timestamp: full.timestamp,
          });
        }
      }
      if (restored.length > 0) setSessions(restored);
    }
  }, []);

  // ── Add message helper ──
  const addMessage = useCallback((msg: Omit<AgentMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, { ...msg, id: msgId(), timestamp: Date.now() }]);
  }, []);

  // ── Group consecutive activities for compact chat display ──
  const renderItems = useMemo(() => {
    // Only keep the LAST thinking indicator — kill any trail
    const lastThinkIdx = messages.reduce((last, m, i) =>
      (m.role === 'activity' && m.activity === 'thinking' && m.streaming) ? i : last, -1);
    const cleaned = messages.filter((m, i) => {
      if (m.role === 'activity' && m.activity === 'thinking' && m.streaming && i !== lastThinkIdx) return false;
      return true;
    });

    const result: ({ msg: AgentMessage } | { id: string; items: AgentMessage[] })[] = [];
    let buf: AgentMessage[] = [];

    const flush = () => {
      if (!buf.length) return;
      if (buf.length <= 2) {
        buf.forEach(m => result.push({ msg: m }));
      } else {
        result.push({ id: `grp_${buf[0].id}`, items: [...buf] });
      }
      buf = [];
    };

    for (const msg of cleaned) {
      if (msg.role === 'activity') { buf.push(msg); }
      else { flush(); result.push({ msg }); }
    }
    flush();
    return result;
  }, [messages]);

  // Pre-compute the last assistant message ID once — avoids O(n²) scan per message
  const lastAssistantId = useMemo(() => {
    for (let i = renderItems.length - 1; i >= 0; i--) {
      const r = renderItems[i];
      if ('msg' in r && r.msg.role === 'assistant') return r.msg.id;
    }
    return null;
  }, [renderItems]);

  const updateLastMessage = useCallback((content: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      return [...prev.slice(0, -1), { ...last, content, streaming: true }];
    });
  }, []);

  // ── Read a file (works with both browser FileSystem API and Electron IPC) ──
  const readProjectFile = useCallback(async (path: string): Promise<string> => {
    try {
      if (isElectronProject && projectPath) {
        return await readFileElectron(`${projectPath}/${path}`);
      } else if (dirHandle) {
        return await readFileFromHandle(dirHandle, path);
      }
    } catch { }
    return '';
  }, [dirHandle, isElectronProject, projectPath]);

  // ── Write a file ──
  const writeProjectFile = useCallback(async (path: string, content: string): Promise<boolean> => {
    try {
      if (isElectronProject && projectPath) {
        return await writeFileElectron(`${projectPath}/${path}`, content);
      } else if (dirHandle) {
        return await writeFileFromHandle(dirHandle, path, content);
      }
    } catch { }
    return false;
  }, [dirHandle, isElectronProject, projectPath]);

  // ── List directory from scanned project files ──
  const listProjectDir = useCallback((dirPath: string): string[] => {
    const isRoot = dirPath === '.' || dirPath === '' || dirPath === '/';
    const seen = new Set<string>();
    for (const f of projectFiles) {
      if (isRoot) {
        seen.add(f.path.split('/')[0]);
      } else {
        const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
        if (f.path.startsWith(prefix)) {
          seen.add(f.path.slice(prefix.length).split('/')[0]);
        }
      }
    }
    return Array.from(seen).sort();
  }, [projectFiles]);

  // ── Typewriter animation — types out text chunk by chunk ──
  const typewriterAnimate = useCallback(async (text: string, messageId: string): Promise<void> => {
    const len = text.length;
    // Larger chunks + 16ms delay = 60fps, no jank
    const chunkSize = len > 2000 ? 80 : len > 500 ? 40 : 20;

    for (let i = 0; i < len; i += chunkSize) {
      const partial = text.slice(0, Math.min(i + chunkSize, len));
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === messageId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], content: partial, streaming: true };
        return updated;
      });
      await new Promise(r => setTimeout(r, 16)); // 1 frame at 60fps
    }
    // Finalize
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], content: text, streaming: false };
      return updated;
    });
  }, []);

  // ── Analyze project ──
  const analyzeProject = useCallback(async (
    files: { path: string; name: string }[],
    readFile: (path: string) => Promise<string>
  ) => {
    setIsWorking(true);

    // Show scanning status
    const scanId = msgId();
    setMessages(prev => [...prev, {
      id: scanId, role: 'activity' as const, content: `Found ${files.length} files — scanning project structure...`,
      activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
    }]);

    const updateScan = (text: string) => {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === scanId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], content: text };
        return updated;
      });
    };

    // 1. Find and read important files
    const importantFound: ProjectFile[] = [];
    const readQueue: string[] = [];

    for (const f of files) {
      const name = f.path.split('/').pop() ?? '';
      if (IMPORTANT_FILES.includes(name)) readQueue.push(f.path);
    }

    const sourceFiles = files.filter(f => {
      const parts = f.path.split('/');
      return parts.some(p => SOURCE_DIRS.includes(p)) && !f.path.includes('node_modules');
    }).slice(0, 20);

    for (const sf of sourceFiles) {
      if (!readQueue.includes(sf.path)) readQueue.push(sf.path);
    }

    // Read files with animated feedback
    for (let i = 0; i < Math.min(readQueue.length, 25); i++) {
      const filePath = readQueue[i];
      const fileName = filePath.split('/').pop() ?? filePath;
      updateScan(`Reading ${fileName}... (${i + 1}/${Math.min(readQueue.length, 12)})`);
      await new Promise(r => setTimeout(r, 100));

      const content = await readFile(filePath);
      if (content) {
        importantFound.push({ name: fileName, path: filePath, content });

        // Remove scanning indicator, show file activity, re-add scanning
        setMessages(prev => prev.filter(m => m.id !== scanId));
        addMessage({
          role: 'activity', content: '', activity: 'reading',
          files: [{ path: filePath, content: content.slice(0, 2000), action: 'read' }],
        });
        // Re-add thinking indicator
        setMessages(prev => [...prev, {
          id: scanId, role: 'activity' as const, content: '',
          activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
        }]);
      }
    }

    // 2. Load BLEUMR.md project instructions (if present)
    updateScan('Checking for BLEUMR.md...');
    const config = await loadBleumrConfig(readFile);
    setBleumrConfig(config);
    if (config) {
      // Parse hooks, skills, and permissions from config file
      hooksRef.current = parseHooks(config.content);
      skillsRef.current = parseSkills(config.content);
      permissionsRef.current = parsePermissions(config.content);

      setMessages(prev => prev.filter(m => m.id !== scanId));
      addMessage({
        role: 'activity', content: '', activity: 'reading',
        files: [{ path: config.source, content: config.content.slice(0, 2000), action: 'read' }],
      });
      if (hasCustomPermissions(permissionsRef.current)) {
        addMessage({
          role: 'activity', content: '', activity: 'thinking',
          files: [{ path: 'permissions', content: 'BLEUMR.md permissions active', action: 'read' }],
        });
      }
      setMessages(prev => [...prev, {
        id: scanId, role: 'activity' as const, content: '',
        activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
      }]);
    } else {
      permissionsRef.current = parsePermissions(''); // reset to defaults
    }

    // 3. Build project context summary
    const fileList = files.map(f => f.path).join('\n');
    const fileContents = importantFound.map(f =>
      `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``
    ).join('\n\n');

    const projectSummary = `Project files (${files.length} total):\n${fileList}\n\n${fileContents}`;
    setProjectContext(projectSummary);

    // 2b. Detect if this is a website project — auto-load HTML/CSS/JS into preview
    const htmlFiles = files.filter(f => f.path.endsWith('.html') && !f.path.includes('node_modules'));
    if (htmlFiles.length > 0) {
      updateScan('Detected website project — loading preview...');
      const webFiles: { path: string; content: string }[] = [];
      const webExtensions = /\.(html|css|js)$/;
      const webQueue = files.filter(f => webExtensions.test(f.path) && !f.path.includes('node_modules')).slice(0, 20);

      for (const wf of webQueue) {
        const content = await readFile(wf.path);
        if (content) webFiles.push({ path: wf.path, content });
      }

      if (webFiles.length > 0) {
        setWrittenFiles(webFiles);
        // Auto-open preview
        setTimeout(() => {
          const orbit = (window as any).orbit;
          if (orbit?.browser?.loadHTML) {
            orbit.browser.loadHTML(buildPreviewFromFiles(webFiles));
          } else {
            setPreviewOpen(true);
          }
        }, 800);
      }
    }

    // 3. Ask AI to summarize
    updateScan('Analyzing project structure and tech stack...');

    if (apiKey) {
      try {
        const data = await groqFetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: pickModel('summary'),
            messages: [
              {
                role: 'system',
                content: 'You are CODE Bleu, the coding agent inside Bleumr. You just opened a project. Talk to the user like a developer who just sat down to look at their codebase. Be specific and direct:\n\n1) What the app does — its actual purpose and domain (e.g. "Instagram follower booster with automated engagement", not "social media application").\n2) Tech stack — frameworks, key libraries, APIs used.\n3) What\'s already built and what state it\'s in.\n4) 2-3 specific things you could help build or improve — be concrete (e.g. "add OAuth authentication for the Instagram API" not "improve security").\n\nKeep it to 4-6 sentences. Write naturally, no markdown, no generic filler. Do NOT say "Let me know if you need anything" or "Feel free to ask".'
              },
              { role: 'user', content: `I just opened a project called "${projectName}". Here's what I see:\n\n${projectSummary.slice(0, 12000)}` },
            ],
            max_tokens: 1024,
            temperature: 0.3,
          }),
        });
        const reply = data?.choices?.[0]?.message?.content ?? 'Project loaded. Ask me anything about the code.';

        // Remove thinking, typewriter the summary
        setMessages(prev => prev.filter(m => m.id !== scanId));
        const summaryId = msgId();
        setMessages(prev => [...prev, {
          id: summaryId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now(),
        }]);
        await typewriterAnimate(reply, summaryId);
      } catch (err: any) {
        setMessages(prev => prev.filter(m => m.id !== scanId));
        const isOffline = (err as Error)?.message === 'OFFLINE';
        const fallback = isOffline
          ? `I loaded ${files.length} files from the project but I can't reach the AI service right now — looks like you're offline or the connection dropped. I can still read and browse your files locally. Try sending a message when you're back online.`
          : 'Project loaded — I can see all your files. What would you like to work on?';
        const fbId = msgId();
        setMessages(prev => [...prev, {
          id: fbId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now(),
        }]);
        await typewriterAnimate(fallback, fbId);
      }
    } else {
      setMessages(prev => prev.filter(m => m.id !== scanId));
      addMessage({ role: 'assistant', content: 'Project loaded. Add your Groq API key in Settings to start coding with me.' });
    }

    setIsWorking(false);
  }, [apiKey, addMessage, typewriterAnimate]);

  // ── Open folder (browser) ──
  const openFolderBrowser = useCallback(async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDirHandle(handle);
      setProjectName(handle.name);
      setProjectPath(null);
      setIsElectronProject(false);
      setMessages([]);
      // Drop conversation context — switching project means the previous
      // tool history points at files in a different folder
      prevConversationRef.current = [];
      lastToolContextRef.current = '';
      denyFeedbackRef.current = null;

      addMessage({ role: 'assistant', content: `Opening ${handle.name}... scanning files.` });

      const files = await readDirRecursive(handle);
      setProjectFiles(files);

      await analyzeProject(files, (path) => readFileFromHandle(handle, path));
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        addMessage({ role: 'assistant', content: `Failed to open folder: ${err?.message ?? 'Unknown error'}` });
      }
    }
  }, [addMessage, analyzeProject]);

  // ── Open folder (Electron) ──
  const openFolderElectron = useCallback(async () => {
    const orbit = (window as any).orbit;
    if (!orbit) return;

    try {
      // Use Electron's dialog to pick a folder
      const result = await orbit.showOpenDialog?.({ properties: ['openDirectory'] });
      const folderPath = result?.filePaths?.[0];
      if (!folderPath) return;

      const folderName = folderPath.split('/').pop() ?? folderPath;
      setProjectPath(folderPath);
      setProjectName(folderName);
      setDirHandle(null);
      setIsElectronProject(true);
      setMessages([]);
      // Drop conversation context — switching project means the previous
      // tool history points at files in a different folder
      prevConversationRef.current = [];
      lastToolContextRef.current = '';
      denyFeedbackRef.current = null;

      addMessage({ role: 'assistant', content: `Opening ${folderName}... scanning files.` });

      const files = await readDirElectronRecursive(folderPath);
      // Normalize paths to be relative
      const relFiles = files.map(f => ({
        ...f,
        path: f.path.startsWith(folderPath) ? f.path.slice(folderPath.length + 1) : f.path,
      }));
      setProjectFiles(relFiles);

      await analyzeProject(relFiles, (path) => readFileElectron(`${folderPath}/${path}`));
    } catch (err: any) {
      addMessage({ role: 'assistant', content: `Failed to open folder: ${err?.message ?? 'Unknown error'}` });
    }
  }, [addMessage, analyzeProject]);

  const openFolder = isElectron ? openFolderElectron : openFolderBrowser;

  // ── Send message to agent (agentic tool-use loop) ��─
  const sendToAgent = useCallback(async (messageText: string) => {
    let text = messageText.trim();
    if (!text || isWorking || agentRunningRef.current) return;
    agentRunningRef.current = true;
    abortedRef.current = false; // Reset abort flag for new run
    // Generation counter: if a session switch or reset bumps the generation,
    // this loop knows its results are stale and should bail out.
    const myGen = ++loopGenRef.current;

    // Expand skill commands (e.g. /review-pr → full prompt)
    const skillName = matchSkillCommand(text);
    if (skillName) {
      const skillPrompt = getSkillPrompt(skillName, skillsRef.current);
      if (skillPrompt) text = skillPrompt;
    }

    // ── Fire session_start hook (once per Code Bleu session) ──
    if (!sessionStartedRef.current && hooksRef.current.length > 0) {
      sessionStartedRef.current = true;
      const orbit = (window as any).orbit;
      const hookCwd = projectPathRef.current || projectPath;
      if (orbit?.shellExec && hookCwd) {
        runHooks('session_start', {}, hooksRef.current, orbit.shellExec, hookCwd).catch(() => null);
      }
    }

    // ── Create checkpoint BEFORE this prompt runs — snapshot current state for rewind ──
    // Skip checkpoints for permission-approval clicks (they're not real prompts)
    if (text !== 'Allow once' && text !== 'Deny') {
      const sid = activeSessionId ?? `session_${Date.now()}`;
      // Read messages snapshot via setState callback to avoid stale closure
      let snapshotMessages: any[] = [];
      setMessages(prev => { snapshotMessages = prev; return prev; });
      const meta = createCheckpoint(
        sid,
        text,
        snapshotMessages,
        writtenFiles,
        projectPathRef.current,
        projectName,
      );
      if (meta && activeSessionId === sid) {
        setCheckpoints(prev => [meta, ...prev.slice(0, 19)]);
      }
    }

    // Capture and clear attached images
    const currentImages = [...attachedImages];
    setAttachedImages([]);

    // Build user message with image context
    const imageContext = currentImages.length > 0
      ? `\n\n[User attached ${currentImages.length} image(s): ${currentImages.map(img => img.name).join(', ')}. ${currentImages.filter(i => i.path).map(i => `File path: ${i.path}`).join('; ')}]`
      : '';

    addMessage({
      role: 'user', content: text,
      images: currentImages.length > 0 ? currentImages.map(i => ({ name: i.name, dataUri: i.dataUri })) : undefined,
    });
    setIsWorking(true);
    abortedRef.current = false;

    // Hoisted out of try{} so the finally block can persist it back to
    // prevConversationRef for the next turn. Initialised inside try once
    // we know the request is valid.
    let conversationMessages: any[] = [];

    try {
      if (!apiKey) throw new Error('NO_KEY');

      // ── System prompt ──
      const permissionMode = autoApprove
        ? `You have FULL PERMISSION to read, write, create, delete, and run any commands without asking. The user enabled auto-approve mode. Just do the work — no need to ask "should I?" or "want me to?" — go ahead and execute immediately. Be fast and efficient.`
        : `Ask the user for permission before writing or deleting files. Explain what you plan to change and why. If the user says "yes", "go ahead", "do it", "fix it", or anything affirmative — proceed.`;

      // Rebuild system prompt each iteration — projectPathRef may change after create_project
      const buildSysPrompt = () => {
        // If project was just created this loop and no files written yet, keep the "build from scratch" prompt
        const isNewlyCreatedProject = createdProjectThisLoop && filesWrittenThisLoop === 0;
        if (isNewlyCreatedProject && projectPathRef.current) {
          return `You are CODE Bleu, a senior coding agent inside Bleumr. You just created project "${projectName || projectPathRef.current?.split('/').pop()}".

${permissionMode}

Now write ALL the files for this project. Use write_file with ABSOLUTE paths starting with ${projectPathRef.current}/

Think out loud as you work — you're pair-programming with the user:
- FIRST, share your architecture plan: "I'll create [N] files. Here's the structure: [brief breakdown]. Let me start with [file] since [reason]."
- After writing each file, briefly explain what it does: "That's the main entry point — it sets up the router and mounts the app."
- Between files, connect the dots: "Now I'll create the API routes that the frontend calls..."
- Focus on quality — write clean, well-structured, production-ready code.
- Write COMPLETE file content — no placeholders, no "TODO" comments.
- Write each file ONCE with care. Plan ALL files before starting.
- After ALL files, give a specific closing summary: what you built, how the pieces connect, how to run it.
- NEVER say "Let me know if you need anything" — just describe what you built.

Technology decisions — make them automatically:
- "website" or "page" → plain HTML/CSS/JS (no framework needed)
- "app" or "application" → React + TypeScript
- "api" or "server" → Node.js + Express
- If unclear, use HTML/CSS/JS — it's simplest and always works.`;
        }

        return (projectContext || projectPathRef.current)
        ? `You are CODE Bleu, a powerful coding agent with 55 tools inside Bleumr. You're a senior developer pair-programming with the user. You think out loud, explain your reasoning, and narrate your work as you go — never silently writing code.

${permissionMode}

How you communicate (THIS IS CRITICAL — follow these patterns exactly):

BEFORE touching any code, think out loud:
- "Let me read the file first to understand the current structure..."
- "I'll start by looking at the component to see how props are passed..."
- "Before I change anything, let me check how this is used elsewhere..."

AFTER reading a file, share what you found:
- "I see the handler on line 47 returns early when the user is null — that's why the redirect isn't working."
- "The styles are using flexbox but the container doesn't have a fixed height, which is causing the overflow."
- "Found it — the API call is missing the auth header."

WHILE making changes, explain your decisions:
- "I'll use replace_in_file here since we only need to update the validation logic — no point rewriting the whole file."
- "This needs a full rewrite — the component structure doesn't support what you want, so I'll restructure it."
- "I'm adding a null check before the map call to prevent the crash you're seeing."

WHEN something goes wrong, narrate the debugging:
- "Hmm, the build failed because of a missing import. Let me fix that..."
- "That approach won't work because the state updates are batched. Let me try a different pattern."
- "The test is failing on the async call — I need to add an await."

BETWEEN tool calls — 1-2 sentences max. Brief, specific, human. No walls of text.
AFTER finishing — give a specific closing summary. Not "I've updated the code" but "I fixed the login redirect by adding a null check on line 23 and moving the navigation call inside the auth callback."

NEVER do these:
- Don't silently read files and write code without talking. ALWAYS explain what you see and why you're changing it.
- Don't put code in your text responses. ALL code goes into files via tools.
- Don't use filler phrases: "Let me know if you need anything", "Please note that...", "Feel free to...", "I hope this helps", "Don't hesitate to ask"
- Don't hedge: "This may need to be adjusted" — if it needs adjusting, adjust it yourself.
- Don't give generic summaries. Be specific about what changed and why.

Your workflow for MODIFYING existing code (change, fix, add to, improve, update):
1. ALWAYS read_file FIRST. Say what you're about to read and why.
2. After reading, explain what you found — reference specific lines, patterns, or issues.
3. ${autoApprove ? 'Explain your approach briefly, then make the changes.' : 'Explain your plan and wait for approval.'}
4. For small/targeted edits: use replace_in_file — it's precise and doesn't risk losing other code.
5. For large rewrites: use write_file with COMPLETE content. Explain why a full rewrite is needed.
6. After changes, tell the user what you did and why. Reference the specific change.

Your workflow for BUILDING new things (create, build, make me):
1. Share your plan — what you'll build, what tech stack, what files.
2. Create files with write_file. After each file, briefly say what it does and how it fits.
3. If the project needs multiple files, explain the architecture: "I'll set up the API routes first, then the frontend components that call them."
4. Closing summary: what you built, how it works, how to run it.

Quality rules:
- ALWAYS read existing files before modifying them. NEVER rewrite a file from memory.
- Use replace_in_file for targeted changes. Use write_file only when rewriting most of the file.
- Write clean, well-structured code. No placeholders, no "TODO" comments, no shortcuts.
- Plan ALL changes before starting. Write each file ONCE — get it right the first time.
- If the user asks to improve something, READ the code first, understand it, then make thoughtful improvements.
- Make smart decisions yourself — don't ask the user to choose frameworks or approaches unless there's a genuine tradeoff worth discussing.

You have 55 tools organized by category:
- File ops: read_file, write_file, list_directory, create_directory, delete_file, rename_file, copy_file, move_file, find_files, search_in_files, replace_in_file, file_exists, file_info
- Git: git_status, git_diff, git_log, git_commit, git_add, git_push, git_pull, git_branch, git_checkout, git_stash, git_merge, git_clone
- Packages: install_package, uninstall_package, list_packages, check_outdated, init_package_json
- Build & Dev: run_tests, run_build, run_lint, run_format, start_dev_server, stop_process, check_port
- Web: web_search, fetch_url, check_url
- W3C Validation: validate_html, validate_css — validate code against official W3C web standards. Use after writing HTML/CSS to ensure spec compliance.
- Analysis: find_definition, find_usages, count_lines, detect_stack, analyze_dependencies
- Scaffold: scaffold_component, scaffold_page, scaffold_api, scaffold_test, init_framework. For full project scaffolding with best-practice structure, use run_command with: python3 bleumr-gen.py <template> <name> — templates: fastapi, flask, django, cli, package, react, next, electron
- Shell: run_command (for anything not covered by specific tools)
- Agents: dispatch_agent (FileScout, LintCheck, Refactor, TestGen)
- Interaction: ask_user (ask questions with clickable answer buttons)
- Preacher (safety net): rollback_file, rollback_file_original — Every file you modify is automatically backed up by Preacher before you change it. If you break something, use rollback_file to undo your last change, or rollback_file_original to restore the file to its state before you touched it at all. USE THIS instead of guessing what the old code looked like. If something breaks after your edit, rollback first, then re-read the file, then try again with a better approach.

Not all tools are available at once — the system loads relevant tools based on context. If you need a tool that's not available, use run_command as a fallback.

${planMode ? PLAN_MODE_PROMPT : ''}
${formatConfigForPrompt(bleumrConfig)}
${getCodeContext(lastUserMsgRef.current)}
${preacher.getTrackedFiles().length > 0 ? preacher.getSummary() + '\n\n' : ''}Project context:
${(projectContext || `Project at: ${projectPathRef.current}`).slice(0, 12000)}`
        : `You are CODE Bleu, a senior coding agent inside Bleumr. No project is open yet. You think out loud and narrate your work like a real developer pair-programming with the user.

How you work:
1. Acknowledge what they want to build: "Got it — you want a [description]. I'll use [tech] for this because [reason]."
2. Call create_project with a descriptive name. Tell them: "Setting up the project folder..."
3. Share your architecture: "I'll create [N] files — [brief list]. Let me start with [first file] since everything else depends on it."
4. Write each file with write_file using ABSOLUTE paths. After each file, briefly say what it does and how it connects.
5. After ALL files are written, give a specific summary: what you built, how the pieces fit together, and how to run it.

Rules:
- ALL code goes into files via write_file. NEVER put code in your text response.
- Write COMPLETE file content — no placeholders, no "TODO" comments.
- Write each file ONCE with care. Quality over speed.
- Make technology decisions yourself — "website"/"page" → HTML/CSS/JS, "app" → React + TypeScript, "api"/"server" → Node.js + Express.
- NEVER use filler: "Let me know if you need anything", "Please note...", "Feel free to ask". Be specific about what you built.
- Talk naturally between tool calls — 1-2 sentences explaining what you just did or are about to do.

If they ask a coding question (not building), answer naturally and helpfully — share your expertise, explain concepts clearly, reference real patterns.`;
      };

      // ── Tool selection (dynamic — picks relevant subset of 55 tools) ──
      // Store user message for tool selection context
      lastUserMsgRef.current = text;

      // ── Build conversation history ──
      // ── Build conversation history ──
      // Prefer the FULL persisted conversation from the previous turn if we
      // have one. It includes tool_use + tool_result blocks so the model
      // already knows the absolute file paths it wrote, what each command
      // returned, and where the project lives. Without this, "fix it" turns
      // into "let me read the project to understand…" because the model only
      // sees user/assistant text and has no idea what it built last time.
      //
      // Falls back to the lossy text-only history (the old behaviour) on the
      // very first turn or after a session reset.
      const prevTurn = prevConversationRef.current;
      const seedHistory: any[] = prevTurn.length > 0
        ? prevTurn.slice()
        : (() => {
            const h: any[] = messages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .slice(-10)
              .map(m => ({ role: m.role, content: m.content }));
            if (lastToolContextRef.current) {
              h.push({ role: 'assistant', content: `[Previous actions: ${lastToolContextRef.current}]` });
            }
            return h;
          })();
      conversationMessages = [
        ...seedHistory,
        { role: 'user', content: text + imageContext },
      ];

      // ── Agentic loop — keeps going while AI calls tools ──
      let iterations = 0;
      const maxIterations = 20;
      const toolResultsLog: string[] = [];
      let lastAssistantText = '';
      let createdProjectThisLoop = false; // Track if we just created a project (need to keep writing files)
      let filesWrittenThisLoop = 0;       // Track file writes — don't stop until at least 1 after create_project
      let emptyResponseStreak = 0;        // Safety: bail after 3 consecutive empty responses

      // Show initial thinking status
      let thinkingId = msgId();
      setMessages(prev => [...prev, {
        id: thinkingId, role: 'activity' as const, content: 'Understanding your request...',
        activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
      }]);

      const updateThinking = (text: string) => {
        setMessages(prev => {
          const idx = prev.findIndex(m => m.id === thinkingId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], content: text };
          return updated;
        });
      };

      const removeThinking = () => {
        setMessages(prev => prev.filter(m => m.id !== thinkingId));
      };

      while (iterations++ < maxIterations) {
        // Check if user interrupted OR session switched OR component unmounted
        if (abortedRef.current || loopGenRef.current !== myGen || !mountedRef.current) {
          removeThinking();
          const stopId = msgId();
          setMessages(prev => [...prev, {
            id: stopId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now(),
          }]);
          await typewriterAnimate('Stopped.', stopId);
          break;
        }
        updateThinking(iterations === 1 ? 'Thinking about your request...' : 'Planning next steps...');

        // ── Credit budget gate — Code Bleu costs 3 credits per tool iteration ──
        const codeBleuTier = SubscriptionService.getTier();
        const codeAction = 'code_bleu' as const;
        const cbCreditCheck = usageBudget.canAfford(codeAction, codeBleuTier);
        if (!cbCreditCheck.allowed) {
          removeThinking();
          addMessage({
            role: 'assistant', content: cbCreditCheck.reason || 'Out of credits for today. They reset at midnight!',
          });
          break;
        }
        // Credits consumed AFTER successful API response (see below), not here.

        // Dynamic tool selection — re-evaluates every iteration (fixes stuck-after-create bug)
        const hasActiveProject = !!projectContext || !!projectPathRef.current;
        let activeTools = pickTools(lastUserMsgRef.current, hasActiveProject);
        if (planMode) activeTools = filterToolsForPlanMode(activeTools);

        // Force tool call on first iteration when user clearly wants action
        // 'required' = model MUST call a tool, 'auto' = model decides
        // Force tool use on first iteration UNLESS it's a pure knowledge question
        // "how can we improve" = action request (force tools), "how does X work" = question (don't force)
        const isPureQuestion = text.match(/\b(how does|how do|how is|how are|how can|how would|what does|what is|what are|what ideas|what would|what can|what should|what do you|why does|why is|why do|is (this|it|that) (a |the )?(good|bad|right|correct|best|proper|safe)|should i (use|choose|pick|go with|try)|can you explain|compare|difference between|pros and cons|vs\b|thoughts on|opinion on|explain\s+(how|what|why|the)|tell me (about|how|what|why)|help me understand|any (ideas|suggestions|thoughts|tips|recommendations|advice)|do you (think|suggest|recommend|have))\b/i)
          && !text.match(/\b(make|build|create|fix|improve|change|update|add|remove|refactor|better|upgrade|implement|write|delete|install)\b/i);
        // Force tools on iteration 1, AND keep forcing after create_project until files are written
        const forceToolUse = activeTools.length > 0 && !isPureQuestion
          && (iterations === 1 || (createdProjectThisLoop && filesWrittenThisLoop === 0));
        // Prune conversation if too large — truncate old tool results to keep under ~80K chars
        let totalChars = conversationMessages.reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0);
        const willCompact = totalChars > 80000;
        if (willCompact) {
          for (let i = 0; i < conversationMessages.length && totalChars > 60000; i++) {
            if (conversationMessages[i].role === 'tool' && conversationMessages[i].content?.length > 500) {
              const old = conversationMessages[i].content.length;
              conversationMessages[i].content = conversationMessages[i].content.slice(0, 500) + '\n... (pruned for context)';
              totalChars -= (old - 500);
            }
          }
          // Fire on_compact lifecycle hook
          if (hooksRef.current.length > 0) {
            const orbit = (window as any).orbit;
            const hookCwd = projectPathRef.current || projectPath;
            if (orbit?.shellExec && hookCwd) {
              runHooks('on_compact', {}, hooksRef.current, orbit.shellExec, hookCwd).catch(() => null);
            }
          }
        }

        const agentModel = pickModel('agent', text);
        const requestBody: any = {
          model: agentModel,
          messages: [{ role: 'system', content: buildSysPrompt() }, ...conversationMessages],
          max_tokens: 4096,
          temperature: 0.2,
          tools: activeTools,
          tool_choice: forceToolUse ? 'required' : 'auto',
        };

        // ── Stream response from Groq (real-time, like Claude) ──
        // Keep thinking indicator visible until first text token arrives
        updateThinking(iterations === 1 ? 'Thinking...' : 'Working...');

        let streamMsgId = '';
        let streamedAnyText = false;
        let assistantMsg: any = null;

        // ── Batched streaming: buffer tokens, flush at ~60fps via rAF ──
        let streamBuf = '';
        let rafId = 0;
        const flushStream = () => {
          rafId = 0;
          if (!streamBuf) return;
          const pending = streamBuf;
          streamBuf = '';
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === streamMsgId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], content: updated[idx].content + pending };
            return updated;
          });
        };

        try {
          const result = await streamGroqResponse(
            apiKey!,
            requestBody,
            (chunk) => {
              if (!streamedAnyText) {
                // First text token — remove thinking, create streaming message
                removeThinking();
                streamMsgId = msgId();
                setMessages(prev => [...prev, {
                  id: streamMsgId, role: 'assistant' as const, content: chunk,
                  streaming: true, timestamp: Date.now(),
                }]);
                streamedAnyText = true;
              } else {
                // Buffer tokens, flush once per animation frame (~60fps)
                streamBuf += chunk;
                if (!rafId) rafId = requestAnimationFrame(flushStream);
              }
            },
            abortedRef,
          );
          // Flush any remaining buffered text
          if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
          if (streamBuf) {
            const final = streamBuf; streamBuf = '';
            setMessages(prev => {
              const idx = prev.findIndex(m => m.id === streamMsgId);
              if (idx === -1) return prev;
              const updated = [...prev];
              updated[idx] = { ...updated[idx], content: updated[idx].content + final };
              return updated;
            });
          }
          assistantMsg = result.message;
        } catch (fetchErr: any) {
          // Remove streaming message if it was created
          if (streamMsgId) setMessages(prev => prev.filter(m => m.id !== streamMsgId));
          streamedAnyText = false;

          if (fetchErr?.message?.includes('400') || fetchErr?.message?.includes('tool_use_failed')) {
            console.warn('[CodeBleu] Stream 400 — retrying with core tools:', fetchErr.message);
            const CORE_NAMES = ['read_file', 'write_file', 'run_command', 'list_directory', 'ask_user', 'create_project', 'create_directory'];
            const coreTools = ALL_TOOLS.filter(t => CORE_NAMES.includes(t.function.name));
            try {
              const data = await groqFetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ ...requestBody, tools: coreTools, tool_choice: 'auto' }),
              });
              assistantMsg = data.choices?.[0]?.message;
            } catch {
              // Core tools failed — text-only, prevent narration
              console.error('[CodeBleu] Core tools failed, text-only fallback');
              const textBody = { ...requestBody };
              delete textBody.tools;
              delete textBody.tool_choice;
              textBody.messages = textBody.messages.map((m: any) =>
                m.role === 'system' ? { ...m, content: 'You are Code Bleu. Tools temporarily unavailable. Tell the user to try again. Do NOT describe tool calls.' } : m
              );
              const data = await groqFetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(textBody),
              });
              assistantMsg = data.choices?.[0]?.message;
            }

            // Show fallback response with typewriter since we couldn't stream
            if (assistantMsg?.content?.trim()) {
              const fbId = msgId();
              setMessages(prev => [...prev, { id: fbId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now() }]);
              await typewriterAnimate(assistantMsg.content.trim(), fbId);
              streamedAnyText = true;
            }
          } else {
            throw fetchErr;
          }
        }

        if (!assistantMsg) { removeThinking(); break; }

        // Consume credits only after a successful API response (prevents lost credits on failures)
        usageBudget.consume(codeAction, codeBleuTier);

        const hasToolCalls = assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0;
        if (hasToolCalls) emptyResponseStreak = 0; // Reset empty streak on successful tool use

        // Finalize the streamed message
        if (streamedAnyText && streamMsgId) {
          const responseText = (assistantMsg.content || '').trim();
          lastAssistantText = responseText;
          const detectedSuggestions = !hasToolCalls ? extractSuggestions(responseText) : [];
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === streamMsgId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              content: responseText,
              streaming: false,
              suggestions: detectedSuggestions.length > 0 ? detectedSuggestions : undefined,
            };
            return updated;
          });
        }

        // If no text was streamed and model only made tool calls, remove thinking
        // (tool execution will show its own activity indicators)
        if (!streamedAnyText) {
          removeThinking();
        }

        // ── No tool calls → check if we should auto-continue or stop ──
        if (!hasToolCalls) {
          const responseText = (assistantMsg.content || '').trim();

          if (!responseText && !streamedAnyText) {
            emptyResponseStreak++;

            // After create_project with 0 files written — nudge model to continue writing
            if (createdProjectThisLoop && filesWrittenThisLoop === 0 && emptyResponseStreak <= 2) {
              conversationMessages.push({ role: 'assistant', content: '' });
              conversationMessages.push({ role: 'user', content: `Continue. Write the files now using write_file with absolute paths starting with ${projectPathRef.current}/` });
              continue;
            }

            // Model returned empty on first iteration — retry without forcing tools
            if (forceToolUse && iterations === 1) {
              conversationMessages.push({ role: 'assistant', content: '' });
              conversationMessages.push({ role: 'user', content: 'Please respond to my question directly.' });
              continue;
            }

            // Safety: too many empty responses in a row — bail
            if (emptyResponseStreak >= 3) {
              const doneId = msgId();
              setMessages(prev => [...prev, {
                id: doneId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now(),
              }]);
              await typewriterAnimate('Having trouble continuing — please try again or rephrase your request.', doneId);
              break;
            }

            // Build summary from THIS loop's tool results only
            const summary = toolResultsLog.length > 0
              ? `All done — completed ${toolResultsLog.length} action${toolResultsLog.length > 1 ? 's' : ''}. Let me know if you need anything else.`
              : 'Finished processing your request. Let me know if you need anything else.';

            const doneId = msgId();
            setMessages(prev => [...prev, {
              id: doneId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now(),
            }]);
            await typewriterAnimate(summary, doneId);
            break;
          }

          const respLower = responseText.toLowerCase();
          const looksLikeQuestion = responseText.includes('?') || respLower.match(/\b(which|what|should i|want me|do you|would you|choose|pick|prefer)\b/);
          const looksLikeClosing = respLower.match(/\b(let me know|anything else|feel free|if you (need|want|have)|further (requests|changes|questions)|happy to help|hope this|all set|i've (completed|finished|updated|created|fixed|added)|done with|changes (are|have been)|has been (applied|updated|fixed))\b/);
          // Auto-continue: mid-task conversational updates like "I read the file. The styles need..." — NOT final answers
          // Allows longer messages since the agent now talks to the user as it works
          const isStatusUpdate = iterations > 1 && !looksLikeQuestion && !looksLikeClosing && responseText.length < 400
            && respLower.match(/\b(now|next|let me|i'll|going to|updating|moving on|working on|i see|i read|i found|looking at|here's what|i'll start|i notice|the file|the code)\b/);

          if (isStatusUpdate && iterations < maxIterations - 2) {
            conversationMessages.push({ role: 'assistant', content: responseText });
            conversationMessages.push({ role: 'user', content: 'Continue.' });
            continue;
          }

          // After create_project but 0 files written — force continuation regardless of what model says
          if (createdProjectThisLoop && filesWrittenThisLoop === 0 && iterations < maxIterations - 2) {
            conversationMessages.push({ role: 'assistant', content: responseText });
            conversationMessages.push({ role: 'user', content: `Continue. Write all the project files now using write_file. Use absolute paths starting with ${projectPathRef.current}/` });
            continue;
          }

          break;
        }

        // ── Process tool calls ──
        let askUserBreak = false;
        conversationMessages.push(assistantMsg);

        // Re-create thinking indicator for tool execution
        thinkingId = msgId();
        setMessages(prev => [...prev, {
          id: thinkingId, role: 'activity' as const,
          content: 'Executing...',
          activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
        }]);

        for (const toolCall of assistantMsg.tool_calls) {
          // Abort check inside tool loop — prevents ghost tool execution after Stop/session switch
          if (abortedRef.current || loopGenRef.current !== myGen || !mountedRef.current) break;

          let args: any;
          try {
            args = JSON.parse(toolCall.function.arguments);
            if (!args || typeof args !== 'object') args = {};
          } catch {
            conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: 'Error: Invalid arguments' });
            continue;
          }

          let result = '';

          // Plan mode safety net — block write/destructive tools
          const planBlock = planMode ? checkPlanModeBlock(toolCall.function.name) : null;
          if (planBlock) {
            conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: planBlock });
            continue;
          }

          // ── Permission gate — BLEUMR.md allow/ask/deny rules + autoApprove fallback ──
          const shellCmd = toolCall.function.name === 'run_command' ? (args.command || args.cmd || '') : undefined;
          const verdict = resolvePermission(toolCall.function.name, shellCmd, permissionsRef.current, autoApprove);
          if (verdict === 'deny') {
            const denyMsg = formatDenyResult(toolCall.function.name, shellCmd);
            removeThinking();
            addMessage({
              role: 'activity', content: '', activity: 'thinking',
              files: [{ path: 'BLOCKED', content: denyMsg, action: 'read' }],
            });
            conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: denyMsg });
            // Re-create thinking indicator for next iteration
            thinkingId = msgId();
            setMessages(prev => [...prev, {
              id: thinkingId, role: 'activity' as const, content: 'Trying a different approach...',
              activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
            }]);
            continue;
          }
          if (verdict === 'ask') {
            // Show inline confirmation. User must approve via the suggestion buttons.
            removeThinking();
            const argSummary = shellCmd
              ? `\`${shellCmd.slice(0, 120)}\``
              : `${toolCall.function.name}(${Object.entries(args).slice(0, 2).map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60)}`).join(', ')})`;
            const askId = msgId();
            setMessages(prev => [...prev, {
              id: askId, role: 'assistant' as const,
              content: `Permission needed to run ${argSummary}`,
              suggestions: ['Allow once', 'Deny'],
              streaming: false, timestamp: Date.now(),
            }]);
            // Wait for user response via the suggestions click handler
            const approved = await new Promise<boolean>((resolve) => {
              pendingApprovalRef.current = resolve;
              // Safety: auto-deny after 60 seconds of no response
              setTimeout(() => {
                if (pendingApprovalRef.current === resolve) {
                  pendingApprovalRef.current = null;
                  resolve(false);
                }
              }, 60000);
            });
            if (!approved) {
              // If the user typed free text instead of clicking Allow/Deny,
              // their message was stashed in denyFeedbackRef. Surface it to
              // the model so it actually knows what they want, instead of
              // just seeing "denied" and guessing.
              const userFeedback = denyFeedbackRef.current;
              denyFeedbackRef.current = null;
              const denyMsg = userFeedback
                ? `User denied permission for ${toolCall.function.name} and said: "${userFeedback.slice(0, 400)}". Adjust your approach to match what they want.`
                : `User denied permission for ${toolCall.function.name}. Try a different approach or ask them what they'd prefer.`;
              conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: denyMsg });
              thinkingId = msgId();
              setMessages(prev => [...prev, {
                id: thinkingId, role: 'activity' as const, content: 'Reconsidering approach...',
                activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
              }]);
              continue;
            }
            // Approved — re-create thinking indicator and fall through to execution
            thinkingId = msgId();
            setMessages(prev => [...prev, {
              id: thinkingId, role: 'activity' as const, content: 'Approved — continuing...',
              activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
            }]);
          }

          // ── Pre-tool-use lifecycle hook ──
          if (hooksRef.current.length > 0) {
            const orbit = (window as any).orbit;
            const hookCwd = projectPathRef.current || projectPath;
            if (orbit?.shellExec && hookCwd) {
              await runHooks('pre_tool_use', { tool: toolCall.function.name, file: args.path }, hooksRef.current, orbit.shellExec, hookCwd).catch(() => null);
            }
          }

          if (toolCall.function.name === 'read_file') {
            // ── READ FILE ──
            if (!args.path) { result = 'Error: read_file requires a path.'; conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result }); continue; }
            const fileName = args.path.split('/').pop() ?? args.path;
            updateThinking(`Reading ${fileName}...`);
            await new Promise(r => setTimeout(r, 200));

            const isAbsolutePath = args.path.startsWith('/') || args.path.startsWith('C:') || args.path.startsWith('D:');
            const content = isAbsolutePath ? await readFileElectron(args.path) : await readProjectFile(args.path);
            result = content ? content.slice(0, 10000) : 'File not found or empty.';

            removeThinking();
            addMessage({
              role: 'activity', content: '', activity: 'reading',
              files: [{ path: args.path, content: content.slice(0, 3000), action: 'read' }],
            });

            // Re-create thinking indicator for next step
            thinkingId = msgId();
            setMessages(prev => [...prev, {
              id: thinkingId, role: 'activity' as const, content: `Analyzing ${fileName}...`,
              activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
            }]);
            await new Promise(r => setTimeout(r, 300));

          } else if (toolCall.function.name === 'write_file') {
            // ── WRITE FILE ──
            if (!args.path || !args.content) { result = 'Error: write_file requires path and content.'; conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result }); continue; }
            const fileName = args.path.split('/').pop() ?? args.path;
            updateThinking(`Writing changes to ${fileName}...`);

            // ── before_write hook (formatters/validators that run BEFORE the write) ──
            if (hooksRef.current.length > 0) {
              const orbit = (window as any).orbit;
              const hookCwd = projectPathRef.current || projectPath;
              if (orbit?.shellExec && hookCwd) {
                await runHooks('before_write', { file: args.path }, hooksRef.current, orbit.shellExec, hookCwd).catch(() => null);
              }
            }

            // ── Preacher: snapshot the file BEFORE overwriting ──
            try {
              const isAbsPath = args.path.startsWith('/') || args.path.startsWith('C:') || args.path.startsWith('D:');
              let existingContent = '';
              if (isAbsPath) {
                const orbit = (window as any).orbit;
                if (orbit?.readFile) existingContent = await orbit.readFile(args.path).catch(() => '');
              } else {
                existingContent = await readProjectFile(args.path).catch(() => '');
              }
              if (existingContent) {
                preacher.snapshot(args.path, existingContent, 'write', `Before write_file by agent`);
              }
            } catch {} // Don't block write if snapshot fails

            await new Promise(r => setTimeout(r, 200));

            // Support absolute paths (for new projects) and relative paths (for opened projects)
            const isAbsolutePath = args.path.startsWith('/') || args.path.startsWith('C:') || args.path.startsWith('D:');
            let success: boolean;
            if (isAbsolutePath) {
              // Ensure parent directory exists
              const parentDir = args.path.substring(0, args.path.lastIndexOf('/'));
              const orbit = (window as any).orbit;
              if (orbit?.mkdir) await orbit.mkdir(parentDir);
              success = await writeFileElectron(args.path, args.content);
            } else {
              success = await writeProjectFile(args.path, args.content);
            }
            result = success
              ? `Successfully wrote ${args.content.length} characters to ${args.path}`
              : `Failed to write ${args.path}. Check permissions.`;
            if (success) filesWrittenThisLoop++;

            removeThinking();
            addMessage({
              role: 'activity', content: '', activity: 'writing',
              files: [{ path: args.path, content: args.content.slice(0, 3000), action: 'write' }],
            });

            // Update project file list if new file
            if (success) {
              setProjectFiles(prev => {
                const exists = prev.some(f => f.path === args.path);
                return exists ? prev : [...prev, { path: args.path, name: fileName }];
              });
              // Track for preview if it's a web file
              if (/\.(html|css|js)$/.test(args.path)) {
                setWrittenFiles(prev => {
                  const idx = prev.findIndex(f => f.path === args.path);
                  if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = { path: args.path, content: args.content };
                    return updated;
                  }
                  const next = [...prev, { path: args.path, content: args.content }];
                  // Auto-open preview in Electron browser tab when first HTML file is written
                  if (args.path.endsWith('.html') && !prev.some(f => f.path.endsWith('.html'))) {
                    setTimeout(() => {
                      const orbit = (window as any).orbit;
                      if (orbit?.browser?.loadHTML) {
                        orbit.browser.loadHTML(buildPreviewFromFiles(next));
                      } else {
                        setPreviewOpen(true);
                      }
                    }, 500);
                  }
                  return next;
                });
              }
            }

            // Run after_write hooks
            if (success && hooksRef.current.length > 0) {
              const orbit = (window as any).orbit;
              const hookCwd = projectPathRef.current || projectPath;
              if (orbit?.shellExec && hookCwd) {
                const hookOutput = await runHooks('after_write', { file: args.path }, hooksRef.current, orbit.shellExec, hookCwd);
                if (hookOutput) result += `\nHook: ${hookOutput.slice(0, 500)}`;
              }
            }

            // Re-create thinking indicator
            thinkingId = msgId();
            setMessages(prev => [...prev, {
              id: thinkingId, role: 'activity' as const,
              content: success ? `${fileName} saved` : `Failed to save ${fileName}`,
              activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
            }]);
            await new Promise(r => setTimeout(r, 400));

          } else if (toolCall.function.name === 'list_directory') {
            // ── LIST DIR ──
            updateThinking(`Scanning ${args.path === '.' ? 'project root' : args.path}...`);
            await new Promise(r => setTimeout(r, 150));

            const entries = listProjectDir(args.path);
            result = entries.length > 0 ? entries.join('\n') : 'Directory empty or not found.';
            removeThinking();
            addMessage({ role: 'activity', content: '', activity: 'reading', files: [{ path: args.path || '.', content: result.slice(0, 2000), action: 'read' }] });
            thinkingId = msgId();
            setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);

          } else if (toolCall.function.name === 'dispatch_agent') {
            // ── DISPATCH SUB-AGENT ──
            // Sub-agents cost 5 credits (they run a full separate AI call)
            usageBudget.consume('code_agent', SubscriptionService.getTier());

            const agentName: string = args.agent ?? 'FileScout';
            // Files can be array or comma-separated string
            const agentFiles: string[] = Array.isArray(args.files) ? args.files : (args.files ?? '').split(',').map((f: string) => f.trim()).filter(Boolean);
            const agentInstruction: string = args.instruction ?? '';

            // Show running state in chat
            removeThinking();
            const subAgentMsgId = msgId();
            setMessages(prev => [...prev, {
              id: subAgentMsgId, role: 'subagent' as const, content: '',
              subAgent: { name: agentName, status: 'running' as const },
              streaming: true, timestamp: Date.now(),
            }]);

            // Build file access adapter for sub-agents
            const fileAccess: FileAccess = {
              readFile: readProjectFile,
              writeFile: async (path: string, content: string) => writeProjectFile(path, content),
              listDir: (path: string) => listProjectDir(path),
              projectFiles,
            };

            let agentResult: SubAgentResult;
            try {
              if (agentName === 'FileScout') {
                agentResult = await runFileScout(agentFiles, agentInstruction, fileAccess, apiKey!, groqFetch);
              } else if (agentName === 'LintCheck') {
                agentResult = await runLintAgent(agentFiles, fileAccess, apiKey!, groqFetch);
              } else if (agentName === 'Refactor') {
                agentResult = await runRefactorAgent(agentFiles[0] ?? '', agentInstruction, fileAccess, apiKey!, groqFetch);
              } else if (agentName === 'TestGen') {
                agentResult = await runTestGenAgent(agentFiles[0] ?? '', fileAccess, apiKey!, groqFetch);
              } else {
                agentResult = { agentName, status: 'error', summary: `Unknown agent: ${agentName}` };
              }
            } catch (err: any) {
              agentResult = { agentName, status: 'error', summary: `Agent crashed: ${err?.message ?? 'unknown error'}` };
            }

            // Update sub-agent message with result
            setMessages(prev => {
              const idx = prev.findIndex(m => m.id === subAgentMsgId);
              if (idx === -1) return prev;
              const updated = [...prev];
              updated[idx] = {
                ...updated[idx],
                content: agentResult.summary,
                subAgent: { name: agentName, status: agentResult.status === 'error' ? 'error' : 'done' },
                files: agentResult.filesRead?.map(f => ({ path: f.path, content: f.content.slice(0, 2000), action: 'read' as const })),
                streaming: false,
              };
              return updated;
            });

            // Build result for the main agent to use
            let agentResultText = `[${agentName}] ${agentResult.summary}`;
            if (agentResult.data?.improvedContent) {
              agentResultText += `\n\nRefactored code:\n${agentResult.data.improvedContent.slice(0, 8000)}`;
            }
            if (agentResult.data?.testContent) {
              agentResultText += `\n\nGenerated test file (${agentResult.data.testPath}):\n${agentResult.data.testContent.slice(0, 8000)}`;
            }
            result = agentResultText;

            // Re-create thinking indicator
            thinkingId = msgId();
            setMessages(prev => [...prev, {
              id: thinkingId, role: 'activity' as const,
              content: `Reviewing ${agentName} results...`,
              activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
            }]);
            await new Promise(r => setTimeout(r, 400));

          } else if (toolCall.function.name === 'run_command') {
            // ── RUN SHELL COMMAND ──
            const command: string = args.command ?? '';
            const orbit = (window as any).orbit;

            const cmdCwd = projectPathRef.current || projectPath;
            if (!orbit?.shellExec) {
              result = 'Shell execution is only available in the desktop app.';
            } else {
              // ── before_command hook (e.g. log to .bleumr/commands.log) ──
              if (hooksRef.current.length > 0 && cmdCwd) {
                await runHooks('before_command', { file: command }, hooksRef.current, orbit.shellExec, cmdCwd).catch(() => null);
              }

              removeThinking();
              // Show command in chat as activity
              addMessage({
                role: 'activity', content: '', activity: 'analyzing',
                files: [{ path: `$ ${command}`, content: 'Running...', action: 'read' }],
              });

              // Re-create thinking with command name
              thinkingId = msgId();
              setMessages(prev => [...prev, {
                id: thinkingId, role: 'activity' as const,
                content: `Running: ${command.slice(0, 60)}...`,
                activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
              }]);

              let cmdSucceeded = false;
              try {
                // 60s timeout to prevent commands from hanging the agent loop forever
                const shellPromise = orbit.shellExec(command, cmdCwd || undefined);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Command timed out after 60 seconds')), 60000));
                const res = await Promise.race([shellPromise, timeoutPromise]) as any;
                const output = res.stdout || '';
                const errors = res.stderr || '';
                cmdSucceeded = !!res.success;
                result = res.success
                  ? `Command succeeded (exit 0).\n${output ? `stdout:\n${output.slice(0, 8000)}` : '(no output)'}${errors ? `\nstderr:\n${errors.slice(0, 2000)}` : ''}`
                  : `Command failed (exit ${res.code}).\n${errors ? `stderr:\n${errors.slice(0, 4000)}` : ''}${output ? `\nstdout:\n${output.slice(0, 4000)}` : ''}`;

                // Update the activity with actual output
                removeThinking();
                addMessage({
                  role: 'activity', content: '', activity: res.success ? 'analyzing' : 'writing',
                  files: [{ path: `$ ${command}`, content: (output + (errors ? '\n' + errors : '')).slice(0, 3000) || '(no output)', action: 'read' }],
                });
              } catch (err: any) {
                result = `Failed to execute command: ${err?.message ?? 'unknown error'}`;
                cmdSucceeded = false;
              }

              // ── after_command + on_error hooks ──
              if (hooksRef.current.length > 0 && cmdCwd) {
                await runHooks('after_command', {
                  file: command,
                  success: cmdSucceeded,
                }, hooksRef.current, orbit.shellExec, cmdCwd).catch(() => null);
                if (!cmdSucceeded) {
                  await runHooks('on_error', {
                    file: command,
                    error: result.slice(0, 500),
                  }, hooksRef.current, orbit.shellExec, cmdCwd).catch(() => null);
                }
              }

              // Re-create thinking indicator
              thinkingId = msgId();
              setMessages(prev => [...prev, {
                id: thinkingId, role: 'activity' as const,
                content: 'Reviewing command output...',
                activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
              }]);
              await new Promise(r => setTimeout(r, 300));
            }

          } else if (toolCall.function.name === 'create_project') {
            // ── CREATE PROJECT ──
            const projName: string = args.name ?? 'new-project';
            const orbit = (window as any).orbit;

            if (!orbit?.createProject) {
              result = 'Project creation is only available in the desktop app.';
            } else {
              updateThinking(`Creating project folder: ${projName}...`);
              try {
                const res = await orbit.createProject(projName);
                if (res.success) {
                  const newPath = res.path;
                  // Auto-set this as the active project
                  projectPathRef.current = newPath; // Set ref immediately for run_command
                  setProjectPath(newPath);
                  setProjectName(projName);
                  setIsElectronProject(true);
                  setProjectFiles([]);

                  createdProjectThisLoop = true; // Track: system prompt stays in "build from scratch" mode

                  result = res.existed
                    ? `Project folder already exists at ${newPath}. Using it as the active project. You MUST now write all files using write_file with absolute paths like ${newPath}/index.html — do NOT stop until all files are written.`
                    : `Created project folder at ${newPath}. This is now your active project. You MUST now write ALL files using write_file with absolute paths like ${newPath}/index.html — do NOT stop until every file is written.`;

                  removeThinking();
                  addMessage({
                    role: 'activity', content: '', activity: 'writing',
                    files: [{ path: newPath, content: res.existed ? 'Folder already existed' : 'Created new project folder', action: 'write' }],
                  });
                } else {
                  result = `Failed to create project: ${res.reason ?? 'unknown error'}`;
                }
              } catch (err: any) {
                result = `Error creating project: ${err?.message ?? 'unknown'}`;
              }

              thinkingId = msgId();
              setMessages(prev => [...prev, {
                id: thinkingId, role: 'activity' as const,
                content: 'Setting up project...',
                activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
              }]);
              await new Promise(r => setTimeout(r, 300));
            }

          } else if (toolCall.function.name === 'web_search') {
            // ── WEB SEARCH ──
            const query: string = args.query ?? '';
            updateThinking(`Searching: ${query.slice(0, 50)}...`);

            try {
              const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
              let rawHtml = '';

              const orbit = (window as any).orbit;
              if (orbit?.proxyFetch) {
                const res = await orbit.proxyFetch(searchUrl, {
                  method: 'GET',
                  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bleumr/1.0)' },
                });
                rawHtml = res.text ?? '';
              } else {
                const res = await fetchWithTimeout(searchUrl);
                rawHtml = await res.text();
              }

              const resultMatches = rawHtml.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/gs) ?? [];
              const snippetMatches = rawHtml.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gs) ?? [];

              const results: string[] = [];
              for (let i = 0; i < Math.min(resultMatches.length, 5); i++) {
                const title = (resultMatches[i] ?? '').replace(/<[^>]+>/g, '').trim();
                const snippet = (snippetMatches[i] ?? '').replace(/<[^>]+>/g, '').trim();
                if (title) results.push(`${i + 1}. ${title}\n   ${snippet}`);
              }

              result = results.length > 0
                ? `Search results for "${query}":\n\n${results.join('\n\n')}`
                : `No results found for "${query}". Try rephrasing.`;
            } catch {
              result = `Search failed — couldn't reach the web. Try again when online.`;
            }

            removeThinking();
            addMessage({
              role: 'activity', content: '', activity: 'analyzing',
              files: [{ path: `Search: ${query}`, content: result.slice(0, 2000), action: 'read' }],
            });

            thinkingId = msgId();
            setMessages(prev => [...prev, {
              id: thinkingId, role: 'activity' as const,
              content: 'Processing search results...',
              activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
            }]);
            await new Promise(r => setTimeout(r, 300));

          } else if (toolCall.function.name === 'ask_user') {
            // ── ASK USER (with clickable suggestions) ──
            const question: string = args.question ?? 'What would you like to do?';
            const optionStr: string = args.options ?? '';
            const options = optionStr.split(',').map((o: string) => o.trim()).filter(Boolean);

            removeThinking();
            const askId = msgId();
            setMessages(prev => [...prev, {
              id: askId, role: 'assistant' as const, content: question,
              suggestions: options.length > 0 ? options : undefined,
              streaming: false, timestamp: Date.now(),
            }]);

            result = `Question shown to user: "${question}" with options: [${options.join(', ')}]. Waiting for their response. Do NOT continue until the user responds.`;
            // Flag to break the while loop AFTER processing remaining tool calls
            askUserBreak = true;

          } else if (toolCall.function.name === 'fetch_url') {
            // ── FETCH URL ──
            const url: string = args.url ?? '';
            updateThinking(`Fetching ${url.slice(0, 50)}...`);

            try {
              const orbit = (window as any).orbit;
              let text = '';
              if (orbit?.proxyFetch) {
                const res = await orbit.proxyFetch(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bleumr/1.0)' } });
                text = res.text ?? '';
              } else {
                const res = await fetchWithTimeout(url);
                text = await res.text();
              }
              // Strip HTML tags for cleaner output
              if (args.format !== 'html') {
                text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
              }
              result = text.slice(0, 10000) || 'Empty response.';
            } catch (err: any) {
              result = `Failed to fetch URL: ${err?.message ?? 'unknown error'}`;
            }

            removeThinking();
            addMessage({
              role: 'activity', content: '', activity: 'analyzing',
              files: [{ path: `Fetch: ${url.slice(0, 60)}`, content: result.slice(0, 2000), action: 'read' }],
            });
            thinkingId = msgId();
            setMessages(prev => [...prev, {
              id: thinkingId, role: 'activity' as const, content: 'Processing...',
              activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
            }]);

          } else if (toolCall.function.name === 'check_url') {
            // ── CHECK URL ──
            updateThinking(`Checking ${args.url?.slice(0, 40)}...`);
            try {
              const orbit = (window as any).orbit;
              if (orbit?.proxyFetch) {
                const res = await orbit.proxyFetch(args.url, { method: 'HEAD', headers: {} });
                result = res.ok ? `URL is reachable (status ${res.status})` : `URL returned status ${res.status}`;
              } else {
                const res = await fetchWithTimeout(args.url, { method: 'HEAD' }, 10000);
                result = `URL is ${res.ok ? 'reachable' : 'not reachable'} (status ${res.status})`;
              }
            } catch { result = 'URL is not reachable.'; }
            removeThinking();
            addMessage({ role: 'activity', content: '', activity: 'analyzing', files: [{ path: `URL: ${(args.url || '').slice(0, 60)}`, content: result, action: 'read' }] });
            thinkingId = msgId();
            setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);

          } else if (toolCall.function.name === 'validate_html') {
            // ── W3C HTML VALIDATION ──
            const html: string = (args.html ?? '').slice(0, 50000);
            updateThinking('Validating HTML against W3C standards...');

            try {
              const orbit = (window as any).orbit;
              const validatorUrl = 'https://validator.w3.org/nu/?out=json';
              let responseText = '';

              if (orbit?.proxyFetch) {
                const res = await orbit.proxyFetch(validatorUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/html; charset=utf-8', 'User-Agent': 'Bleumr/1.0' },
                  body: html,
                });
                responseText = res.text ?? '';
              } else {
                const res = await fetchWithTimeout(validatorUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
                  body: html,
                });
                responseText = await res.text();
              }

              let data: any;
              try { data = JSON.parse(responseText); } catch {
                throw new Error(`Validator returned non-JSON response (${responseText.slice(0, 120)})`);
              }
              const messages = data.messages ?? [];
              const errors = messages.filter((m: any) => m.type === 'error');
              const warnings = messages.filter((m: any) => m.type === 'info' && m.subType === 'warning');
              const info = messages.filter((m: any) => m.type === 'info' && m.subType !== 'warning');

              const lines: string[] = [
                `## W3C HTML Validation Results`,
                `✅ Passed: ${errors.length === 0 ? 'Yes' : 'No'}`,
                `❌ Errors: ${errors.length}  ⚠️ Warnings: ${warnings.length}  ℹ️ Info: ${info.length}`,
                '',
              ];

              if (errors.length > 0) {
                lines.push('### Errors:');
                errors.slice(0, 20).forEach((e: any, i: number) => {
                  lines.push(`${i + 1}. Line ${e.lastLine ?? '?'}: ${e.message}`);
                  if (e.extract) lines.push(`   Extract: \`${e.extract.slice(0, 100)}\``);
                });
              }
              if (warnings.length > 0) {
                lines.push('', '### Warnings:');
                warnings.slice(0, 10).forEach((w: any, i: number) => {
                  lines.push(`${i + 1}. Line ${w.lastLine ?? '?'}: ${w.message}`);
                });
              }

              result = lines.join('\n');
            } catch (err: any) {
              result = `W3C HTML validation failed: ${err?.message ?? 'Validator unreachable. Try again.'}`;
            }

            removeThinking();
            addMessage({
              role: 'activity', content: '', activity: 'analyzing',
              files: [{ path: 'W3C HTML Validation', content: result.slice(0, 3000), action: 'read' }],
            });
            thinkingId = msgId();
            setMessages(prev => [...prev, {
              id: thinkingId, role: 'activity' as const, content: 'Reviewing validation results...',
              activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
            }]);

          } else if (toolCall.function.name === 'validate_css') {
            // ── W3C CSS VALIDATION ──
            const css: string = (args.css ?? '').slice(0, 50000);
            updateThinking('Validating CSS against W3C standards...');

            try {
              const orbit = (window as any).orbit;
              // Use POST with form body to avoid URL length limits on large CSS
              const validatorUrl = 'https://jigsaw.w3.org/css-validator/validator';
              const formBody = `text=${encodeURIComponent(css)}&output=json&profile=css3&warning=2`;
              let responseText = '';

              if (orbit?.proxyFetch) {
                const res = await orbit.proxyFetch(validatorUrl, {
                  method: 'POST',
                  headers: { 'User-Agent': 'Bleumr/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: formBody,
                });
                responseText = res.text ?? '';
              } else {
                const res = await fetchWithTimeout(validatorUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: formBody,
                });
                responseText = await res.text();
              }

              let data: any;
              try { data = JSON.parse(responseText); } catch {
                throw new Error(`Validator returned non-JSON response (${responseText.slice(0, 120)})`);
              }
              const validity = data?.cssvalidation?.validity ?? false;
              const cssErrors = data?.cssvalidation?.errors ?? [];
              const cssWarnings = data?.cssvalidation?.warnings ?? [];

              const lines: string[] = [
                `## W3C CSS Validation Results`,
                `✅ Valid: ${validity ? 'Yes' : 'No'}`,
                `❌ Errors: ${cssErrors.length}  ⚠️ Warnings: ${cssWarnings.length}`,
                '',
              ];

              if (cssErrors.length > 0) {
                lines.push('### Errors:');
                cssErrors.slice(0, 20).forEach((e: any, i: number) => {
                  lines.push(`${i + 1}. Line ${e.line ?? '?'}: ${e.message?.replace(/\s+/g, ' ').trim()}`);
                  if (e.context) lines.push(`   Context: \`${e.context.slice(0, 80)}\``);
                });
              }
              if (cssWarnings.length > 0) {
                lines.push('', '### Warnings:');
                cssWarnings.slice(0, 10).forEach((w: any, i: number) => {
                  lines.push(`${i + 1}. Line ${w.line ?? '?'}: ${w.message?.replace(/\s+/g, ' ').trim()}`);
                });
              }

              result = lines.join('\n');
            } catch (err: any) {
              result = `W3C CSS validation failed: ${err?.message ?? 'Validator unreachable. Try again.'}`;
            }

            removeThinking();
            addMessage({
              role: 'activity', content: '', activity: 'analyzing',
              files: [{ path: 'W3C CSS Validation', content: result.slice(0, 3000), action: 'read' }],
            });
            thinkingId = msgId();
            setMessages(prev => [...prev, {
              id: thinkingId, role: 'activity' as const, content: 'Reviewing validation results...',
              activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
            }]);


          } else if (toolCall.function.name === 'create_directory') {
            // ── CREATE DIRECTORY ──
            if (!args.path) { result = 'Error: create_directory requires a path.'; conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result }); continue; }
            updateThinking(`Creating ${args.path}...`);
            const orbit = (window as any).orbit;
            const dirPath = args.path.startsWith('/') ? args.path : `${projectPathRef.current || projectPath}/${args.path}`;
            if (orbit?.mkdir) {
              try {
                await orbit.mkdir(dirPath);
                result = `Created directory: ${dirPath}`;
              } catch (err: any) { result = `Failed: ${err?.message ?? 'unknown'}`; }
            } else { result = 'Directory creation only available in desktop app.'; }
            removeThinking();
            addMessage({ role: 'activity', content: '', activity: 'writing', files: [{ path: dirPath, content: result, action: 'write' }] });
            thinkingId = msgId();
            setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);

          } else if (toolCall.function.name === 'file_exists') {
            // ── FILE EXISTS ──
            const exists = projectFiles.some(f => f.path === args.path || f.path.endsWith(`/${args.path}`));
            result = exists ? `Yes, ${args.path} exists in the project.` : `No, ${args.path} was not found.`;
            removeThinking();
            addMessage({ role: 'activity', content: '', activity: 'analyzing', files: [{ path: args.path, content: result, action: 'read' }] });
            thinkingId = msgId();
            setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);

          } else if (toolCall.function.name === 'search_in_files') {
            // ── SEARCH IN FILES (grep) ──
            if (!args.pattern) { result = 'Error: search_in_files requires a pattern.'; conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result }); continue; }
            const orbit = (window as any).orbit;
            const cmdCwd = projectPathRef.current || projectPath;
            if (orbit?.shellExec && cmdCwd) {
              const ext = args.file_type ? `--include='*.${shellSafe(args.file_type)}'` : '--include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.rs" --include="*.go"';
              const cmd = `grep -rn '${shellSafe(args.pattern)}' . ${ext} 2>/dev/null | head -40`;
              const res = await orbit.shellExec(cmd, cmdCwd);
              result = res.stdout || 'No matches found.';
            } else {
              // Fallback: search in loaded project files
              try {
                const matches = projectFiles.filter(f => f.name.match(new RegExp(args.file_type || '.*')));
                result = `Searched ${matches.length} file names. Use run_command with grep for content search.`;
              } catch { result = 'Invalid file type pattern.'; }
            }
            removeThinking();
            addMessage({ role: 'activity', content: '', activity: 'analyzing', files: [{ path: `Search: ${args.pattern}`, content: result.slice(0, 2000), action: 'read' }] });
            thinkingId = msgId();
            setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Reviewing results...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);

          } else if (toolCall.function.name === 'find_files') {
            // ── FIND FILES (glob) ──
            updateThinking(`Finding ${args.pattern || '*'}...`);
            const pattern = args.pattern || '*';
            const orbit = (window as any).orbit;
            const cmdCwd = projectPathRef.current || projectPath;
            if (orbit?.shellExec && cmdCwd) {
              const cmd = `find . -name '${shellSafe(pattern)}' -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -50`;
              const res = await orbit.shellExec(cmd, cmdCwd);
              result = res.stdout || 'No matching files found.';
            } else {
              const matches = projectFiles.filter(f => f.name.match(new RegExp(pattern.replace(/\*/g, '.*'))));
              result = matches.map(f => f.path).join('\n') || 'No matches.';
            }
            removeThinking();
            addMessage({ role: 'activity', content: '', activity: 'analyzing', files: [{ path: `Find: ${pattern}`, content: result.slice(0, 2000), action: 'read' }] });
            thinkingId = msgId();
            setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);

          } else if (toolCall.function.name === 'replace_in_file') {
            // ── REPLACE IN FILE ──
            if (!args.path || args.find === undefined || args.replace === undefined) {
              result = 'Error: replace_in_file requires path, find, and replace.';
              conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result }); continue;
            }
            if (args.find === '') { result = 'Error: find string cannot be empty.'; conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result }); continue; }
            try {
              const content = args.path.startsWith('/') ? await readFileElectron(args.path) : await readProjectFile(args.path);
              if (!content) { result = `File not found: ${args.path}`; }
              else {
                // Preacher: snapshot before replace
                preacher.snapshot(args.path, content, 'replace', `Before replace_in_file: "${(args.find ?? '').slice(0, 40)}"`);

                const newContent = content.split(args.find).join(args.replace);
                if (newContent === content) { result = `Text "${args.find.slice(0, 80)}" not found in ${args.path}.`; }
                else {
                  const isAbs = args.path.startsWith('/');
                  const success = isAbs ? await writeFileElectron(args.path, newContent) : await writeProjectFile(args.path, newContent);
                  const count = (content.split(args.find).length - 1);
                  result = success ? `Replaced ${count} occurrence(s) in ${args.path}.` : `Failed to write ${args.path}.`;
                  if (success) {
                    removeThinking();
                    addMessage({ role: 'activity', content: '', activity: 'writing', files: [{ path: args.path, content: newContent.slice(0, 2000), action: 'write' }] });
                    thinkingId = msgId();
                    setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: `Replaced in ${args.path.split('/').pop()}`, activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);
                  }
                }
              }
            } catch (err: any) { result = `Replace failed: ${err?.message ?? 'unknown error'}`; }
            // Ensure thinking state is clean regardless of outcome
            removeThinking();
            thinkingId = msgId();
            setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);

          } else if (toolCall.function.name === 'get_project_tree') {
            // ── PROJECT TREE ──
            updateThinking('Mapping project structure...');
            const orbit = (window as any).orbit;
            const cmdCwd = projectPathRef.current || projectPath;
            if (orbit?.shellExec && cmdCwd) {
              const rawDepth = String(args.depth || '3').replace(/[^0-9]/g, '') || '3';
              const depth = Math.min(parseInt(rawDepth, 10), 10);
              const treePath = safePath(String(args.path || '.')) ?? '.';
              const cmd = `find ${shellSafe(treePath)} -maxdepth ${depth} -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" 2>/dev/null | head -100 | sort`;
              const res = await orbit.shellExec(cmd, cmdCwd);
              result = res.stdout || 'Empty project.';
            } else {
              result = projectFiles.map(f => f.path).sort().join('\n') || 'No files loaded.';
            }
            removeThinking();
            addMessage({ role: 'activity', content: '', activity: 'reading', files: [{ path: 'Project Tree', content: result.slice(0, 2000), action: 'read' }] });
            thinkingId = msgId();
            setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);

          } else if (toolCall.function.name === 'get_project_info') {
            // ── PROJECT INFO ──
            updateThinking('Reading project metadata...');
            const pkgContent = await readProjectFile('package.json');
            if (pkgContent) {
              try {
                const pkg = JSON.parse(pkgContent);
                result = `Name: ${pkg.name || 'unnamed'}\nVersion: ${pkg.version || '0.0.0'}\nDependencies: ${Object.keys(pkg.dependencies || {}).join(', ') || 'none'}\nDev deps: ${Object.keys(pkg.devDependencies || {}).join(', ') || 'none'}\nScripts: ${Object.keys(pkg.scripts || {}).join(', ') || 'none'}`;
              } catch { result = 'package.json found but could not parse.'; }
            } else {
              result = `Project at: ${projectPathRef.current || projectPath || 'unknown'}\nFiles: ${projectFiles.length}\nNo package.json found.`;
            }
            removeThinking();
            addMessage({ role: 'activity', content: '', activity: 'reading', files: [{ path: 'package.json', content: result.slice(0, 2000), action: 'read' }] });
            thinkingId = msgId();
            setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);

          } else if (toolCall.function.name === 'scaffold_component' || toolCall.function.name === 'scaffold_page' || toolCall.function.name === 'scaffold_api' || toolCall.function.name === 'scaffold_test') {
            // ── SCAFFOLD TOOLS — generate template and write file ──
            const rawName = args.name || args.source_file?.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Template';
            const scaffoldName = safePath(rawName.replace(/[^a-zA-Z0-9_-]/g, '')) ?? 'Template';
            const fw = (args.framework || 'react').toLowerCase();
            let scaffoldPath = '';
            let scaffoldContent = '';

            if (toolCall.function.name === 'scaffold_component') {
              scaffoldPath = `src/components/${scaffoldName}.tsx`;
              scaffoldContent = `import React from 'react';\n\ninterface ${scaffoldName}Props {\n  // Add your props here\n}\n\nexport function ${scaffoldName}({}: ${scaffoldName}Props) {\n  return (\n    <div>\n      <h2>${scaffoldName}</h2>\n    </div>\n  );\n}\n`;
              if (fw.includes('vue')) { scaffoldPath = `src/components/${scaffoldName}.vue`; scaffoldContent = `<template>\n  <div>\n    <h2>${scaffoldName}</h2>\n  </div>\n</template>\n\n<script setup lang="ts">\n// Props and logic here\n</script>\n`; }
            } else if (toolCall.function.name === 'scaffold_page') {
              scaffoldPath = `src/pages/${scaffoldName}.tsx`;
              scaffoldContent = `import React from 'react';\n\nexport default function ${scaffoldName}Page() {\n  return (\n    <div>\n      <h1>${scaffoldName}</h1>\n    </div>\n  );\n}\n`;
            } else if (toolCall.function.name === 'scaffold_api') {
              const method = (args.method || 'GET').toUpperCase();
              scaffoldPath = `src/api/${scaffoldName}.ts`;
              scaffoldContent = `// ${method} /api/${scaffoldName.toLowerCase()}\n\nexport async function handler(req: Request): Promise<Response> {\n  if (req.method !== '${method}') {\n    return new Response('Method not allowed', { status: 405 });\n  }\n\n  try {\n    // Your logic here\n    return Response.json({ message: 'OK' });\n  } catch (error) {\n    return Response.json({ error: 'Internal error' }, { status: 500 });\n  }\n}\n`;
            } else if (toolCall.function.name === 'scaffold_test') {
              const srcFile = args.source_file || `${scaffoldName}.ts`;
              const testFw = (args.framework || 'vitest').toLowerCase();
              const extMatch = srcFile.match(/\.(ts|tsx|js|jsx)$/);
              scaffoldPath = extMatch ? srcFile.replace(extMatch[0], `.test${extMatch[0]}`) : `${srcFile}.test.ts`;
              if (testFw.includes('pytest')) {
                scaffoldPath = `tests/test_${scaffoldName.toLowerCase()}.py`;
                scaffoldContent = `import pytest\n\n\ndef test_${scaffoldName.toLowerCase()}_exists():\n    \"\"\"Test that ${scaffoldName} works correctly.\"\"\"\n    assert True  # Replace with real tests\n`;
              } else {
                scaffoldContent = `import { describe, it, expect } from '${testFw.includes('jest') ? '@jest/globals' : 'vitest'}';\n\ndescribe('${scaffoldName}', () => {\n  it('should work correctly', () => {\n    expect(true).toBe(true); // Replace with real tests\n  });\n});\n`;
              }
            }

            // Write the scaffold file
            const isAbs = scaffoldPath.startsWith('/');
            const fullPath = isAbs ? scaffoldPath : `${projectPathRef.current || projectPath}/${scaffoldPath}`;
            const orbit = (window as any).orbit;
            const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
            if (orbit?.mkdir) await orbit.mkdir(parentDir);
            const success = await writeFileElectron(fullPath, scaffoldContent);
            result = success ? `Scaffolded ${scaffoldPath} (${scaffoldContent.length} chars)` : `Failed to scaffold ${scaffoldPath}`;

            if (success) {
              removeThinking();
              addMessage({ role: 'activity', content: '', activity: 'writing', files: [{ path: scaffoldPath, content: scaffoldContent.slice(0, 2000), action: 'write' }] });
              setProjectFiles(prev => prev.some(f => f.path === scaffoldPath) ? prev : [...prev, { path: scaffoldPath, name: scaffoldPath.split('/').pop() ?? scaffoldPath }]);
              thinkingId = msgId();
              setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: `Scaffolded ${scaffoldPath.split('/').pop()}`, activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);
            }

          } else if (toolCall.function.name === 'import_image') {
            // ── IMPORT IMAGE into project ──
            const orbit = (window as any).orbit;
            const srcPath: string = args.source_path ?? '';
            const destPath: string = args.dest_path ?? '';
            const cmdCwd = projectPathRef.current || projectPath;

            if (!safePath(srcPath) || !safePath(destPath)) {
              result = 'Invalid path — paths must not contain ".." or shell metacharacters.';
            } else if (!orbit?.shellExec || !cmdCwd) {
              result = 'Image import only available in the desktop app with a project open.';
            } else {
              const fullDest = destPath.startsWith('/') ? destPath : `${cmdCwd}/${destPath}`;
              const parentDir = fullDest.substring(0, fullDest.lastIndexOf('/'));
              try {
                if (orbit.mkdir) await orbit.mkdir(parentDir);
                const res = await orbit.shellExec(`cp '${shellSafe(srcPath)}' '${shellSafe(fullDest)}'`, cmdCwd);
                if (res.success) {
                  result = `Copied image to ${destPath}. You can reference it in your code as "${destPath}" or "./${destPath}".`;
                  removeThinking();
                  addMessage({ role: 'activity', content: '', activity: 'writing', files: [{ path: destPath, content: `[Image: ${srcPath.split('/').pop()}]`, action: 'write' }] });
                  setProjectFiles(prev => prev.some(f => f.path === destPath) ? prev : [...prev, { path: destPath, name: destPath.split('/').pop() ?? destPath }]);
                  thinkingId = msgId();
                  setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: `Imported ${srcPath.split('/').pop()}`, activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);
                } else {
                  result = `Failed to copy image: ${res.stderr || 'unknown error'}`;
                }
              } catch (err: any) {
                result = `Error importing image: ${err?.message ?? 'unknown'}`;
              }
            }

          } else if (toolCall.function.name === 'rollback_file') {
            // ── PREACHER: UNDO LAST CHANGE ──
            if (!args.path) { result = 'Error: rollback_file requires a path.'; conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result }); continue; }
            const snap = preacher.popLatest(args.path);
            if (!snap) {
              result = `No snapshot found for ${args.path}. Preacher only has backups of files you've modified this session.`;
              removeThinking();
              thinkingId = msgId();
              setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);
            } else {
              updateThinking(`Rolling back ${args.path.split('/').pop()}...`);
              const isAbs = args.path.startsWith('/') || snap.path.startsWith('/');
              const success = isAbs ? await writeFileElectron(snap.path, snap.content) : await writeProjectFile(snap.path, snap.content);
              result = success
                ? `Rolled back ${args.path} to its state before your last change (snapshot from ${new Date(snap.timestamp).toLocaleTimeString()}). ${preacher.getHistory(args.path).length} older version(s) still available.`
                : `Rollback failed — couldn't write to ${args.path}.`;
              if (success) {
                removeThinking();
                addMessage({
                  role: 'activity', content: '', activity: 'writing',
                  files: [{ path: args.path, content: snap.content.slice(0, 2000), action: 'write' }],
                });
                thinkingId = msgId();
                setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: `Rolled back ${args.path.split('/').pop()}`, activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);
              }
            }

          } else if (toolCall.function.name === 'rollback_file_original') {
            // ── PREACHER: NUCLEAR ROLLBACK TO ORIGINAL ──
            if (!args.path) { result = 'Error: rollback_file_original requires a path.'; conversationMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result }); continue; }
            const snap = preacher.getOriginal(args.path);
            if (!snap) {
              result = `No original snapshot found for ${args.path}. Preacher only has backups of files you've modified this session.`;
              removeThinking();
              thinkingId = msgId();
              setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: 'Processing...', activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);
            } else {
              updateThinking(`Restoring original ${args.path.split('/').pop()}...`);
              const isAbs = args.path.startsWith('/') || snap.path.startsWith('/');
              const success = isAbs ? await writeFileElectron(snap.path, snap.content) : await writeProjectFile(snap.path, snap.content);
              result = success
                ? `Fully restored ${args.path} to its original state (before any of your changes). All ${preacher.getHistory(args.path).length} intermediate versions cleared.`
                : `Rollback failed — couldn't write to ${args.path}.`;
              if (success) {
                preacher.clearFile(args.path); // Clear all snapshots — we're back to original
                removeThinking();
                addMessage({
                  role: 'activity', content: '', activity: 'writing',
                  files: [{ path: args.path, content: snap.content.slice(0, 2000), action: 'write' }],
                });
                thinkingId = msgId();
                setMessages(prev => [...prev, { id: thinkingId, role: 'activity' as const, content: `Restored original ${args.path.split('/').pop()}`, activity: 'thinking' as const, streaming: true, timestamp: Date.now() }]);
              }
            }

          } else if (SHELL_CMD[toolCall.function.name]) {
            // ── SHELL-BASED TOOLS (git, packages, build, analysis, etc.) ──
            const shellCommand = SHELL_CMD[toolCall.function.name](args);
            const orbit = (window as any).orbit;
            const cmdCwd = projectPathRef.current || projectPath;

            // Preacher: snapshot before destructive file operations
            if (orbit?.readFile && (toolCall.function.name === 'delete_file' || toolCall.function.name === 'rename_file' || toolCall.function.name === 'move_file')) {
              const targetPath = args.path || args.old_path || args.source || '';
              if (targetPath) {
                try {
                  const fullPath = targetPath.startsWith('/') ? targetPath : `${cmdCwd}/${targetPath}`;
                  const snap = await orbit.readFile(fullPath).catch(() => '');
                  if (snap) preacher.snapshot(targetPath, snap, toolCall.function.name === 'delete_file' ? 'delete' : 'rename', `Before ${toolCall.function.name}`);
                } catch {}
              }
            }

            if (!orbit?.shellExec) {
              result = 'Shell execution is only available in the desktop app.';
            } else {
              const toolLabel = toolCall.function.name.replace(/_/g, ' ');
              removeThinking();
              addMessage({
                role: 'activity', content: '', activity: 'analyzing',
                files: [{ path: `$ ${shellCommand.slice(0, 80)}`, content: 'Running...', action: 'read' }],
              });
              thinkingId = msgId();
              setMessages(prev => [...prev, {
                id: thinkingId, role: 'activity' as const,
                content: `${toolLabel}: ${shellCommand.slice(0, 50)}...`,
                activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
              }]);

              try {
                const res = await orbit.shellExec(shellCommand, cmdCwd || undefined);
                const output = res.stdout || '';
                const errors = res.stderr || '';
                result = res.success
                  ? `${toolLabel} succeeded.\n${output ? output.slice(0, 8000) : '(no output)'}${errors ? `\nWarnings:\n${errors.slice(0, 2000)}` : ''}`
                  : `${toolLabel} failed (exit ${res.code}).\n${errors ? errors.slice(0, 4000) : ''}${output ? `\n${output.slice(0, 4000)}` : ''}`;

                removeThinking();
                addMessage({
                  role: 'activity', content: '', activity: res.success ? 'analyzing' : 'writing',
                  files: [{ path: `$ ${shellCommand.slice(0, 80)}`, content: (output + (errors ? '\n' + errors : '')).slice(0, 3000) || '(no output)', action: 'read' }],
                });
              } catch (err: any) {
                result = `Failed: ${err?.message ?? 'unknown error'}`;
              }

              thinkingId = msgId();
              setMessages(prev => [...prev, {
                id: thinkingId, role: 'activity' as const,
                content: 'Reviewing output...',
                activity: 'thinking' as const, streaming: true, timestamp: Date.now(),
              }]);
              await new Promise(r => setTimeout(r, 200));
            }

          } else {
            // ── UNKNOWN TOOL — fallback ──
            result = `Unknown tool: ${toolCall.function.name}. Use run_command as a fallback.`;
          }

          // Cap tool results to prevent context explosion across iterations
          const cappedResult = result.length > 4000 ? result.slice(0, 4000) + '\n... (truncated)' : result;
          conversationMessages.push({
            role: 'tool', tool_call_id: toolCall.id, content: cappedResult,
          });
          if (result) toolResultsLog.push(result.slice(0, 500));

          // ── Post-tool-use lifecycle hook ──
          if (hooksRef.current.length > 0) {
            const orbit = (window as any).orbit;
            const hookCwd = projectPathRef.current || projectPath;
            if (orbit?.shellExec && hookCwd) {
              const success = !result.toLowerCase().startsWith('error') && !result.toLowerCase().startsWith('failed');
              await runHooks('post_tool_use', {
                tool: toolCall.function.name,
                file: args.path,
                success,
              }, hooksRef.current, orbit.shellExec, hookCwd).catch(() => null);
            }
          }
        }

        // Break after ask_user — but only after all tool calls in this batch are processed
        if (askUserBreak) break;
        // Loop continues — AI processes tool results
      }

      removeThinking();
      // Sweep ALL lingering thinking indicators — catches any that slipped through React batching
      setMessages(prev => prev.filter(m => !(m.role === 'activity' && m.activity === 'thinking' && m.streaming)));

      // ── Fire task_complete lifecycle hook ──
      if (hooksRef.current.length > 0) {
        const orbit = (window as any).orbit;
        const hookCwd = projectPathRef.current || projectPath;
        if (orbit?.shellExec && hookCwd) {
          runHooks('task_complete', { success: !abortedRef.current }, hooksRef.current, orbit.shellExec, hookCwd).catch(() => null);
        }
      }

      // ── Post-loop: ensure a closing response exists ──
      // If the last visible message is NOT from the assistant (e.g. it's an activity),
      // make one final call to get a summary of what was done.
      const lastMsgs = await new Promise<AgentMessage[]>(resolve => {
        setMessages(prev => { resolve(prev); return prev; });
      });
      const lastMsg = lastMsgs[lastMsgs.length - 1];
      const needsClosing = lastMsg && lastMsg.role !== 'assistant' && lastMsg.role !== 'user' && conversationMessages.length > 2;

      if (needsClosing && apiKey && !abortedRef.current) {
        // Wrap closing response in a 10s timeout — prevents Stop button from getting stuck
        const closingTimeout = new Promise<void>(resolve => setTimeout(resolve, 10000));
        const closingWork = (async () => {
          const closingBody = {
            model: pickModel('closing'),
            messages: [
              { role: 'system', content: 'You are Code Bleu. You just finished working on a task. Talk to the user naturally — summarize what you did in 2-4 sentences. Mention specific files, features, or changes. If you built something, explain how they can use it. Be warm and helpful, like a developer wrapping up with their teammate. No markdown formatting. NEVER use generic filler like "Let me know if you need anything" or "Please note that..." — just describe what you actually did.' },
              ...conversationMessages.slice(-6),
            ],
            max_tokens: 300,
            temperature: 0.3,
          };

          const closingId = msgId();
          let closingStreamed = false;

          setMessages(prev => [...prev, {
            id: closingId, role: 'assistant' as const, content: '',
            streaming: true, timestamp: Date.now(),
          }]);

          try {
            await streamGroqResponse(apiKey, closingBody, (chunk) => {
              closingStreamed = true;
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === closingId);
                if (idx === -1) return prev;
                const updated = [...prev];
                updated[idx] = { ...updated[idx], content: updated[idx].content + chunk };
                return updated;
              });
            }, abortedRef);
          } catch {
            try {
              const data = await groqFetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(closingBody),
              });
              const text = data.choices?.[0]?.message?.content?.trim();
              if (text) {
                setMessages(prev => {
                  const idx = prev.findIndex(m => m.id === closingId);
                  if (idx === -1) return prev;
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], content: text };
                  return updated;
                });
                closingStreamed = true;
              }
            } catch { /* give up */ }
          }

          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === closingId);
            if (idx === -1) return prev;
            if (!closingStreamed) return prev.filter(m => m.id !== closingId);
            const updated = [...prev];
            updated[idx] = { ...updated[idx], streaming: false };
            return updated;
          });
        })();
        try { await Promise.race([closingWork, closingTimeout]); } catch { /* best-effort */ }
      }

    } catch (err: any) {
      // Remove any lingering thinking indicators
      setMessages(prev => prev.filter(m => !(m.role === 'activity' && m.activity === 'thinking' && m.streaming)));

      // ── on_error lifecycle hook ──
      if (hooksRef.current.length > 0) {
        const orbit = (window as any).orbit;
        const hookCwd = projectPathRef.current || projectPath;
        if (orbit?.shellExec && hookCwd) {
          runHooks('on_error', {
            error: (err as Error)?.message ?? 'unknown error',
            success: false,
          }, hooksRef.current, orbit.shellExec, hookCwd).catch(() => null);
        }
      }

      const errMsg = (err as Error)?.message ?? '';
      let errorContent: string;

      if (errMsg === 'NO_KEY') {
        errorContent = 'No API key configured. Add your Groq key in Settings to start coding.';
      } else if (errMsg === 'OFFLINE') {
        errorContent = 'Looks like the connection dropped — I tried a few times but couldn\'t reach the AI service. Your project files are still loaded and safe. Check your internet connection and try again.';
      } else if (errMsg.includes('429') || errMsg.includes('rate')) {
        errorContent = 'Hit the rate limit on the AI service. Give it a few seconds and try again.';
      } else if (errMsg.includes('401')) {
        errorContent = 'Your Groq API key seems invalid or expired. Check it in Settings and try again.';
      } else if (errMsg.includes('API error')) {
        errorContent = `The AI service returned an error (${errMsg}). This is usually temporary — try again in a moment.`;
      } else {
        errorContent = 'Something went wrong reaching the AI service. Your files are still loaded — try sending your message again.';
      }

      const errId = msgId();
      setMessages(prev => [...prev, {
        id: errId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now(),
      }]);
      await typewriterAnimate(errorContent, errId);
    } finally {
      // Only update shared state if this loop is still the active generation
      // (prevents stale loops from corrupting a new session's state)
      const isStale = loopGenRef.current !== myGen;

      if (!isStale && toolResultsLog.length > 0) {
        // Preserve tool context for next sendToAgent call (so model remembers what it did)
        lastToolContextRef.current = toolResultsLog
          .slice(-8)
          .map(r => r.slice(0, 120))
          .join(' | ')
          .slice(0, 800);
      }
      // Persist the FULL conversation (with tool_use + tool_result blocks)
      // so the next turn picks up exactly where this one left off. Cap to the
      // last 30 entries — long enough to remember what was just built, short
      // enough that we don't blow the context window over many turns.
      if (!isStale && conversationMessages.length > 0) {
        prevConversationRef.current = conversationMessages.slice(-30);
      }
      // Auto-memory: extract learnable patterns from this interaction (safe even if stale)
      if (toolResultsLog.length > 0 || lastAssistantText) {
        try { extractCodeMemories(lastUserMsgRef.current, lastAssistantText, toolResultsLog); } catch { /* best-effort */ }
      }
      // Defensive: if a permission prompt is still pending (e.g. the loop
      // exited via abort or maxIterations while awaiting approval), resolve
      // it as deny so the awaiting promise doesn't leak forever.
      if (pendingApprovalRef.current) {
        const resolve = pendingApprovalRef.current;
        pendingApprovalRef.current = null;
        try { resolve(false); } catch { /* ignore */ }
      }
      denyFeedbackRef.current = null;
      // Always release running locks — a stuck "running" state is worse than a brief race
      agentRunningRef.current = false;
      setIsWorking(false);
    }
  }, [isWorking, messages, projectContext, projectFiles, apiKey, addMessage, readProjectFile, writeProjectFile, listProjectDir, typewriterAnimate, autoApprove, attachedImages, planMode, bleumrConfig]);

  // Wrapper that reads from input state
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    // ── Pending-approval intercept ──────────────────────────────────────────
    // If a tool is currently waiting on user permission and the user types
    // free text instead of clicking [Allow once] / [Deny], interpret short
    // affirmative phrases as approval and treat everything else as denial
    // while passing the typed message through to the agent as feedback. This
    // is the fix for the "agent never stops, I had to press Stop" bug — the
    // promise the loop was awaiting now resolves the instant the user types
    // anything, so isWorking flips back to false on its own.
    if (pendingApprovalRef.current) {
      const lc = text.toLowerCase();
      const looksAffirmative = /^(y|yes|yeah|yep|yup|sure|ok|okay|fine|please|do it|go|go ahead|allow|approve|approved|run it|continue|proceed)\b[.,!\s]*$/.test(lc);
      const resolve = pendingApprovalRef.current;
      pendingApprovalRef.current = null;
      // Show the user's reply in the chat so they have a record of it
      addMessage({ role: 'user', content: text });
      setInput('');
      inputRef.current?.focus();
      if (!looksAffirmative) {
        // Stash the typed feedback so the loop's deny branch can inject it
        // into the next iteration as an actual user message instead of just
        // "denied". The agent then reconsiders based on what they said.
        denyFeedbackRef.current = text;
      }
      resolve(looksAffirmative);
      return;
    }

    // Intercept built-in slash commands — don't send them to the agent
    if (text.startsWith('/')) {
      const cmdName = text.slice(1).split(/\s/)[0];
      const isBuiltIn = ['clear', 'init', 'permissions', 'help', 'plan', 'rewind'].includes(cmdName);
      if (isBuiltIn && runBuiltInCommandRef.current) {
        runBuiltInCommandRef.current(cmdName);
        return;
      }
    }
    setInput('');
    inputRef.current?.focus();
    sendToAgent(text);
  }, [input, sendToAgent, addMessage]);

  // Handle suggestion chip clicks
  const handleSuggestionClick = useCallback((option: string, msgIdToUpdate: string) => {
    // Remove suggestions from the message
    setMessages(prev => prev.map(m =>
      m.id === msgIdToUpdate ? { ...m, suggestions: undefined } : m
    ));

    // ── Permission approval intercept — if a tool is waiting on user approval,
    // resolve the pending promise instead of sending a new agent message ──
    if (pendingApprovalRef.current && (option === 'Allow once' || option === 'Deny')) {
      const resolve = pendingApprovalRef.current;
      pendingApprovalRef.current = null;
      resolve(option === 'Allow once');
      return;
    }

    sendToAgent(option);
  }, [sendToAgent]);

  // ── Image/file upload ──
  const handleAttachFiles = useCallback(async () => {
    const orbit = (window as any).orbit;
    if (!orbit?.showOpenDialog) return;

    const result = await orbit.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePaths?.length) return;

    for (const filePath of result.filePaths) {
      const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);

      if (isImage && orbit.readFileBase64) {
        const data = await orbit.readFileBase64(filePath);
        if (data) {
          const dataUri = `data:${data.contentType};base64,${data.base64}`;
          const name = filePath.split('/').pop() ?? filePath;
          setAttachedImages(prev => [...prev, { name, dataUri, path: filePath }]);
        }
      } else {
        // Non-image file — read as text and mention in input
        const content = await orbit.readFile(filePath);
        if (content) {
          const name = filePath.split('/').pop() ?? filePath;
          setInput(prev => prev + (prev ? '\n' : '') + `[Attached file: ${name}]\n`);
        }
      }
    }
  }, []);

  // Handle paste (for screenshots / clipboard images)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUri = reader.result as string;
          const name = `screenshot_${Date.now()}.png`;
          setAttachedImages(prev => [...prev, { name, dataUri, path: '' }]);
        };
        reader.readAsDataURL(blob);
      }
    }
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Session management (must be before handleReset) ──
  const saveCurrentSession = useCallback(() => {
    if (messages.length === 0) return null;
    const sessionId = activeSessionId ?? `session_${Date.now()}`;
    const firstUserMsg = messages.find(m => m.role === 'user')?.content ?? '';
    const sessionName = firstUserMsg.slice(0, 40) || projectName || 'Untitled session';

    const session: CodingSession = {
      id: sessionId,
      name: sessionName,
      projectName,
      messages: messages.filter(m => m.role === 'user' || m.role === 'assistant'),
      projectPath,
      projectContext,
      projectFiles,
      timestamp: Date.now(),
    };

    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === sessionId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = session;
        return updated;
      }
      return [session, ...prev];
    });
    setActiveSessionId(sessionId);
    // Persist to localStorage
    saveCodeSession(session);
    return sessionId;
  }, [messages, activeSessionId, projectName, projectPath, projectContext, projectFiles]);

  // Helper: fire session_end hook (best-effort, never blocks)
  const fireSessionEnd = useCallback(() => {
    if (hooksRef.current.length === 0 || !sessionStartedRef.current) return;
    const orbit = (window as any).orbit;
    const hookCwd = projectPathRef.current || projectPath;
    if (orbit?.shellExec && hookCwd) {
      runHooks('session_end', {}, hooksRef.current, orbit.shellExec, hookCwd).catch(() => null);
    }
  }, [projectPath]);

  const loadSession = useCallback((session: CodingSession) => {
    // Fire session_end for the OUTGOING session before loading the new one
    fireSessionEnd();
    sessionStartedRef.current = false;

    // Abort any running agent loop + invalidate stale generation
    abortedRef.current = true;
    agentRunningRef.current = false;
    loopGenRef.current++;
    setIsWorking(false);

    // Wipe conversation context — the new session has its own history and
    // tool results; carrying the old ones over would confuse the agent.
    prevConversationRef.current = [];
    lastToolContextRef.current = '';
    denyFeedbackRef.current = null;
    if (pendingApprovalRef.current) {
      const r = pendingApprovalRef.current;
      pendingApprovalRef.current = null;
      try { r(false); } catch { /* ignore */ }
    }

    setMessages(session.messages);
    setProjectName(session.projectName);
    setProjectPath(session.projectPath);
    setProjectContext(session.projectContext);
    setProjectFiles(session.projectFiles);
    setIsElectronProject(!!session.projectPath);
    setActiveSessionId(session.id);
    setMenuOpen(false);
    setPreviewOpen(false);
    setWrittenFiles([]);
    // Load checkpoints for this session
    setCheckpoints(loadCheckpoints(session.id));
  }, []);

  const startNewSession = useCallback(() => {
    // Fire session_end for the outgoing session
    fireSessionEnd();

    // Abort any running agent loop + invalidate stale generation
    abortedRef.current = true;
    agentRunningRef.current = false;
    loopGenRef.current++;
    setIsWorking(false);

    // Wipe conversation context — fresh session starts from zero
    prevConversationRef.current = [];
    lastToolContextRef.current = '';
    denyFeedbackRef.current = null;
    if (pendingApprovalRef.current) {
      const r = pendingApprovalRef.current;
      pendingApprovalRef.current = null;
      try { r(false); } catch { /* ignore */ }
    }

    saveCurrentSession();
    setMessages([]);
    setProjectPath(null);
    setProjectName(null);
    setProjectFiles([]);
    setProjectContext('');
    setDirHandle(null);
    setIsElectronProject(false);
    setPreviewOpen(false);
    setWrittenFiles([]);
    setActiveSessionId(null);
    setMenuOpen(false);
    setBleumrConfig(null);
    hooksRef.current = [];
    skillsRef.current = [];
    permissionsRef.current = parsePermissions('');
    sessionStartedRef.current = false;
    setCheckpoints([]);
    setCheckpointPanelOpen(false);
  }, [saveCurrentSession, fireSessionEnd]);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    deleteCodeSession(sessionId);
    clearCheckpoints(sessionId);
    if (activeSessionId === sessionId) {
      // Clear all state so deleted session doesn't linger in the UI
      setActiveSessionId(null);
      setMessages([]);
      setProjectPath(null);
      setProjectName(null);
      setProjectFiles([]);
      setProjectContext('');
      setDirHandle(null);
      setIsElectronProject(false);
      setWrittenFiles([]);
      setCheckpoints([]);
      // Wipe conversation context too — the deleted session's tool history
      // would point at files that may no longer exist
      prevConversationRef.current = [];
      lastToolContextRef.current = '';
      denyFeedbackRef.current = null;
      if (pendingApprovalRef.current) {
        const r = pendingApprovalRef.current;
        pendingApprovalRef.current = null;
        try { r(false); } catch { /* ignore */ }
      }
    }
  }, [activeSessionId]);

  // ── Reset (saves current session first) ──
  const handleReset = useCallback(() => {
    // Fire session_end for the outgoing session
    fireSessionEnd();

    // Abort any running agent loop first + invalidate stale generation
    abortedRef.current = true;
    agentRunningRef.current = false;
    loopGenRef.current++;
    setIsWorking(false);

    // Wipe conversation context — fresh start
    prevConversationRef.current = [];
    lastToolContextRef.current = '';
    denyFeedbackRef.current = null;
    if (pendingApprovalRef.current) {
      const r = pendingApprovalRef.current;
      pendingApprovalRef.current = null;
      try { r(false); } catch { /* ignore */ }
    }

    saveCurrentSession();
    setMessages([]);
    setProjectPath(null);
    setProjectName(null);
    setProjectFiles([]);
    setProjectContext('');
    setDirHandle(null);
    setIsElectronProject(false);
    setPreviewOpen(false);
    setWrittenFiles([]);
    setActiveSessionId(null);
    setBleumrConfig(null);
    hooksRef.current = [];
    skillsRef.current = [];
    permissionsRef.current = parsePermissions('');
    sessionStartedRef.current = false;
    setCheckpoints([]);
    setCheckpointPanelOpen(false);
  }, [saveCurrentSession, fireSessionEnd]);

  // ── Checkpoint restore — load a snapshot back into current state ──
  const restoreCheckpoint = useCallback(async (checkpointId: string) => {
    if (!activeSessionId) return;
    const data = loadCheckpoint(activeSessionId, checkpointId);
    if (!data) {
      addMessage({ role: 'assistant', content: 'Could not load that checkpoint — it may have been pruned.' });
      return;
    }

    // Abort any running loop
    abortedRef.current = true;
    agentRunningRef.current = false;
    loopGenRef.current++;
    setIsWorking(false);

    // Wipe conversation context — checkpoint restore is a hard rewind, the
    // tool history from after this point is no longer valid
    prevConversationRef.current = [];
    lastToolContextRef.current = '';
    denyFeedbackRef.current = null;
    if (pendingApprovalRef.current) {
      const r = pendingApprovalRef.current;
      pendingApprovalRef.current = null;
      try { r(false); } catch { /* ignore */ }
    }

    // Restore messages (filter to user/assistant only since that's what was stored)
    setMessages(data.messages.map(m => ({
      id: m.id,
      role: m.role as any,
      content: m.content,
      timestamp: m.timestamp ?? Date.now(),
      streaming: false,
    })));

    // Restore in-memory written files map
    setWrittenFiles(data.files);

    // Write the snapshotted files back to disk so the project state matches
    const orbit = (window as any).orbit;
    let restoredCount = 0;
    let failedCount = 0;
    if (orbit?.writeFile && data.files.length > 0) {
      for (const f of data.files) {
        try {
          await orbit.writeFile(f.path, f.content);
          restoredCount++;
        } catch {
          failedCount++;
        }
      }
    }

    setCheckpointPanelOpen(false);

    // Add a system note so the user knows what just happened
    const summary = data.files.length === 0
      ? `Rewound to checkpoint from ${formatCheckpointTime(data.timestamp)}: "${data.prompt.slice(0, 80)}". Restored ${data.messages.length} messages.`
      : `Rewound to checkpoint from ${formatCheckpointTime(data.timestamp)}: "${data.prompt.slice(0, 80)}". Restored ${data.messages.length} messages and ${restoredCount} file${restoredCount === 1 ? '' : 's'}${failedCount > 0 ? ` (${failedCount} failed)` : ''}.`;
    setTimeout(() => {
      addMessage({ role: 'assistant', content: summary });
    }, 100);
  }, [activeSessionId, addMessage]);

  // ── Delete a checkpoint ──
  const removeCheckpoint = useCallback((checkpointId: string) => {
    if (!activeSessionId) return;
    deleteCheckpoint(activeSessionId, checkpointId);
    setCheckpoints(prev => prev.filter(c => c.id !== checkpointId));
  }, [activeSessionId]);

  // ── Slash command palette ──
  // Built-in commands that have side effects beyond the agent loop
  const builtInSlashCommands = useMemo(() => [
    { name: 'clear',       desc: 'Clear current session messages',     builtIn: true },
    { name: 'init',        desc: 'Create a BLEUMR.md template',         builtIn: true },
    { name: 'permissions', desc: 'Show active allow/ask/deny rules',   builtIn: true },
    { name: 'help',        desc: 'Show available commands and tools',  builtIn: true },
    { name: 'plan',        desc: `Toggle plan mode (currently ${planMode ? 'ON' : 'OFF'})`, builtIn: true },
    { name: 'rewind',      desc: `Open checkpoint history (${checkpoints.length} saved)`, builtIn: true },
  ], [planMode, checkpoints.length]);

  // Filter both built-ins and user-defined skills against the current input
  const filteredSlashCommands = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const query = input.slice(1).split(/\s/)[0].toLowerCase();
    const skillCommands = skillsRef.current.map(s => ({
      name: s.name, desc: s.prompt.slice(0, 70).replace(/\s+/g, ' '), builtIn: false,
    }));
    const all = [...builtInSlashCommands, ...skillCommands];
    if (!query) return all;
    return all.filter(c => c.name.toLowerCase().startsWith(query));
  }, [input, builtInSlashCommands]);

  // Run a built-in slash command (returns true if handled)
  const runBuiltInCommand = useCallback((name: string): boolean => {
    if (name === 'clear') {
      setMessages([]);
      setInput('');
      return true;
    }
    if (name === 'plan') {
      setPlanMode(p => !p);
      setInput('');
      addMessage({ role: 'assistant', content: `Plan mode ${!planMode ? 'enabled — read-only exploration' : 'disabled'}.` });
      return true;
    }
    if (name === 'init') {
      const template = `# BLEUMR.md\n\nProject instructions for Code Bleu.\n\n## Permissions\n- allow: read_file, list_directory, search_in_files, find_files, write_file, replace_in_file\n- ask: run_command, git_commit, git_push, install_package, delete_file\n- deny: rm -rf, sudo, git push --force\n\n## Hooks\n- after_write(*.ts): npx prettier --write {file}\n- after_write(*.tsx): npx prettier --write {file}\n\n## Skills\n### /review-pr\nRead the current git diff with git_diff, then analyze code quality, check for bugs, and provide a structured review with actionable feedback.\n\n### /test-all\nRun \`npm test\`. If any tests fail, read the failing test files and fix them. Re-run until all tests pass.\n`;
      const orbit = (window as any).orbit;
      const cwd = projectPathRef.current;
      if (orbit?.writeFile && cwd) {
        orbit.writeFile(`${cwd}/BLEUMR.md`, template).then(() => {
          addMessage({ role: 'assistant', content: `Created BLEUMR.md at ${cwd}/BLEUMR.md. Reload the project to activate.` });
        }).catch((err: any) => {
          addMessage({ role: 'assistant', content: `Couldn't create BLEUMR.md: ${err?.message ?? 'unknown error'}` });
        });
      } else {
        addMessage({ role: 'assistant', content: 'Open a project folder first, then run /init.' });
      }
      setInput('');
      return true;
    }
    if (name === 'permissions') {
      const r = permissionsRef.current;
      const lines: string[] = ['Active permissions:'];
      if (r.allowedTools.size > 0) lines.push(`  Allow: ${[...r.allowedTools].join(', ')}`);
      if (r.askedTools.size > 0)   lines.push(`  Ask:   ${[...r.askedTools].join(', ')}`);
      if (r.deniedTools.size > 0)  lines.push(`  Deny:  ${[...r.deniedTools].join(', ')}`);
      if (r.shellDenyPatterns.length > 0) lines.push(`  Shell deny: ${r.shellDenyPatterns.slice(0, 6).join(', ')}${r.shellDenyPatterns.length > 6 ? '...' : ''}`);
      if (lines.length === 1) lines.push(`  (no custom rules — using autoApprove=${autoApprove ? 'AUTO' : 'ASK'})`);
      addMessage({ role: 'assistant', content: lines.join('\n') });
      setInput('');
      return true;
    }
    if (name === 'help') {
      const skills = skillsRef.current.map(s => `/${s.name}`).join(', ') || '(none)';
      addMessage({
        role: 'assistant',
        content: `Built-in commands: /clear /init /permissions /plan /rewind /help\nProject skills: ${skills}\n\nCode Bleu has 55 tools across file ops, git, packages, build, web, scaffolding, and shell. Type any natural-language request and I'll figure out the right tools to use.`,
      });
      setInput('');
      return true;
    }
    if (name === 'rewind') {
      setCheckpointPanelOpen(true);
      setInput('');
      return true;
    }
    return false;
  }, [planMode, autoApprove, addMessage]);

  // Sync runBuiltInCommand into a ref so handleSend (declared above) can call it without TDZ
  useEffect(() => {
    runBuiltInCommandRef.current = runBuiltInCommand;
  }, [runBuiltInCommand]);

  // Insert a chosen command into the input (or run it if built-in)
  const selectSlashCommand = useCallback((name: string) => {
    setSlashPaletteOpen(false);
    setSlashPaletteIndex(0);
    if (runBuiltInCommand(name)) return;
    // User skill — insert into input so user can add args, then press Enter
    setInput(`/${name} `);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [runBuiltInCommand]);

  // Open palette when input starts with "/", close otherwise
  useEffect(() => {
    setSlashPaletteOpen(input.startsWith('/') && filteredSlashCommands.length > 0);
    setSlashPaletteIndex(0);
  }, [input, filteredSlashCommands.length]);

  // ── Input handlers ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Slash palette navigation
    if (slashPaletteOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashPaletteIndex(i => (i + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashPaletteIndex(i => (i - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashPaletteIndex];
        if (cmd) selectSlashCommand(cmd.name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashPaletteOpen(false);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashPaletteIndex];
        if (cmd) selectSlashCommand(cmd.name);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, slashPaletteOpen, filteredSlashCommands, slashPaletteIndex, selectSlashCommand]);

  const handleCopy = useCallback((text: string) => {
    try {
      navigator.clipboard.writeText(text).catch(() => {
        // Fallback for contexts where clipboard API is restricted
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      });
    } catch {
      // Synchronous fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }, []);

  const handleInterrupt = useCallback(() => {
    abortedRef.current = true;
    agentRunningRef.current = false;
    // Wake any in-flight permission prompt so the awaiting loop unblocks
    // immediately instead of sitting on a hung promise for the 60s timeout.
    // Without this, pressing Stop frees the input but the ghost loop keeps
    // running in the background until the auto-deny fires.
    if (pendingApprovalRef.current) {
      const resolve = pendingApprovalRef.current;
      pendingApprovalRef.current = null;
      try { resolve(false); } catch { /* ignore */ }
    }
    denyFeedbackRef.current = null;
    setIsWorking(false);
    // Clear any lingering thinking indicators
    setMessages(prev => prev.filter(m => !(m.role === 'activity' && m.activity === 'thinking' && m.streaming)));
  }, []);

  // ── Render ──
  const hasProject = !!projectName;
  const hasMessages = messages.length > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      fontFamily: 'Inter, system-ui, sans-serif',
      background: '#0a0a0f',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* ═══ AMBIENT GLOW ═══ */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', width: 600, height: 600, borderRadius: '50%',
          top: -300, left: '50%', marginLeft: -300,
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.06) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }} />
      </div>

      {/* ═══ DRAG REGION + HAMBURGER ═══ */}
      <div style={{
        position: 'relative', zIndex: 10,
        height: isElectron ? 38 : 6,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        padding: '0 12px 4px',
        paddingLeft: isElectron ? 80 : 12,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center',
            padding: 4, borderRadius: 4, transition: 'color 0.15s',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
        >
          <Menu size={16} />
        </button>
      </div>

      {/* ═══ SESSION HISTORY SIDEBAR ═══ */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 50,
                background: 'rgba(0,0,0,0.4)',
              }}
            />
            {/* Panel */}
            <motion.div
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                position: 'fixed', top: 0, left: 0, bottom: 0,
                width: 270, zIndex: 51,
                background: '#0e0e16',
                borderRight: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', flexDirection: 'column',
                paddingTop: isElectron ? 40 : 12,
              }}
            >
              {/* New session button */}
              <div style={{ padding: '8px 14px 12px' }}>
                <button
                  onClick={startNewSession}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 12px', borderRadius: 8,
                    background: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.15)',
                    color: '#818cf8', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
                >
                  <Plus size={14} /> New Session
                </button>
              </div>

              {/* Session list */}
              <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
                {sessions.length === 0 && (
                  <div style={{ padding: '20px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                    No saved sessions yet
                  </div>
                )}
                {sessions.map(s => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 7, marginBottom: 2,
                      background: activeSessionId === s.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (activeSessionId !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { if (activeSessionId !== s.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div onClick={() => loadSession(s)} style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {s.name}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginTop: 2,
                      }}>
                        {s.projectName && (
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                            {s.projectName}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>
                          {new Date(s.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.15)', padding: 4, borderRadius: 4,
                        display: 'flex', alignItems: 'center', transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = 'rgba(239,68,68,0.5)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.15)'}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Close sidebar */}
              <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <button
                  onClick={onClose}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                    padding: '8px 12px', borderRadius: 7,
                    background: 'none', border: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.3)', fontSize: 11, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                >
                  <X size={12} /> Close Code Bleu
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ MAIN CONTENT (chat + optional preview) ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

      {/* ── Chat + Input column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

      {/* ═══ CHAT AREA ═══ */}
      <div style={{
        flex: 1, overflow: 'auto', position: 'relative',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Empty state — no project selected */}
        {!hasMessages && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40,
          }}>
            {/* Code Bleu logo */}
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 40px rgba(99,102,241,0.08)',
            }}>
              <CodeBleuLogo size={40} />
            </div>

            <div style={{ textAlign: 'center', maxWidth: 420 }}>
              <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                CODE Bleu
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                Open a project folder and I'll analyze the codebase, understand what's been built, and help you write, debug, and refactor code.
              </p>
            </div>

            <button onClick={openFolder} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
              border: 'none', cursor: 'pointer', color: 'white',
              fontSize: 13, fontWeight: 600,
              boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 25px rgba(99,102,241,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.3)'; }}
            >
              <FolderOpen size={16} /> Open Project
            </button>
          </div>
        )}

        {/* Messages */}
        {hasMessages && (
          <div style={{ flex: 1, padding: '16px 0' }}>
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px' }}>
              {renderItems.map((item) => {
                if ('items' in item) return <ActivityGroup key={item.id} items={item.items} />;
                const msg = item.msg;
                const isLastAssistant = msg.role === 'assistant' && msg.id === lastAssistantId;
                return (
                <div key={msg.id} style={{ marginBottom: 12 }}>

                  {/* Activity blocks (1-2 standalone activities) */}
                  {msg.role === 'activity' && <ActivityBlock message={msg} />}

                  {/* Sub-agent blocks */}
                  {msg.role === 'subagent' && <SubAgentBlock message={msg} />}

                  {/* User messages */}
                  {msg.role === 'user' && (
                    <div style={{
                      display: 'flex', justifyContent: 'flex-end', marginBottom: 4,
                    }}>
                      <div style={{
                        background: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.15)',
                        borderRadius: 14, borderBottomRightRadius: 4,
                        padding: '10px 14px', maxWidth: '85%',
                        fontSize: 13.5, color: 'rgba(255,255,255,0.9)', lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {/* Attached image thumbnails */}
                        {msg.images && msg.images.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                            {msg.images.map((img, idx) => (
                              <div key={idx} style={{
                                width: 80, height: 80, borderRadius: 8, overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.1)',
                                position: 'relative', flexShrink: 0,
                              }}>
                                <img src={img.dataUri} alt={img.name} style={{
                                  width: '100%', height: '100%', objectFit: 'cover',
                                }} />
                                <div style={{
                                  position: 'absolute', bottom: 0, left: 0, right: 0,
                                  background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                                  padding: '6px 4px 2px', display: 'flex', alignItems: 'center', gap: 3,
                                }}>
                                  <ImageIcon size={8} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
                                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.content}
                      </div>
                    </div>
                  )}

                  {/* Assistant messages */}
                  {msg.role === 'assistant' && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ marginTop: 2 }}>
                          {isLastAssistant
                            ? <CodeBleuAvatar size={28} isStreaming={!!msg.streaming} />
                            : <span style={{
                                width: 6, height: 6, borderRadius: '50%', marginTop: 6, marginLeft: 2,
                                background: 'rgba(255,255,255,0.2)', display: 'inline-block', flexShrink: 0,
                              }} />
                          }
                        </div>
                        <div style={{
                          flex: 1, fontSize: 13.5, color: 'rgba(255,255,255,0.8)',
                          lineHeight: 1.7, minWidth: 0,
                        }}>
                          {parseAssistantContent(msg.content)}
                          {msg.streaming && (
                            <span style={{
                              display: 'inline-block', width: 6, height: 16,
                              background: '#6366f1', borderRadius: 1, marginLeft: 2,
                              animation: 'blink 1s steps(2) infinite', verticalAlign: 'text-bottom',
                            }} />
                          )}
                        </div>
                      </div>

                      {/* Clickable suggestion chips */}
                      {msg.suggestions && msg.suggestions.length > 0 && !msg.streaming && (
                        <div style={{
                          display: 'flex', flexWrap: 'wrap', gap: 6,
                          marginTop: 8, marginLeft: 34,
                        }}>
                          {msg.suggestions.map((option, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSuggestionClick(option, msg.id)}
                              style={{
                                background: 'rgba(99,102,241,0.08)',
                                border: '1px solid rgba(99,102,241,0.2)',
                                borderRadius: 20, padding: '6px 14px',
                                color: '#a5b4fc', fontSize: 12, fontWeight: 500,
                                cursor: 'pointer', transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'; e.currentTarget.style.color = '#c7d2fe'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)'; e.currentTarget.style.color = '#a5b4fc'; }}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ); })}

              {/* Working indicator */}
              {isWorking && messages[messages.length - 1]?.role !== 'assistant' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0', marginBottom: 8,
                  color: 'rgba(255,255,255,0.3)', fontSize: 12,
                }}>
                  <CodeBleuAvatar size={28} isThinking />
                  <span style={{ fontStyle: 'italic' }}>Thinking...</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ INPUT AREA ═══ */}
      <div style={{
        position: 'relative', zIndex: 10,
        padding: '12px 20px 8px',
        borderTop: hasMessages ? '1px solid rgba(255,255,255,0.04)' : 'none',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {/* Attached image thumbnails */}
          {attachedImages.length > 0 && (
            <div style={{
              display: 'flex', gap: 8, padding: '8px 4px 6px',
              flexWrap: 'wrap',
            }}>
              {attachedImages.map((img, idx) => (
                <div key={idx} style={{
                  position: 'relative', width: 64, height: 64, borderRadius: 10,
                  overflow: 'hidden', border: '1px solid rgba(99,102,241,0.2)',
                  background: 'rgba(0,0,0,0.3)',
                  flexShrink: 0,
                }}>
                  <img src={img.dataUri} alt={img.name} style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                  }} />
                  <button
                    onClick={() => removeAttachment(idx)}
                    style={{
                      position: 'absolute', top: 2, right: 2,
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.7)', border: 'none',
                      color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, lineHeight: 1,
                    }}
                  >
                    <X size={10} />
                  </button>
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                    padding: '8px 4px 3px', fontSize: 8, color: 'rgba(255,255,255,0.5)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {img.name}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Checkpoint history panel — opens on /rewind or the rewind button */}
          {checkpointPanelOpen && (
            <div style={{
              background: 'rgba(20,22,30,0.96)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              marginBottom: 6,
              padding: 4,
              maxHeight: 360,
              overflowY: 'auto',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px 6px',
              }}>
                <div style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  Checkpoints · {checkpoints.length} saved
                </div>
                <button
                  onClick={() => setCheckpointPanelOpen(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: '2px 6px',
                  }}
                >
                  ✕
                </button>
              </div>
              {checkpoints.length === 0 ? (
                <div style={{
                  padding: '20px 12px', textAlign: 'center',
                  color: 'rgba(255,255,255,0.35)', fontSize: 12,
                }}>
                  No checkpoints yet. They're created automatically before each prompt.
                </div>
              ) : (
                checkpoints.map((cp) => (
                  <div
                    key={cp.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 8, gap: 8,
                      transition: 'background 0.1s', cursor: 'default',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        color: 'rgba(255,255,255,0.85)', fontSize: 12,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        marginBottom: 2,
                      }}>
                        {cp.prompt || '(empty prompt)'}
                      </div>
                      <div style={{
                        color: 'rgba(255,255,255,0.4)', fontSize: 10,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span>{formatCheckpointTime(cp.timestamp)}</span>
                        <span>·</span>
                        <span>{cp.messageCount} msg{cp.messageCount === 1 ? '' : 's'}</span>
                        {cp.fileCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{cp.fileCount} file{cp.fileCount === 1 ? '' : 's'}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => restoreCheckpoint(cp.id)}
                        style={{
                          background: 'rgba(129,140,248,0.14)',
                          border: '1px solid rgba(129,140,248,0.3)',
                          color: '#a5b4fc', fontSize: 10, fontWeight: 500,
                          padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                          textTransform: 'uppercase', letterSpacing: 0.5,
                        }}
                        title="Restore this checkpoint — overwrites current messages and files"
                      >
                        Rewind
                      </button>
                      <button
                        onClick={() => removeCheckpoint(cp.id)}
                        style={{
                          background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.4)', fontSize: 10,
                          padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                        }}
                        title="Delete this checkpoint"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Slash command palette — appears above the input when user types "/" */}
          {slashPaletteOpen && filteredSlashCommands.length > 0 && (
            <div style={{
              background: 'rgba(20,22,30,0.96)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              marginBottom: 6,
              padding: 4,
              maxHeight: 280,
              overflowY: 'auto',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            }}>
              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.35)',
                padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                Commands · ↑↓ to navigate · Tab/Enter to select
              </div>
              {filteredSlashCommands.map((cmd, idx) => (
                <div
                  key={`${cmd.builtIn ? 'b' : 'u'}-${cmd.name}`}
                  onClick={() => selectSlashCommand(cmd.name)}
                  onMouseEnter={() => setSlashPaletteIndex(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    background: idx === slashPaletteIndex ? 'rgba(129,140,248,0.14)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <span style={{
                      color: cmd.builtIn ? '#818cf8' : '#4ade80',
                      fontSize: 13, fontWeight: 500, fontFamily: 'monospace',
                    }}>
                      /{cmd.name}
                    </span>
                    <span style={{
                      color: 'rgba(255,255,255,0.45)', fontSize: 12,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {cmd.desc}
                    </span>
                  </div>
                  <span style={{
                    color: 'rgba(255,255,255,0.25)', fontSize: 9,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    flexShrink: 0, marginLeft: 8,
                  }}>
                    {cmd.builtIn ? 'built-in' : 'skill'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Text input */}
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={hasProject ? 'Ask me to build, fix, or explain anything...' : 'Open a project folder to start, or ask a coding question...'}
              rows={1}
              style={{
                width: '100%', resize: 'none', border: 'none', outline: 'none',
                background: 'transparent', color: 'rgba(255,255,255,0.85)',
                fontSize: 14, lineHeight: 1.6, padding: '14px 16px 4px',
                fontFamily: 'Inter, system-ui, sans-serif',
                minHeight: 24, maxHeight: 160, overflow: 'auto',
              }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = '24px';
                t.style.height = Math.min(t.scrollHeight, 160) + 'px';
              }}
            />

            {/* Bottom bar inside input */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px 8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Open folder button */}
                <button onClick={openFolder} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                  borderRadius: 6, color: 'rgba(255,255,255,0.3)', display: 'flex',
                  alignItems: 'center', gap: 5, fontSize: 11, transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'none'; }}
                >
                  <FolderInput size={13} />
                  {hasProject ? 'Change' : 'Open Folder'}
                </button>

                {/* Attach image/file button */}
                <button onClick={handleAttachFiles} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                  borderRadius: 6, color: attachedImages.length > 0 ? '#818cf8' : 'rgba(255,255,255,0.3)',
                  display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = attachedImages.length > 0 ? '#818cf8' : 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'none'; }}
                  title="Attach images (screenshots, errors, logos, references)"
                >
                  <Paperclip size={13} />
                  {attachedImages.length > 0 && <span>{attachedImages.length}</span>}
                </button>

                {/* Checkpoint history button — opens rewind panel */}
                {checkpoints.length > 0 && (
                  <button
                    onClick={() => setCheckpointPanelOpen(p => !p)}
                    style={{
                      background: checkpointPanelOpen ? 'rgba(129,140,248,0.14)' : 'none',
                      border: 'none', cursor: 'pointer', padding: '4px 8px',
                      borderRadius: 6,
                      color: checkpointPanelOpen ? '#a5b4fc' : 'rgba(255,255,255,0.3)',
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!checkpointPanelOpen) e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
                    onMouseLeave={e => { if (!checkpointPanelOpen) e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
                    title={`${checkpoints.length} checkpoint${checkpoints.length === 1 ? '' : 's'} — click to rewind`}
                  >
                    <RotateCcw size={13} />
                    <span>{checkpoints.length}</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Preview toggle */}
                {writtenFiles.some(f => f.path.endsWith('.html')) && (
                  <button onClick={() => setPreviewOpen(!previewOpen)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                    borderRadius: 5, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                    color: previewOpen ? '#818cf8' : 'rgba(255,255,255,0.3)',
                    transition: 'color 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.color = '#818cf8'}
                    onMouseLeave={e => { if (!previewOpen) e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
                  >
                    <Eye size={12} />
                  </button>
                )}

                {/* Reset */}
                {hasProject && (
                  <button onClick={handleReset} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                    borderRadius: 5, display: 'flex', alignItems: 'center',
                    color: 'rgba(255,255,255,0.25)', transition: 'color 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
                  >
                    <RotateCcw size={12} />
                  </button>
                )}

                {/* Close */}
                <button onClick={onClose} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                  borderRadius: 5, display: 'flex', alignItems: 'center',
                  color: 'rgba(255,255,255,0.25)', transition: 'color 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
                >
                  <X size={14} />
                </button>

                {/* Auto-approve toggle */}
                <button
                  onClick={() => {
                    if (autoApprove) {
                      setAutoApprove(false);
                    } else {
                      setShowAutoWarning(true);
                    }
                  }}
                  title={autoApprove ? 'Auto-approve ON — agent builds without asking' : 'Auto-approve OFF — agent asks before writing'}
                  style={{
                    background: autoApprove ? 'rgba(34,197,94,0.12)' : 'none',
                    border: `1px solid ${autoApprove ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 5, padding: '3px 8px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    color: autoApprove ? '#4ade80' : 'rgba(255,255,255,0.25)',
                    fontSize: 10, fontWeight: 600, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!autoApprove) e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                  onMouseLeave={e => { if (!autoApprove) e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
                >
                  <Sparkles size={10} />
                  {autoApprove ? 'AUTO' : 'ASK'}
                </button>

                {/* Plan / Execute mode toggle */}
                <button
                  onClick={() => setPlanMode(!planMode)}
                  title={planMode ? 'Plan mode ON — agent explores and plans without making changes' : 'Execute mode — agent can read, write, and run commands'}
                  style={{
                    background: planMode ? 'rgba(6,182,212,0.12)' : 'none',
                    border: `1px solid ${planMode ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 5, padding: '3px 8px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    color: planMode ? '#22d3ee' : 'rgba(255,255,255,0.25)',
                    fontSize: 10, fontWeight: 600, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!planMode) e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                  onMouseLeave={e => { if (!planMode) e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
                >
                  {planMode ? 'PLAN' : 'EXEC'}
                </button>

                {/* Model badge */}
                <div style={{
                  fontSize: 10, color: 'rgba(255,255,255,0.2)',
                  padding: '3px 8px', borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.05)',
                  fontWeight: 500,
                }}>
                  Multi-Model · 55 tools
                </div>

                {/* Stop / Send button */}
                {isWorking ? (
                  <button
                    onClick={handleInterrupt}
                    style={{
                      background: 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: 8, padding: '5px 10px',
                      cursor: 'pointer', color: '#f87171',
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 11, fontWeight: 600,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
                  >
                    <StopCircle size={13} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    style={{
                      background: input.trim() ? '#6366f1' : 'rgba(255,255,255,0.05)',
                      border: 'none', borderRadius: 8, padding: '6px 8px',
                      cursor: input.trim() ? 'pointer' : 'default',
                      color: input.trim() ? 'white' : 'rgba(255,255,255,0.15)',
                      display: 'flex', alignItems: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    <Send size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Project bar */}
          {hasProject && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 4px 4px', marginTop: 2,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 10px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)',
              }}>
                <FolderOpen size={12} style={{ color: '#6366f1' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                  {projectName}
                </span>
                <span style={{
                  fontSize: 10, color: 'rgba(255,255,255,0.2)',
                  padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(255,255,255,0.04)',
                }}>
                  {projectFiles.length} files
                </span>
              </div>

              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.15)',
                padding: '4px 8px', borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.04)',
              }}>
                Local
              </div>
            </div>
          )}
        </div>
      </div>

      </div>{/* end chat+input column */}

      </div>{/* end main content row */}

      {/* ═══ PREVIEW PANEL — slides in from the right, clean edgeless ═══ */}
      <AnimatePresence>
        {previewOpen && writtenFiles.some(f => f.path.endsWith('.html')) && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: '50%', maxWidth: 720, minWidth: 340,
              zIndex: 100,
              display: 'flex', flexDirection: 'column',
              background: '#0a0a0f',
              boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Floating control bar — minimal, glass-like */}
            <div style={{
              position: 'absolute', top: 10, left: 12, right: 12, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px',
              background: 'rgba(10,10,15,0.75)',
              backdropFilter: 'blur(12px)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Eye size={11} style={{ color: '#818cf8' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>Preview</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {/* Open in Electron browser tab */}
                <button
                  onClick={() => {
                    const orbit = (window as any).orbit;
                    if (orbit?.browser?.loadHTML) {
                      orbit.browser.loadHTML(buildPreviewFromFiles(writtenFiles));
                    }
                  }}
                  title="Open in Bleumr browser tab"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 8px', borderRadius: 6, fontSize: 10, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#818cf8'; e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'none'; }}
                >
                  <ExternalLink size={10} /> Open in Tab
                </button>
                <button
                  onClick={() => setPreviewOpen(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center',
                    padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'none'; }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Full-bleed iframe — no borders, fills the whole panel */}
            <iframe
              srcDoc={buildPreviewFromFiles(writtenFiles)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              style={{
                width: '100%', height: '100%', border: 'none',
                background: '#0a0a0a',
              }}
              title="Code Bleu Preview"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ AUTO-APPROVE WARNING MODAL ═══ */}
      <AnimatePresence>
        {showAutoWarning && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setShowAutoWarning(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 9998,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
              }}
            />
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                position: 'fixed', zIndex: 9999,
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 380, maxWidth: '90vw',
                background: '#12121c',
                border: '1px solid rgba(251,191,36,0.15)',
                borderRadius: 16,
                padding: '24px 24px 20px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(251,191,36,0.05)',
              }}
            >
              {/* Warning icon */}
              <div style={{
                width: 44, height: 44, borderRadius: 12, margin: '0 auto 16px',
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>

              <h3 style={{
                textAlign: 'center', color: '#fbbf24', fontSize: 15, fontWeight: 700,
                margin: '0 0 8px', letterSpacing: '-0.01em',
              }}>
                Enable Auto Mode?
              </h3>

              <p style={{
                textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 12.5,
                lineHeight: 1.7, margin: '0 0 6px',
              }}>
                This gives CODE Bleu full permission to read, write, delete files, and run shell commands without asking you first.
              </p>

              <div style={{
                background: 'rgba(251,191,36,0.06)',
                border: '1px solid rgba(251,191,36,0.1)',
                borderRadius: 10, padding: '10px 14px', margin: '12px 0 18px',
              }}>
                <p style={{
                  color: 'rgba(251,191,36,0.7)', fontSize: 11.5, lineHeight: 1.6,
                  margin: 0, textAlign: 'center',
                }}>
                  The agent will modify your project files directly. Make sure you have backups or version control before enabling this.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowAutoWarning(false)}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setAutoApprove(true); setShowAutoWarning(false); }}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.15))',
                    border: '1px solid rgba(251,191,36,0.3)',
                    color: '#fbbf24', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(251,191,36,0.3), rgba(245,158,11,0.25))'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.15))'; }}
                >
                  Enable Auto Mode
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Keyframe animations */}
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.3); } }
      `}</style>
    </div>
  );
}
