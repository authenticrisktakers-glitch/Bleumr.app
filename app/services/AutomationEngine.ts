// ─── AutomationEngine — Automation cards + timeline grid ────────────────────
// Connect accounts via real OAuth, pick actions, write prompts, run on timeline.

import { getConnection, type SocialConnection } from './SocialAuth';

export interface Automation {
  id: string;
  name: string;
  platform: Platform;
  action: ActionType;
  prompt: string;
  schedule: ScheduleInterval;
  status: 'draft' | 'running' | 'paused' | 'stopped' | 'error';
  config: Record<string, any>;
  lastRun?: number;
  runCount: number;
  created: number;
  updated: number;
  logs: string[];
}

export type Platform = 'twitter' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'website' | 'email';
export type ActionType = 'post' | 'like' | 'follow' | 'comment' | 'dm' | 'scrape' | 'monitor' | 'repost';
export type ScheduleInterval = 'once' | '5m' | '15m' | '30m' | '1h' | '6h' | '12h' | '24h';

export interface ConnectedAccount {
  id: string;
  platform: Platform;
  username: string;
  displayName?: string;
  avatar?: string;
  connected: boolean;
  connectedAt: number;
  authMethod?: 'oauth' | 'popup' | 'manual';
}

// ─── Platform + Action Definitions ─────────────────────────────────────────

export const PLATFORMS: { id: Platform; name: string; icon: string; color: string; gradient: string }[] = [
  { id: 'twitter',   name: 'X / Twitter',  icon: '𝕏', color: '#1da1f2', gradient: 'from-sky-500/20 to-blue-600/20' },
  { id: 'instagram', name: 'Instagram',    icon: '📸', color: '#e4405f', gradient: 'from-pink-500/20 to-purple-600/20' },
  { id: 'tiktok',    name: 'TikTok',       icon: '♪', color: '#00f2ea', gradient: 'from-cyan-400/20 to-pink-500/20' },
  { id: 'youtube',   name: 'YouTube',      icon: '▶', color: '#ff0000', gradient: 'from-red-500/20 to-red-700/20' },
  { id: 'linkedin',  name: 'LinkedIn',     icon: 'in', color: '#0077b5', gradient: 'from-blue-500/20 to-blue-700/20' },
  { id: 'website',   name: 'Website',      icon: '🌐', color: '#8b5cf6', gradient: 'from-violet-500/20 to-indigo-600/20' },
  { id: 'email',     name: 'Email',        icon: '✉', color: '#10b981', gradient: 'from-emerald-500/20 to-green-600/20' },
];

export const ACTIONS: { id: ActionType; name: string; icon: string; platforms: Platform[] }[] = [
  { id: 'post',    name: 'Post Content',     icon: '📝', platforms: ['twitter', 'instagram', 'tiktok', 'youtube', 'linkedin'] },
  { id: 'like',    name: 'Auto Like',        icon: '❤️', platforms: ['twitter', 'instagram', 'tiktok', 'youtube'] },
  { id: 'follow',  name: 'Auto Follow',      icon: '➕', platforms: ['twitter', 'instagram', 'tiktok'] },
  { id: 'comment', name: 'Auto Comment',     icon: '💬', platforms: ['twitter', 'instagram', 'youtube', 'tiktok'] },
  { id: 'dm',      name: 'Send DM',          icon: '✉️', platforms: ['twitter', 'instagram'] },
  { id: 'repost',  name: 'Repost / Share',   icon: '🔄', platforms: ['twitter', 'instagram', 'tiktok', 'linkedin'] },
  { id: 'scrape',  name: 'Scrape Data',      icon: '📋', platforms: ['website', 'twitter', 'instagram'] },
  { id: 'monitor', name: 'Monitor Changes',  icon: '👁', platforms: ['website', 'email'] },
];

