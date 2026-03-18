import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BLEUMR_AGENT_PREFIX } from '../services/BleumrLore';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search as SearchIcon, Layers3, X, Zap, CheckCircle2, Bot, Orbit, Sparkles, Archive, Pencil, Download, Trash2, Plus, FolderOpen } from 'lucide-react';
import { InlineStarSphere } from './InlineStarSphere';

// ─── Agent config ─────────────────────────────────────────────────────────────
const AGENTS = [
  {
    id: 'planner' as const,
    name: 'Planner',
    title: 'Task Architect',
    role: 'Scopes & sequences your work',
    Icon: Brain,
    model: 'llama-3.3-70b-versatile',
    badge: 'Strategy',
    accent: '#818cf8',
    accentDim: 'rgba(99,102,241,0.18)',
    hair: '#312e81',
    shirt1: '#4f46e5', shirt2: '#6366f1',
    pants: '#1e1b4b',
    skin1: '#fde68a', skin2: '#f59e0b',
  },
  {
    id: 'researcher' as const,
    name: 'Researcher',
    title: 'Knowledge Hunter',
    role: 'Digs deep, verifies facts',
    Icon: SearchIcon,
    model: 'llama-3.3-70b-versatile',
    badge: 'Intel',
    accent: '#22d3ee',
    accentDim: 'rgba(6,182,212,0.18)',
    hair: '#0c4a6e',
    shirt1: '#0284c7', shirt2: '#06b6d4',
    pants: '#0c4a6e',
    skin1: '#fed7aa', skin2: '#fb923c',
  },
  {
    id: 'synth' as const,
    name: 'Synth',
    title: 'Answer Composer',
    role: 'Merges & delivers the final answer',
    Icon: Orbit,
    model: 'llama-3.3-70b-versatile',
    badge: 'Synthesis',
    accent: '#34d399',
    accentDim: 'rgba(16,185,129,0.18)',
    hair: '#064e3b',
    shirt1: '#059669', shirt2: '#34d399',
    pants: '#022c22',
    skin1: '#fde68a', skin2: '#f59e0b',
  },
] as const;

type AgentId = 'planner' | 'researcher' | 'synth';
type AgentStatus = 'idle' | 'thinking' | 'done';
type Phase = 'idle' | 'planning' | 'researching' | 'synthesizing' | 'done';
interface AgentOutput { id: AgentId; text: string }
interface WorkspacePageProps { onClose: () => void; apiKey: string; initialTask?: string }

// ─── Seated character SVG ─────────────────────────────────────────────────────
// What each agent says they're doing at each phase — makes bubbles feel like real convo
const AGENT_PHASE_LABEL: Record<string, Record<string, string>> = {
  planner: {
    planning_1:    'Mapping the strategy…',
    planning_2:    'Revising based on research…',
    default:       'Thinking…',
  },
  researcher: {
    researching_1: 'Challenging assumptions…',
    researching_2: 'Validating the revision…',
    default:       'Digging deep…',
  },
  synth: {
    synthesizing:  'Composing the final answer…',
    default:       'Synthesizing…',
  },
};

