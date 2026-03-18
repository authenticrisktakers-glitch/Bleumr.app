/**
 * CodePlayground — write, edit, preview, and run code inside Bleumr
 * Supports: JavaScript, TypeScript, Python, HTML, CSS, SQL, Go, Rust, Bash, JSON, and more
 * JavaScript runs live in a sandboxed iframe
 * HTML renders live in a preview iframe
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, RotateCcw, Download, Copy, Terminal, Eye, Code2 } from 'lucide-react';

export interface CodePanelState {
  language: string;
  code: string;
  title: string;
}

interface CodePlaygroundProps {
  panel: CodePanelState;
  onClose: () => void;
  onCodeChange?: (code: string) => void;
}

// Simple syntax highlighter — tokenizes for common patterns
function highlight(code: string, lang: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (lang === 'html') {
    return esc(code)
      .replace(/(&lt;\/?[a-zA-Z][a-zA-Z0-9-]*)/g, '<span style="color:#e06c75">$1</span>')
      .replace(/(\s[a-zA-Z-]+=)/g, '<span style="color:#d19a66">$1</span>')
      .replace(/(".*?")/g, '<span style="color:#98c379">$1</span>')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span style="color:#5c6370;font-style:italic">$1</span>');
  }

  if (lang === 'css') {
    return esc(code)
      .replace(/([\w-]+)\s*:/g, '<span style="color:#d19a66">$1</span>:')
      .replace(/:\s*([^;{]+)/g, ': <span style="color:#98c379">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#5c6370;font-style:italic">$1</span>');
  }

  if (lang === 'sql') {
    const kw = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP BY|ORDER BY|HAVING|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|DISTINCT|AS|AND|OR|NOT|NULL|IS|IN|LIKE|BETWEEN|LIMIT|OFFSET|COUNT|SUM|AVG|MIN|MAX|COALESCE|CASE|WHEN|THEN|ELSE|END)\b/gi;
    return esc(code)
      .replace(kw, '<span style="color:#c678dd;font-weight:600">$1</span>')
      .replace(/'([^']*)'/g, '<span style="color:#98c379">\'$1\'</span>')
      .replace(/(--[^\n]*)/g, '<span style="color:#5c6370;font-style:italic">$1</span>');
  }

  // JS/TS/Python/Go/Rust (shared tokenizer)
  const keywords = {
    javascript: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|typeof|instanceof|in|of|class|extends|import|export|default|async|await|try|catch|finally|throw|yield|null|undefined|true|false|this|super|static|get|set|delete|void)\b/g,
    typescript: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|typeof|instanceof|in|of|class|extends|import|export|default|async|await|try|catch|finally|throw|yield|null|undefined|true|false|this|super|static|get|set|delete|void|interface|type|enum|namespace|declare|abstract|readonly|public|private|protected|implements|as|is|keyof|infer|never|unknown|any)\b/g,
    python: /\b(def|class|return|if|elif|else|for|while|break|continue|import|from|as|try|except|finally|raise|with|yield|lambda|pass|None|True|False|and|or|not|in|is|global|nonlocal|del|assert|async|await)\b/g,
    go: /\b(func|return|if|else|for|range|switch|case|break|continue|var|const|type|struct|interface|package|import|go|defer|select|chan|map|make|new|len|cap|append|copy|delete|nil|true|false|int|string|bool|float64|error)\b/g,
    rust: /\b(fn|return|if|else|for|while|loop|match|break|continue|let|mut|const|type|struct|enum|impl|trait|pub|use|mod|crate|super|self|Self|move|async|await|dyn|ref|box|where|true|false|None|Some|Ok|Err|Vec|String|bool|i32|i64|u32|u64|f64|usize)\b/g,
    bash: /\b(if|then|else|elif|fi|for|do|done|while|case|esac|function|return|exit|echo|export|local|source|set|unset|readonly|shift|break|continue)\b/g,
  }[lang as keyof typeof keywords];

  let result = esc(code);

  // Strings first
  result = result
    .replace(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, '<span style="color:#98c379">$1$2$1</span>')
    // Comments
    .replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span style="color:#5c6370;font-style:italic">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#5c6370;font-style:italic">$1</span>');

  // Numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#d19a66">$1</span>');

  // Keywords
  if (keywords) {
    result = result.replace(keywords, '<span style="color:#c678dd;font-weight:600">$1</span>');
  }

  // Function/method calls
  result = result.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span style="color:#61afef">$1</span>');

  return result;
}

const LANG_META: Record<string, { label: string; icon: string; color: string; canRun: boolean; ext: string }> = {
  javascript: { label: 'JavaScript', icon: '⚡', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', canRun: true, ext: 'js' },
  js: { label: 'JavaScript', icon: '⚡', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', canRun: true, ext: 'js' },
  typescript: { label: 'TypeScript', icon: '🔷', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', canRun: false, ext: 'ts' },
  ts: { label: 'TypeScript', icon: '🔷', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', canRun: false, ext: 'ts' },
  python: { label: 'Python', icon: '🐍', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', canRun: false, ext: 'py' },
  html: { label: 'HTML', icon: '🌐', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', canRun: true, ext: 'html' },
  css: { label: 'CSS', icon: '🎨', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20', canRun: true, ext: 'css' },
  sql: { label: 'SQL', icon: '🗄️', color: 'text-green-400 bg-green-500/10 border-green-500/20', canRun: false, ext: 'sql' },
  go: { label: 'Go', icon: '🐹', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20', canRun: false, ext: 'go' },
  rust: { label: 'Rust', icon: '🦀', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', canRun: false, ext: 'rs' },
  bash: { label: 'Bash', icon: '📟', color: 'text-green-400 bg-green-500/10 border-green-500/20', canRun: false, ext: 'sh' },
  sh: { label: 'Shell', icon: '📟', color: 'text-green-400 bg-green-500/10 border-green-500/20', canRun: false, ext: 'sh' },
  json: { label: 'JSON', icon: '{}', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', canRun: false, ext: 'json' },
};

function getLangMeta(lang: string) {
  return LANG_META[lang.toLowerCase()] ?? { label: lang, icon: '📄', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', canRun: false, ext: 'txt' };
}

function buildIframeSrc(code: string, lang: string): string {
  if (lang === 'html') return code;
  if (lang === 'css') {
    return `<!DOCTYPE html><html><head><style>
      body { background: #1a1a2e; color: #ccc; font-family: sans-serif; padding: 20px; }
      ${code}
    </style></head><body><div class="demo">Demo Element</div><p>Sample text</p><button>Button</button></body></html>`;
  }
  // JavaScript
  return `<!DOCTYPE html><html><head><style>
    body{background:#0a0a0a;color:#e2e8f0;font-family:'Courier New',monospace;padding:16px;margin:0;font-size:13px;}
    .log{padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);}
    .log.error{color:#f87171;}
    .log.warn{color:#fbbf24;}
    .log.info{color:#60a5fa;}
    pre{white-space:pre-wrap;word-break:break-all;margin:0;}
  </style></head><body>
  <script>
    const _logs = [];
    const _orig = {log: console.log, error: console.error, warn: console.warn, info: console.info};
    ['log','error','warn','info'].forEach(m => {
      console[m] = (...args) => {
        _orig[m](...args);
        const div = document.createElement('div');
        div.className = 'log ' + m;
        div.innerHTML = '<pre>' + args.map(a => {
          try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); } catch { return String(a); }
        }).join(' ') + '</pre>';
        document.body.appendChild(div);
      };
    });
    window.onerror = (msg, src, line, col, err) => {
      const div = document.createElement('div');
      div.className = 'log error';
      div.innerHTML = '<pre>Error: ' + msg + (line ? ' (line ' + line + ')' : '') + '</pre>';
      document.body.appendChild(div);
    };
    try {
      ${code}
    } catch(e) {
      const div = document.createElement('div');
      div.className = 'log error';
      div.innerHTML = '<pre>Error: ' + e.message + '</pre>';
      document.body.appendChild(div);
    }
  </script></body></html>`;
}

export function CodePlayground({ panel, onClose, onCodeChange }: CodePlaygroundProps) {
  const [code, setCode] = useState(panel.code);
  const [tab, setTab] = useState<'code' | 'preview'>('code');
  const [runKey, setRunKey] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const meta = getLangMeta(panel.language);
  const canPreview = meta.canRun || panel.language === 'html' || panel.language === 'css';

  // Sync highlighted display with textarea scroll
  const syncScroll = useCallback(() => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const handleRun = useCallback(() => {
    if (!canPreview) return;
    setIsRunning(true);
    setTab('preview');
    setRunKey(k => k + 1);
    setTimeout(() => setIsRunning(false), 600);
  }, [canPreview]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  const handleDownload = useCallback(() => {
    const filename = panel.title.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase() || 'code';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.${meta.ext}`; a.click();
    URL.revokeObjectURL(url);
  }, [code, panel.title, meta.ext]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newCode = code.slice(0, start) + '  ' + code.slice(end);
      setCode(newCode);
      onCodeChange?.(newCode);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleRun();
    }
  }, [code, handleRun, onCodeChange]);

  const highlighted = useMemo(() => highlight(code, panel.language.toLowerCase()), [code, panel.language]);
  const lines = code.split('\n');

  const iframeSrc = useMemo(() => buildIframeSrc(code, panel.language.toLowerCase()), [code, panel.language, runKey]); // eslint-disable-line

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9998] flex flex-col bg-[#0d0d14]"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#111118] border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
            <div className="w-3 h-3 rounded-full bg-green-500/40" />
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold tracking-wide border ${meta.color}`}>
            {meta.icon} {meta.label}
          </div>
          <span className="text-sm text-slate-400 font-medium truncate max-w-[360px]">{panel.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/8">
            <button
              onClick={() => setTab('code')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${tab === 'code' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
            >
              <Code2 className="w-3 h-3" /> Code
            </button>
            {canPreview && (
              <button
                onClick={() => setTab('preview')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${tab === 'preview' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
              >
                {meta.canRun ? <Terminal className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {meta.canRun ? 'Output' : 'Preview'}
              </button>
            )}
          </div>

          {canPreview && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white rounded-lg transition-colors"
            >
              <Play className="w-3 h-3" />
              {isRunning ? 'Running…' : `Run  ⌘↵`}
            </button>
          )}

          <button onClick={() => { setCode(panel.code); onCodeChange?.(panel.code); }} title="Reset" className="p-1.5 text-slate-400 hover:text-white hover:bg-white/8 rounded-lg transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDownload} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg transition-colors">
            <Download className="w-3 h-3" /> Save
          </button>
          <button onClick={handleCopy} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg transition-colors">
            <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/8 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden relative">
        {/* Code Editor */}
        <div className={`absolute inset-0 flex overflow-hidden transition-opacity duration-150 ${tab === 'code' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          {/* Line numbers */}
          <div className="shrink-0 w-12 bg-[#0d0d14] border-r border-white/5 overflow-hidden">
            <div className="pt-3 pb-3">
              {lines.map((_, i) => (
                <div key={i} className="text-right pr-3 text-[12px] font-mono text-slate-600 leading-6 select-none">{i + 1}</div>
              ))}
            </div>
          </div>

          {/* Editor area — textarea overlaid on highlighted pre */}
          <div className="flex-1 relative overflow-auto">
            <pre
              ref={preRef}
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none px-4 pt-3 text-[13px] font-mono leading-6 whitespace-pre overflow-hidden"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
            <textarea
              ref={textareaRef}
              value={code}
              onChange={e => { setCode(e.target.value); onCodeChange?.(e.target.value); }}
              onKeyDown={handleKeyDown}
              onScroll={syncScroll}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="absolute inset-0 w-full h-full px-4 pt-3 text-[13px] font-mono leading-6 bg-transparent text-transparent caret-white resize-none outline-none whitespace-pre overflow-auto"
              style={{ caretColor: '#a78bfa', colorScheme: 'dark' }}
            />
          </div>
        </div>

        {/* Preview / Output */}
        {canPreview && tab === 'preview' && (
          <iframe
            key={runKey}
            srcDoc={iframeSrc}
            sandbox="allow-scripts"
            className="w-full h-full border-0 bg-[#0a0a0a]"
            title="Code Preview"
          />
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 bg-[#111118] border-t border-white/5 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-slate-600 font-mono">{lines.length} lines · {code.length} chars</span>
          {canPreview && <span className="text-[11px] text-violet-500/60 font-mono">⌘↵ to run</span>}
        </div>
        <span className="text-[11px] text-slate-600 font-mono">{meta.label}</span>
      </div>
    </motion.div>
  );
}