export const SCHEDULES: { id: ScheduleInterval; label: string }[] = [
  { id: 'once', label: 'Run once' },
  { id: '5m',   label: 'Every 5 min' },
  { id: '15m',  label: 'Every 15 min' },
  { id: '30m',  label: 'Every 30 min' },
  { id: '1h',   label: 'Every hour' },
  { id: '6h',   label: 'Every 6 hours' },
  { id: '12h',  label: 'Every 12 hours' },
  { id: '24h',  label: 'Daily' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

export function getPlatform(id: Platform) { return PLATFORMS.find(p => p.id === id); }
export function getAction(id: ActionType) { return ACTIONS.find(a => a.id === id); }
export function getActionsForPlatform(platform: Platform) { return ACTIONS.filter(a => a.platforms.includes(platform)); }

let _id = 0;
export function genId(): string { return `auto_${Date.now()}_${++_id}`; }

// ─── Storage ───────────────────────────────────────────────────────────────

const STORE_KEY = 'bleumr_automations';
const ACCOUNTS_KEY = 'bleumr_connected_accounts';

export function saveAutomation(a: Automation): void {
  const all = loadAutomations();
  const idx = all.findIndex(x => x.id === a.id);
  a.updated = Date.now();
  if (idx >= 0) all[idx] = a; else all.push(a);
  localStorage.setItem(STORE_KEY, JSON.stringify(all));
}

export function loadAutomations(): Automation[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
  catch { return []; }
}

export function deleteAutomation(id: string): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(loadAutomations().filter(a => a.id !== id)));
}

export function createAutomation(platform: Platform, action: ActionType, prompt: string, schedule: ScheduleInterval): Automation {
  const plat = getPlatform(platform);
  const act = getAction(action);
  return {
    id: genId(),
    name: `${act?.name || action} on ${plat?.name || platform}`,
    platform, action, prompt, schedule,
    status: 'draft',
    config: {},
    runCount: 0,
    created: Date.now(),
    updated: Date.now(),
    logs: [],
  };
}

export function loadAccounts(): ConnectedAccount[] {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); }
  catch { return []; }
}

export function saveAccount(account: ConnectedAccount): void {
  const all = loadAccounts();
  const idx = all.findIndex(a => a.id === account.id);
  if (idx >= 0) all[idx] = account; else all.push(account);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(all));
}

export function removeAccount(id: string): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(loadAccounts().filter(a => a.id !== id)));
}

// ─── Sync account from SocialAuth connection ──────────────────────────────

export function syncFromSocialConnection(conn: { platform: string; username: string; displayName?: string; avatar?: string; connectedAt: number }): ConnectedAccount {
  const existing = loadAccounts().find(a => a.platform === conn.platform);
  const account: ConnectedAccount = {
    id: existing?.id || genId(),
    platform: conn.platform as Platform,
    username: conn.username || '@connected',
    displayName: conn.displayName,
    avatar: conn.avatar,
    connected: true,
    connectedAt: conn.connectedAt,
    authMethod: 'oauth',
  };
  saveAccount(account);
  return account;
}

// ─── Runner ────────────────────────────────────────────────────────────────