function SeatedCharacter({ agent, status, selected, onClick, phaseLabel }: {
  agent: typeof AGENTS[number];
  status: AgentStatus;
  selected: boolean;
  onClick: () => void;
  streamText?: string; // kept for API compat but no longer rendered
  phaseLabel?: string;
}) {
  const thinking = status === 'thinking';
  const done = status === 'done';
  const label = phaseLabel || (thinking ? 'Thinking…' : '');

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center outline-none select-none"
      style={{ cursor: 'pointer' }}
    >
      {/* Status pill — single clean label, no streaming text */}
      <AnimatePresence mode="wait">
        {thinking && label && (
          <motion.div key="status"
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={{ duration: 0.22 }}
            className="absolute pointer-events-none"
            style={{
              bottom: '112%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 50,
              whiteSpace: 'nowrap',
            }}
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{
                background: `linear-gradient(135deg, rgba(10,12,28,0.96), rgba(6,8,20,0.96))`,
                border: `1px solid ${agent.accent}50`,
                boxShadow: `0 2px 12px rgba(0,0,0,0.5), 0 0 0 1px ${agent.accent}15`,
                backdropFilter: 'blur(12px)',
              }}
            >
              <motion.div
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: agent.accent }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.88)' }}>
                {label}
              </span>
            </div>
            {/* Tail */}
            <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -6, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${agent.accent}50` }} />
            <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -5, width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid rgba(6,8,20,0.96)' }} />
          </motion.div>
        )}

        {thinking && !label && (
          <motion.div key="dots"
            initial={{ opacity: 0, y: 4, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-full"
            style={{ background: agent.accentDim, border: `1px solid ${agent.accent}50`, backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}
          >
            {[0, 0.2, 0.4].map((d, i) => (
              <motion.div key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: agent.accent }}
                animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: d }}
              />
            ))}
          </motion.div>
        )}

        {done && (
          <motion.div key="check"
            initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute -top-7 left-1/2 -translate-x-1/2"
          >
            <CheckCircle2 style={{ color: agent.accent, width: 20, height: 20, filter: `drop-shadow(0 0 6px ${agent.accent})` }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glow halo under character */}
      <motion.div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full blur-2xl"
        style={{ width: 80, height: 24, background: agent.accent }}
        animate={{ opacity: thinking ? [0.3, 0.7, 0.3] : done ? 0.5 : selected ? 0.35 : 0.15 }}
        transition={{ duration: 1.4, repeat: Infinity }}
      />

      {/* The SVG — upper body seated, slightly leaning forward when thinking */}
      <motion.div
        animate={thinking ? { y: [0, -3, 0] } : { y: 0 }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="90" height="100" viewBox="0 0 90 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id={`shirt-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={agent.shirt1} />
              <stop offset="100%" stopColor={agent.shirt2} />
            </linearGradient>
            <radialGradient id={`face-${agent.id}`} cx="45%" cy="38%" r="60%">
              <stop offset="0%" stopColor={agent.skin1} />
              <stop offset="100%" stopColor={agent.skin2} />
            </radialGradient>
            <linearGradient id={`arm-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={agent.skin1} />
              <stop offset="100%" stopColor={agent.skin2} />
            </linearGradient>
            {/* Chair back gradient */}
            <linearGradient id={`chair-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          {/* ── Chair back (behind torso) ── */}
          <rect x="14" y="52" width="62" height="45" rx="10" fill={`url(#chair-${agent.id})`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          {/* Chair headrest */}
          <rect x="22" y="46" width="46" height="14" rx="8" fill="#1e293b" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

          {/* ── Left arm reaching forward onto desk ── */}
          <motion.g
            animate={thinking
              ? { rotate: [0, -6, 0], translateY: [0, 2, 0] }
              : { rotate: 0, translateY: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '20px 72px' }}
          >
            {/* Upper arm */}
            <rect x="10" y="68" width="14" height="26" rx="7" fill={`url(#shirt-${agent.id})`} />
            {/* Forearm angled forward-down */}
            <rect x="8" y="88" width="12" height="18" rx="6" fill={`url(#arm-${agent.id})`} transform="rotate(-12 14 88)" />
            {/* Hand/fist on desk */}
            <ellipse cx="11" cy="104" rx="7" ry="5" fill={agent.skin1} />
          </motion.g>

          {/* ── Right arm reaching forward onto desk ── */}
          <motion.g
            animate={thinking
              ? { rotate: [0, 6, 0], translateY: [0, 2, 0] }
              : { rotate: 0, translateY: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
            style={{ transformOrigin: '70px 72px' }}
          >
            {/* Upper arm */}
            <rect x="66" y="68" width="14" height="26" rx="7" fill={`url(#shirt-${agent.id})`} />
            {/* Forearm angled forward-down */}
            <rect x="70" y="88" width="12" height="18" rx="6" fill={`url(#arm-${agent.id})`} transform="rotate(12 76 88)" />
            {/* Hand/fist on desk */}
            <ellipse cx="79" cy="104" rx="7" ry="5" fill={agent.skin1} />
          </motion.g>

          {/* ── Torso / body ── */}
          <rect x="20" y="55" width="50" height="42" rx="14" fill={`url(#shirt-${agent.id})`} />

          {/* Shirt collar V */}
          <path d="M35 56 L45 68 L55 56" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

          {/* Tiny icon badge on chest */}
          <rect x="37" y="65" width="16" height="14" rx="5" fill="rgba(0,0,0,0.3)" />
          <circle cx="45" cy="72" r="5" fill={agent.accentDim} />

          {/* ── Neck ── */}
          <rect x="37" y="43" width="16" height="16" rx="6" fill={`url(#arm-${agent.id})`} />

          {/* ── Head ── */}
          <motion.g
            animate={thinking ? { rotate: [0, 2, 0, -1, 0] } : { rotate: 0 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '45px 26px' }}
          >
            <circle cx="45" cy="26" r="22" fill={`url(#face-${agent.id})`} />

            {/* Hair — fills top of head */}
            <path
              d="M23 22 C23 10 67 10 67 22 L67 16 C67 5 23 5 23 16 Z"
              fill={agent.hair}
            />
            <rect x="23" y="12" width="44" height="12" rx="5" fill={agent.hair} />

            {/* Ears */}
            <ellipse cx="23" cy="27" rx="3.5" ry="5" fill={agent.skin2} />
            <ellipse cx="67" cy="27" rx="3.5" ry="5" fill={agent.skin2} />

            {/* Eyes with blinking */}
            <motion.g
              animate={thinking ? { scaleY: [1, 0.08, 1] } : { scaleY: 1 }}
              transition={{ duration: 4, repeat: Infinity, repeatDelay: 3 }}
              style={{ transformOrigin: '45px 24px' }}
            >
              {/* Eye whites */}
              <ellipse cx="37" cy="24" rx="5" ry="5.5" fill="white" />
              <ellipse cx="53" cy="24" rx="5" ry="5.5" fill="white" />
              {/* Pupils — look slightly down (toward desk) */}
              <circle cx="37.5" cy="25.5" r="3" fill="#1e293b" />
              <circle cx="53.5" cy="25.5" r="3" fill="#1e293b" />
              {/* Shine */}
              <circle cx="38.5" cy="24" r="1" fill="white" opacity="0.9" />
              <circle cx="54.5" cy="24" r="1" fill="white" opacity="0.9" />
            </motion.g>

            {/* Eyebrows */}
            <path d="M31 18 Q37 16 42 18" stroke={agent.hair} strokeWidth="1.8" strokeLinecap="round" fill="none" />
            <path d="M48 18 Q53 16 59 18" stroke={agent.hair} strokeWidth="1.8" strokeLinecap="round" fill="none" />
            {thinking && (
              <>
                {/* Focused brow */}
                <path d="M31 17 Q37 15.5 42 17.5" stroke={agent.hair} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.7" />
                <path d="M48 17.5 Q53 15.5 59 17" stroke={agent.hair} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.7" />
              </>
            )}

            {/* Mouth */}
            <motion.path
              d={done
                ? 'M38 34 Q45 39 52 34'
                : thinking
                  ? 'M40 33 Q45 35 50 33'
                  : 'M39 33 Q45 36 51 33'}
              stroke={done ? '#34d399' : agent.skin2}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />

            {/* Glasses (Researcher only) */}
            {agent.id === 'researcher' && (
              <g opacity="0.7">
                <circle cx="37" cy="24" r="7" stroke="#94a3b8" strokeWidth="1.2" fill="none" />
                <circle cx="53" cy="24" r="7" stroke="#94a3b8" strokeWidth="1.2" fill="none" />
                <line x1="44" y1="24" x2="46" y2="24" stroke="#94a3b8" strokeWidth="1.2" />
                <line x1="30" y1="24" x2="23" y2="26" stroke="#94a3b8" strokeWidth="1.2" />
                <line x1="60" y1="24" x2="67" y2="26" stroke="#94a3b8" strokeWidth="1.2" />
              </g>
            )}

            {/* Headband/hat accent (Synth) */}
            {agent.id === 'synth' && (
              <rect x="23" y="11" width="44" height="6" rx="3" fill={agent.accent} opacity="0.6" />
            )}
          </motion.g>
        </svg>
      </motion.div>

      {/* Name tag */}
      <div className="flex flex-col items-center mt-1 gap-0.5">
        <span className="text-[12px] font-bold tracking-tight leading-none"
          style={{ color: (selected || thinking) ? agent.accent : 'rgba(255,255,255,0.8)' }}>
          {agent.name}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.25)' }}>
          {agent.badge}
        </span>
      </div>
    </motion.button>
  );
}

// ─── Desk (rendered over character's lap to complete seated illusion) ──────────
function Desk({ agent, status }: { agent: typeof AGENTS[number]; status: AgentStatus }) {
  const active = status !== 'idle';
  const thinking = status === 'thinking';

  return (
    <div className="relative" style={{ width: 140, marginTop: -28, zIndex: 10 }}>
      {/* Desk surface */}
      <div className="relative rounded-2xl"
        style={{
          height: 52,
          background: 'linear-gradient(160deg,#1a1f35 0%,#111525 100%)',
          border: `1px solid ${active ? agent.accent + '40' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: active
            ? `0 0 30px ${agent.accent}20, inset 0 1px 0 rgba(255,255,255,0.07)`
            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* Monitor */}
        <div className="absolute left-2.5 top-2.5 rounded-lg overflow-hidden"
          style={{ width: 62, height: 34, background: '#080c14', border: '1px solid rgba(255,255,255,0.1)' }}>
          <AnimatePresence>
            {active && (
              <motion.div key="screen"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col gap-1 p-1.5"
              >
                {[85, 65, 50].map((w, i) => (
                  <motion.div key={i} className="rounded-full"
                    style={{ height: 2.5, width: `${w}%`, background: agent.accent, opacity: 1 - i * 0.3 }}
                    animate={thinking ? { opacity: [1 - i * 0.3, (1 - i * 0.3) * 0.4, 1 - i * 0.3] } : {}}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {/* Status LED */}
          <motion.div className="absolute right-1.5 top-1.5 rounded-full"
            style={{ width: 5, height: 5, background: active ? agent.accent : '#1e293b' }}
            animate={thinking ? { opacity: [1, 0.2, 1], scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        </div>

        {/* Monitor stand */}
        <div className="absolute left-[42px] top-[38px] w-1 h-3 rounded-b" style={{ background: '#0f172a' }} />
        <div className="absolute left-[36px] top-[49px] w-[13px] h-1.5 rounded" style={{ background: '#0f172a' }} />

        {/* Keyboard */}
        <div className="absolute bottom-2 left-2.5 rounded"
          style={{ width: 65, height: 10, background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
          {Array.from({ length: 3 }).map((_, row) => (
            <div key={row} className="flex gap-px px-1" style={{ marginTop: row === 0 ? 1 : 2 }}>
              {Array.from({ length: 8 }).map((_, col) => (
                <motion.div key={col} className="flex-1 rounded-[1px]"
                  style={{ height: 1.5, background: active ? `${agent.accent}50` : 'rgba(255,255,255,0.08)' }}
                  animate={thinking && Math.random() > 0.7 ? { opacity: [0.3, 1, 0.3] } : {}}
                  transition={{ duration: 0.4, repeat: Infinity, delay: (row * 8 + col) * 0.05 }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Coffee mug */}
        <div className="absolute right-2.5 top-2">
          <div className="rounded-b-lg rounded-t-sm"
            style={{ width: 14, height: 18, background: 'linear-gradient(180deg,#374151,#1f2937)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="mx-auto mt-1 rounded-full" style={{ width: 8, height: 3, background: `${agent.accent}60` }} />
          </div>
          {/* Steam */}
          {active && (
            <motion.div className="absolute -top-2 left-1/2 -translate-x-1/2"
              animate={{ y: [0, -4, 0], opacity: [0, 0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity }}>
              <div className="w-0.5 h-2 rounded-full" style={{ background: 'rgba(148,163,184,0.5)' }} />
            </motion.div>
          )}
        </div>

        {/* Paper stack */}
        <motion.div className="absolute right-2.5 bottom-2 rounded-md"
          style={{ width: 20, height: 26, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', transform: 'rotate(4deg)' }}
          animate={active ? { rotate: [4, 6, 4] } : {}}
          transition={{ duration: 3, repeat: Infinity }}
        >
          {[0.5, 0.3, 0.2].map((op, i) => (
            <div key={i} className="mx-auto rounded-full"
              style={{ marginTop: i === 0 ? 6 : 4, height: 1.5, width: '65%', background: `rgba(255,255,255,${op})` }} />
          ))}
        </motion.div>
      </div>

      {/* Desk legs */}
      <div className="flex justify-between px-3">
        {[0, 1].map(i => (
          <div key={i} className="w-1.5 rounded-b"
            style={{ height: 18, background: '#0a0d16', border: '1px solid rgba(255,255,255,0.05)' }} />
        ))}
      </div>
    </div>
  );
}

// ─── Smart download helpers ───────────────────────────────────────────────────
type ExportFormat = 'md' | 'html' | 'csv' | 'json' | 'txt';

interface FormatMeta { ext: ExportFormat; label: string; mime: string; icon: string }
const FORMAT_META: FormatMeta[] = [
  { ext: 'md',   label: '.md',   mime: 'text/markdown',  icon: '📝' },
  { ext: 'html', label: '.html', mime: 'text/html',       icon: '📊' },
  { ext: 'csv',  label: '.csv',  mime: 'text/csv',        icon: '📋' },
  { ext: 'json', label: '.json', mime: 'application/json',icon: '🗂' },
  { ext: 'txt',  label: '.txt',  mime: 'text/plain',      icon: '📄' },
];

/** Detect which formats are most relevant given content + original task */
function detectFormats(text: string, task: string): ExportFormat[] {
  const hasMarkdownTable = /\|.+\|.+\|/.test(text);
  const hasHeaders       = /^#{1,4}\s/m.test(text);
  const hasBullets       = /^[-*]\s/m.test(text) || /^\d+\.\s/m.test(text);
  const hasCodeBlock     = /```/.test(text);
  const taskLc           = task.toLowerCase();
  const wantsChart       = /graph|chart|visual|dashboard|plot|report|data|analytic/i.test(taskLc);
  const wantsData        = /table|spreadsheet|csv|data|dataset|numbers|metrics|kpi/i.test(taskLc);
  const wantsJson        = /json|api|schema|struct|object/i.test(taskLc);
  const wantsPlan        = /plan|strategy|roadmap|outline|doc|report|business|proposal/i.test(taskLc);

  const out: ExportFormat[] = [];
  if (hasHeaders || hasBullets || wantsPlan) out.push('md');
  if (wantsChart || hasMarkdownTable)        out.push('html');
  if (hasMarkdownTable || wantsData)         out.push('csv');
  if (wantsJson)                             out.push('json');
  out.push('txt'); // always available
  return [...new Set(out)] as ExportFormat[];
}

/** Parse first markdown table → { headers, rows } */
function parseMarkdownTable(text: string) {
  const lines = text.split('\n');
  const tStart = lines.findIndex(l => /\|.+\|/.test(l));
  if (tStart === -1) return null;
  const tableLines = lines.slice(tStart).filter(l => /\|.+\|/.test(l) && !/^[\s|:-]+$/.test(l));
  if (tableLines.length < 2) return null;
  const headers = tableLines[0].split('|').map(s => s.trim()).filter(Boolean);
  const rows    = tableLines.slice(1).map(l => l.split('|').map(s => s.trim()).filter(Boolean));
  return { headers, rows };
}

/** Build the blob content for a given format */
function buildContent(text: string, format: ExportFormat, task: string): string {
  if (format === 'txt' || format === 'md') return text;

  if (format === 'csv') {
    const parsed = parseMarkdownTable(text);
    if (parsed) {
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [parsed.headers, ...parsed.rows].map(r => r.map(escape).join(',')).join('\n');
    }
    // Fallback: convert each line to a single-column CSV
    return text.split('\n').map(l => `"${l.replace(/"/g, '""')}"`).join('\n');
  }

  if (format === 'json') {
    return JSON.stringify({ task, generated: new Date().toISOString(), content: text }, null, 2);
  }

  if (format === 'html') {
    const parsed = parseMarkdownTable(text);
    const chartScript = parsed ? (() => {
      const numeric = parsed.headers.slice(1).filter((_, ci) =>
        parsed.rows.some(r => !isNaN(parseFloat(r[ci + 1]))));
      if (numeric.length === 0) return '';
      const labels = JSON.stringify(parsed.rows.map(r => r[0]));
      const datasets = JSON.stringify(numeric.map((h, ci) => ({
        label: h,
        data: parsed.rows.map(r => parseFloat(r[ci + 1]) || 0),
        backgroundColor: ['#818cf8','#22d3ee','#34d399','#f59e0b','#f87171'][ci % 5] + 'cc',
        borderColor:     ['#818cf8','#22d3ee','#34d399','#f59e0b','#f87171'][ci % 5],
        borderWidth: 2,
      })));
      return `
<div style="max-width:700px;margin:40px auto 0">
  <canvas id="chart" height="320"></canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  new Chart(document.getElementById('chart'), {
    type: 'bar',
    data: { labels: ${labels}, datasets: ${datasets} },
    options: { responsive:true, plugins:{ legend:{ labels:{ color:'#e2e8f0' } } }, scales:{ x:{ ticks:{ color:'#94a3b8' }, grid:{ color:'#1e293b' } }, y:{ ticks:{ color:'#94a3b8' }, grid:{ color:'#1e293b' }, beginAtZero:true } } }
  });
</script>`;
    })() : '';

    // Simple markdown → HTML (headers, bullets, code, bold, paragraphs)
    const md2html = (md: string) => md
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/^(?!<[h|u|p|l|c|p])(.+)$/gm, '$1')
      .replace(/\|(.+)\|/g, (m) => {
        const cells = m.split('|').map(s => s.trim()).filter(Boolean);
        return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${task.slice(0, 60)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#04060e;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:48px 32px;max-width:860px;margin:0 auto;line-height:1.7}
  h1{font-size:2rem;font-weight:800;color:#fff;margin-bottom:8px;background:linear-gradient(135deg,#818cf8,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  h2{font-size:1.3rem;font-weight:700;color:#c7d2fe;margin:32px 0 12px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px}
  h3{font-size:1.05rem;font-weight:600;color:#a5b4fc;margin:24px 0 8px}
  h4{font-size:.95rem;font-weight:600;color:#94a3b8;margin:16px 0 6px}
  p{margin:12px 0;color:#cbd5e1}
  ul,ol{margin:10px 0 10px 24px;color:#cbd5e1}
  li{margin:4px 0}
  strong{color:#e2e8f0}
  code{background:rgba(99,102,241,0.15);color:#a5b4fc;padding:2px 6px;border-radius:4px;font-size:.88em}
  pre{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;overflow-x:auto;margin:16px 0}
  pre code{background:none;color:#e2e8f0;padding:0}
  table{width:100%;border-collapse:collapse;margin:20px 0;font-size:.9rem}
  th,td{padding:10px 14px;border:1px solid rgba(255,255,255,0.08);text-align:left}
  th{background:rgba(99,102,241,0.18);color:#c7d2fe;font-weight:600}
  tr:nth-child(even){background:rgba(255,255,255,0.025)}
  .meta{font-size:.75rem;color:rgba(255,255,255,0.25);margin-bottom:40px}
  .badge{display:inline-block;background:rgba(99,102,241,0.2);color:#818cf8;border:1px solid rgba(99,102,241,0.3);border-radius:6px;padding:2px 10px;font-size:.72rem;font-weight:700;letter-spacing:.06em;margin-bottom:16px}
</style>
</head>
<body>
<span class="badge">BLEUMR RESEARCH CENTER</span>
<h1>${task}</h1>
<p class="meta">Generated ${new Date().toLocaleString()} · Bleumr Mission Team · 3-agent synthesis</p>
<div>${md2html(text)}</div>
${chartScript}
</body>
</html>`;
  }

  return text;
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Workspace File Cabinet — storage ────────────────────────────────────────

export interface WSFile {
  id: string;
  name: string;
  content: string;
  format: ExportFormat;
  agentId: AgentId;
  task: string;
  createdAt: number;
  folder: string; // '' = root / uncategorised
}

const WS_FILES_KEY = 'orbit_workspace_files';

function loadWSFiles(): WSFile[] {
  try { return JSON.parse(localStorage.getItem(WS_FILES_KEY) || '[]'); }
  catch { return []; }
}
function saveWSFiles(files: WSFile[]) {
  localStorage.setItem(WS_FILES_KEY, JSON.stringify(files));
}
function addWSFile(file: Omit<WSFile, 'id' | 'createdAt'>): WSFile[] {
  const next: WSFile = { ...file, id: Date.now().toString() + Math.random().toString(36).slice(2), createdAt: Date.now() };
  const all = [next, ...loadWSFiles()];
  saveWSFiles(all);
  return all;
}

// ─── File Cabinet Visual — rendered on back wall ──────────────────────────────

function FileCabinetVisual({ fileCount, onClick }: { fileCount: number; onClick: () => void }) {
  const hasFiles = fileCount > 0;
  return (
    <div onClick={onClick} className="relative cursor-pointer group select-none"
      style={{ width: 52, height: 72 }}>
      {/* Cabinet body */}
      <div className="absolute inset-0 rounded-sm overflow-hidden transition-all duration-300"
        style={{
          background: 'linear-gradient(160deg, #1a1d2e 0%, #0f1120 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: hasFiles
            ? '2px 4px 16px rgba(0,0,0,0.8), inset 1px 0 0 rgba(255,255,255,0.07), 0 0 24px rgba(99,102,241,0.18)'
            : '2px 4px 16px rgba(0,0,0,0.8), inset 1px 0 0 rgba(255,255,255,0.05)',
        }}>
        {/* Top edge rim */}
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'rgba(255,255,255,0.14)' }} />
        {/* 4 drawers */}
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="absolute left-2 right-2 rounded-sm"
            style={{
              top: 4 + i * 17,
              height: 14,
              background: i === 0 && hasFiles
                ? 'linear-gradient(180deg, #1e2448 0%, #171a36 100%)'
                : 'linear-gradient(180deg, #1e2238 0%, #161929 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }}>
            {/* Handle bar */}
            <div className="absolute left-3 right-3 rounded-full"
              style={{
                top: '50%', height: 3, transform: 'translateY(-50%)',
                background: i === 0 && hasFiles
                  ? 'linear-gradient(90deg, rgba(99,102,241,0.5), rgba(139,92,246,0.5))'
                  : 'rgba(255,255,255,0.13)',
                boxShadow: i === 0 && hasFiles ? '0 0 6px rgba(99,102,241,0.45)' : 'none',
              }} />
          </div>
        ))}
        {/* Right shadow edge */}
        <div className="absolute right-0 top-0 bottom-0 w-1"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.45))' }} />
      </div>

      {/* File count badge */}
      {hasFiles && (
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.9)', border: '1px solid rgba(129,140,248,0.6)', boxShadow: '0 0 10px rgba(99,102,241,0.7)', fontSize: 8, color: '#fff', fontWeight: 700, zIndex: 1 }}>
          {fileCount > 99 ? '99+' : fileCount}
        </motion.div>
      )}

      {/* Hover glow overlay */}
      <motion.div className="absolute inset-0 rounded-sm pointer-events-none"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        style={{ boxShadow: '0 0 22px rgba(99,102,241,0.45)', background: 'rgba(99,102,241,0.04)' }} />

      {/* Label */}
      <div className="absolute w-full text-center"
        style={{ bottom: -14, fontSize: 7, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)' }}>
        FILES
      </div>
    </div>
  );
}

// ─── File Cabinet Panel ───────────────────────────────────────────────────────

function FileCabinetPanel({
  files, onClose, onSave, onDelete, onAnalyze,
}: {
  files: WSFile[];
  onClose: () => void;
  onSave: (files: WSFile[]) => void;
  onDelete: (id: string) => void;
  onAnalyze: (file: WSFile) => void;
}) {
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('__all__');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renamingId && renameRef.current) renameRef.current.focus(); }, [renamingId]);

  const folders = useMemo(() => {
    const set = new Set(files.map(f => f.folder).filter(Boolean));
    return Array.from(set) as string[];
  }, [files]);

  const filtered = useMemo(() => {
    return files
      .filter(f => folder === '__all__' || f.folder === folder)
      .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.task.toLowerCase().includes(search.toLowerCase()));
  }, [files, folder, search]);

  const commitRename = (id: string) => {
    if (!renameName.trim()) { setRenamingId(null); return; }
    onSave(files.map(f => f.id === id ? { ...f, name: renameName.trim() } : f));
    setRenamingId(null);
  };

  const moveToFolder = (id: string, targetFolder: string) => {
    onSave(files.map(f => f.id === id ? { ...f, folder: targetFolder } : f));
  };

  const createFolder = () => {
    if (!newFolderName.trim()) { setNewFolderMode(false); return; }
    setFolder(newFolderName.trim());
    setNewFolderMode(false);
    setNewFolderName('');
  };

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    const diffD = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diffD === 0) return 'Today · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diffD === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const FMT_COLOR: Record<string, string> = {
    md: '#818cf8', html: '#f59e0b', csv: '#34d399', json: '#22d3ee', txt: '#94a3b8',
  };

  return (
    <motion.div
      initial={{ x: 370, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 370, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      className="absolute right-0 top-0 bottom-0 flex flex-col z-[60] overflow-hidden"
      style={{ width: 360, background: 'rgba(5,7,18,0.78)', backdropFilter: 'blur(56px)', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>

      {/* Left rim glow */}
      <div className="absolute left-0 top-0 bottom-0 w-px pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.35), rgba(99,102,241,0.1) 60%, transparent)' }} />

      {/* Ambient glow */}
      <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-32 pointer-events-none rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.1) 0%, transparent 70%)', filter: 'blur(24px)' }} />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-4 pt-4 pb-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.3), rgba(139,92,246,0.2), transparent)' }} />
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.28)', boxShadow: '0 0 14px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
          <Archive style={{ width: 14, height: 14, color: '#818cf8' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white text-sm font-semibold leading-none tracking-wide">File Cabinet</h2>
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {files.length} {files.length === 1 ? 'file' : 'files'} · team deliverables
          </p>
        </div>
        <button onClick={onClose}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/8"
          style={{ color: '#475569' }}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <SearchIcon style={{ width: 11, height: 11, color: '#334155' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search files or tasks…"
            className="flex-1 text-[11px] text-white placeholder-slate-700 bg-transparent outline-none" />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: '#334155' }}>
              <X style={{ width: 10, height: 10 }} />
            </button>
          )}
        </div>
      </div>

      {/* Folder chips */}
      <div className="px-4 pb-2.5 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[{ key: '__all__', label: 'All' }, ...folders.map(f => ({ key: f, label: f }))].map(({ key, label }) => (
            <button key={key} onClick={() => setFolder(key)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-semibold transition-all"
              style={{
                background: folder === key ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.04)',
                color: folder === key ? '#a5b4fc' : '#475569',
                border: `1px solid ${folder === key ? 'rgba(99,102,241,0.32)' : 'rgba(255,255,255,0.06)'}`,
              }}>
              {key !== '__all__' && <FolderOpen style={{ width: 8, height: 8 }} />}
              {label}
            </button>
          ))}
          {!newFolderMode ? (
            <button onClick={() => setNewFolderMode(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-semibold"
              style={{ color: '#2d3748', border: '1px dashed rgba(255,255,255,0.07)' }}>
              <Plus style={{ width: 8, height: 8 }} />Folder
            </button>
          ) : (
            <input
              value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName(''); } }}
              onBlur={createFolder}
              placeholder="Name…" autoFocus
              className="px-2.5 py-1 rounded-full text-[9px] text-white bg-transparent outline-none"
              style={{ border: '1px solid rgba(99,102,241,0.45)', width: 80 }} />
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px mx-4 shrink-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }} />

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: 'none' }}>
        <AnimatePresence>
          {filtered.length === 0 && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-3">
              <Archive style={{ width: 32, height: 32, color: '#1a1e30' }} />
              <p className="text-[11px]" style={{ color: '#2d3748' }}>
                {search ? 'No files match your search' : files.length === 0 ? 'Files appear here after a Mission Team run' : 'No files in this folder'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-2">
          <AnimatePresence>
            {filtered.map((file, idx) => {
              const agentObj = AGENTS.find(a => a.id === file.agentId) ?? AGENTS[2];
              const fmtColor = FMT_COLOR[file.format] ?? '#94a3b8';
              const isRenaming = renamingId === file.id;

              return (
                <motion.div key={file.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.04 } }}
                  exit={{ opacity: 0, x: 20, transition: { duration: 0.15 } }}
                  className="rounded-2xl p-3 group relative overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.026)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}>
                  {/* Card top rim */}
                  <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
                    style={{ background: `linear-gradient(90deg, transparent, ${fmtColor}40, transparent)` }} />

                  {/* Main row */}
                  <div className="flex items-start gap-2.5">
                    {/* Format badge */}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[9px] font-bold"
                      style={{ background: fmtColor + '14', border: `1px solid ${fmtColor}30`, color: fmtColor, letterSpacing: '0.05em' }}>
                      .{file.format}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* File name */}
                      {isRenaming ? (
                        <input ref={renameRef} value={renameName}
                          onChange={e => setRenameName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(file.id); if (e.key === 'Escape') setRenamingId(null); }}
                          onBlur={() => commitRename(file.id)}
                          className="w-full text-[12px] text-white bg-transparent outline-none pb-0.5"
                          style={{ borderBottom: '1px solid rgba(99,102,241,0.5)' }} />
                      ) : (
                        <p className="text-[12px] font-medium leading-tight truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>
                          {file.name}
                        </p>
                      )}

                      {/* Task excerpt */}
                      <p className="text-[9px] mt-0.5 truncate" style={{ color: '#334155' }}>{file.task}</p>

                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <div className="flex items-center gap-1">
                          <agentObj.Icon style={{ width: 8, height: 8, color: agentObj.accent }} />
                          <span style={{ fontSize: 8, color: agentObj.accent + 'bb' }}>{agentObj.name}</span>
                        </div>
                        <span style={{ fontSize: 8, color: '#1e2535' }}>·</span>
                        <span style={{ fontSize: 8, color: '#334155' }}>{fmtDate(file.createdAt)}</span>
                        {file.folder && (
                          <>
                            <span style={{ fontSize: 8, color: '#1e2535' }}>·</span>
                            <span className="flex items-center gap-0.5" style={{ fontSize: 8, color: 'rgba(99,102,241,0.55)' }}>
                              <FolderOpen style={{ width: 7, height: 7 }} />{file.folder}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action row — shown on hover */}
                  <div className="flex items-center gap-1 mt-2.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    {/* Analyze with team */}
                    <button onClick={() => onAnalyze(file)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-semibold transition-all hover:scale-105 active:scale-95"
                      style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.28)', boxShadow: '0 0 8px rgba(99,102,241,0.1)' }}>
                      <Sparkles style={{ width: 8, height: 8 }} />Analyze
                    </button>

                    {/* Rename */}
                    <button onClick={() => { setRenamingId(file.id); setRenameName(file.name); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] transition-all hover:scale-105"
                      style={{ background: 'rgba(255,255,255,0.04)', color: '#475569', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <Pencil style={{ width: 8, height: 8 }} />Rename
                    </button>

                    {/* Move to folder — only shown if folders exist */}
                    {folders.length > 0 && (
                      <select value={file.folder} onChange={e => moveToFolder(file.id, e.target.value)}
                        className="text-[9px] rounded-lg px-1.5 py-1 outline-none cursor-pointer appearance-none"
                        style={{ background: 'rgba(255,255,255,0.04)', color: '#475569', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <option value="" className="bg-[#080a18]">No folder</option>
                        {folders.map(f => <option key={f} value={f} className="bg-[#080a18]">{f}</option>)}
                      </select>
                    )}

                    {/* Download again */}
                    <button onClick={() => {
                      const meta = FORMAT_META.find(m => m.ext === file.format)!;
                      if (meta) triggerDownload(file.content, `${file.name}.${file.format}`, meta.mime);
                    }}
                      className="p-1.5 rounded-lg transition-all hover:scale-105 ml-auto"
                      style={{ background: 'rgba(255,255,255,0.04)', color: '#475569', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <Download style={{ width: 9, height: 9 }} />
                    </button>

                    {/* Delete */}
                    <button onClick={() => onDelete(file.id)}
                      className="p-1.5 rounded-lg transition-all hover:scale-105"
                      style={{ background: 'rgba(239,68,68,0.06)', color: 'rgba(239,68,68,0.55)', border: '1px solid rgba(239,68,68,0.1)' }}>
                      <Trash2 style={{ width: 9, height: 9 }} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer hint */}
      {files.length > 0 && (
        <div className="px-4 py-2.5 shrink-0 flex items-center justify-center gap-1.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <Sparkles style={{ width: 9, height: 9, color: '#334155' }} />
          <p className="text-[9px]" style={{ color: '#2d3748' }}>Click Analyze to re-run a file through the team</p>
        </div>
      )}
    </motion.div>
  );
}

// ─── Data packet traveling between agents ─────────────────────────────────────
function DataPacket({ fromPct, toPct, color, delay = 0 }: { fromPct: string; toPct: string; color: string; delay?: number }) {
  return (
    <motion.div className="absolute z-30 rounded-full"
      style={{ top: '52%', width: 10, height: 10, background: color, boxShadow: `0 0 14px 5px ${color}80`, left: fromPct }}
      animate={{ left: [fromPct, toPct], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 2.2, delay, ease: [0.25, 0.46, 0.45, 0.94], repeat: Infinity, repeatDelay: 1.5 }}
    />
  );
}

// ─── Phase rail ───────────────────────────────────────────────────────────────
const PHASES: { key: Phase; label: string; color: string }[] = [
  { key: 'planning',     label: 'Plan',     color: '#818cf8' },
  { key: 'researching',  label: 'Research', color: '#22d3ee' },
  { key: 'synthesizing', label: 'Compose',  color: '#34d399' },
  { key: 'done',         label: 'Done',     color: '#34d399' },
];

function PhaseRail({ phase }: { phase: Phase }) {
  const idx = PHASES.findIndex(p => p.key === phase);
  return (
    <div className="flex items-center gap-1.5 ml-3">
      {PHASES.map((p, i) => {
        const active = i === idx;
        const done = i < idx || phase === 'done';
        return (
          <React.Fragment key={p.key}>
            <div className="flex items-center gap-1">
              <motion.div className="rounded-full" style={{ width: 6, height: 6 }}
                animate={{ background: done ? '#34d399' : active ? p.color : '#1e293b', scale: active ? [1, 1.5, 1] : 1 }}
                transition={{ duration: 0.9, repeat: active ? Infinity : 0 }}
              />
              <span className="text-[10px] font-semibold"
                style={{ color: done ? '#34d399' : active ? p.color : '#334155' }}>
                {p.label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div className="w-3 h-px rounded-full" style={{ background: done ? '#34d399' : '#1e293b' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Top-view office ──────────────────────────────────────────────────────────
const TOP_STATIONS = [
  { agent: AGENTS[0], cx: 20, cy: 60 },
  { agent: AGENTS[1], cx: 50, cy: 65 },
  { agent: AGENTS[2], cx: 80, cy: 60 },
] as const;

function TopViewOffice({
  statuses, agentStreaming, agentPhaseLabel, selected, onSelect, fileCount, onCabinetClick,
}: {
  statuses: Record<AgentId, AgentStatus>;
  agentStreaming: Record<AgentId, string>;
  agentPhaseLabel: Record<AgentId, string>;
  selected: AgentId | null;
  onSelect: (id: AgentId) => void;
  fileCount: number;
  onCabinetClick: () => void;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#04060b' }}>

      {/* ── Grid Floor ── */}
      <div className="absolute" style={{ left: '4%', right: '4%', top: '10%', bottom: '5%', background: '#05060c' }}>
        {/* Major grid lines — horizontal */}
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={`h${i}`} className="absolute left-0 right-0"
            style={{ top: `${(i + 1) * 7}%`, height: 1, background: (i + 1) % 2 === 0 ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.035)' }} />
        ))}
        {/* Major grid lines — vertical */}
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={`v${i}`} className="absolute top-0 bottom-0"
            style={{ left: `${(i + 1) * 7}%`, width: 1, background: (i + 1) % 2 === 0 ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.035)' }} />
        ))}
        {/* Grid intersection dots */}
        {Array.from({ length: 7 }).map((_, row) =>
          Array.from({ length: 7 }).map((_, col) => (
            <div key={`d${row}-${col}`} className="absolute rounded-full"
              style={{ left: `${(col + 1) * 14 - 0.5}%`, top: `${(row + 1) * 14 - 0.5}%`, width: 2, height: 2, background: 'rgba(99,102,241,0.25)' }} />
          ))
        )}
        {/* Center glow beneath emblem */}
        <div className="absolute left-1/2 -translate-x-1/2 top-1/3 -translate-y-1/2 rounded-full pointer-events-none"
          style={{ width: 200, height: 200, background: 'radial-gradient(circle,rgba(99,102,241,0.07) 0%,transparent 70%)', filter: 'blur(8px)' }} />
        {/* Edge fade vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%,transparent 40%,rgba(3,4,10,0.7) 100%)' }} />
      </div>

      {/* ── Walls ── */}
      {/* Back wall */}
      <div className="absolute left-0 right-0 top-0" style={{ height: '10%', background: 'linear-gradient(180deg,#020306 0%,#040509 100%)', borderBottom: '2px solid rgba(255,255,255,0.07)' }}>
        {/* Panel dividers */}
        {[20, 40, 60, 80].map(x => (
          <div key={x} className="absolute top-1 bottom-1" style={{ left: `${x}%`, width: 1, background: 'rgba(255,255,255,0.03)' }} />
        ))}
        {/* Window openings in back wall */}
        {[
          { left: '8%', color: '#818cf8', glow: 'rgba(99,102,241,0.35)' },
          { right: '8%', color: '#34d399', glow: 'rgba(52,211,153,0.28)' },
        ].map((w, wi) => (
          <div key={wi} className="absolute top-1 bottom-1 rounded-sm overflow-hidden"
            style={{ ...w, width: '14%', background: '#010214', border: `1px solid ${w.color}55`, boxShadow: `inset 0 0 16px ${w.glow}, 0 0 8px ${w.glow}` }}>
            <motion.div className="absolute inset-0"
              style={{ background: `linear-gradient(90deg,${wi === 0 ? 'rgba(99,102,241,0.12)' : 'rgba(52,211,153,0.1)'},transparent)` }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, delay: wi * 1.5 }}
            />
            {/* Stars inside */}
            {Array.from({ length: 8 }).map((_, si) => {
              const sx = (si * 37 + wi * 13) % 90;
              const sy = (si * 53 + wi * 17) % 80;
              return <div key={si} className="absolute rounded-full" style={{ left: `${sx}%`, top: `${sy}%`, width: si % 3 === 0 ? 2 : 1, height: si % 3 === 0 ? 2 : 1, background: wi === 0 ? '#a5b4fc' : '#6ee7b7', opacity: 0.6 }} />;
            })}
            {/* Window mullions */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-px" style={{ height: 2, background: 'rgba(30,35,55,0.9)' }} />
            <div className="absolute inset-y-0 left-1/2 -translate-x-px" style={{ width: 2, background: 'rgba(30,35,55,0.9)' }} />
          </div>
        ))}
        {/* Wall label */}
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 text-[7px] font-bold tracking-[0.35em] uppercase" style={{ color: 'rgba(255,255,255,0.1)' }}>BACK WALL</div>
      </div>

      {/* Left wall */}
      <div className="absolute left-0 top-0 bottom-0" style={{ width: '4%', background: '#020307', borderRight: '2px solid rgba(255,255,255,0.06)' }}>
        {/* Door on left wall */}
        <div className="absolute left-1 right-1 rounded-t-sm" style={{ bottom: '20%', height: '22%', background: '#010214', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 0 8px rgba(0,0,0,0.6)' }}>
          <div className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full" style={{ width: 4, height: 4, background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center">
          <span className="text-[6px] font-bold uppercase" style={{ color: 'rgba(255,255,255,0.08)', writingMode: 'vertical-rl', letterSpacing: '0.2em' }}>LEFT</span>
        </div>
      </div>

      {/* Right wall */}
      <div className="absolute right-0 top-0 bottom-0" style={{ width: '4%', background: '#020307', borderLeft: '2px solid rgba(255,255,255,0.06)' }}>
        <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center">
          <span className="text-[6px] font-bold uppercase" style={{ color: 'rgba(255,255,255,0.08)', writingMode: 'vertical-rl', letterSpacing: '0.2em' }}>RIGHT</span>
        </div>
        {/* Whiteboard on right wall */}
        <div className="absolute left-1 right-1 rounded-sm" style={{ top: '15%', height: '28%', background: '#07090f', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[1,2,3,4].map(i => <div key={i} className="mx-1 rounded-full" style={{ marginTop: 3, height: 1, background: 'rgba(255,255,255,0.05)' }} />)}
        </div>
      </div>

      {/* Front wall */}
      <div className="absolute left-0 right-0 bottom-0" style={{ height: '5%', background: '#020307', borderTop: '2px solid rgba(255,255,255,0.06)' }}>
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 text-[6px] font-bold tracking-[0.3em] uppercase" style={{ color: 'rgba(255,255,255,0.08)' }}>FRONT</div>
      </div>

      {/* ── Floor emblem — center of room ── */}
      <motion.div className="absolute" style={{ left: '50%', top: '32%', transform: 'translate(-50%,-50%)', width: 72, height: 72, zIndex: 2 }}>
        <div className="w-full h-full rounded-full flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', boxShadow: '0 0 30px rgba(99,102,241,0.08)' }}>
          <InlineStarSphere size={72} />
        </div>
        {/* Outer ring */}
        <motion.div className="absolute inset-0 rounded-full pointer-events-none"
          style={{ border: '1px solid rgba(99,102,241,0.15)' }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[7px] font-bold tracking-[0.28em] uppercase" style={{ color: 'rgba(129,140,248,0.35)' }}>BLEUMR MISSION TEAM</div>
      </motion.div>

      {/* ── Ambient light pools from windows on floor ── */}
      <div className="absolute pointer-events-none" style={{ left: '4%', top: '10%', width: '18%', height: '25%', background: 'radial-gradient(ellipse at 50% 0%,rgba(99,102,241,0.08) 0%,transparent 70%)' }} />
      <div className="absolute pointer-events-none" style={{ right: '4%', top: '10%', width: '18%', height: '25%', background: 'radial-gradient(ellipse at 50% 0%,rgba(52,211,153,0.06) 0%,transparent 70%)' }} />

      {/* ── SVG floor connectors ── */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
        <defs>
          <filter id="glow-p"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="glow-r"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        {/* Floor guide line P→R */}
        <line x1="23%" y1="63%" x2="45%" y2="66%" stroke={AGENTS[0].accent} strokeWidth="1" strokeOpacity="0.18" strokeDasharray="5 5" />
        {/* Floor guide line R→S */}
        <line x1="55%" y1="66%" x2="77%" y2="63%" stroke={AGENTS[1].accent} strokeWidth="1" strokeOpacity="0.18" strokeDasharray="5 5" />
        {/* Floor guide line P→S (arc via top) */}
        <path d={`M 22% 59% Q 50% 45% 78% 59%`} stroke="rgba(255,255,255,0.05)" strokeWidth="1" fill="none" strokeDasharray="6 8" />

        {/* Animated data packets */}
        {statuses.researcher === 'thinking' && (
          <motion.circle r="5" fill={AGENTS[0].accent} filter="url(#glow-p)"
            animate={{ cx: ['23%', '45%'], cy: ['63%', '66%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.8, ease: [0.25,0.46,0.45,0.94] }}
          />
        )}
        {statuses.synth === 'thinking' && (
          <motion.circle r="5" fill={AGENTS[1].accent} filter="url(#glow-r)"
            animate={{ cx: ['55%', '77%'], cy: ['66%', '63%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.8, ease: [0.25,0.46,0.45,0.94] }}
          />
        )}
      </svg>

      {/* ── Workstations ── */}
      {TOP_STATIONS.map(({ agent, cx, cy }) => {
        const status = statuses[agent.id];
        const thinking = status === 'thinking';
        const done = status === 'done';
        const active = status !== 'idle';
        const isSelected = selected === agent.id;

        // Extract last sentence for bubble
        const rawStream = agentStreaming[agent.id] || '';
        const cleanBubble = rawStream.replace(/[#*`>_~]/g,'').replace(/\s+/g,' ').trim().slice(-120);

        return (
          <div key={agent.id} className="absolute" style={{ left: `${cx}%`, top: `${cy}%`, transform: 'translate(-50%,-50%)', zIndex: 10 }}>

            {/* Glow halo on floor */}
            <motion.div className="absolute rounded-full blur-2xl pointer-events-none"
              style={{ width: 160, height: 80, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: agent.accent }}
              animate={{ opacity: thinking ? [0.08, 0.22, 0.08] : active ? 0.1 : isSelected ? 0.07 : 0 }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />

            <button onClick={() => onSelect(agent.id)} className="relative outline-none" style={{ cursor: 'pointer' }}>

              {/* Desk surface — viewed from above */}
              <div className="relative rounded-xl overflow-visible"
                style={{
                  width: 148, height: 84,
                  background: 'linear-gradient(160deg,#14182a 0%,#0d1020 100%)',
                  border: `1.5px solid ${active || isSelected ? agent.accent + '55' : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: active ? `0 0 28px ${agent.accent}20, inset 0 1px 0 rgba(255,255,255,0.05)` : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                }}>

                {/* ── Monitor (top edge of desk) ── */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded-lg overflow-hidden"
                  style={{ width: 92, height: 22, background: '#05070e', border: `1px solid ${active ? agent.accent + '70' : 'rgba(255,255,255,0.1)'}` }}>
                  {active && (
                    <motion.div className="absolute inset-0"
                      style={{ background: `linear-gradient(90deg,${agent.accent}15,transparent)` }}
                      animate={{ opacity: [0.4, 0.9, 0.4] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                  )}
                  {/* Screen content lines */}
                  {[90, 70, 50].map((w, i) => (
                    <motion.div key={i} className="absolute rounded-full"
                      style={{ left: 4, top: `${20 + i * 28}%`, height: 2, width: `${w}%`, background: agent.accent, opacity: 0.7 - i * 0.2 }}
                      animate={thinking ? { opacity: [0.7 - i * 0.2, 0.15, 0.7 - i * 0.2], width: [`${w}%`, `${w * 0.6}%`, `${w}%`] } : {}}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }}
                    />
                  ))}
                  {/* LED status */}
                  <motion.div className="absolute top-1 right-1 rounded-full"
                    style={{ width: 4, height: 4, background: active ? agent.accent : '#0d1018' }}
                    animate={thinking ? { opacity: [1, 0.15, 1], scale: [1, 1.4, 1] } : {}}
                    transition={{ duration: 0.7, repeat: Infinity }}
                  />
                </div>

                {/* Monitor stand — tiny rectangle below monitor */}
                <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 25, width: 8, height: 4, background: '#0a0c14', borderRadius: 1 }} />
                <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 29, width: 20, height: 2, background: '#0a0c14', borderRadius: 1 }} />

                {/* ── Keyboard ── */}
                <div className="absolute left-1/2 -translate-x-1/2"
                  style={{ top: 36, width: 76, height: 18, background: '#080b13', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4 }}>
                  {[0, 1, 2].map(row => (
                    <div key={row} className="flex gap-px px-1" style={{ marginTop: row === 0 ? 2 : 2 }}>
                      {Array.from({ length: 10 }).map((_, col) => (
                        <motion.div key={col} className="flex-1 rounded-sm"
                          style={{ height: 3, background: active ? `${agent.accent}40` : 'rgba(255,255,255,0.06)' }}
                          animate={thinking && (row * 10 + col) % 4 === 0 ? { opacity: [0.3, 1, 0.3] } : {}}
                          transition={{ duration: 0.45, repeat: Infinity, delay: col * 0.04 + row * 0.08 }}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* ── Mouse ── */}
                <div className="absolute" style={{ right: 8, top: 34, width: 12, height: 20, background: '#0d1018', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6 }}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ width: 5, height: 5, background: active ? `${agent.accent}50` : 'rgba(255,255,255,0.05)' }} />
                  <div className="absolute top-1 left-1/2 -translate-x-1/2" style={{ width: 1, height: 7, background: 'rgba(255,255,255,0.06)' }} />
                </div>

                {/* ── Mug (circle from above) ── */}
                <div className="absolute" style={{ left: 8, top: 34 }}>
                  <div className="rounded-full" style={{ width: 18, height: 18, background: 'linear-gradient(135deg,#1f2937,#111827)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div className="absolute inset-1.5 rounded-full" style={{ background: `${agent.accent}35` }} />
                  </div>
                  {/* Mug handle */}
                  <div className="absolute" style={{ right: -5, top: 5, width: 5, height: 8, borderRadius: '0 50% 50% 0', border: '1px solid rgba(255,255,255,0.08)', borderLeft: 'none' }} />
                  {/* Steam wisps */}
                  {active && [0, 4].map(dx => (
                    <motion.div key={dx} className="absolute rounded-full"
                      style={{ left: 5 + dx, top: -8, width: 2, height: 6, background: 'rgba(148,163,184,0.2)', borderRadius: 4 }}
                      animate={{ y: [0, -6, 0], opacity: [0, 0.5, 0], scaleX: [1, 1.5, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity, delay: dx * 0.4 }}
                    />
                  ))}
                </div>

                {/* ── Papers stack ── */}
                <div className="absolute" style={{ left: 8, bottom: 6, width: 24, height: 28, transform: 'rotate(-5deg)' }}>
                  {[0, 2, 4].map(offset => (
                    <div key={offset} className="absolute rounded-sm"
                      style={{ left: offset, top: offset, right: -offset, bottom: -offset, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} className="mx-1.5 rounded-full" style={{ marginTop: 4 + i * 5, height: 1.5, background: `rgba(255,255,255,${0.1 - i * 0.02})` }} />
                      ))}
                    </div>
                  ))}
                </div>

                {/* ── Sticky notes ── */}
                <div className="absolute" style={{ right: 8, bottom: 6, width: 20, height: 20, background: `${agent.accent}18`, border: `1px solid ${agent.accent}30`, borderRadius: 3, transform: 'rotate(3deg)' }}>
                  {[0, 1].map(i => <div key={i} className="mx-1 rounded-full" style={{ marginTop: 4 + i * 5, height: 1.5, background: `${agent.accent}40` }} />)}
                </div>

                {/* ── Name plate on front edge of desk ── */}
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-sm flex items-center justify-center"
                  style={{ width: 50, height: 8, background: 'rgba(0,0,0,0.4)', border: `1px solid ${agent.accent}30` }}>
                  <span className="text-[6px] font-bold uppercase tracking-wider" style={{ color: agent.accent }}>{agent.name}</span>
                </div>
              </div>

              {/* ── Chair (below desk from top view) ── */}
              <div className="relative mx-auto rounded-xl"
                style={{ width: 60, height: 44, marginTop: 6, background: 'linear-gradient(180deg,#1a1e2e,#111420)', border: `1px solid ${isSelected ? agent.accent + '40' : 'rgba(255,255,255,0.07)'}`, boxShadow: isSelected ? `0 0 12px ${agent.accent}20` : 'none' }}>
                {/* Cushion */}
                <div className="absolute inset-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }} />
                {/* Chair arm rests */}
                <div className="absolute left-0 top-3 bottom-3 rounded-l-lg" style={{ width: 5, background: '#0f1220', border: '1px solid rgba(255,255,255,0.06)' }} />
                <div className="absolute right-0 top-3 bottom-3 rounded-r-lg" style={{ width: 5, background: '#0f1220', border: '1px solid rgba(255,255,255,0.06)' }} />
                {/* Chair wheels */}
                {[[-6, -4], [6, -4], [0, 8]].map(([ox, oy], wi) => (
                  <div key={wi} className="absolute rounded-full"
                    style={{ width: 5, height: 5, left: `calc(50% + ${ox}px)`, bottom: oy, background: '#090c14', border: '1px solid rgba(255,255,255,0.05)' }} />
                ))}
              </div>

              {/* ── Agent avatar ── */}
              <motion.div
                className="absolute rounded-full flex items-center justify-center"
                style={{
                  width: 44, height: 44,
                  left: '50%', top: 88,
                  transform: 'translateX(-50%)',
                  background: agent.accentDim,
                  border: `2px solid ${active ? agent.accent : agent.accent + '45'}`,
                  boxShadow: active ? `0 0 24px ${agent.accent}55, 0 0 8px ${agent.accent}30` : 'none',
                  zIndex: 3,
                }}
                animate={thinking ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                <agent.Icon style={{ width: 18, height: 18, color: agent.accent }} />
                {/* Done badge */}
                {done && (
                  <motion.div className="absolute -top-1 -right-1 rounded-full flex items-center justify-center"
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    style={{ width: 14, height: 14, background: '#10b981', border: '1.5px solid #04060b' }}>
                    <span style={{ fontSize: 8, color: '#fff', lineHeight: 1 }}>✓</span>
                  </motion.div>
                )}
              </motion.div>

              {/* ── Status chip ── */}
              <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 138, whiteSpace: 'nowrap', zIndex: 4 }}>
                <div className="flex items-center gap-1 rounded-full px-2.5 py-0.5"
                  style={{ background: 'rgba(4,6,18,0.92)', border: `1px solid ${active ? agent.accent + '40' : 'rgba(255,255,255,0.06)'}`, backdropFilter: 'blur(8px)' }}>
                  <motion.div className="rounded-full" style={{ width: 5, height: 5, background: agent.accent }}
                    animate={{ opacity: thinking ? [1, 0.2, 1] : done ? 1 : 0.2 }}
                    transition={{ duration: 0.7, repeat: thinking ? Infinity : 0 }}
                  />
                  <span className="text-[9px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>{agent.name}</span>
                  {thinking && <span className="text-[8px]" style={{ color: agent.accent }}>working…</span>}
                  {done && <span className="text-[8px] text-emerald-400">done</span>}
                </div>
              </div>

              {/* ── Speech bubble (top view) ── */}
              <AnimatePresence>
                {thinking && cleanBubble.length > 10 && (
                  <motion.div
                    key="bubble"
                    initial={{ opacity: 0, scale: 0.85, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    className="absolute rounded-2xl px-3 py-2"
                    style={{
                      width: 170, left: '50%', transform: 'translateX(-50%)',
                      top: -82,
                      background: 'rgba(6,8,18,0.96)',
                      border: `1px solid ${agent.accent}55`,
                      boxShadow: `0 4px 20px rgba(0,0,0,0.6), 0 0 0 1px ${agent.accent}15`,
                      zIndex: 30,
                    }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <motion.div className="rounded-full shrink-0" style={{ width: 5, height: 5, background: agent.accent }}
                        animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.65, repeat: Infinity }} />
                      <span className="text-[8px] font-bold" style={{ color: agent.accent }}>{agentPhaseLabel[agent.id] || agent.name}</span>
                    </div>
                    <p className="text-[9px] leading-snug" style={{ color: 'rgba(255,255,255,0.75)', wordBreak: 'break-word' }}>
                      {cleanBubble}
                      <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.5, repeat: Infinity }}
                        style={{ color: agent.accent, marginLeft: 2, fontWeight: 700 }}>▋</motion.span>
                    </p>
                    {/* Tail */}
                    <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -7, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `8px solid ${agent.accent}55` }} />
                    <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -6, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid rgba(6,8,18,0.96)' }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        );
      })}

      {/* ── File cabinet — top-down view, back wall center ── */}
      <motion.div
        onClick={onCabinetClick}
        className="absolute cursor-pointer group select-none"
        style={{ left: '50%', transform: 'translateX(-50%)', top: '11%', width: 44, height: 62, zIndex: 10 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}>

        {/* Cabinet body — bird's-eye rectangle */}
        <div className="absolute inset-0 rounded-sm overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #1c2040 0%, #10132a 100%)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: fileCount > 0
              ? '0 0 20px rgba(99,102,241,0.25), 0 2px 8px rgba(0,0,0,0.7)'
              : '0 2px 8px rgba(0,0,0,0.7)',
          }}>
          {/* Top face highlight (simulates 3D top edge) */}
          <div className="absolute inset-x-0 top-0 h-1"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04))' }} />
          {/* 4 drawer divisions (horizontal lines from top view) */}
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="absolute left-1.5 right-1.5 rounded-full"
              style={{
                top: 6 + i * 14,
                height: 10,
                background: fileCount > 0 && i === 0
                  ? 'linear-gradient(180deg, rgba(99,102,241,0.22), rgba(99,102,241,0.1))'
                  : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
              {/* Handle dot — visible from top */}
              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-4 h-1.5 rounded-full"
                style={{
                  background: fileCount > 0 && i === 0
                    ? 'rgba(99,102,241,0.65)'
                    : 'rgba(255,255,255,0.18)',
                  boxShadow: fileCount > 0 && i === 0 ? '0 0 5px rgba(99,102,241,0.6)' : 'none',
                }} />
            </div>
          ))}
        </div>

        {/* File count badge */}
        {fileCount > 0 && (
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(99,102,241,0.92)',
              border: '1px solid rgba(129,140,248,0.7)',
              boxShadow: '0 0 10px rgba(99,102,241,0.8)',
              fontSize: 8, color: '#fff', fontWeight: 700, zIndex: 2,
            }}>
            {fileCount > 99 ? '99+' : fileCount}
          </motion.div>
        )}

        {/* Hover glow ring */}
        <div className="absolute inset-0 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ boxShadow: '0 0 18px rgba(99,102,241,0.5)', border: '1px solid rgba(99,102,241,0.35)' }} />

        {/* Label */}
        <div className="absolute w-full text-center"
          style={{ bottom: -13, fontSize: 7, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
          FILES
        </div>
      </motion.div>

      {/* ── View label ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold tracking-[0.4em] uppercase" style={{ color: 'rgba(255,255,255,0.1)', zIndex: 1 }}>
        TOP VIEW
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function WorkspacePage({ onClose, apiKey, initialTask }: WorkspacePageProps) {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [statuses, setStatuses] = useState<Record<AgentId, AgentStatus>>({ planner: 'idle', researcher: 'idle', synth: 'idle' });
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [streaming, setStreaming] = useState('');
  const [agentStreaming, setAgentStreaming] = useState<Record<AgentId, string>>({ planner: '', researcher: '', synth: '' });
  const [agentPhaseLabel, setAgentPhaseLabel] = useState<Record<AgentId, string>>({ planner: '', researcher: '', synth: '' });
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [lastTask, setLastTask] = useState('');
  const [viewMode, setViewMode] = useState<'side' | 'top'>('top');
  const [cabinetOpen, setCabinetOpen] = useState(false);
  const [wsFiles, setWsFiles] = useState<WSFile[]>(loadWSFiles);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoRunFired = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [outputs, streaming]);

  // Auto-run when arriving from a JUMARI chat handoff
  useEffect(() => {
    if (initialTask && !autoRunFired.current && apiKey) {
      autoRunFired.current = true;
      // Small delay so the page is fully mounted — no fake typing shown
      setTimeout(() => {
        runWithTask(initialTask);
      }, 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTask, apiKey]);

  const setStatus = (id: AgentId, s: AgentStatus) => setStatuses(p => ({ ...p, [id]: s }));
  const appendAgentStream = (id: AgentId, tok: string) => setAgentStreaming(p => ({ ...p, [id]: p[id] + tok }));
  const clearAgentStream  = (id: AgentId) => setAgentStreaming(p => ({ ...p, [id]: '' }));

  // ── Groq call (supports streaming) ────────────────────────────────────────
  const groq = useCallback(async (
    model: string,
    msgs: { role: string; content: string }[],
    signal: AbortSignal,
    onTok?: (t: string) => void,
  ): Promise<string> => {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: msgs, stream: !!onTok, max_tokens: 4096, temperature: 0.65 }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Groq ${res.status}: ${err.slice(0, 120)}`);
    }
    if (!onTok) {
      const d = await res.json();
      return d.choices?.[0]?.message?.content ?? '';
    }
    // Streaming
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let out = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value, { stream: true }).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') break;
        try {
          const tok = JSON.parse(raw).choices?.[0]?.delta?.content;
          if (tok) { out += tok; onTok(tok); }
        } catch { /* skip */ }
      }
    }
    return out;
  }, [apiKey]);

  // ── Core pipeline — accepts task string directly ───────────────────────────
  const runWithTask = useCallback(async (task: string) => {
    if (!task.trim() || !apiKey) return;
    setLastTask(task);
    setOutputs([]); setStreaming('');
    setStatuses({ planner: 'idle', researcher: 'idle', synth: 'idle' });
    setAgentStreaming({ planner: '', researcher: '', synth: '' });

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    try {
      // ── Round 1: Planner ───────────────────────────────────────────────
      setPhase('planning');
      setStatus('planner', 'thinking');
      setAgentPhaseLabel(p => ({ ...p, planner: 'Breaking down the task…' }));
      clearAgentStream('planner');

      const plan = await groq(
        AGENTS[0].model,
        [
          {
            role: 'system',
            content: `${BLEUMR_AGENT_PREFIX}
You're Planner on the Bleumr Mission Team — a real person, not a robot. You talk like a sharp professional who thinks out loud, uses plain language, and isn't afraid to say exactly what you think.

Round 1 — lay out your take on this task. Talk directly to your teammate Researcher like you're in a Slack channel together. Be specific, be direct. Structure your breakdown clearly but write like a human:
- What's the real ask here (not just the surface level)?
- Your step-by-step game plan — numbered, specific, no fluff
- The 3 things you're assuming that Researcher needs to check — be honest about your weak spots
- One thing that, if you're wrong about it, blows up the whole plan

Don't be stiff. This is a real team conversation. Write it that way.`,
          },
          { role: 'user', content: `TASK: ${task}\n\nAlright Researcher, here's my read on this:` },
        ],
        signal,
        (tok) => appendAgentStream('planner', tok),
      );

      setStatus('planner', 'done');
      clearAgentStream('planner');
      setOutputs(p => [...p, { id: 'planner', text: plan }]);

      // ── Round 2: Researcher ────────────────────────────────────────────
      setPhase('researching');
      setStatus('researcher', 'thinking');
      setAgentPhaseLabel(p => ({ ...p, researcher: 'Pulling the real data…' }));
      clearAgentStream('researcher');

      const research = await groq(
        AGENTS[1].model,
        [
          {
            role: 'system',
            content: `${BLEUMR_AGENT_PREFIX}
You're Researcher on the Bleumr Mission Team — a real person who digs for facts and isn't shy about pushing back when something's off. You talk directly to Planner like a colleague, not a subordinate.

Round 2 — you just read Planner's breakdown. Now respond like a real teammate:
- Quote the specific parts you agree with, disagree with, or want to push back on — use their actual words
- Where Planner's assumptions are shaky, say so directly and back it up with real evidence, numbers, examples
- If Planner missed something important, name it bluntly: "You didn't account for X, and that's a problem because..."
- Give at least 2 angles or options Planner didn't consider
- End with what you need Planner to fix in their revision — be specific

This is a real back-and-forth. Be direct. It's okay to respectfully disagree. The work gets better when we push each other.`,
          },
          { role: 'user', content: `TASK: ${task}\n\n=== PLANNER'S TAKE ===\n${plan}\n\nOkay Planner, I've looked into this. Here's where I'm with you and where I'm not:` },
        ],
        signal,
        (tok) => appendAgentStream('researcher', tok),
      );

      setStatus('researcher', 'done');
      clearAgentStream('researcher');
      setOutputs(p => [...p, { id: 'researcher', text: research }]);

      // ── Round 3: Planner revision ──────────────────────────────────────
      setPhase('planning');
      setStatus('planner', 'thinking');
      setAgentPhaseLabel(p => ({ ...p, planner: 'Updating the plan…' }));
      clearAgentStream('planner');

      const refinedPlan = await groq(
        AGENTS[0].model,
        [
          {
            role: 'system',
            content: `${BLEUMR_AGENT_PREFIX}
You're Planner — Round 3. Researcher just pushed back on your plan, and some of it landed. Talk directly to them. Be real:
- Acknowledge what they got right — specifically. Don't be vague about it.
- Push back on what you disagree with and explain why, briefly
- Show a revised plan that actually incorporates their corrections — this isn't just tweaks, genuinely rebuild where needed
- Add detail: timelines, what success looks like, what could go wrong

Write like you're responding to a teammate in a Google Doc comment thread. Real language, real revisions.`,
          },
          { role: 'user', content: `TASK: ${task}\n\n=== MY ORIGINAL PLAN ===\n${plan}\n\n=== RESEARCHER'S PUSHBACK ===\n${research}\n\nFair points, Researcher. Let me revise this:` },
        ],
        signal,
        (tok) => appendAgentStream('planner', tok),
      );

      setStatus('planner', 'done');
      clearAgentStream('planner');
      setOutputs(p => [...p, { id: 'planner', text: `[Revised]\n${refinedPlan}` }]);

      // ── Round 4: Researcher final check ───────────────────────────────
      setPhase('researching');
      setStatus('researcher', 'thinking');
      setAgentPhaseLabel(p => ({ ...p, researcher: 'Verifying the revision…' }));
      clearAgentStream('researcher');

      const finalResearch = await groq(
        AGENTS[1].model,
        [
          {
            role: 'system',
            content: `${BLEUMR_AGENT_PREFIX}
You're Researcher — final pass, Round 4. Planner revised their plan based on your feedback. Be honest:
- Did they actually fix it or just nod and move on? Call it out if needed.
- Add the final layer of intelligence — the most important facts, numbers, or context that Synth needs for the deliverable
- Any tables, comparisons, benchmarks? Drop them in — Synth will use them
- End with 2–3 sentences: what does this team collectively think is the right move here?

Keep it direct, human. Synth is reading this whole conversation to write the final answer.`,
          },
          { role: 'user', content: `TASK: ${task}\n\n=== MY ORIGINAL RESEARCH ===\n${research}\n\n=== PLANNER'S REVISED PLAN ===\n${refinedPlan}\n\nAlright, final thoughts from me:` },
        ],
        signal,
        (tok) => appendAgentStream('researcher', tok),
      );

      setStatus('researcher', 'done');
      clearAgentStream('researcher');
      setOutputs(p => [...p, { id: 'researcher', text: `[Final Check]\n${finalResearch}` }]);

      // ── Round 5: Synth — writes the deliverable ────────────────────────
      setPhase('synthesizing');
      setStatus('synth', 'thinking');
      setAgentPhaseLabel(p => ({ ...p, synth: 'Writing the final answer…' }));
      clearAgentStream('synth');
      let full = '';
      setStreaming('');

      await groq(
        AGENTS[2].model,
        [
          {
            role: 'system',
            content: `${BLEUMR_AGENT_PREFIX}
You're Synth — you just watched Planner and Researcher go back and forth for four rounds: a plan, a pushback, a revision, a final check. Now you write the actual deliverable for the user. Not a recap of the conversation — the finished product.

- Pull the best of everything from both of them
- Write at professional consultant level: structured, specific, actionable
- Rich markdown: ## headers, numbered steps, bullets, tables where useful
- Real numbers, real examples, real timelines where available
- Thorough — this is a deep-work document, not a quick summary
- Close with "Next Steps": 3–5 things the user can act on today

This gets saved to the File Cabinet. Make it worth keeping.`,
          },
          {
            role: 'user',
            content: `TASK: ${task}

=== PLANNER (Round 1) ===
${plan}

=== RESEARCHER (Round 2) ===
${research}

=== PLANNER REVISED (Round 3) ===
${refinedPlan}

=== RESEARCHER FINAL (Round 4) ===
${finalResearch}

Write the complete final deliverable:`,
          },
        ],
        signal,
        (tok) => { full += tok; setStreaming(s => s + tok); appendAgentStream('synth', tok); },
      );

      setStatus('synth', 'done');
      clearAgentStream('synth');
      setOutputs(p => [...p, { id: 'synth', text: full }]);
      setStreaming('');
      setPhase('done');

      // Auto-save final deliverable to file cabinet
      const synthTask = task;
      const synthSlug = (synthTask.replace(/[^a-z0-9 ]/gi, '').trim().slice(0, 36).replace(/\s+/g, '_').toLowerCase()) || 'workspace_output';
      const autoFormats = detectFormats(full, synthTask);
      const autoFmt = autoFormats[0] ?? 'md';
      const autoContent = buildContent(full, autoFmt, synthTask);
      const savedAll = addWSFile({ name: synthSlug, content: autoContent, format: autoFmt, agentId: 'synth', task: synthTask, folder: '' });
      setWsFiles(savedAll);

    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[Workspace]', e.message);
      setPhase('idle');
      setStatuses({ planner: 'idle', researcher: 'idle', synth: 'idle' });
    }
  }, [apiKey, groq]);

  // Thin wrapper so the Launch button can still call run() reading from input state
  const run = useCallback(() => {
    if (!input.trim()) return;
    const task = input.trim();
    setInput('');
    runWithTask(task);
  }, [input, runWithTask]);

  const reset = () => {
    abortRef.current?.abort();
    setPhase('idle');
    setStatuses({ planner: 'idle', researcher: 'idle', synth: 'idle' });
    setAgentStreaming({ planner: '', researcher: '', synth: '' });
    setAgentPhaseLabel({ planner: '', researcher: '', synth: '' });
    setOutputs([]); setStreaming(''); setInput('');
  };

  const handleCabinetSave = (updated: WSFile[]) => {
    saveWSFiles(updated);
    setWsFiles(updated);
  };

  const handleCabinetDelete = (id: string) => {
    const next = wsFiles.filter(f => f.id !== id);
    saveWSFiles(next);
    setWsFiles(next);
  };

  const handleCabinetAnalyze = (file: WSFile) => {
    setCabinetOpen(false);
    const prompt = `Please analyze this document titled "${file.name}":\n\n${file.content.slice(0, 4000)}`;
    setTimeout(() => runWithTask(prompt), 200);
  };

  const isRunning = phase !== 'idle' && phase !== 'done';

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'linear-gradient(135deg,#04060e 0%,#060a18 60%,#040810 100%)', fontFamily: 'inherit' }}>

      {/* Minimal top bar — close + phase rail + view toggle */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-2">
          {phase !== 'idle' && <PhaseRail phase={phase} />}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {(['side', 'top'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
                style={{
                  background: viewMode === mode ? 'rgba(129,140,248,0.18)' : 'transparent',
                  color: viewMode === mode ? '#818cf8' : 'rgba(255,255,255,0.25)',
                  borderRight: mode === 'side' ? '1px solid rgba(255,255,255,0.06)' : undefined,
                }}>
                {mode === 'side' ? '⬛ Side' : '⬆ Top'}
              </button>
            ))}
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT: Office ────────────────────────────────────────── */}
        <div className="relative flex-1 overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>

          {/* ── Top view ── */}
          <AnimatePresence>
            {viewMode === 'top' && (
              <motion.div key="top" className="absolute inset-0 z-50"
                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25 }}>
                <TopViewOffice
                  statuses={statuses}
                  agentStreaming={agentStreaming}
                  agentPhaseLabel={agentPhaseLabel}
                  selected={selected}
                  onSelect={id => setSelected(p => p === id ? null : id)}
                  fileCount={wsFiles.length}
                  onCabinetClick={() => setCabinetOpen(true)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Base room fill ── */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#08090f 0%,#06080e 48%,#0a0c12 100%)' }} />

          {/* ── Ceiling — dark slab with subtle ambient ── */}
          <div className="absolute top-0 left-0 right-0" style={{ height: '8%', background: 'linear-gradient(180deg,#030408 0%,#050609 100%)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {/* Ceiling recessed light strips */}
            {[25, 50, 75].map(pct => (
              <div key={pct} className="absolute top-0" style={{ left: `${pct}%`, transform: 'translateX(-50%)', width: 60, height: '100%' }}>
                <div style={{ width: '100%', height: 2, background: 'linear-gradient(90deg,transparent,rgba(200,220,255,0.12),transparent)' }} />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full blur-lg" style={{ width: 40, height: 20, background: 'rgba(180,200,255,0.07)' }} />
              </div>
            ))}
          </div>

          {/* ── Back wall — textured paneling ── */}
          <div className="absolute left-0 right-0" style={{ top: '8%', height: '48%', background: 'linear-gradient(180deg,#0b0d15 0%,#090b13 100%)' }}>
            {/* Horizontal rail — chair rail height */}
            <div className="absolute left-0 right-0" style={{ bottom: 0, height: 1, background: 'rgba(255,255,255,0.055)' }} />
            <div className="absolute left-0 right-0" style={{ bottom: 3, height: 1, background: 'rgba(255,255,255,0.025)' }} />
            {/* Vertical panel dividers */}
            {[16.6, 33.3, 50, 66.6, 83.3].map(pct => (
              <div key={pct} className="absolute top-0 bottom-0" style={{ left: `${pct}%`, width: 1, background: 'linear-gradient(180deg,transparent,rgba(255,255,255,0.04),transparent)' }} />
            ))}
            {/* Subtle wall grain overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.008) 3px,rgba(255,255,255,0.008) 4px)', opacity: 0.6 }} />
            {/* Ambient ceiling bounce — soft warm bloom from desk lights */}
            <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: '40%', background: 'linear-gradient(0deg,rgba(99,102,241,0.04) 0%,transparent 100%)' }} />
          </div>

          {/* ── Wainscoting / lower wall panel ── */}
          <div className="absolute left-0 right-0" style={{ top: '56%', bottom: '16%', background: 'linear-gradient(180deg,#080a10 0%,#060810 100%)' }}>
            {/* Panel edge top */}
            <div className="absolute left-0 right-0 top-0" style={{ height: 2, background: 'rgba(255,255,255,0.05)' }} />
            {/* Baseboard bottom */}
            <div className="absolute left-0 right-0 bottom-0" style={{ height: 3, background: 'rgba(255,255,255,0.04)' }} />
            {/* Vertical groove lines on lower panel */}
            {[10, 22, 34, 46, 58, 70, 82, 94].map(pct => (
              <div key={pct} className="absolute top-2 bottom-2" style={{ left: `${pct}%`, width: 1, background: 'rgba(255,255,255,0.025)' }} />
            ))}
          </div>

          {/* ── Floor — dark hardwood planks ── */}
          <div className="absolute left-0 right-0 bottom-0" style={{ height: '16%', background: 'linear-gradient(180deg,#07080d 0%,#050609 100%)' }}>
            {/* Plank lines */}
            {[18, 36, 54, 72, 90].map(y => (
              <div key={y} className="absolute left-0 right-0" style={{ top: `${y}%`, height: 1, background: 'rgba(255,255,255,0.03)' }} />
            ))}
            {/* Plank end seams — random widths */}
            {[8, 28, 52, 76].map(x => (
              <div key={x} className="absolute top-0 bottom-0" style={{ left: `${x}%`, width: 1, background: 'rgba(255,255,255,0.025)' }} />
            ))}
            {/* Subtle floor gloss reflection */}
            <div className="absolute inset-x-0 top-0" style={{ height: '30%', background: 'linear-gradient(180deg,rgba(99,102,241,0.04) 0%,transparent 100%)' }} />
          </div>

          {/* ── Windows — much larger, more dramatic ── */}
          {([
            { style: { left: 18 }, nebulaColor: 'rgba(99,102,241,0.22)', dir: -1 as const },
            { style: { right: 18 }, nebulaColor: 'rgba(52,211,153,0.16)', dir: 1 as const },
          ]).map((w, wi) => (
            <div key={wi} className="absolute rounded-2xl overflow-hidden"
              style={{
                width: 168, height: 210,
                top: '9%',
                ...w.style,
                background: '#010308',
                border: '1.5px solid rgba(255,255,255,0.14)',
                boxShadow: `inset 0 0 60px rgba(0,0,10,0.9), 0 0 0 3px rgba(255,255,255,0.03), 0 8px 40px rgba(0,0,0,0.6), 0 0 60px ${w.nebulaColor.replace('0.22','0.08').replace('0.16','0.06')}`,
              }}>

              {/* Deep space bg */}
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 20%, #050826 0%, #010210 60%, #010308 100%)' }} />

              {/* Star layer 1 — slow drift */}
              <motion.div className="absolute inset-0"
                animate={{ x: [0, w.dir * 40, 0] }}
                transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}>
                {Array.from({ length: 38 }).map((_, si) => {
                  const sx = ((si * 41 + wi * 17) % 220) - 30;
                  const sy = ((si * 29 + wi * 11) % 95) + 2;
                  const sz = si % 5 === 0 ? 2.5 : si % 3 === 0 ? 1.5 : 1;
                  return (
                    <motion.div key={si} className="absolute rounded-full"
                      style={{ left: sx, top: `${sy}%`, width: sz, height: sz, background: si % 6 === 0 ? '#a5b4fc' : si % 4 === 0 ? '#67e8f9' : si % 7 === 0 ? '#fde68a' : '#ffffff' }}
                      animate={{ opacity: [0.1, si % 3 === 0 ? 1 : 0.65, 0.1] }}
                      transition={{ duration: 2 + (si % 5) * 1.3, repeat: Infinity, delay: (si * 0.3) % 6 }}
                    />
                  );
                })}
              </motion.div>

              {/* Star layer 2 — faster, opposite */}
              <motion.div className="absolute inset-0"
                animate={{ x: [0, w.dir * -24, 0] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}>
                {Array.from({ length: 18 }).map((_, si) => {
                  const sx = ((si * 67 + wi * 23 + 10) % 190) - 20;
                  const sy = ((si * 47 + wi * 19 + 5) % 90) + 5;
                  return (
                    <motion.div key={si} className="absolute rounded-full"
                      style={{ left: sx, top: `${sy}%`, width: 1, height: 1, background: '#ffffff', opacity: 0.35 }}
                      animate={{ opacity: [0.08, 0.55, 0.08] }}
                      transition={{ duration: 3 + (si % 4), repeat: Infinity, delay: (si * 0.5) % 5 }}
                    />
                  );
                })}
              </motion.div>

              {/* Nebula 1 — large, drifting */}
              <motion.div className="absolute rounded-full blur-2xl pointer-events-none"
                style={{ width: 130, height: 90, left: '-15%', top: '10%', background: w.nebulaColor }}
                animate={{ x: [0, w.dir * 30, 0], opacity: [0.45, 0.85, 0.45] }}
                transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut', delay: wi * 2 }}
              />

              {/* Nebula 2 — smaller, different color */}
              <motion.div className="absolute rounded-full blur-xl pointer-events-none"
                style={{ width: 70, height: 50, right: '-10%', top: '50%', background: wi === 0 ? 'rgba(34,211,238,0.15)' : 'rgba(129,140,248,0.15)' }}
                animate={{ x: [0, w.dir * -20, 0], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: wi * 3 + 2 }}
              />

              {/* Shooting star */}
              <motion.div className="absolute rounded-full"
                style={{ width: 32, height: 1.5, top: '28%', left: '-25%', background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.9), white)`, opacity: 0 }}
                animate={{ left: ['-25%', '130%'], opacity: [0, 0.9, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 7 + wi * 5, ease: 'easeIn' }}
              />

              {/* Second shooting star */}
              <motion.div className="absolute rounded-full"
                style={{ width: 20, height: 1, top: '60%', left: '-25%', background: `linear-gradient(90deg, transparent, rgba(167,200,255,0.7))`, opacity: 0 }}
                animate={{ left: ['-25%', '130%'], opacity: [0, 0.6, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 12 + wi * 3, ease: 'easeIn', delay: 4 }}
              />

              {/* Window cross frame — 4-pane look */}
              <div className="absolute inset-x-0 top-1/2 pointer-events-none" style={{ height: 4, background: 'linear-gradient(180deg,rgba(20,24,40,0.9),rgba(30,35,55,0.9))', zIndex: 3, marginTop: -2 }} />
              <div className="absolute inset-y-0 left-1/2 pointer-events-none" style={{ width: 4, background: 'linear-gradient(90deg,rgba(20,24,40,0.9),rgba(30,35,55,0.9))', zIndex: 3, marginLeft: -2 }} />

              {/* Frame edge highlight */}
              <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.07), inset 3px 3px 0 rgba(255,255,255,0.04), inset -1px -1px 0 rgba(0,0,0,0.5)' }} />

              {/* Window light spill onto wall (outside window) */}
              <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: 8, background: `linear-gradient(0deg,${w.nebulaColor.replace(/[\d.]+\)$/, '0.4)')},transparent)`, zIndex: 4, filter: 'blur(4px)' }} />
            </div>
          ))}

          {/* Window sill ledges */}
          {[{ left: 18 }, { right: 18 }].map((pos, wi) => (
            <div key={wi} className="absolute rounded-b-sm"
              style={{
                width: 178, height: 8, top: 'calc(9% + 210px)',
                ...pos,
                background: 'linear-gradient(180deg,#1a1d28,#12141e)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }} />
          ))}

          {/* ── Ambient light pools from windows onto floor ── */}
          <div className="absolute pointer-events-none" style={{ left: 0, width: 200, bottom: '16%', height: 80, background: 'radial-gradient(ellipse 80% 50% at 30% 100%,rgba(99,102,241,0.06) 0%,transparent 70%)' }} />
          <div className="absolute pointer-events-none" style={{ right: 0, width: 200, bottom: '16%', height: 80, background: 'radial-gradient(ellipse 80% 50% at 70% 100%,rgba(52,211,153,0.05) 0%,transparent 70%)' }} />

          {/* ── File cabinet — centered on back wall, just below the sign ── */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 'calc(10% + 152px)', zIndex: 10 }}>
            <FileCabinetVisual fileCount={wsFiles.length} onClick={() => setCabinetOpen(true)} />
          </div>

          {/* Bleumr Workspace — etched into back wall */}
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{ top: '10%', width: 200 }}>
            <div className="relative flex flex-col items-center px-5 py-4 rounded-2xl"
              style={{
                background: 'linear-gradient(160deg, rgba(255,255,255,0.018) 0%, rgba(255,255,255,0.006) 100%)',
                boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.7), inset 0 -1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
              <InlineStarSphere size={64} />
              <div className="mt-3 flex flex-col items-center gap-0.5">
                <motion.span className="tracking-[0.25em] font-bold text-[12px] uppercase"
                  style={{ color: 'rgba(255,255,255,0.6)', textShadow: '0 0 16px rgba(129,140,248,0.4)' }}
                  animate={{ opacity: [0.45, 0.75, 0.45] }}
                  transition={{ duration: 4, repeat: Infinity }}>
                  BLEUMR
                </motion.span>
                <span className="tracking-[0.2em] text-[7px] font-semibold uppercase"
                  style={{ color: 'rgba(129,140,248,0.45)' }}>
                  MISSION TEAM
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                {['#818cf8','#22d3ee','#34d399'].map((c, i) => (
                  <motion.div key={i} className="rounded-full"
                    style={{ width: 22, height: 2, background: c }}
                    animate={{ opacity: [0.25, 0.6, 0.25] }}
                    transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4 }}
                  />
                ))}
              </div>
              <div className="absolute top-0 inset-x-4 h-px rounded-full"
                style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)' }} />
            </div>
          </div>

          {/* ── Data packets ── */}
          <AnimatePresence>
            {statuses.researcher === 'thinking' && (
              <DataPacket fromPct="20%" toPct="44%" color={AGENTS[0].accent} delay={0} />
            )}
            {statuses.synth === 'thinking' && (
              <DataPacket fromPct="46%" toPct="70%" color={AGENTS[1].accent} delay={0} />
            )}
          </AnimatePresence>

          {/* ── Agent stations ── */}
          <div className="absolute bottom-14 left-0 right-0 flex items-end justify-around px-8">
            {AGENTS.map(agent => (
              <div key={agent.id} className="flex flex-col items-center">
                <SeatedCharacter
                  agent={agent}
                  status={statuses[agent.id]}
                  selected={selected === agent.id}
                  onClick={() => setSelected(p => p === agent.id ? null : agent.id)}
                  streamText={agentStreaming[agent.id]}
                  phaseLabel={agentPhaseLabel[agent.id]}
                />
                <Desk agent={agent} status={statuses[agent.id]} />
              </div>
            ))}
          </div>

          {/* ── Floor fade ── */}
          <div className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none"
            style={{ background: 'linear-gradient(180deg,rgba(5,7,14,0) 0%,rgba(3,4,9,0.96) 100%)' }} />

          {/* ── File Cabinet Panel overlay ── */}
          <AnimatePresence>
            {cabinetOpen && (
              <FileCabinetPanel
                files={wsFiles}
                onClose={() => setCabinetOpen(false)}
                onSave={handleCabinetSave}
                onDelete={handleCabinetDelete}
                onAnalyze={handleCabinetAnalyze}
              />
            )}
          </AnimatePresence>

          {/* ── Status dots ── */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-around px-8">
            {AGENTS.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ background: 'rgba(5,7,18,0.92)', border: `1px solid ${statuses[a.id] !== 'idle' ? `${a.accent}45` : 'rgba(255,255,255,0.06)'}`, backdropFilter: 'blur(16px)' }}>
                <motion.div className="h-1.5 w-1.5 rounded-full" style={{ background: a.accent }}
                  animate={{ opacity: statuses[a.id] === 'thinking' ? [1, 0.2, 1] : statuses[a.id] === 'done' ? 1 : 0.2 }}
                  transition={{ duration: 0.7, repeat: statuses[a.id] === 'thinking' ? Infinity : 0 }}
                />
                <span className="text-[9px] font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.name}</span>
              </div>
            ))}
          </div>

          {/* Selected agent card */}
          <AnimatePresence>
            {selected && (() => {
              const a = AGENTS.find(x => x.id === selected)!;
              const out = outputs.find(o => o.id === selected);
              const s = statuses[selected];
              return (
                <motion.div key={selected}
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-2xl p-4 shadow-2xl"
                  style={{ width: 280, background: 'rgba(5,8,18,0.97)', border: `1px solid ${a.accent}35`, backdropFilter: 'blur(24px)', boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px ${a.accent}18`, zIndex: 20 }}
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: a.accentDim }}>
                      <a.Icon style={{ width: 18, height: 18, color: a.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-white">{a.name}</div>
                      <div className="text-[10px] font-semibold" style={{ color: a.accent }}>{a.title}</div>
                    </div>
                    <div>
                      {s === 'thinking' && <span className="text-[10px] font-semibold animate-pulse" style={{ color: a.accent }}>Working…</span>}
                      {s === 'done' && <span className="text-[10px] font-semibold text-emerald-400">✓ Done</span>}
                      {s === 'idle' && <span className="text-[10px] text-slate-600">Idle</span>}
                    </div>
                  </div>
                  <p className="text-[12px] leading-relaxed line-clamp-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {out ? out.text : a.role}
                  </p>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* ── RIGHT: Glass panel ─────────────────────────────────────── */}
        <div className="w-[340px] flex flex-col shrink-0 relative overflow-hidden"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.045)', backdropFilter: 'blur(32px) saturate(140%)' }}>

          {/* Foggy aura background layers */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(4,5,16,0.42)' }} />
          {/* Indigo aura — top */}
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-56 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.13) 0%, rgba(99,102,241,0.04) 50%, transparent 75%)', filter: 'blur(32px)' }} />
          {/* Cyan aura — mid */}
          <div className="absolute top-1/3 -right-8 w-56 h-64 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(6,182,212,0.09) 0%, rgba(6,182,212,0.03) 50%, transparent 75%)', filter: 'blur(40px)' }} />
          {/* Emerald aura — bottom */}
          <div className="absolute -bottom-12 left-8 w-60 h-48 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 55%, transparent 80%)', filter: 'blur(40px)' }} />
          {/* Fine fog veil */}
          <div className="absolute inset-0 pointer-events-none opacity-60"
            style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.04) 0%, transparent 40%, rgba(16,185,129,0.03) 100%)' }} />
          {/* Left rim glow */}
          <div className="absolute left-0 top-0 bottom-0 w-px pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.25), rgba(6,182,212,0.12) 50%, rgba(16,185,129,0.15))' }} />

          {/* Output feed — transparent, scrollable */}
          <div className="relative z-10 flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-2.5" style={{ scrollbarWidth: 'none' }}>

            {/* Empty state */}
            {outputs.length === 0 && phase === 'idle' && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                <p className="text-[13px] font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>Team is ready</p>
                <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.12)' }}>
                  Type a task and launch to begin.
                </p>
              </div>
            )}

            {/* Output cards */}
            {outputs.map(o => {
              const a = AGENTS.find(x => x.id === o.id)!;
              const isFinal = o.id === 'synth';
              const isLarge = o.text.length > 700;

              const slug = (outputs.find(x => x.id === 'planner')?.text ?? 'workspace')
                .split('\n')[0].replace(/[^a-z0-9 ]/gi, '').trim().slice(0, 40).replace(/\s+/g, '_').toLowerCase() || 'workspace_output';

              const formats = detectFormats(o.text, lastTask);
              const doDownload = (fmt: ExportFormat) => {
                const meta = FORMAT_META.find(m => m.ext === fmt)!;
                triggerDownload(buildContent(o.text, fmt, lastTask), `${slug}.${fmt}`, meta.mime);
              };

              return (
                <motion.div key={o.id}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.22 }}
                  className="rounded-2xl p-3.5"
                  style={{
                    background: isFinal
                      ? `linear-gradient(135deg,${a.accent}14,${a.accent}08)`
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isFinal ? `${a.accent}30` : 'rgba(255,255,255,0.06)'}`,
                    backdropFilter: 'blur(20px)',
                    boxShadow: isFinal ? `0 0 32px ${a.accent}10, inset 0 1px 0 rgba(255,255,255,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                  }}>
                  {/* Header row */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${a.accent}18` }}>
                      <a.Icon style={{ width: 12, height: 12, color: a.accent }} />
                    </div>
                    <span className="text-[11px] font-bold flex-1" style={{ color: isFinal ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)' }}>{a.name}</span>
                    {isFinal && <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full" style={{ color: a.accent, background: `${a.accent}18`, border: `1px solid ${a.accent}30` }}>Final</span>}
                    <CheckCircle2 style={{ width: 13, height: 13, color: '#34d399', opacity: 0.8, flexShrink: 0 }} />
                  </div>

                  {/* Inline content (short only) */}
                  {!isLarge && (
                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap mb-2.5"
                      style={{ color: isFinal ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)', display: '-webkit-box', WebkitLineClamp: isFinal ? 999 : 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {o.text}
                    </p>
                  )}

                  {/* Export strip */}
                  {(isLarge || isFinal) && (
                    <div className={!isLarge ? 'pt-2 mt-2' : ''} style={!isLarge ? { borderTop: `1px solid ${a.accent}15` } : {}}>
                      <p className="text-[8px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.18)' }}>Export</p>
                      <div className="flex flex-wrap gap-1">
                        {formats.map(fmt => {
                          const meta = FORMAT_META.find(m => m.ext === fmt)!;
                          const isPrimary = fmt === formats[0];
                          return (
                            <button key={fmt} onClick={() => doDownload(fmt)}
                              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold transition-all hover:scale-105 active:scale-95"
                              style={{
                                background: isPrimary ? `${a.accent}20` : 'rgba(255,255,255,0.04)',
                                color: isPrimary ? a.accent : 'rgba(255,255,255,0.3)',
                                border: `1px solid ${isPrimary ? `${a.accent}40` : 'rgba(255,255,255,0.08)'}`,
                                backdropFilter: 'blur(8px)',
                              }}>
                              {meta.icon} {meta.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Live synth stream */}
            <AnimatePresence>
              {streaming && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-2xl p-3.5"
                  style={{ background: `linear-gradient(135deg,${AGENTS[2].accent}12,${AGENTS[2].accent}06)`, border: `1px solid ${AGENTS[2].accent}28`, backdropFilter: 'blur(20px)', boxShadow: `0 0 24px ${AGENTS[2].accent}10` }}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${AGENTS[2].accent}20` }}>
                      <Orbit style={{ width: 12, height: 12, color: AGENTS[2].accent }} />
                    </div>
                    <span className="text-[11px] font-bold text-white/70 flex-1">Synth</span>
                    <motion.div className="flex gap-0.5" animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 0.75, repeat: Infinity }}>
                      {[0,1,2].map(i => <div key={i} className="h-1 w-1 rounded-full" style={{ background: AGENTS[2].accent }} />)}
                    </motion.div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg,${AGENTS[2].accent},${AGENTS[2].accent}80)` }}
                        animate={{ width: `${Math.min(Math.round(streaming.length / 40), 100)}%` }}
                        transition={{ duration: 0.35 }} />
                    </div>
                    <span className="text-[9px] font-semibold tabular-nums shrink-0" style={{ color: AGENTS[2].accent }}>
                      {streaming.length.toLocaleString()}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Thinking indicator */}
            <AnimatePresence>
              {isRunning && !streaming && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)' }}>
                  {(() => {
                    const a = AGENTS.find(x => statuses[x.id] === 'thinking') ?? AGENTS[0];
                    return (
                      <>
                        <div className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${a.accent}18` }}>
                          <a.Icon style={{ width: 12, height: 12, color: a.accent }} />
                        </div>
                        <span className="text-[11px] flex-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{a.name} is thinking…</span>
                        <motion.div className="flex gap-0.5" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.9, repeat: Infinity }}>
                          {[0,1,2].map(i => <div key={i} className="h-1 w-1 rounded-full" style={{ background: `${a.accent}80` }} />)}
                        </motion.div>
                      </>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={bottomRef} />
          </div>

          {/* ── Glass input bar — same language as main chat ── */}
          <div className="relative z-10 px-3 pb-4 pt-2 shrink-0">
            {/* Gradient border ring */}
            <div className="rounded-2xl p-px transition-all duration-500"
              style={{
                background: input.trim()
                  ? 'linear-gradient(135deg,rgba(129,140,248,0.55),rgba(34,211,238,0.3),rgba(129,140,248,0.2))'
                  : 'linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.04))',
              }}>
              <div className="relative rounded-[14px] overflow-hidden"
                style={{
                  background: 'rgba(4,6,14,0.45)',
                  backdropFilter: 'blur(40px) saturate(160%)',
                  boxShadow: input.trim()
                    ? 'inset 0 1.5px 0 rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.4)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.07)',
                }}>

                {/* Top caustic rim */}
                <div className="absolute top-0 left-[8%] right-[8%] h-px pointer-events-none"
                  style={{ background: input.trim()
                    ? 'linear-gradient(90deg,transparent,rgba(255,255,255,0.45) 30%,rgba(255,255,255,0.45) 70%,transparent)'
                    : 'linear-gradient(90deg,transparent,rgba(255,255,255,0.14) 40%,rgba(255,255,255,0.14) 60%,transparent)',
                    filter: 'blur(0.3px)' }} />

                {/* Glass refraction */}
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(130deg,rgba(255,255,255,0.04) 0%,transparent 50%,rgba(255,255,255,0.01) 100%)', mixBlendMode: 'overlay' }} />

                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isRunning) run(); }}
                  placeholder="Give the team a task…"
                  rows={2}
                  disabled={isRunning}
                  className="relative z-10 w-full resize-none px-4 pt-3.5 pb-2 text-[13px] text-white placeholder-white/20 outline-none bg-transparent leading-relaxed"
                  style={{ caretColor: '#818cf8', fontFamily: 'inherit' }}
                />

                {/* Action row */}
                <div className="relative z-10 flex items-center gap-2 px-3 pb-3">
                  <span className="text-[9px] font-semibold uppercase tracking-widest flex-1" style={{ color: 'rgba(255,255,255,0.14)' }}>
                    {isRunning ? 'Team is working…' : phase === 'done' ? 'Run again anytime' : '⌘↵ to launch'}
                  </span>

                  {/* Clear / stop */}
                  <AnimatePresence>
                    {(isRunning || outputs.length > 0) && (
                      <motion.button initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.8 }}
                        onClick={reset}
                        className="h-7 w-7 rounded-full flex items-center justify-center transition-all"
                        style={{ background: isRunning ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', border: isRunning ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.08)' }}>
                        <X style={{ width: 11, height: 11, color: isRunning ? '#f87171' : 'rgba(255,255,255,0.35)' }} />
                      </motion.button>
                    )}
                  </AnimatePresence>

                  {/* Launch button */}
                  <motion.button
                    onClick={isRunning ? reset : run}
                    disabled={!isRunning && !input.trim()}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1.5 px-3.5 h-8 rounded-full text-[11px] font-bold transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                    style={isRunning
                      ? { background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }
                      : { background: input.trim() ? 'linear-gradient(135deg,#6366f1,#818cf8)' : 'rgba(99,102,241,0.12)', border: input.trim() ? 'none' : '1px solid rgba(99,102,241,0.2)', color: 'white', boxShadow: input.trim() ? '0 0 18px rgba(99,102,241,0.4)' : 'none' }}>
                    {isRunning
                      ? <><X style={{ width: 10, height: 10 }} /> Stop</>
                      : <><Zap style={{ width: 10, height: 10 }} /> {phase === 'done' ? 'Again' : 'Launch'}</>
                    }
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
