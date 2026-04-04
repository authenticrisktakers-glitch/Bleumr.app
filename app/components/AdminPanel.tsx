/**
 * AdminPanel — License key management dashboard
 * Full CRUD: create, view, extend, deactivate, delete keys
 * Expiration timers, upcoming expirations tab, stats overview
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Plus, Key, Clock, AlertTriangle, Trash2, RefreshCw,
  Shield, ShieldCheck, Copy, Check, ChevronDown, ChevronRight,
  Timer, Zap, Users, Ban, RotateCcw, Calendar, Search,
  Brain, Square, Play, Pause, Activity, BookOpen, Cpu, Database,
} from 'lucide-react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/SupabaseConfig';

// ─── Types ─────────────────────────────────────────────────────────────────

interface LicenseKey {
  id: string;
  key: string;
  tier: 'pro' | 'stellur';
  active: boolean;
  max_activations: number;
  current_activations: number;
  created_at: string;
  expires_at: string | null;
  note: string | null;
  // Enriched fields from admin-keys API
  days_remaining: number | null;
  is_expired: boolean;
  device_count: number;
  status: 'active' | 'expired' | 'deactivated';
}

interface ExpiringKey extends LicenseKey {
  hours_remaining: number;
  urgency: 'expired' | 'critical' | 'warning' | 'upcoming';
}

interface Stats {
  total: number;
  active: number;
  expired: number;
  deactivated: number;
  expiring_in_7_days: number;
  pro_keys: number;
  stellur_keys: number;
  total_activations: number;
}

type Tab = 'all' | 'expiring' | 'create' | 'consciousness';

interface AdminPanelProps {
  onClose: () => void;
  adminKey: string;
}

// ─── API helpers ───────────────────────────────────────────────────────────

const API_BASE = `${SUPABASE_URL}/functions/v1/admin-keys`;

async function adminFetch(action: string, adminKey: string, body?: Record<string, any>): Promise<any> {
  const url = `${API_BASE}?action=${action}&admin_key=${encodeURIComponent(adminKey)}`;
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeRemaining(days: number | null): string {
  if (days === null) return 'No expiry';
  if (days <= 0) return 'Expired';
  if (days === 1) return '1 day left';
  if (days <= 30) return `${days} days left`;
  return `${Math.floor(days / 30)}mo ${days % 30}d left`;
}

function tierBadge(tier: string) {
  return tier === 'stellur'
    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
    : 'bg-violet-500/15 text-violet-300 border border-violet-500/25';
}

function statusColor(status: string) {
  if (status === 'active') return 'text-emerald-400';
  if (status === 'expired') return 'text-red-400';
  return 'text-slate-500';
}

function urgencyColor(urgency: string) {
  if (urgency === 'expired') return 'bg-red-500/15 border-red-500/25 text-red-300';
  if (urgency === 'critical') return 'bg-orange-500/15 border-orange-500/25 text-orange-300';
  if (urgency === 'warning') return 'bg-amber-500/15 border-amber-500/25 text-amber-300';
  return 'bg-sky-500/10 border-sky-500/20 text-sky-300';
}

// ─── Consciousness types ────────────────────────────────────────────────────

interface ConsciousnessEntry {
  timestamp: string;
  type: string;
  message: string;
  details: string;
  plainEnglish: string;
  color: string;
}

interface BrainStats {
  rawSamples: number;
  domains: string[];
  checkpoints: number;
  tokenizerReady: boolean;
  lastActivity: string;
}

const BRAIN_SERVER = 'http://127.0.0.1:7420';

// Translate raw log entries into plain English
function toPlainEnglish(type: string, message: string, details: string): string {
  const m = message.toLowerCase();
  if (type === 'KNOWLEDGE') {
    const sampleMatch = message.match(/Learned (\d+) samples? about (.+?) \((.+?)\)/i);
    if (sampleMatch) {
      const [, count, topic, domain] = sampleMatch;
      if (count === '0') return `⚠️ Tried to learn about ${topic} but Groq's response couldn't be parsed. Skipping.`;
      return `📖 Just learned ${count} new things about "${topic}" (${domain} knowledge)`;
    }
    if (m.includes('distillation session complete')) {
      const totalMatch = details.match(/Total samples: (\d+)/);
      const total = totalMatch ? totalMatch[1] : '?';
      return `✅ Finished a full learning session — absorbed ${total} total pieces of knowledge`;
    }
  }
  if (type === 'TRAINING') {
    const stepMatch = message.match(/step (\d+)/i);
    const lossMatch = details.match(/Loss: ([\d.]+)/);
    if (stepMatch) {
      const step = stepMatch[1];
      const loss = lossMatch ? ` (accuracy improving — loss: ${lossMatch[1]})` : '';
      return `🧠 Training checkpoint saved at step ${step}${loss}`;
    }
  }
  if (type === 'CONTROL') {
    if (m.includes('stop signal')) return '🛑 You paused JUMARI — she stopped learning gracefully';
    if (m.includes('resume')) return '▶️ JUMARI resumed learning';
  }
  if (type === 'BRAIN INITIALIZED') return '🌱 JUMARI 2.0 Brain was created — empty and waiting to learn';
  if (type === 'CORE SYSTEMS BUILT') return '🔧 All brain systems were built — transformer, tokenizer, tools, memory';
  if (type === 'CURRENT STATE') return '📊 Brain status snapshot recorded';
  return message;
}

function getEntryColor(type: string, message: string): string {
  if (type === 'KNOWLEDGE' && message.includes('0 samples')) return 'text-amber-400/70';
  if (type === 'KNOWLEDGE') return 'text-emerald-400';
  if (type === 'TRAINING') return 'text-sky-400';
  if (type === 'CONTROL') return message.toLowerCase().includes('stop') ? 'text-red-400' : 'text-violet-400';
  if (type === 'BRAIN INITIALIZED') return 'text-violet-400';
  if (type === 'CORE SYSTEMS BUILT') return 'text-indigo-400';
  return 'text-slate-400';
}

function parseChangelog(raw: string): ConsciousnessEntry[] {
  const entries: ConsciousnessEntry[] = [];
  const blocks = raw.split(/\n(?=\[20\d\d-\d\d-\d\d)/).filter(b => b.trim());

  for (const block of blocks) {
    const headerMatch = block.match(/^\[([^\]]+)\] ([A-Z _]+)\n([\s\S]*)/);
    if (!headerMatch) continue;
    const [, timestamp, type, rest] = headerMatch;
    const lines = rest.split('\n').map(l => l.replace(/^  /, '').trim()).filter(Boolean);
    const message = lines[0] || '';
    const details = lines.slice(1).join('\n');
    entries.push({
      timestamp,
      type: type.trim(),
      message,
      details,
      plainEnglish: toPlainEnglish(type.trim(), message, details),
      color: getEntryColor(type.trim(), message),
    });
  }

  // Also parse the header blocks (BRAIN INITIALIZED, etc.)
  const headerBlocks = raw.match(/\[([^\]]+)\] (BRAIN INITIALIZED|CORE SYSTEMS BUILT|CURRENT STATE)[^\[]+/g) || [];
  for (const block of headerBlocks) {
    const m = block.match(/^\[([^\]]+)\] ([^\n]+)/);
    if (!m) continue;
    if (!entries.find(e => e.timestamp === m[1])) {
      entries.push({
        timestamp: m[1],
        type: m[2].trim(),
        message: m[2].trim(),
        details: '',
        plainEnglish: toPlainEnglish(m[2].trim(), m[2].trim(), ''),
        color: getEntryColor(m[2].trim(), m[2].trim()),
      });
    }
  }

  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function readBrainChangelog(): Promise<string | null> {
  try {
    const res = await fetch(`${BRAIN_SERVER}/changelog`);
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function sendBrainControl(action: 'stop' | 'cooldown' | 'resume', body?: any): Promise<boolean> {
  try {
    const res = await fetch(`${BRAIN_SERVER}/control/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.ok;
  } catch { return false; }
}

async function fetchBrainStats(): Promise<BrainStats | null> {
  try {
    const res = await fetch(`${BRAIN_SERVER}/stats`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      rawSamples: data.rawSamples || 0,
      domains: data.domains || [],
      checkpoints: data.checkpoints || 0,
      tokenizerReady: data.tokenizerReady || false,
      lastActivity: data.lastActivity || '',
    };
  } catch { return null; }
}

async function checkBrainServer(): Promise<boolean> {
  try {
    const res = await fetch(`${BRAIN_SERVER}/health`);
    return res.ok;
  } catch { return false; }
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AdminPanel({ onClose, adminKey }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('all');
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [expiring, setExpiring] = useState<ExpiringKey[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // ── Consciousness state
  const [changelog, setChangelog] = useState<ConsciousnessEntry[]>([]);
  const [isLearning, setIsLearning] = useState(false);
  const [brainStats, setBrainStats] = useState<BrainStats | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const consciousnessTimer = useRef<ReturnType<typeof setInterval>>();

  // ── Create form state
  const [createTier, setCreateTier] = useState<'pro' | 'stellur'>('pro');
  const [createDays, setCreateDays] = useState(30);
  const [createMaxAct, setCreateMaxAct] = useState(3);
  const [createNote, setCreateNote] = useState('');
  const [createCustomKey, setCreateCustomKey] = useState('');

  // ── Fetch data
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [keyData, expiringData, statsData] = await Promise.all([
        adminFetch('list', adminKey),
        adminFetch('expiring', adminKey),
        adminFetch('stats', adminKey),
      ]);
      setKeys(keyData.keys || []);
      setExpiring(expiringData.expiring || []);
      setStats(statsData);
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 60s
  useEffect(() => {
    timerRef.current = setInterval(fetchAll, 60000);
    return () => clearInterval(timerRef.current);
  }, [fetchAll]);

  // ── Consciousness: poll changelog + brain stats every 3s when on that tab
  const [brainServerOnline, setBrainServerOnline] = useState(false);

  const pollConsciousness = useCallback(async () => {
    const online = await checkBrainServer();
    setBrainServerOnline(online);
    if (!online) return;

    const raw = await readBrainChangelog();
    if (raw) {
      const parsed = parseChangelog(raw);
      setChangelog(parsed);
    }
    const stats = await fetchBrainStats();
    if (stats) {
      setBrainStats(stats);
      setIsLearning(stats.lastActivity ? (Date.now() - new Date(stats.lastActivity).getTime()) < 30000 : false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'consciousness') {
      pollConsciousness();
      consciousnessTimer.current = setInterval(pollConsciousness, 3000);
    }
    return () => clearInterval(consciousnessTimer.current);
  }, [tab, pollConsciousness]);

  // Auto-scroll log to bottom when new entries arrive
  useEffect(() => {
    if (tab === 'consciousness') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [changelog.length, tab]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Actions
  const handleCreate = async () => {
    setActionLoading('create');
    try {
      const result = await adminFetch('create', adminKey, {
        tier: createTier,
        expiry_days: createDays,
        max_activations: createMaxAct,
        note: createNote || undefined,
        custom_key: createCustomKey || undefined,
      });
      showToast(`Key created: ${result.key.key}`);
      setCreateNote('');
      setCreateCustomKey('');
      setTab('all');
      await fetchAll();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtend = async (id: string, days: number) => {
    setActionLoading(id);
    try {
      await adminFetch('extend', adminKey, { id, days });
      showToast(`Extended by ${days} days`);
      await fetchAll();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (id: string) => {
    setActionLoading(id);
    try {
      await adminFetch('deactivate', adminKey, { id });
      showToast('Key deactivated');
      await fetchAll();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (id: string) => {
    setActionLoading(id);
    try {
      await adminFetch('reactivate', adminKey, { id });
      showToast('Key reactivated');
      await fetchAll();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this key? This cannot be undone.')) return;
    setActionLoading(id);
    try {
      await adminFetch('delete', adminKey, { id });
      showToast('Key deleted');
      await fetchAll();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeDevices = async (id: string) => {
    setActionLoading(id);
    try {
      await adminFetch('revoke_devices', adminKey, { id });
      showToast('Devices revoked');
      await fetchAll();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter keys by search
  const filtered = keys.filter(k =>
    !search || k.key.toLowerCase().includes(search.toLowerCase()) ||
    k.tier.includes(search.toLowerCase()) ||
    k.note?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[20000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(180deg, rgba(18,15,30,0.98) 0%, rgba(10,10,18,0.99) 100%)', border: '1px solid rgba(99,102,241,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-violet-500/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
              <Key className="w-4.5 h-4.5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">License Key Manager</h2>
              <p className="text-[10px] text-slate-500">Admin Panel — Bleumr</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 px-6 py-3 border-b border-violet-500/10" style={{ background: 'rgba(99,102,241,0.03)' }}>
            {[
              { label: 'Active', value: stats.active, icon: ShieldCheck, color: 'text-emerald-400' },
              { label: 'Expiring Soon', value: stats.expiring_in_7_days, icon: AlertTriangle, color: stats.expiring_in_7_days > 0 ? 'text-amber-400' : 'text-slate-500' },
              { label: 'Expired', value: stats.expired, icon: Timer, color: stats.expired > 0 ? 'text-red-400' : 'text-slate-500' },
              { label: 'Total Devices', value: stats.total_activations, icon: Users, color: 'text-sky-400' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2.5">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <div>
                  <p className="text-lg font-bold text-white leading-none">{s.value}</p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-violet-500/10">
          {[
            { id: 'all' as Tab, label: 'All Keys', count: keys.length },
            { id: 'expiring' as Tab, label: 'Expiring', count: expiring.length },
            { id: 'create' as Tab, label: 'Create Key', count: null },
            { id: 'consciousness' as Tab, label: 'Consciousness', count: null },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${
                  t.id === 'expiring' && t.count > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-slate-400'
                }`}>{t.count}</span>
              )}
            </button>
          ))}

          {tab === 'all' && (
            <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <Search className="w-3 h-3 text-slate-600" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search keys..."
                className="bg-transparent text-xs text-white placeholder-slate-600 outline-none w-32"
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-3" style={{ scrollbarWidth: 'thin' }}>
          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">{error}</div>
          )}

          {loading && !keys.length ? (
            <div className="flex items-center justify-center py-16 text-slate-600 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading...
            </div>
          ) : tab === 'all' ? (
            /* ── All Keys ────────────────────────────────── */
            <div className="space-y-2">
              {filtered.length === 0 && (
                <p className="text-center py-8 text-slate-600 text-xs">{search ? 'No keys match your search' : 'No license keys yet. Create one!'}</p>
              )}
              {filtered.map(k => (
                <div
                  key={k.id}
                  className="rounded-xl border border-white/[0.06] hover:border-violet-500/15 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Key info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleCopy(k.key)} className="font-mono text-sm text-white hover:text-violet-300 transition-colors flex items-center gap-1.5" title="Copy key">
                          {k.key}
                          {copied === k.key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-600" />}
                        </button>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${tierBadge(k.tier)}`}>{k.tier}</span>
                        <span className={`text-[10px] font-medium ${statusColor(k.status)}`}>
                          {k.status === 'active' ? '● Active' : k.status === 'expired' ? '● Expired' : '● Off'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-600">
                          <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                          {k.expires_at ? formatTimeRemaining(k.days_remaining) : 'No expiry'}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          <Users className="w-2.5 h-2.5 inline mr-0.5" />
                          {k.current_activations}/{k.max_activations} devices
                        </span>
                        <span className="text-[10px] text-slate-600">
                          Created {formatDate(k.created_at)}
                        </span>
                        {k.note && <span className="text-[10px] text-slate-500 italic truncate max-w-[150px]">{k.note}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleExtend(k.id, 30)}
                        disabled={actionLoading === k.id}
                        className="px-2 py-1 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors disabled:opacity-30"
                        title="Extend 30 days"
                      >+30d</button>

                      {k.active ? (
                        <button
                          onClick={() => handleDeactivate(k.id)}
                          disabled={actionLoading === k.id}
                          className="p-1.5 rounded-md text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-30"
                          title="Deactivate"
                        ><Ban className="w-3 h-3" /></button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(k.id)}
                          disabled={actionLoading === k.id}
                          className="p-1.5 rounded-md text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-30"
                          title="Reactivate"
                        ><RotateCcw className="w-3 h-3" /></button>
                      )}

                      <button
                        onClick={() => handleRevokeDevices(k.id)}
                        disabled={actionLoading === k.id}
                        className="p-1.5 rounded-md text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors disabled:opacity-30"
                        title="Revoke all devices"
                      ><Users className="w-3 h-3" /></button>

                      <button
                        onClick={() => handleDelete(k.id)}
                        disabled={actionLoading === k.id}
                        className="p-1.5 rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                        title="Delete permanently"
                      ><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>

                  {/* Expiry progress bar */}
                  {k.expires_at && k.days_remaining !== null && (
                    <div className="px-4 pb-2">
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(0, Math.min(100, (k.days_remaining / 30) * 100))}%`,
                            background: k.days_remaining <= 0 ? '#ef4444'
                              : k.days_remaining <= 3 ? '#f59e0b'
                              : k.days_remaining <= 7 ? '#eab308'
                              : '#10b981',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : tab === 'expiring' ? (
            /* ── Expiring Soon ────────────────────────────── */
            <div className="space-y-2">
              {expiring.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShieldCheck className="w-8 h-8 text-emerald-500/40 mb-3" />
                  <p className="text-sm text-slate-500">No keys expiring within 7 days</p>
                  <p className="text-[10px] text-slate-600 mt-1">All active keys are healthy</p>
                </div>
              ) : (
                expiring.map(k => (
                  <div
                    key={k.id}
                    className={`rounded-xl border px-4 py-3 ${urgencyColor(k.urgency)}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{k.key}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${tierBadge(k.tier)}`}>{k.tier}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] font-medium">
                            {k.urgency === 'expired' ? 'EXPIRED' :
                             k.urgency === 'critical' ? `${k.hours_remaining}h remaining` :
                             `${k.days_remaining} days remaining`}
                          </span>
                          <span className="text-[10px] opacity-60">Expires {formatDate(k.expires_at)}</span>
                          {k.note && <span className="text-[10px] opacity-50 italic">{k.note}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleExtend(k.id, 30)}
                          disabled={actionLoading === k.id}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/25 transition-colors disabled:opacity-30"
                        >Extend 30 days</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : tab === 'create' ? (
            /* ── Create Key ────────────────────────────── */
            <div className="max-w-md mx-auto py-4 space-y-4">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
                  <Plus className="w-6 h-6 text-violet-400" />
                </div>
                <h3 className="text-base font-semibold text-white">Generate License Key</h3>
                <p className="text-[11px] text-slate-500 mt-1">Keys auto-expire after the set duration</p>
              </div>

              {/* Tier */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Tier</label>
                <div className="flex gap-2">
                  {(['pro', 'stellur'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setCreateTier(t)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${
                        createTier === t
                          ? t === 'stellur' ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                          : 'bg-white/[0.02] border-white/[0.06] text-slate-500 hover:border-white/10'
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expiry */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Expires in (days)</label>
                <div className="flex gap-2">
                  {[7, 14, 30, 60, 90].map(d => (
                    <button
                      key={d}
                      onClick={() => setCreateDays(d)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${
                        createDays === d ? 'bg-violet-500/15 border-violet-500/30 text-violet-300' : 'bg-white/[0.02] border-white/[0.06] text-slate-500 hover:border-white/10'
                      }`}
                    >{d}d</button>
                  ))}
                </div>
                <input
                  type="number"
                  value={createDays}
                  onChange={e => setCreateDays(parseInt(e.target.value) || 30)}
                  className="mt-2 w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-violet-500/30"
                  placeholder="Custom days (0 = never expires)"
                />
              </div>

              {/* Max activations */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Max device activations</label>
                <input
                  type="number"
                  value={createMaxAct}
                  onChange={e => setCreateMaxAct(parseInt(e.target.value) || 3)}
                  min={1}
                  max={100}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-violet-500/30"
                />
              </div>

              {/* Custom key (optional) */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Custom key (optional)</label>
                <input
                  value={createCustomKey}
                  onChange={e => setCreateCustomKey(e.target.value.toUpperCase())}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-violet-500/30"
                  placeholder="Leave blank to auto-generate BLM-XXXXX-XXXXX-XXXXX"
                />
              </div>

              {/* Note */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Note (optional)</label>
                <input
                  value={createNote}
                  onChange={e => setCreateNote(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-violet-500/30"
                  placeholder="e.g. Beta tester, influencer, partner..."
                />
              </div>

              {/* Create button */}
              <button
                onClick={handleCreate}
                disabled={actionLoading === 'create'}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
              >
                {actionLoading === 'create' ? 'Creating...' : `Generate ${createTier.charAt(0).toUpperCase() + createTier.slice(1)} Key (${createDays} days)`}
              </button>
            </div>
          ) : (
            /* ── Consciousness Tab ───────────────────────── */
            <div className="flex flex-col h-full gap-3">

              {/* Status bar */}
              <div className="flex items-center gap-3 px-1">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border ${
                  isLearning
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                    : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isLearning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {isLearning ? 'Learning right now' : 'Idle'}
                </div>

                {brainStats && (
                  <>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Database className="w-3 h-3" /> {brainStats.rawSamples.toLocaleString()} samples
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Cpu className="w-3 h-3" /> {brainStats.checkpoints} checkpoints
                    </div>
                    {brainStats.tokenizerReady && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-500/70">
                        <BookOpen className="w-3 h-3" /> Tokenizer trained
                      </div>
                    )}
                  </>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const ok = await sendBrainControl('cooldown', { delay: 3.0 });
                      showToast(ok ? 'Cooldown set — JUMARI slowing down' : 'Brain server not running');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-colors"
                    title="Slow down distillation (3s delay between calls)"
                  >
                    <Pause className="w-3 h-3" /> Slow
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await sendBrainControl('resume');
                      showToast(ok ? 'Full speed restored' : 'Brain server not running');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-sky-500/10 border border-sky-500/20 text-sky-300 hover:bg-sky-500/20 transition-colors"
                    title="Full speed (0.5s delay)"
                  >
                    <Play className="w-3 h-3" /> Full Speed
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await sendBrainControl('stop');
                      if (ok) {
                        setIsLearning(false);
                        showToast('Stop signal sent — JUMARI will pause after this batch');
                      } else {
                        showToast('Brain server not running — start it: python server.py');
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 transition-colors"
                  >
                    <Square className="w-3 h-3" /> Stop
                  </button>
                </div>
              </div>

              {/* Live log feed */}
              <div
                className="flex-1 rounded-xl overflow-y-auto space-y-1 p-3"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(99,102,241,0.08)', minHeight: 0 }}
              >
                {!brainServerOnline ? (
                  <div className="flex flex-col items-center justify-center h-32 text-slate-600 text-xs gap-2">
                    <Brain className="w-6 h-6 opacity-30" />
                    <p>Brain server is offline</p>
                    <p className="text-[10px] text-center max-w-xs">Run this in terminal to connect:<br/>
                    <code className="text-violet-400/60 font-mono mt-1 block">cd ~/Desktop/JUMARI-Brain && python server.py</code></p>
                  </div>
                ) : changelog.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-slate-600 text-xs gap-2">
                    <Brain className="w-6 h-6 opacity-30" />
                    <p>No consciousness logs yet. JUMARI hasn't started learning.</p>
                  </div>
                ) : (
                  changelog.map((entry, i) => (
                    <div key={i} className="group">
                      {/* Plain English — the main line */}
                      <div className={`text-[12px] leading-snug font-medium ${entry.color}`}>
                        {entry.plainEnglish}
                      </div>
                      {/* Timestamp — subtle */}
                      <div className="text-[9px] text-slate-700 mt-0.5 mb-1.5">
                        {entry.timestamp}
                        {entry.details && (
                          <span className="ml-2 text-slate-700">{entry.details.slice(0, 80)}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>

              {/* Domain progress */}
              {brainStats && brainStats.domains.length > 0 && (
                <div className="px-1">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5">Domains learned</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brainStats.domains.map(d => (
                      <span key={d} className="px-2 py-0.5 rounded-full text-[10px] bg-violet-500/10 border border-violet-500/15 text-violet-400">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-white/10 border border-white/10 backdrop-blur-lg text-xs text-white"
            >{toast}</motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
