/**
 * WebDesignerPage — AI-powered website builder inside Bleumr
 * Figma/Framer-style: chat prompt → AI generates site → live preview
 * Features:
 *   - Text-to-website via AI (Groq)
 *   - Live side preview (iframe)
 *   - Virtual file system (HTML/CSS/JS per project)
 *   - File tree browser + code viewer
 *   - Export project as downloadable ZIP
 *   - Iterative editing via chat
 *   - Console panel (captures logs/errors/warnings from preview)
 *   - Auto-debug: detects runtime errors → sends to AI for auto-fix
 *   - Audit: reviews code quality and suggests improvements
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Send, FolderOpen, File, ChevronRight, ChevronDown,
  Download, Plus, Code2, Eye, Layers, Paintbrush, RotateCcw,
  Smartphone, Monitor, Tablet, Loader2, Trash2, FileCode, Image,
  Terminal, Search, AlertTriangle, Bug, Sparkles, Paperclip, Upload,
} from 'lucide-react';
import { SecureStorage } from '../services/SecureStorage';
import { BrainMemory } from '../services/BrainMemory';
import { GodAgent } from '../services/GodAgent';
import { searchTemplates, templateToPrompt, type DesignTemplate } from '../services/DesignTemplates';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ProjectFile {
  path: string;
  content: string;
  language: string;
}

interface Project {
  id: string;
  name: string;
  files: ProjectFile[];
  createdAt: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ConsoleEntry {
  id: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: number;
}

interface Attachment {
  id: string;
  type: 'image' | 'code';
  name: string;
  /** For images: base64 data URL. For code: raw text content */
  content: string;
  /** Detected language for code files */
  language?: string;
  /** Image dimensions (for display) */
  width?: number;
  height?: number;
}

type ViewportSize = 'desktop' | 'tablet' | 'mobile';
type RightPanel = 'preview' | 'code' | 'console';

interface WebDesignerPageProps {
  onClose: () => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = [
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

/**
 * Stream from Groq. Tries models in priority order.
 */
async function streamAI(opts: {
  apiKey: string;
  systemPrompt: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken: (token: string) => void;
}): Promise<string> {
  const apiMessages = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.messages,
  ];

  let res: Response | null = null;
  for (const model of GROQ_MODELS) {
    const attempt = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        max_tokens: opts.maxTokens ?? 16000,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: opts.signal,
    });
    if (attempt.ok) { res = attempt; break; }
  }
  if (!res) throw new Error('All models unavailable. Check your API key.');

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') break;
      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content || '';
        if (token) {
          fullText += token;
          opts.onToken(token);
        }
      } catch {}
    }
  }

  return fullText;
}

const VIEWPORT_SIZES: Record<ViewportSize, { width: string; label: string }> = {
  desktop: { width: '100%', label: 'Desktop' },
  tablet: { width: '768px', label: 'Tablet' },
  mobile: { width: '375px', label: 'Mobile' },
};

const SYSTEM_PROMPT = `You are JUMARI, an elite web designer. Output ONLY file tags — no explanation unless asked.

## FORMAT
<file path="index.html">...full code...</file>
<file path="styles.css">...full code...</file>
<file path="script.js">...full code...</file>

## EVERY HTML FILE MUST START WITH:
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>TITLE</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link href="https://unpkg.com/aos@2.3.4/dist/aos.css" rel="stylesheet">
<script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>
<link rel="stylesheet" href="styles.css">
<style>body{font-family:'Inter',sans-serif;}</style></head>
<body class="bg-[#0a0a0a] text-white">CONTENT<script src="script.js"></script></body></html>

## FILES: index.html + styles.css + script.js minimum. Add about.html, contact.html, menu.html etc. for full sites.

## DESIGN (follow EXACTLY):
- Tailwind classes on EVERY element. No naked HTML.
- Dark theme: bg-[#0a0a0a] body, cards bg-white/[0.03] backdrop-blur-xl border-white/[0.08]
- Hero: min-h-screen, gradient text bg-gradient-to-r bg-clip-text text-transparent, text-6xl+ font-black
- Buttons: bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-4 rounded-xl shadow-lg hover:scale-105
- Nav: fixed top-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/[0.06]
- Gradient orbs: absolute w-96 h-96 rounded-full bg-violet-600/20 blur-[120px]
- Sections: py-24 max-w-7xl mx-auto px-6, data-aos="fade-up"
- Footer: bg-[#080808] border-t border-white/[0.06] py-16 grid md:grid-cols-4
- transition-all duration-300 + hover effects on everything
- Responsive: sm: md: lg: breakpoints
- Font Awesome icons: <i class="fas fa-star"></i> — NEVER text emoji placeholders
- Real images: https://images.unsplash.com/photo-REAL_ID?w=800&h=600&fit=crop
- DO NOT call AOS.init() — auto-injected

## styles.css: custom animations, @keyframes float/glow, gradients, scrollbar styling
## script.js: interactivity, mobile menu toggle, scroll effects, form handling

## ON EDIT: output ONLY changed files. Preserve everything else.
## ON DEBUG: fix root cause, output corrected files, 1 sentence explanation.
## SPELLING: Perfect spelling and grammar in ALL text content — headings, paragraphs, buttons, labels, placeholder text. Never misspell a word. Proofread all copy.`;

// ─── Console injection script (injected into preview iframe) ──────────────

const CONSOLE_BRIDGE_SCRIPT = `
<script>
(function() {
  var _post = function(level, args) {
    try {
      var msg = Array.prototype.slice.call(args).map(function(a) {
        if (typeof a === 'object') try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
        return String(a);
      }).join(' ');
      window.parent.postMessage({ __bleumr_console: true, level: level, message: msg }, '*');
    } catch(e) {}
  };
  var _origLog = console.log, _origWarn = console.warn, _origError = console.error, _origInfo = console.info;
  console.log = function() { _origLog.apply(console, arguments); _post('log', arguments); };
  console.warn = function() { _origWarn.apply(console, arguments); _post('warn', arguments); };
  console.error = function() { _origError.apply(console, arguments); _post('error', arguments); };
  console.info = function() { _origInfo.apply(console, arguments); _post('info', arguments); };
  window.onerror = function(msg, src, line, col, err) {
    _post('error', ['Uncaught ' + msg + ' at line ' + line + (col ? ':' + col : '') + (src ? ' in ' + src : '')]);
    return true; // prevent default — don't blank the page
  };
  window.onunhandledrejection = function(e) {
    _post('error', ['Unhandled Promise rejection: ' + (e.reason ? (e.reason.message || e.reason) : 'unknown')]);
  };
  // Ensure page is never fully blank — set a fallback background
  document.addEventListener('DOMContentLoaded', function() {
    if (!document.body || document.body.innerHTML.trim() === '') {
      document.body.style.background = '#0f0f0f';
      document.body.style.color = '#666';
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><p>Preview loading...</p></div>';
    }
  });
})();
</script>`;