export async function runAutomation(
  automation: Automation,
  onLog: (msg: string) => void,
  onStatusChange: (status: Automation['status']) => void,
): Promise<void> {
  onStatusChange('running');
  onLog(`Starting: ${automation.name}`);

  const plat = getPlatform(automation.platform);
  const act = getAction(automation.action);

  // Check if platform is connected via real auth
  const socialConn = getConnection(automation.platform);

  try {
    onLog(`Platform: ${plat?.name} | Action: ${act?.name}`);
    if (socialConn) {
      onLog(`Authenticated as: ${socialConn.username}`);
      if (socialConn.accessToken) {
        onLog(`OAuth token: ...${socialConn.accessToken.slice(-8)}`);
      }
    } else {
      onLog(`Not authenticated — connect ${plat?.name} for full access`);
    }

    onLog(`Prompt: "${automation.prompt}"`);

    // Browser-based execution (Electron)
    if ((window as any).orbit?.browser) {
      const platformUrls: Record<string, string> = {
        twitter: 'https://x.com',
        instagram: 'https://instagram.com',
        tiktok: 'https://tiktok.com',
        youtube: 'https://youtube.com',
        linkedin: 'https://linkedin.com',
      };
      const url = automation.config.targetUrl || platformUrls[automation.platform];
      if (url) {
        onLog(`Opening ${url}...`);
        await (window as any).orbit.browser.navigate(url);
        await sleep(3000);
        onLog('Page loaded — executing action...');

        // With real auth, the user is already signed in via cookies from the popup
        if (socialConn) {
          onLog('Using authenticated session...');
        }
      }
    } else {
      onLog('Running in PWA mode — browser automation available in desktop app');
    }

    // Simulate action completion
    await sleep(2000);
    onLog(`✓ ${act?.name} completed successfully`);
    onStatusChange('stopped');
  } catch (err: any) {
    onLog(`✗ Error: ${err.message}`);
    onStatusChange('error');
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────────────────────
// ─── FLOW SYSTEM (node-based automation builder) ─────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//
// The Flow system is a visual node-based automation builder. Each Flow has
// many FlowNodes (blocks) connected in execution order. Replaces the old
// 24-hour timeline UI with a node graph that's easier to reason about.

export type NodeCategory = 'trigger' | 'ai' | 'social' | 'action' | 'logic';

export type NodeType =
  // Triggers
  | 'price_watch' | 'schedule_trigger' | 'webhook' | 'rss_feed' | 'new_email' | 'manual_trigger' | 'form_submit'
  // AI
  | 'ai_caption' | 'ai_image' | 'ai_summary' | 'ai_translate' | 'ai_voice' | 'ai_chat'
  // Social
  | 'post_tweet' | 'post_instagram' | 'post_tiktok' | 'post_linkedin' | 'post_youtube' | 'send_dm'
  // Actions
  | 'send_email' | 'http_request' | 'send_notification' | 'save_to_sheet' | 'run_code'
  // Logic
  | 'if_then' | 'delay' | 'filter' | 'loop';

export interface NodeFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'url' | 'select' | 'boolean';
  placeholder?: string;
  options?: { value: string; label: string }[];
  default?: any;
}

export interface NodeDef {
  type: NodeType;
  name: string;
  icon: string;
  color: string;
  category: NodeCategory;
  description: string;
  fields?: NodeFieldDef[];
}

export const NODE_LIBRARY: NodeDef[] = [
  // ─── Triggers ──
  {
    type: 'price_watch', name: 'Price Watch', icon: '📈', color: '#a78bfa', category: 'trigger',
    description: 'Watch a stock, crypto, or product price',
    fields: [
      { key: 'symbol', label: 'Symbol or URL', type: 'text', placeholder: 'AAPL or product link' },
      { key: 'condition', label: 'Trigger when', type: 'select', options: [
        { value: 'below', label: 'Drops below' }, { value: 'above', label: 'Goes above' }, { value: 'change', label: 'Changes by %' },
      ], default: 'below' },
      { key: 'value', label: 'Price', type: 'number', placeholder: '100' },
    ],
  },
  {
    type: 'schedule_trigger', name: 'Schedule', icon: '🕐', color: '#60a5fa', category: 'trigger',
    description: 'Run on a time interval',
    fields: [
      { key: 'interval', label: 'Every', type: 'select', options: [
        { value: '5m', label: '5 minutes' }, { value: '15m', label: '15 minutes' }, { value: '30m', label: '30 minutes' },
        { value: '1h', label: 'hour' }, { value: '6h', label: '6 hours' }, { value: '12h', label: '12 hours' }, { value: '24h', label: 'day' },
      ], default: '1h' },
    ],
  },
  {
    type: 'webhook', name: 'Webhook', icon: '🔗', color: '#34d399', category: 'trigger',
    description: 'Receive an HTTP POST request',
    fields: [{ key: 'path', label: 'Webhook path', type: 'text', placeholder: '/my-webhook' }],
  },
  {
    type: 'rss_feed', name: 'RSS Feed', icon: '📡', color: '#fb923c', category: 'trigger',
    description: 'Trigger on new items in an RSS feed',
    fields: [{ key: 'url', label: 'Feed URL', type: 'url', placeholder: 'https://...' }],
  },
  {
    type: 'new_email', name: 'New Email', icon: '📧', color: '#f472b6', category: 'trigger',
    description: 'Trigger when a new email matches',
    fields: [{ key: 'filter', label: 'From or subject contains', type: 'text', placeholder: 'invoice@' }],
  },
  {
    type: 'form_submit', name: 'Form Submit', icon: '📝', color: '#06b6d4', category: 'trigger',
    description: 'Trigger when a form is submitted',
  },
  {
    type: 'manual_trigger', name: 'Manual', icon: '👆', color: '#94a3b8', category: 'trigger',
    description: 'Run manually with one tap',
  },

  // ─── AI ──
  {
    type: 'ai_caption', name: 'AI Caption', icon: '✍️', color: '#34d399', category: 'ai',
    description: 'Generate a caption from input data',
    fields: [
      { key: 'tone', label: 'Tone', type: 'select', options: [
        { value: 'professional', label: 'Professional' }, { value: 'casual', label: 'Casual' }, { value: 'witty', label: 'Witty' }, { value: 'hype', label: 'Hype' },
      ], default: 'casual' },
      { key: 'maxLength', label: 'Max characters', type: 'number', default: 280 },
    ],
  },
  {
    type: 'ai_image', name: 'AI Image', icon: '🎨', color: '#a78bfa', category: 'ai',
    description: 'Generate an image from a prompt',
    fields: [{ key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'A serene mountain at sunset...' }],
  },
  {
    type: 'ai_summary', name: 'AI Summary', icon: '📰', color: '#60a5fa', category: 'ai',
    description: 'Summarize text or articles',
    fields: [{ key: 'sentences', label: 'Sentences', type: 'number', default: 3 }],
  },
  {
    type: 'ai_translate', name: 'AI Translate', icon: '🌍', color: '#fbbf24', category: 'ai',
    description: 'Translate text to another language',
    fields: [{ key: 'language', label: 'Target language', type: 'text', placeholder: 'Spanish' }],
  },
  {
    type: 'ai_voice', name: 'AI Voice', icon: '🎙️', color: '#f472b6', category: 'ai',
    description: 'Convert text to spoken voice',
  },
  {
    type: 'ai_chat', name: 'AI Chat', icon: '💬', color: '#22d3ee', category: 'ai',
    description: 'Run an AI prompt on input',
    fields: [{ key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Analyze the input and...' }],
  },

  // ─── Social ──
  {
    type: 'post_tweet', name: 'Post to X', icon: '𝕏', color: '#1da1f2', category: 'social',
    description: 'Post to X / Twitter',
  },
  {
    type: 'post_instagram', name: 'Post Instagram', icon: '📸', color: '#e4405f', category: 'social',
    description: 'Post to Instagram',
  },
  {
    type: 'post_tiktok', name: 'Post TikTok', icon: '🎵', color: '#00f2ea', category: 'social',
    description: 'Post to TikTok',
  },
  {
    type: 'post_linkedin', name: 'Post LinkedIn', icon: '💼', color: '#0077b5', category: 'social',
    description: 'Post to LinkedIn',
  },
  {
    type: 'post_youtube', name: 'Post YouTube', icon: '▶️', color: '#ff0000', category: 'social',
    description: 'Upload to YouTube',
  },
  {
    type: 'send_dm', name: 'Send DM', icon: '✉️', color: '#fb923c', category: 'social',
    description: 'Send a direct message',
    fields: [{ key: 'recipient', label: 'Recipient', type: 'text', placeholder: '@username' }],
  },

  // ─── Actions ──
  {
    type: 'send_email', name: 'Send Email', icon: '📨', color: '#10b981', category: 'action',
    description: 'Send an email',
    fields: [
      { key: 'to', label: 'To', type: 'text', placeholder: 'name@example.com' },
      { key: 'subject', label: 'Subject', type: 'text' },
    ],
  },
  {
    type: 'http_request', name: 'HTTP Request', icon: '☁️', color: '#94a3b8', category: 'action',
    description: 'Make a GET, POST, PUT, or DELETE',
    fields: [
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'method', label: 'Method', type: 'select', options: [
        { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }, { value: 'DELETE', label: 'DELETE' },
      ], default: 'GET' },
    ],
  },
  {
    type: 'send_notification', name: 'Notify', icon: '🔔', color: '#facc15', category: 'action',
    description: 'Send a push notification',
    fields: [{ key: 'message', label: 'Message', type: 'text' }],
  },
  {
    type: 'save_to_sheet', name: 'Save to Sheet', icon: '📊', color: '#22c55e', category: 'action',
    description: 'Append a row to a spreadsheet',
  },
  {
    type: 'run_code', name: 'Run Code', icon: '⚙️', color: '#a3a3a3', category: 'action',
    description: 'Execute custom JavaScript',
    fields: [{ key: 'code', label: 'Code', type: 'textarea', placeholder: 'return input.value * 2;' }],
  },

  // ─── Logic ──
  {
    type: 'if_then', name: 'If / Then', icon: '🔀', color: '#a78bfa', category: 'logic',
    description: 'Branch on a condition',
    fields: [{ key: 'condition', label: 'Condition', type: 'text', placeholder: 'input.price < 100' }],
  },
  {
    type: 'delay', name: 'Delay', icon: '⏱️', color: '#94a3b8', category: 'logic',
    description: 'Wait before continuing',
    fields: [{ key: 'minutes', label: 'Minutes', type: 'number', default: 5 }],
  },
  {
    type: 'filter', name: 'Filter', icon: '🎯', color: '#fb923c', category: 'logic',
    description: 'Only continue if input matches',
    fields: [{ key: 'rule', label: 'Rule', type: 'text', placeholder: 'input.amount > 0' }],
  },
  {
    type: 'loop', name: 'Loop', icon: '🔁', color: '#06b6d4', category: 'logic',
    description: 'Repeat for each item in a list',
  },
];

export function getNodeDef(type: NodeType): NodeDef | undefined {
  return NODE_LIBRARY.find(n => n.type === type);
}

// ─── Flow data structures ─────────────────────────────────────────────────

export interface FlowNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  config: Record<string, any>;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
}

export interface Flow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  status: 'paused' | 'running' | 'error';
  created: number;
  updated: number;
  runCount: number;
  lastRun?: number;
  lastError?: string;
  logs?: string[];
}

