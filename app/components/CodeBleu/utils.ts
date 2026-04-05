// ─── Code Bleu Utilities ─────────────────────────────────────────────────────

import { LANG_MAP } from './constants';

export function getLang(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() ?? '';
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'bash';
  return LANG_MAP[name.split('.').pop() ?? ''] ?? 'plaintext';
}

export function msgId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Sanitize shell argument — strip chars that enable injection via double-quoted interpolation */
export function shellSafe(val: string): string {
  return val.replace(/[`$\\!"]/g, '');
}

/** Reject path traversal — blocks ../ sequences in user-controlled paths */
export function safePath(name: string): string | null {
  if (name.includes('..') || name.includes('~') || /[;&|`$]/.test(name)) return null;
  return name;
}

/** Fetch with timeout — prevents hanging on unresponsive endpoints */
export function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** Auto-detect questions and generate clickable suggestions */
export function extractSuggestions(text: string): string[] {
  if (!text.includes('?')) return [];
  const questions = text.match(/[^.!?\n]*\?/g);
  if (!questions || questions.length === 0) return [];
  const qText = questions.join(' ').toLowerCase();

  const numberedOpts = text.match(/(?:^|\n)\s*(?:\d+[\.\)]\s*|[-•]\s+)([^\n]{3,50})/g);
  if (numberedOpts && numberedOpts.length >= 2) {
    return numberedOpts
      .map(o => o.replace(/^\s*(?:\d+[\.\)]\s*|[-•]\s+)/, '').trim())
      .filter(o => o.length > 1 && o.length < 50)
      .slice(0, 5);
  }

  const orMatch = qText.match(/\b([\w\s.-]+?)\s+or\s+([\w\s.-]+?)\?/i);
  if (orMatch) {
    const a = orMatch[1].trim().replace(/^(a|an|the|like|use)\s+/i, '');
    const b = orMatch[2].trim().replace(/\?.*$/, '').replace(/^(a|an|the)\s+/i, '');
    if (a.length > 1 && a.length < 40 && b.length > 1 && b.length < 40) return [a, b];
  }

  if (qText.match(/should i.*(go ahead|proceed|fix|write|change|update|create|build|start)/)) return ['Yes, go ahead', 'No, wait'];
  if (qText.match(/want me to.*(fix|write|change|update|create|build|refactor|install)/)) return ['Yes, do it', 'No, hold on'];
  if (qText.match(/ready\?|shall i|should i (start|begin|continue)/)) return ['Yes, start', 'Not yet'];
  if (qText.match(/what.*(kind|type|framework|language|stack|template).*\?/)) return ['React + TypeScript', 'Next.js', 'Vue', 'Node.js + Express', 'Python + Flask'];
  if (qText.match(/what.*(name|call|named).*\?/)) return ['my-app', 'my-project'];
  if (qText.match(/which.*(file|component|page|approach|method|option).*\?/)) return ['The first one', 'The second one', 'Both'];
  if (qText.match(/\b(can i|should i|shall i|want me|would you|do you)\b.*\?/)) return ['Yes', 'No'];

  return [];
}

/** Pick the right model based on task context */
export function pickModel(task: 'summary' | 'agent' | 'closing' | 'analysis', _userMsg?: string): string {
  if (task === 'summary' || task === 'closing') return 'llama-3.1-8b-instant';
  if (task === 'analysis') return 'deepseek-r1-distill-llama-70b';
  return 'llama-3.3-70b-versatile';
}

/** Syntax highlighting (minimal, HTML-based) */
export function highlightCode(code: string, lang: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = esc(code);
  html = html.replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, '<span style="color:#98c379">$&</span>');
  html = html.replace(/(\/\/.*$)/gm, '<span style="color:#5c6370;font-style:italic">$1</span>');
  const kw = 'function|const|let|var|return|if|else|for|while|import|from|export|default|class|extends|new|this|async|await|try|catch|throw|typeof|interface|type|enum|switch|case|break|continue|do|in|of|yield|void|null|undefined|true|false|def|self|print|elif|pass|raise|with|as|lambda|None|True|False|fn|pub|mod|use|impl|struct|match|mut|loop|crate|trait|where|super';
  html = html.replace(new RegExp(`\\b(${kw})\\b`, 'g'), '<span style="color:#c678dd">$1</span>');
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#d19a66">$1</span>');
  return html;
}

/** Safe clipboard copy with fallback */
export function safeClipboardCopy(text: string): void {
  try {
    navigator.clipboard.writeText(text).catch(() => {
      _fallbackCopy(text);
    });
  } catch {
    _fallbackCopy(text);
  }
}

function _fallbackCopy(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