// ─── Helpers ───────────────────────────────────────────────────────────────

function stripMarkdownFences(content: string): string {
  // Remove ```html, ```css, ```javascript, etc. wrappers
  return content
    .replace(/^```[\w]*\s*\n?/gm, '')
    .replace(/^```\s*$/gm, '')
    .trim();
}

const LANG_MAP: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css', js: 'javascript',
  ts: 'typescript', json: 'json', svg: 'svg', md: 'markdown',
};

/** Auto-correct file paths the AI gets wrong (missing extensions, wrong extensions) */
function fixFilePath(path: string, content: string): string {
  const hasExt = path.includes('.');

  if (!hasExt) {
    // No extension — detect from content
    const trimmed = content.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<head') || trimmed.includes('<body')) {
      return path + '.html';
    }
    if (trimmed.includes('{') && trimmed.includes('}') && (trimmed.includes(':') || trimmed.includes('@keyframes') || trimmed.includes('@media'))) {
      return path + '.css';
    }
    if (trimmed.includes('function ') || trimmed.includes('const ') || trimmed.includes('let ') || trimmed.includes('=>') || trimmed.includes('document.')) {
      return path + '.js';
    }
    // Default: if name is a common HTML page name, add .html
    const htmlNames = ['index', 'about', 'contact', 'products', 'services', 'menu', 'cart', 'checkout', 'blog', '404', 'pricing', 'faq', 'gallery', 'team', 'home'];
    if (htmlNames.includes(path.toLowerCase())) return path + '.html';
    // Last resort — if content has ANY html tag, it's HTML
    if (/<[a-z][\s\S]*>/i.test(trimmed)) return path + '.html';
    return path + '.html'; // safe default
  }

  return path;
}

function parseFilesFromResponse(text: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const seen = new Set<string>();

  function addFile(rawPath: string, rawContent: string) {
    const content = stripMarkdownFences(rawContent);
    if (!content) return;
    const path = fixFilePath(rawPath.trim(), content);
    if (seen.has(path)) return;
    seen.add(path);
    const ext = path.split('.').pop()?.toLowerCase() || '';
    files.push({ path, content, language: LANG_MAP[ext] || ext });
  }

  // Strategy 1: Proper <file path="...">...</file> blocks
  const closedRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match;
  while ((match = closedRegex.exec(text)) !== null) {
    addFile(match[1], match[2]);
  }

  // Strategy 2: <file path="..."> without closing tag — grab content until next <file> or end
  if (files.length === 0) {
    const openRegex = /<file\s+path="([^"]+)">\s*([\s\S]*?)(?=<file\s+path="|$)/g;
    while ((match = openRegex.exec(text)) !== null) {
      const content = match[2].replace(/<\/file>\s*$/, '').trim();
      addFile(match[1], content);
    }
  }

  // Strategy 3: Fallback — extract from markdown code blocks with filename hints
  if (files.length === 0) {
    const mdRegex = /(?:\*\*([a-zA-Z0-9_\-./]+(?:\.[a-z]+)?)\*\*\s*\n\s*)?```(\w+)\s*\n([\s\S]*?)```/g;
    while ((match = mdRegex.exec(text)) !== null) {
      const lang = match[2]?.toLowerCase();
      const content = match[3]?.trim();
      if (!content) continue;

      let path = match[1]?.trim() || '';
      if (!path) {
        if (lang === 'html' && !seen.has('index.html')) path = 'index.html';
        else if (lang === 'css' && !seen.has('styles.css')) path = 'styles.css';
        else if ((lang === 'javascript' || lang === 'js') && !seen.has('script.js')) path = 'script.js';
        else continue;
      }
      addFile(path, content);
    }
  }

  return files;
}

function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'html': case 'htm': return <FileCode className="w-3.5 h-3.5 text-orange-400" />;
    case 'css': return <Paintbrush className="w-3.5 h-3.5 text-blue-400" />;
    case 'js': case 'ts': return <Code2 className="w-3.5 h-3.5 text-yellow-400" />;
    case 'svg': case 'png': case 'jpg': return <Image className="w-3.5 h-3.5 text-green-400" />;
    default: return <File className="w-3.5 h-3.5 text-slate-400" />;
  }
}

function inlineLocalAssets(html: string, files: ProjectFile[]): string {
  // Inline local CSS files (keep CDN links intact)
  const cssFiles = files.filter(f => f.language === 'css');
  for (const css of cssFiles) {
    const escaped = css.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkTag = new RegExp(`<link[^>]*href=["']${escaped}["'][^>]*/?>`, 'gi');
    if (linkTag.test(html)) {
      html = html.replace(linkTag, `<style>${css.content}</style>`);
    } else {
      html = html.replace('</head>', `<style>${css.content}</style>\n</head>`);
    }
  }

  // Inline local JS files (keep CDN scripts intact)
  const jsFiles = files.filter(f => f.language === 'javascript');
  for (const js of jsFiles) {
    const escaped = js.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scriptTag = new RegExp(`<script[^>]*src=["']${escaped}["'][^>]*>\\s*</script>`, 'gi');
    if (scriptTag.test(html)) {
      html = html.replace(scriptTag, `<script>${js.content}</script>`);
    } else {
      html = html.replace('</body>', `<script>${js.content}</script>\n</body>`);
    }
  }
  return html;
}

function applyAOSSafety(html: string): string {
  if (!html.includes('aos.js') && !html.includes('AOS')) return html;
  html = html.replace(/<script[^>]*>\s*AOS\.init\([^)]*\);?\s*<\/script>/gi, '');
  html = html.replace(/AOS\.init\([^)]*\);?/g, '/* AOS auto-initialized */');
  html = html.replace('</body>', `<script>window.addEventListener('load',function(){if(typeof AOS!=='undefined'){try{AOS.init({duration:800,once:true});}catch(e){}}});</script>\n</body>`);
  return html;
}