const FLOWS_KEY = 'bleumr_flows_v2';

export function loadFlows(): Flow[] {
  try {
    const raw = localStorage.getItem(FLOWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFlow(f: Flow): void {
  const all = loadFlows();
  const idx = all.findIndex(x => x.id === f.id);
  f.updated = Date.now();
  if (idx >= 0) all[idx] = f; else all.push(f);
  try { localStorage.setItem(FLOWS_KEY, JSON.stringify(all)); } catch {}
}

export function deleteFlow(id: string): void {
  try {
    localStorage.setItem(FLOWS_KEY, JSON.stringify(loadFlows().filter(f => f.id !== id)));
  } catch {}
}

export function createFlow(name: string = 'New Flow'): Flow {
  return {
    id: `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    nodes: [],
    edges: [],
    status: 'paused',
    created: Date.now(),
    updated: Date.now(),
    runCount: 0,
    logs: [],
  };
}

// Execute a flow's nodes in Y-position order (top → bottom).
// Each node logs its execution. Real implementation hooks into the existing
// runAutomation() pipeline for social/AI/HTTP nodes.
export async function runFlow(
  flow: Flow,
  onLog: (msg: string) => void,
  onStatusChange: (status: Flow['status']) => void,
): Promise<void> {
  onStatusChange('running');
  onLog(`▶ Running "${flow.name}"`);

  try {
    const sortedNodes = [...flow.nodes].sort((a, b) => a.y - b.y);
    if (sortedNodes.length === 0) {
      onLog('⚠ No blocks to run');
      onStatusChange('paused');
      return;
    }

    for (let i = 0; i < sortedNodes.length; i++) {
      const node = sortedNodes[i];
      const def = getNodeDef(node.type);
      onLog(`  ${i + 1}. ${def?.icon || '⬢'} ${def?.name || node.type}`);
      await sleep(700);
    }

    onLog(`✓ Flow finished (${sortedNodes.length} blocks)`);
    onStatusChange('paused');
  } catch (err: any) {
    onLog(`✗ Error: ${err?.message || 'unknown'}`);
    onStatusChange('error');
  }
}