function buildPreviewHTML(files: ProjectFile[], activePage?: string): string {
  const htmlFiles = files.filter(f => f.path.endsWith('.html'));
  const targetFile = activePage
    ? htmlFiles.find(f => f.path === activePage)
    : htmlFiles.find(f => f.path === 'index.html') || htmlFiles[0];

  if (!targetFile) return '<html><body style="background:#111;color:#666;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><p>No HTML file yet — describe your site to get started</p></body></html>';

  let html = targetFile.content;

  // Inline CSS and JS
  html = inlineLocalAssets(html, files);

  // If the project has multiple HTML pages, inject a mini-router so links between pages work in srcdoc
  if (htmlFiles.length > 1) {
    const pageMap: Record<string, string> = {};
    for (const f of htmlFiles) {
      // Pre-process each page (inline assets, AOS safety)
      let pageHtml = inlineLocalAssets(f.content, files);
      pageHtml = applyAOSSafety(pageHtml);
      // Extract just the <body> inner content for SPA routing
      const bodyMatch = pageHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) pageMap[f.path] = bodyMatch[1];
    }
    // Inject SPA page router into the preview
    const routerScript = `
<script>
(function() {
  var __pages = ${JSON.stringify(pageMap)};
  window.__bleumrNavigate = function(page) {
    var body = __pages[page];
    if (body) {
      document.body.innerHTML = body;
      document.querySelectorAll('script').forEach(function(s) {
        var ns = document.createElement('script');
        if (s.src) ns.src = s.src; else ns.textContent = s.textContent;
        s.parentNode.replaceChild(ns, s);
      });
      window.parent.postMessage({ __bleumr_page: page }, '*');
    }
  };
  // Intercept local links (about.html, products.html, etc.)
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href && __pages[href]) {
      e.preventDefault();
      __bleumrNavigate(href);
    }
  });
})();
</script>`;
    html = html.replace('</body>', routerScript + '\n</body>');
  }

  // AOS safety
  html = applyAOSSafety(html);

  // HTML sanitization: fix common AI output mistakes
  html = html.replace(/<\s+src="/g, '<img src="');

  // ── CDN Safety Net — force-inject essentials if the AI forgot them ──────
  // This is critical: without Tailwind the site looks like raw 1995 HTML
  const cdnInjections: string[] = [];

  if (!html.includes('cdn.tailwindcss.com') && !html.includes('tailwind')) {
    cdnInjections.push('<script src="https://cdn.tailwindcss.com"></script>');
  }
  if (!html.includes('fonts.googleapis.com')) {
    cdnInjections.push('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">');
  }
  if (!html.includes('font-awesome') && !html.includes('fontawesome')) {
    cdnInjections.push('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">');
  }
  // Inject default dark bg + font if body has no style
  if (!html.includes('bg-[') && !html.includes('bg-gray') && !html.includes('bg-slate') && !html.includes('bg-white') && !html.includes('background')) {
    cdnInjections.push(`<style>body{font-family:'Inter',sans-serif;background:#0a0a0a;color:#e2e8f0;margin:0;}</style>`);
  } else if (!html.includes("font-family") && !html.includes("font-['")) {
    cdnInjections.push(`<style>body{font-family:'Inter',sans-serif;}</style>`);
  }

  if (cdnInjections.length > 0) {
    const injection = cdnInjections.join('\n');
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n${injection}`);
    } else if (html.includes('<html')) {
      html = html.replace(/<html[^>]*>/, `$&\n<head>${injection}</head>`);
    } else {
      html = `<html><head>${injection}</head>${html}</html>`;
    }
  }

  // Inject console bridge right after <head> so it runs before any other script
  html = html.replace('<head>', `<head>${CONSOLE_BRIDGE_SCRIPT}`);

  return html;
}

function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function exportAsZip(project: Project) {
  const orbit = (window as any).orbit;
  if (orbit?.writeFile) {
    const dir = `/tmp/bleumr-export-${project.name.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
    for (const file of project.files) {
      await orbit.writeFile(`${dir}/${file.path}`, file.content);
    }
    alert(`Project exported to: ${dir}`);
    return;
  }
  for (const file of project.files) {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ─── Storage ───────────────────────────────────────────────────────────────

const PROJECTS_STORAGE_KEY = 'bleumr_web_designer_projects';

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveProjects(projects: Project[]) {
  try { localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects)); } catch {}
}

// ─── Component ─────────────────────────────────────────────────────────────

export function WebDesignerPage({ onClose }: WebDesignerPageProps) {
  // Project state
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const activeProjectRef = useRef<Project | null>(null);
  // Keep ref in sync so async callbacks always see the latest project
  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>('preview');
  const [viewport, setViewport] = useState<ViewportSize>('desktop');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Attachments (images + code files uploaded by user)
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Multi-page navigation
  const [activePage, setActivePage] = useState<string>('index.html');

  // Console state
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleFilter, setConsoleFilter] = useState<'all' | 'error' | 'warn' | 'log'>('all');
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const autoDebugCountRef = useRef(0); // count auto-debug attempts — cap at 2
  const lastDebugErrorsRef = useRef(''); // track last errors to avoid re-debugging same issue

  // API key — Groq
  const [apiKey, setApiKey] = useState('');
  useEffect(() => {
    SecureStorage.get('orbit_api_key').then(key => { if (key) setApiKey(key); });
  }, []);

  // Persist projects
  useEffect(() => { saveProjects(projects); }, [projects]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamText]);

  // Auto-scroll console
  useEffect(() => { consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [consoleLogs]);

  // Clear console on new preview from user action (not auto-debug)
  // Note: autoDebugCountRef resets only on user-initiated sends, not auto-debug

  // ── Console + page navigation message listener ──────────────────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // SPA page navigation from iframe
      if (e.data?.__bleumr_page) {
        setActivePage(e.data.__bleumr_page);
        return;
      }
      if (e.data?.__bleumr_console) {
        const entry: ConsoleEntry = {
          id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          level: e.data.level,
          message: e.data.message,
          timestamp: Date.now(),
        };
        setConsoleLogs(prev => {
          const next = [...prev, entry];
          return next.length > 500 ? next.slice(-500) : next; // cap at 500 entries
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Auto-debug: detect errors and send to AI ───────────────────────────
  const triggerAutoDebug = useCallback(async (errors: string[]) => {
    if (!apiKey || !activeProjectRef.current || isGenerating) return;

    // Cap at 2 auto-debug attempts per user action to prevent infinite loops
    if (autoDebugCountRef.current >= 2) return;

    // Don't re-debug the exact same errors
    const errorKey = errors.sort().join('|||');
    if (errorKey === lastDebugErrorsRef.current) return;
    lastDebugErrorsRef.current = errorKey;
    autoDebugCountRef.current += 1;

    const errorSummary = errors.slice(0, 5).join('\n');
    const debugPrompt = `The preview has runtime errors. Fix them. IMPORTANT: Do NOT add AOS.init() — it is injected automatically. Make sure all script tags are properly closed. Fix ONLY the actual error:\n\n${errorSummary}`;

    // Inject as a system-triggered user message
    setInput('');
    const userMsg: ChatMessage = {
      id: `dbg_${Date.now()}`,
      role: 'user',
      content: `🔧 Auto-debug: ${errors.length} error${errors.length > 1 ? 's' : ''} detected in preview`,
    };
    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);
    setStreamText('');

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const currentFiles = (activeProjectRef.current?.files || []).map(f =>
        `<file path="${f.path}">\n${f.content}\n</file>`
      ).join('\n\n');

      const debugMessages = [
        { role: 'user', content: debugPrompt },
      ];

      let streamAccum = '';
      const fullText = await streamAI({
        apiKey,
        systemPrompt: SYSTEM_PROMPT + `\n\nCurrent project files:\n${currentFiles}`,
        messages: debugMessages,
        temperature: 0.4,
        signal: abort.signal,
        onToken: (token) => { streamAccum += token; setStreamText(streamAccum); },
      });

      const parsedFiles = parseFilesFromResponse(fullText);
      if (parsedFiles.length > 0) updateProjectFiles(parsedFiles);

      let displayText = fullText
        .replace(/<file\s+path="[^"]*">[\s\S]*?<\/file>/g, '') // closed file blocks
        .replace(/<file\s+path="[^"]*">[\s\S]*/g, '')           // unclosed file blocks
        .replace(/```[\w]*\n[\s\S]*?```/g, '')                   // markdown code blocks
        .trim();
      if (!displayText && parsedFiles.length > 0) {
        displayText = `Fixed ${parsedFiles.length} file${parsedFiles.length > 1 ? 's' : ''}: ${parsedFiles.map(f => f.path).join(', ')}`;
      }

      // Learn from the error and fix
      if (parsedFiles.length > 0 && displayText) {
        BrainMemory.learnFromError(errorSummary, displayText.slice(0, 200), 'web_designer');
      }

      setMessages(prev => [...prev, {
        id: `adbg_${Date.now()}`,
        role: 'assistant',
        content: `🔧 ${displayText || 'Attempted fix applied.'}`,
      }]);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, { id: `e_${Date.now()}`, role: 'system', content: `Debug error: ${err.message}` }]);
      }
    } finally {
      setIsGenerating(false);
      setStreamText('');
      abortRef.current = null;
    }
  }, [apiKey, activeProject, isGenerating]);

  // Watch for errors and auto-debug after a delay
  useEffect(() => {
    const errors = consoleLogs.filter(l => l.level === 'error');
    if (errors.length === 0 || isGenerating || !activeProject?.files.length) return;
    if (autoDebugCountRef.current >= 2) return; // hard cap

    // Debounce — wait 3s after last error to batch them
    const timer = setTimeout(() => {
      const recentErrors = consoleLogs
        .filter(l => l.level === 'error' && Date.now() - l.timestamp < 5000)
        .map(l => l.message);
      if (recentErrors.length > 0) triggerAutoDebug(recentErrors);
    }, 3000);

    return () => clearTimeout(timer);
  }, [consoleLogs, isGenerating, activeProject, triggerAutoDebug]);

  // ── Project Management ───────────────────────────────────────────────────

  const createNewProject = useCallback((name?: string) => {
    const project: Project = {
      id: generateProjectId(),
      name: name || `Site ${projects.length + 1}`,
      files: [],
      createdAt: Date.now(),
    };
    setProjects(prev => [project, ...prev]);
    setActiveProject(project);
    setMessages([]);
    setSelectedFile(null);
    setRightPanel('preview');
    setConsoleLogs([]);
  }, [projects.length]);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProject?.id === id) {
      setActiveProject(null);
      setMessages([]);
      setConsoleLogs([]);
    }
  }, [activeProject]);

  const updateProjectFiles = useCallback((newFiles: ProjectFile[]) => {
    // Use ref to get the LATEST project — the state closure may be stale
    // (e.g. when sendToAI creates a new project and calls this in the same tick)
    const current = activeProjectRef.current;
    if (!current) return;
    const updated: Project = {
      ...current,
      files: [...current.files],
    };
    for (const nf of newFiles) {
      const idx = updated.files.findIndex(f => f.path === nf.path);
      if (idx >= 0) updated.files[idx] = nf;
      else updated.files.push(nf);
    }
    activeProjectRef.current = updated; // update ref immediately
    setActiveProject(updated);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    if (!selectedFile && updated.files.length > 0) {
      setSelectedFile(updated.files[0].path);
    }
  }, [selectedFile]);

  // ── AI Chat ──────────────────────────────────────────────────────────────

  const sendToAI = useCallback(async (text: string, isAudit = false) => {
    if (!text || isGenerating || !apiKey) return;

    if (!activeProject) {
      const name = text.length > 40 ? text.slice(0, 40) + '...' : text;
      const project: Project = {
        id: generateProjectId(),
        name,
        files: [],
        createdAt: Date.now(),
      };
      setProjects(prev => [project, ...prev]);
      setActiveProject(project);
      activeProjectRef.current = project; // update ref immediately so updateProjectFiles sees it
    }

    // Capture current attachments and clear them from input
    const currentAttachments = [...attachments];
    setAttachments([]);

    // Build user message with attachment info
    const attachmentSummary = currentAttachments.length > 0
      ? '\n\n[Attached by user: ' + currentAttachments.map(a =>
          a.type === 'image'
            ? `📷 ${a.name} (${a.width}×${a.height}px image — use as base64 data URL in <img src="...">)`
            : `📄 ${a.name} (${a.language} code file)`
        ).join(', ') + ']'
      : '';

    const displayContent = currentAttachments.length > 0
      ? text + '\n' + currentAttachments.map(a =>
          a.type === 'image' ? `📷 ${a.name}` : `📄 ${a.name}`
        ).join(' • ')
      : text;

    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content: displayContent };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsGenerating(true);
    setStreamText('');
    if (!isAudit) {
      // Reset auto-debug counter only on user-initiated sends (not audit/debug)
      autoDebugCountRef.current = 0;
      lastDebugErrorsRef.current = '';
      setConsoleLogs([]); // fresh console for new user action
    }

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const currentFiles = (activeProjectRef.current?.files || []).map(f =>
        `<file path="${f.path}">\n${f.content}\n</file>`
      ).join('\n\n');

      const contextMsg = currentFiles ? `\n\nCurrent project files:\n${currentFiles}` : '';

      // Include recent console errors as context if any exist
      const recentErrors = consoleLogs.filter(l => l.level === 'error').slice(-5);
      const consoleContext = recentErrors.length > 0
        ? `\n\nRecent console errors from preview:\n${recentErrors.map(e => `[ERROR] ${e.message}`).join('\n')}`
        : '';

      const chatHistory = [...messages, userMsg].slice(-10).map(m => ({
        role: m.role as string,
        content: m.content,
      }));

      // Consult GOD AGENT for quality guidelines and cross-agent context
      const godDirective = GodAgent.consult({
        agent: 'web_designer',
        userInput: text,
        conversationHistory: chatHistory.slice(-6),
      });

      // Build attachment context for the AI
      let attachmentContext = '';
      if (currentAttachments.length > 0) {
        const parts: string[] = [];
        for (const att of currentAttachments) {
          if (att.type === 'image') {
            // Tell AI to use the base64 data URL directly in <img> tags
            parts.push(`\n## User-uploaded image: ${att.name} (${att.width}×${att.height}px)\nUse this EXACT data URL as the src for an <img> tag wherever it fits the design:\n${att.content}\n`);
          } else {
            // Include code content for AI to integrate
            parts.push(`\n## User-uploaded code file: ${att.name} (${att.language})\nIntegrate this code into the project. The user wants this in their site:\n\`\`\`${att.language}\n${att.content}\n\`\`\`\n`);
          }
        }
        attachmentContext = '\n\n## USER ATTACHMENTS — integrate these into the site:\n' + parts.join('\n');
      }

      // Auto-match a design template from the bot's brain (65 templates)
      // Only match for new site creation (not edits to existing projects)
      let templateContext = '';
      const isNewSite = !activeProjectRef.current?.files.length || activeProjectRef.current.files.length === 0;
      if (isNewSite && !isAudit) {
        const matches = searchTemplates(text);
        if (matches.length > 0) {
          const best = matches[0]; // top match
          templateContext = '\n\n## DESIGN BLUEPRINT (auto-selected from template library):\n' + templateToPrompt(best, text);
        }
      }

      // GOD AGENT provides brain memory + quality guidelines in one block
      const systemContent = SYSTEM_PROMPT + godDirective.systemPromptAdditions + templateContext + contextMsg + consoleContext;

      // Build the actual user prompt with attachment data
      const userPromptWithAttachments = text + attachmentSummary + attachmentContext;

      // Replace the last user message in chat history with the enriched version
      const enrichedHistory = chatHistory.map((m, i) =>
        i === chatHistory.length - 1 && m.role === 'user'
          ? { ...m, content: userPromptWithAttachments }
          : m
      );

      let streamAccum2 = '';
      const fullText = await streamAI({
        apiKey,
        systemPrompt: systemContent,
        messages: enrichedHistory,
        temperature: isAudit ? 0.3 : 0.7,
        signal: abort.signal,
        onToken: (token) => { streamAccum2 += token; setStreamText(streamAccum2); },
      });

      const parsedFiles = parseFilesFromResponse(fullText);
      if (parsedFiles.length > 0) {
        updateProjectFiles(parsedFiles);
        setConsoleLogs([]); // fresh console for new code

        // Report success to GOD AGENT
        GodAgent.report({ agent: 'web_designer', userInput: text }, {
          success: true,
          filesGenerated: parsedFiles.length,
        });

        // Learn: remember what user asked for and what was generated
        if (!isAudit && text.length > 10) {
          BrainMemory.learnPattern(
            `User asked: "${text.slice(0, 80)}..." → Generated ${parsedFiles.length} files: ${parsedFiles.map(f => f.path).join(', ')}`,
            'web_designer'
          );
        }
      }

      let displayText = fullText
        .replace(/<file\s+path="[^"]*">[\s\S]*?<\/file>/g, '') // closed file blocks
        .replace(/<file\s+path="[^"]*">[\s\S]*/g, '')           // unclosed file blocks
        .replace(/```[\w]*\n[\s\S]*?```/g, '')                   // markdown code blocks
        .replace(/<\/?(!DOCTYPE|html|head|body|meta|link|script|style|div|section|header|nav|main|footer|h[1-6]|p|a|span|img|ul|ol|li|form|input|button|textarea|select|label|table|tr|td|th|svg|path|circle)[^>]*>/gi, '') // strip leaked HTML tags
        .replace(/\s{3,}/g, ' ')                                  // collapse whitespace
        .trim();

      // If display text is mostly code (lots of brackets/braces), replace with file summary
      if (parsedFiles.length > 0 && displayText.length > 200) {
        const codeRatio = (displayText.match(/[{}<>/;=]/g) || []).length / displayText.length;
        if (codeRatio > 0.15) displayText = ''; // too code-heavy, use summary instead
      }

      if (!displayText && parsedFiles.length > 0) {
        displayText = `Updated ${parsedFiles.length} file${parsedFiles.length > 1 ? 's' : ''}: ${parsedFiles.map(f => f.path).join(', ')}`;
      }

      const assistantMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: displayText || 'Done!',
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, {
          id: `e_${Date.now()}`,
          role: 'system',
          content: `Error: ${err.message}`,
        }]);
      }
    } finally {
      setIsGenerating(false);
      setStreamText('');
      abortRef.current = null;
    }
  }, [input, isGenerating, apiKey, activeProject, messages, updateProjectFiles, consoleLogs]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    // Allow sending with just attachments (auto-generate prompt)
    if (!text && attachments.length > 0) {
      const imageCount = attachments.filter(a => a.type === 'image').length;
      const codeCount = attachments.filter(a => a.type === 'code').length;
      const autoPrompt = imageCount > 0 && codeCount > 0
        ? 'Use these uploaded images and code files in the site.'
        : imageCount > 0
          ? 'Use these uploaded images in the site — place them where they fit best.'
          : 'Integrate these uploaded code files into the project.';
      sendToAI(autoPrompt);
    } else {
      sendToAI(text);
    }
  }, [input, sendToAI, attachments]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsGenerating(false);
  };

  // ── Audit ───────────────────────────────────────────────────────────────
  const handleAudit = useCallback(() => {
    if (!activeProject?.files.length) return;
    sendToAI('Audit the entire project. Review all files for accessibility, performance, SEO, mobile responsiveness, JavaScript errors, and best practices. Fix every issue you find and output the corrected files.', true);
  }, [activeProject, sendToAI]);

  // ── Manual Debug ────────────────────────────────────────────────────────
  const handleDebug = useCallback(() => {
    const errors = consoleLogs.filter(l => l.level === 'error');
    if (errors.length === 0) {
      setMessages(prev => [...prev, {
        id: `sys_${Date.now()}`,
        role: 'system',
        content: 'No errors found in console. Your site is running clean!',
      }]);
      return;
    }
    const errorMsgs = errors.slice(-10).map(e => e.message);
    sendToAI(`Fix these console errors from the preview:\n\n${errorMsgs.join('\n')}`);
  }, [consoleLogs, sendToAI]);

  // ── Attachments: image + code file uploads ─────────────────────────────

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Get image dimensions
        const img = new window.Image();
        img.onload = () => {
          setAttachments(prev => [...prev, {
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'image',
            name: file.name,
            content: dataUrl,
            width: img.width,
            height: img.height,
          }]);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = ''; // reset so same file can be re-selected
  }, []);

  const handleCodeUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
          html: 'html', htm: 'html', css: 'css', js: 'javascript', ts: 'typescript',
          tsx: 'typescript', jsx: 'javascript', json: 'json', svg: 'svg', md: 'markdown',
          py: 'python', rb: 'ruby', php: 'php',
        };
        setAttachments(prev => [...prev, {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'code',
          name: file.name,
          content,
          language: langMap[ext] || ext,
        }]);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (!files.length) return;
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const img = new window.Image();
          img.onload = () => {
            setAttachments(prev => [...prev, {
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'image',
              name: file.name,
              content: dataUrl,
              width: img.width,
              height: img.height,
            }]);
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      } else {
        // Treat as code/text file
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result as string;
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          setAttachments(prev => [...prev, {
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'code',
            name: file.name,
            content,
            language: ext,
          }]);
        };
        reader.readAsText(file);
      }
    });
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const img = new window.Image();
          img.onload = () => {
            setAttachments(prev => [...prev, {
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'image',
              name: `pasted-image-${Date.now()}.png`,
              content: dataUrl,
              width: img.width,
              height: img.height,
            }]);
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const previewHTML = activeProject ? buildPreviewHTML(activeProject.files, activePage) : '';
  const htmlPages = activeProject?.files.filter(f => f.path.endsWith('.html')) || [];
  const currentFile = activeProject?.files.find(f => f.path === selectedFile);
  const errorCount = consoleLogs.filter(l => l.level === 'error').length;
  const warnCount = consoleLogs.filter(l => l.level === 'warn').length;
  const filteredLogs = consoleFilter === 'all'
    ? consoleLogs
    : consoleLogs.filter(l => l.level === consoleFilter);

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col sm:flex-row bg-[#0a0a0a] text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── Left Panel: Projects + Chat ── */}
      <div className="w-full sm:w-[340px] h-[45vh] sm:h-auto flex flex-col border-b sm:border-b-0 sm:border-r border-white/[0.06] bg-[#0d0d0d] shrink-0">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-white">Web Designer</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => createNewProject()}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
              title="New Project"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Project List / File Tree */}
        <div className="h-[140px] overflow-y-auto border-b border-white/[0.06] scrollbar-thin scrollbar-thumb-slate-800">
          {!activeProject ? (
            <div className="p-2 space-y-1">
              {projects.length === 0 && (
                <p className="text-xs text-slate-600 text-center py-4">No projects yet. Describe a website to start.</p>
              )}
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProject(p); setMessages([]); setSelectedFile(p.files[0]?.path || null); setConsoleLogs([]); }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.05] text-left group transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-xs text-slate-300 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-slate-600">{p.files.length} files</span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteProject(p.id); }}
                      className="p-0.5 hover:text-red-400 text-slate-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-2">
              <button
                onClick={() => { setActiveProject(null); setMessages([]); setConsoleLogs([]); }}
                className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-white mb-2 px-1 transition-colors"
              >
                <ChevronRight className="w-3 h-3 rotate-180" /> All Projects
              </button>
              <div className="flex items-center gap-2 px-2 mb-2">
                <FolderOpen className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-medium text-white truncate">{activeProject.name}</span>
                <button
                  onClick={() => exportAsZip(activeProject)}
                  className="ml-auto p-1 rounded hover:bg-white/[0.08] text-slate-500 hover:text-white transition-colors"
                  title="Export Project"
                >
                  <Download className="w-3 h-3" />
                </button>
              </div>
              {activeProject.files.length === 0 ? (
                <p className="text-[10px] text-slate-600 px-2">No files yet</p>
              ) : (
                <div className="space-y-0.5">
                  {activeProject.files.map(f => (
                    <button
                      key={f.path}
                      onClick={() => { setSelectedFile(f.path); setRightPanel('code'); }}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors ${
                        selectedFile === f.path ? 'bg-violet-500/20 text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                      }`}
                    >
                      {getFileIcon(f.path)}
                      <span className="truncate">{f.path}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-800">
          {messages.length === 0 && !streamText && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <Layers className="w-8 h-8 text-violet-400/40 mb-3" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Describe the website you want to build. Be specific about layout, colors, and content.
              </p>
              <div className="mt-4 space-y-2 w-full">
                {[
                  'Build a modern SaaS landing page with pricing',
                  'Create a portfolio site with dark theme',
                  'Design a restaurant website with menu',
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(suggestion)}
                    className="w-full text-left text-[11px] text-slate-500 hover:text-white px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.06] hover:border-white/[0.08] transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-violet-600 text-white rounded-tr-sm'
                  : msg.role === 'system'
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-white/[0.04] text-slate-300 border border-white/[0.06]'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Figma-style generation status */}
          {isGenerating && (
            <div className="flex justify-start">
              <div className="w-full px-3 py-2.5 rounded-xl text-xs bg-violet-500/[0.08] border border-violet-500/20">
                {(() => {
                  const fileMatches = streamText.match(/<file\s+path="([^"]+)">/g) || [];
                  const fileNames = fileMatches.map(m => m.match(/path="([^"]+)"/)?.[1] || '');
                  const isWritingFile = streamText.includes('<file') && !streamText.endsWith('</file>');
                  const currentFileInStream = fileNames[fileNames.length - 1];
                  const completedFiles = streamText.match(/<\/file>/g)?.length || 0;

                  if (!streamText) {
                    return (
                      <span className="flex items-center gap-2 text-violet-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Designing your site...</span>
                      </span>
                    );
                  }
                  if (isWritingFile && currentFileInStream) {
                    return (
                      <span className="flex items-center gap-2 text-violet-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Writing <span className="font-mono text-violet-200">{currentFileInStream}</span></span>
                        {completedFiles > 0 && <span className="text-violet-400/60 ml-auto">{completedFiles} file{completedFiles > 1 ? 's' : ''} done</span>}
                      </span>
                    );
                  }
                  if (completedFiles > 0) {
                    return (
                      <span className="flex items-center gap-2 text-violet-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Finishing up...</span>
                        <span className="text-violet-400/60 ml-auto">{completedFiles} file{completedFiles > 1 ? 's' : ''} ready</span>
                      </span>
                    );
                  }
                  return (
                    <span className="flex items-center gap-2 text-violet-300">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Planning layout...</span>
                    </span>
                  );
                })()}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-white/[0.06]">
          {/* Quick action bar */}
          {activeProject && activeProject.files.length > 0 && !isGenerating && (
            <div className="flex items-center gap-1.5 mb-2">
              <button
                onClick={handleAudit}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 border border-violet-500/20 transition-colors"
                title="AI audits code for issues and fixes them"
              >
                <Sparkles className="w-3 h-3" /> Audit
              </button>
              <button
                onClick={handleDebug}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                  errorCount > 0
                    ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border-red-500/20'
                    : 'bg-white/[0.03] text-slate-500 hover:bg-white/[0.06] border-white/[0.06]'
                }`}
                title="Send console errors to AI for debugging"
              >
                <Bug className="w-3 h-3" /> Debug{errorCount > 0 ? ` (${errorCount})` : ''}
              </button>
              <button
                onClick={() => setShowConsole(!showConsole)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                  showConsole
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-white/[0.03] text-slate-500 hover:bg-white/[0.06] border-white/[0.06]'
                }`}
                title="Toggle console panel"
              >
                <Terminal className="w-3 h-3" /> Console
                {(errorCount + warnCount) > 0 && (
                  <span className={`ml-0.5 px-1 rounded-full text-[9px] ${errorCount > 0 ? 'bg-red-500/30 text-red-300' : 'bg-amber-500/30 text-amber-300'}`}>
                    {errorCount + warnCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,.css,.js,.ts,.tsx,.jsx,.json,.svg,.md,.py,.rb,.php,.txt"
            multiple
            onChange={handleCodeUpload}
            className="hidden"
          />

          {/* Attachment preview chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachments.map(att => (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] group"
                >
                  {att.type === 'image' ? (
                    <img src={att.content} alt={att.name} className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-white/[0.06] flex items-center justify-center">
                      <Code2 className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-slate-300 truncate max-w-[100px]">{att.name}</span>
                    <span className="text-[9px] text-slate-600">
                      {att.type === 'image' ? `${att.width}×${att.height}` : att.language}
                    </span>
                  </div>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="p-0.5 rounded hover:bg-white/[0.1] text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            className="relative"
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              onPaste={handlePaste}
              placeholder={activeProject ? 'Describe changes... (paste or drop images/code)' : 'Describe your website... (paste or drop images/code)'}
              rows={2}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 pr-20 text-xs text-white placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500/40 transition-colors"
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              {!isGenerating && (
                <>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-white/[0.06] transition-colors"
                    title="Upload images"
                  >
                    <Image className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-white/[0.06] transition-colors"
                    title="Upload code files"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {isGenerating ? (
                <button
                  onClick={handleStop}
                  className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={(!input.trim() && attachments.length === 0) || !apiKey}
                  className="p-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-white/20 mt-1 px-1">
            Powered by Llama 4 Maverick
          </p>
        </div>
      </div>

      {/* ── Right Panel: Preview + Code + Console ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#0d0d0d]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setRightPanel('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                rightPanel === 'preview' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Preview
            </button>
            <button
              onClick={() => setRightPanel('code')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                rightPanel === 'code' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" /> Code
            </button>
            <button
              onClick={() => setRightPanel('console')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                rightPanel === 'console' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-500 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" /> Console
              {errorCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-red-500/30 text-red-300">{errorCount}</span>
              )}
            </button>
          </div>

          {/* Viewport size — only in preview mode */}
          {rightPanel === 'preview' && (
            <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5">
              <button
                onClick={() => setViewport('desktop')}
                className={`p-1.5 rounded-md transition-colors ${viewport === 'desktop' ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-300'}`}
                title="Desktop"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewport('tablet')}
                className={`p-1.5 rounded-md transition-colors ${viewport === 'tablet' ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-300'}`}
                title="Tablet"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewport('mobile')}
                className={`p-1.5 rounded-md transition-colors ${viewport === 'mobile' ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-300'}`}
                title="Mobile"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1">
            {activeProject && activeProject.files.length > 0 && (
              <button
                onClick={() => exportAsZip(activeProject)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 relative overflow-hidden bg-[#111] flex flex-col">
          {/* Main content */}
          <div className="flex-1 overflow-hidden">
            {rightPanel === 'preview' && (
              <div className="h-full flex flex-col overflow-hidden">
                {/* Page tabs — show when multiple HTML files exist */}
                {htmlPages.length > 1 && (
                  <div className="flex items-center gap-0.5 px-3 py-1.5 bg-[#0d0d0d] border-b border-white/[0.06] overflow-x-auto scrollbar-thin">
                    {htmlPages.map(f => (
                      <button
                        key={f.path}
                        onClick={() => setActivePage(f.path)}
                        className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                          activePage === f.path
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
                        }`}
                      >
                        {f.path.replace('.html', '')}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex-1 flex items-start justify-center overflow-auto p-4" style={{ background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #151515 0% 50%) 0 0 / 20px 20px' }}>
                <div
                  className="bg-[#0f0f0f] rounded-lg overflow-hidden shadow-2xl transition-all duration-300"
                  style={{
                    width: VIEWPORT_SIZES[viewport].width,
                    maxWidth: '100%',
                    height: viewport === 'desktop' ? '100%' : 'auto',
                    minHeight: viewport !== 'desktop' ? '600px' : undefined,
                  }}
                >
                  {activeProject && activeProject.files.length > 0 ? (
                    <iframe
                      srcDoc={previewHTML}
                      className="w-full h-full border-0"
                      style={{ minHeight: viewport !== 'desktop' ? '600px' : '100%', background: '#0f0f0f' }}
                      sandbox="allow-scripts allow-same-origin allow-popups"
                      title="Preview"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-400 bg-[#fafafa]">
                      <Layers className="w-12 h-12 text-slate-200 mb-4" />
                      <p className="text-sm font-medium text-slate-400">Your site preview will appear here</p>
                      <p className="text-xs text-slate-300 mt-1">Describe what you want to build in the chat</p>
                    </div>
                  )}
                </div>
              </div>
              </div>
            )}

            {rightPanel === 'code' && (
              <div className="h-full flex">
                {activeProject && activeProject.files.length > 0 ? (
                  <div className="w-full flex flex-col">
                    <div className="flex items-center border-b border-white/[0.06] bg-[#0d0d0d] overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
                      {activeProject.files.map(f => (
                        <button
                          key={f.path}
                          onClick={() => setSelectedFile(f.path)}
                          className={`flex items-center gap-1.5 px-3 py-2 text-xs border-r border-white/[0.04] whitespace-nowrap transition-colors ${
                            selectedFile === f.path
                              ? 'bg-[#111] text-white border-b-2 border-b-violet-500'
                              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'
                          }`}
                        >
                          {getFileIcon(f.path)}
                          {f.path}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 overflow-auto">
                      {currentFile ? (
                        <pre className="p-4 text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                          <code>{currentFile.content}</code>
                        </pre>
                      ) : (
                        <p className="p-4 text-xs text-slate-600">Select a file to view</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-slate-600 text-xs">
                    No files to show
                  </div>
                )}
              </div>
            )}

            {rightPanel === 'console' && (
              <div className="h-full flex flex-col bg-[#0a0a0a]">
                {/* Console toolbar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-[#0d0d0d]">
                  <div className="flex items-center gap-1">
                    {(['all', 'error', 'warn', 'log'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setConsoleFilter(f)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          consoleFilter === f
                            ? f === 'error' ? 'bg-red-500/20 text-red-300'
                              : f === 'warn' ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-white/[0.08] text-white'
                            : 'text-slate-500 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        {f === 'all' ? `All (${consoleLogs.length})` : f === 'error' ? `Errors (${errorCount})` : f === 'warn' ? `Warnings (${warnCount})` : `Logs (${consoleLogs.filter(l => l.level === 'log' || l.level === 'info').length})`}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={handleDebug}
                      disabled={errorCount === 0 || isGenerating}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Bug className="w-3 h-3" /> Fix Errors
                    </button>
                    <button
                      onClick={() => setConsoleLogs([])}
                      className="p-1 rounded hover:bg-white/[0.06] text-slate-500 hover:text-white transition-colors"
                      title="Clear console"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Console output */}
                <div className="flex-1 overflow-y-auto font-mono text-[11px] scrollbar-thin scrollbar-thumb-slate-800">
                  {filteredLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                      <Terminal className="w-4 h-4 mr-2 opacity-40" />
                      {consoleLogs.length === 0 ? 'Console output will appear here when the preview runs' : 'No entries match this filter'}
                    </div>
                  ) : (
                    filteredLogs.map(entry => (
                      <div
                        key={entry.id}
                        className={`flex items-start gap-2 px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/[0.02] ${
                          entry.level === 'error' ? 'bg-red-500/[0.04] text-red-300'
                          : entry.level === 'warn' ? 'bg-amber-500/[0.04] text-amber-300'
                          : 'text-slate-400'
                        }`}
                      >
                        <span className="shrink-0 mt-0.5">
                          {entry.level === 'error' ? <AlertTriangle className="w-3 h-3 text-red-400" />
                            : entry.level === 'warn' ? <AlertTriangle className="w-3 h-3 text-amber-400" />
                            : <ChevronRight className="w-3 h-3 text-slate-600" />}
                        </span>
                        <span className="break-all whitespace-pre-wrap leading-relaxed">{entry.message}</span>
                        <span className="shrink-0 ml-auto text-[9px] text-slate-700 tabular-nums">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={consoleEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* Inline console drawer (when toggled from left panel) — shows below preview/code */}
          {showConsole && rightPanel !== 'console' && (
            <div className="h-[180px] border-t border-white/[0.06] bg-[#0a0a0a] flex flex-col shrink-0">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-[#0d0d0d]">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-slate-300">Console</span>
                  {errorCount > 0 && <span className="px-1 rounded-full text-[9px] bg-red-500/30 text-red-300">{errorCount} error{errorCount > 1 ? 's' : ''}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDebug}
                    disabled={errorCount === 0 || isGenerating}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Bug className="w-2.5 h-2.5" /> Fix
                  </button>
                  <button onClick={() => setConsoleLogs([])} className="p-0.5 hover:bg-white/[0.06] text-slate-600 hover:text-white rounded transition-colors">
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                  <button onClick={() => setShowConsole(false)} className="p-0.5 hover:bg-white/[0.06] text-slate-600 hover:text-white rounded transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto font-mono text-[10px] scrollbar-thin scrollbar-thumb-slate-800">
                {consoleLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-700 text-[10px]">No console output yet</div>
                ) : (
                  consoleLogs.slice(-100).map(entry => (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-1.5 px-2 py-1 border-b border-white/[0.02] ${
                        entry.level === 'error' ? 'text-red-300 bg-red-500/[0.03]'
                        : entry.level === 'warn' ? 'text-amber-300 bg-amber-500/[0.03]'
                        : 'text-slate-500'
                      }`}
                    >
                      <span className="shrink-0 mt-px">
                        {entry.level === 'error' ? <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                          : entry.level === 'warn' ? <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                          : <ChevronRight className="w-2.5 h-2.5 text-slate-700" />}
                      </span>
                      <span className="break-all whitespace-pre-wrap leading-relaxed">{entry.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
