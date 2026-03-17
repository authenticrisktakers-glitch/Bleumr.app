import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search, Layers3, X, Zap, CheckCircle2, Bot, FlaskConical, Orbit, Sparkles } from 'lucide-react';
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
    Icon: Search,
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

function SeatedCharacter({ agent, status, selected, onClick, streamText, phaseLabel }: {
  agent: typeof AGENTS[number];
  status: AgentStatus;
  selected: boolean;
  onClick: () => void;
  streamText?: string;
  phaseLabel?: string;
}) {
  const thinking = status === 'thinking';
  const done = status === 'done';

  // Extract the last complete sentence from the stream so it reads like
  // the agent is actually communicating a thought, not dumping raw tokens.
  const bubbleText = (() => {
    if (!streamText || streamText.length < 8) return '';
    const clean = streamText.replace(/\s+/g, ' ').replace(/[#*`>_~]/g, '').trim();
    // Find the last complete sentence (ends with . ! ?)
    const sentenceEnd = /[.!?]/g;
    let lastIdx = -1;
    let m: RegExpExecArray | null;
    while ((m = sentenceEnd.exec(clean)) !== null) lastIdx = m.index;
    if (lastIdx > 20) {
      // Walk back to find the sentence start (after previous . ! ?)
      const prev = clean.lastIndexOf('.', lastIdx - 1);
      const prev2 = clean.lastIndexOf('!', lastIdx - 1);
      const prev3 = clean.lastIndexOf('?', lastIdx - 1);
      const start = Math.max(prev, prev2, prev3);
      const sentence = clean.slice(start > 0 ? start + 2 : 0, lastIdx + 1).trim();
      if (sentence.length > 8 && sentence.length <= 120) return sentence;
    }
    // Fallback: last clean chunk of words, max 90 chars
    return clean.slice(-90).replace(/^\S+\s/, '').trim();
  })();
  const hasBubbleText = bubbleText.length > 6;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center outline-none select-none"
      style={{ cursor: 'pointer' }}
    >
      {/* Speech / thought bubble */}
      <AnimatePresence mode="wait">
        {thinking && hasBubbleText && (
          <motion.div key="speech"
            initial={{ opacity: 0, y: 6, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88, y: 4 }}
            transition={{ duration: 0.18 }}
            className="absolute pointer-events-none"
            style={{
              bottom: '115%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 180,
              zIndex: 50,
            }}
          >
            {/* Bubble body */}
            <div className="relative rounded-2xl px-3 py-2.5"
              style={{
                background: `linear-gradient(135deg, rgba(10,12,28,0.97), rgba(6,8,20,0.97))`,
                border: `1px solid ${agent.accent}55`,
                boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px ${agent.accent}18, inset 0 1px 0 rgba(255,255,255,0.05)`,
                backdropFilter: 'blur(16px)',
              }}
            >
              {/* Accent top bar */}
              <div className="absolute top-0 left-4 right-4 h-px rounded-full"
                style={{ background: `linear-gradient(90deg, transparent, ${agent.accent}80, transparent)` }} />

              {/* Phase label — what this agent is currently doing */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <motion.div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: agent.accent }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 0.7, repeat: Infinity }}
                />
                <span className="text-[8px] font-semibold" style={{ color: agent.accent }}>
                  {phaseLabel || agent.name}
                </span>
              </div>

              {/* Last complete thought from stream */}
              <p className="text-[10.5px] leading-snug" style={{ color: 'rgba(255,255,255,0.82)', wordBreak: 'break-word', fontStyle: 'normal' }}>
                "{bubbleText}"
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.55, repeat: Infinity }}
                  style={{ color: agent.accent, fontWeight: 700, fontStyle: 'normal', marginLeft: 2 }}
                >▋</motion.span>
              </p>
            </div>

            {/* Bubble tail pointing down to character */}
            <div className="absolute left-1/2 -translate-x-1/2"
              style={{
                bottom: -7,
                width: 0, height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: `8px solid ${agent.accent}55`,
              }}
            />
            <div className="absolute left-1/2 -translate-x-1/2"
              style={{
                bottom: -6,
                width: 0, height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '7px solid rgba(6,8,20,0.97)',
              }}
            />
          </motion.div>
        )}

        {thinking && !hasBubbleText && (
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
<p class="meta">Generated ${new Date().toLocaleString()} · Bleumr Workspace · 3-agent synthesis</p>
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
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoRunFired = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [outputs, streaming]);

  // Auto-run when arriving from a JUMARI chat handoff
  useEffect(() => {
    if (initialTask && !autoRunFired.current && apiKey) {
      autoRunFired.current = true;
      setInput(initialTask);
      // Slight delay so the page is fully mounted before firing
      setTimeout(() => {
        setInput('');
        runWithTask(initialTask);
      }, 600);
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
      // ── Round 1: Planner — deep initial breakdown ─────────────────────
      setPhase('planning');
      setStatus('planner', 'thinking');
      setAgentPhaseLabel(p => ({ ...p, planner: 'Mapping the strategy…' }));
      clearAgentStream('planner');

      const plan = await groq(
        AGENTS[0].model,
        [
          {
            role: 'system',
            content: `You are Planner — the strategic architect on a three-agent research team (Planner, Researcher, Synth). This is NOT a quick-answer tool. The team is built for deep, thorough, collaborative work. Your job in this first round is to:
1. Fully understand the scope and hidden complexity of the task.
2. Break it into a detailed, numbered execution plan (6–10 steps minimum). Each step must be specific — not vague headings.
3. Flag at least 3 assumptions you're making that Researcher should verify or challenge.
4. Identify what information would change the plan if it were different.
Think like a senior consultant drafting a project brief. No shortcuts.`,
          },
          { role: 'user', content: `TASK: ${task}\n\nDraft your full strategic plan and flag your assumptions for Researcher:` },
        ],
        signal,
        (tok) => appendAgentStream('planner', tok),
      );

      setStatus('planner', 'done');
      clearAgentStream('planner');
      setOutputs(p => [...p, { id: 'planner', text: plan }]);

      // ── Round 2: Researcher — deep critique + evidence ────────────────
      setPhase('researching');
      setStatus('researcher', 'thinking');
      setAgentPhaseLabel(p => ({ ...p, researcher: 'Challenging the plan…' }));
      clearAgentStream('researcher');

      const research = await groq(
        AGENTS[1].model,
        [
          {
            role: 'system',
            content: `You are Researcher — the evidence and critical thinking expert on a three-agent team. Planner has laid out a strategic plan. Your job is thorough and challenging — not supportive cheerleading:
1. Challenge every assumption Planner stated. State whether each is valid, partially valid, or wrong, and explain why with specifics.
2. Identify gaps, risks, edge cases, and overlooked factors in the plan. Be brutal but constructive.
3. Provide concrete supporting material: real-world examples, known failure modes, relevant data points, industry patterns, or case studies.
4. Propose at least 2 alternative angles or approaches Planner may not have considered.
5. End with a prioritized list of corrections Planner must incorporate in the revision.
This is deep research, not a summary. Be exhaustive.`,
          },
          { role: 'user', content: `TASK: ${task}\n\n=== PLANNER'S PLAN ===\n${plan}\n\nProvide your full research, critique, and corrections:` },
        ],
        signal,
        (tok) => appendAgentStream('researcher', tok),
      );

      setStatus('researcher', 'done');
      clearAgentStream('researcher');
      setOutputs(p => [...p, { id: 'researcher', text: research }]);

      // ── Round 3: Planner — absorbs research, revises deeply ──────────
      setPhase('planning');
      setStatus('planner', 'thinking');
      setAgentPhaseLabel(p => ({ ...p, planner: 'Revising after research…' }));
      clearAgentStream('planner');

      const refinedPlan = await groq(
        AGENTS[0].model,
        [
          {
            role: 'system',
            content: `You are Planner in your second pass. Researcher has challenged your assumptions, added evidence, and flagged gaps. You must now:
1. Explicitly address every correction Researcher raised — either incorporate it or explain why you disagree.
2. Produce a significantly improved, detailed revised plan. This should be substantially different from and better than your first draft.
3. Incorporate the evidence and examples Researcher provided where they strengthen the plan.
4. Add implementation specifics: timelines, metrics for success, resource requirements, risk mitigations.
Do not just tweak the original — rebuild it properly with everything you now know.`,
          },
          { role: 'user', content: `TASK: ${task}\n\n=== YOUR ORIGINAL PLAN ===\n${plan}\n\n=== RESEARCHER'S CRITIQUE & FINDINGS ===\n${research}\n\nWrite your substantially revised and improved plan:` },
        ],
        signal,
        (tok) => appendAgentStream('planner', tok),
      );

      setStatus('planner', 'done');
      clearAgentStream('planner');
      setOutputs(p => [...p, { id: 'planner', text: `[Revised Plan]\n${refinedPlan}` }]);

      // ── Round 4: Researcher — validates revision, final intelligence ──
      setPhase('researching');
      setStatus('researcher', 'thinking');
      setAgentPhaseLabel(p => ({ ...p, researcher: 'Validating the revision…' }));
      clearAgentStream('researcher');

      const finalResearch = await groq(
        AGENTS[1].model,
        [
          {
            role: 'system',
            content: `You are Researcher in your second pass. Planner has revised their strategy based on your critique. Now:
1. Validate the revision — did Planner actually address your concerns? Call out anything still missing or weak.
2. Add your final layer of intelligence: the deepest, most specific facts, data, or context that will make the final output exceptional.
3. Provide any structured data (tables, comparisons, benchmarks) that Synth should include in the final deliverable.
4. Write a brief "team verdict" — 2–3 sentences summarizing what you both agree the best path forward is.
This is your last input before Synth writes the final answer. Make it count.`,
          },
          { role: 'user', content: `TASK: ${task}\n\n=== YOUR ORIGINAL RESEARCH ===\n${research}\n\n=== PLANNER'S REVISED PLAN ===\n${refinedPlan}\n\nFinal validation, additional intelligence, and team verdict:` },
        ],
        signal,
        (tok) => appendAgentStream('researcher', tok),
      );

      setStatus('researcher', 'done');
      clearAgentStream('researcher');
      setOutputs(p => [...p, { id: 'researcher', text: `[Final Intelligence]\n${finalResearch}` }]);

      // ── Round 5: Synth — reads full dialogue, writes the deliverable ──
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
            content: `You are Synth — the final composer on the team. You have just read a complete multi-round collaboration between Planner and Researcher: two full planning passes and two research passes. Your job is to synthesize everything into a single, world-class deliverable. This is NOT a summary — it is the final product.
Rules:
- Use the best ideas from both agents across all rounds.
- Write at professional consultant quality: structured, specific, actionable.
- Use rich markdown formatting: ## headers, bullet lists, numbered steps, tables, code blocks where appropriate.
- Include concrete examples, metrics, timelines, and data where available.
- Length matters here — this is a deep-work output. Be thorough, not brief.
- End with a "Next Steps" section with 3–5 immediately actionable items.`,
          },
          {
            role: 'user',
            content: `TASK: ${task}

=== PLANNER — ROUND 1 ===
${plan}

=== RESEARCHER — ROUND 1 ===
${research}

=== PLANNER — ROUND 2 (REVISED) ===
${refinedPlan}

=== RESEARCHER — ROUND 2 (FINAL INTELLIGENCE) ===
${finalResearch}

Write the complete, polished final deliverable:`,
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

  const isRunning = phase !== 'idle' && phase !== 'done';

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'linear-gradient(135deg,#04060e 0%,#060a18 60%,#040810 100%)', fontFamily: 'inherit' }}>

      {/* Minimal top bar — just close + phase rail */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-2">
          {phase !== 'idle' && <PhaseRail phase={phase} />}
        </div>
        <button onClick={onClose}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT: Office ────────────────────────────────────────── */}
        <div className="relative flex-1 overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>

          {/* Room bg */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 0%,rgba(99,102,241,0.07) 0%,transparent 70%), linear-gradient(180deg,#07090f 0%,#050710 100%)' }} />

          {/* Back wall */}
          <div className="absolute top-0 left-0 right-0" style={{ height: '52%', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'linear-gradient(180deg,rgba(255,255,255,0.015) 0%,rgba(255,255,255,0.005) 100%)' }} />

          {/* Windows — moving starfield, space-station view */}
          {([
            { style: { left: 24 }, nebulaColor: 'rgba(99,102,241,0.18)', dir: -1 },
            { style: { right: 24 }, nebulaColor: 'rgba(52,211,153,0.14)', dir: 1 },
          ] as const).map((w, wi) => (
            <div key={wi} className="absolute top-4 rounded-2xl overflow-hidden"
              style={{ width: 94, height: 124, ...w.style, background: '#010308', border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 0 30px rgba(0,0,10,0.8), 0 0 0 1px rgba(255,255,255,0.04)' }}>

              {/* Deep space background */}
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 20%, #05082a 0%, #010308 100%)' }} />

              {/* Star layer 1 — slow drift across */}
              <motion.div className="absolute inset-0"
                animate={{ x: [0, w.dir * 30, 0] }}
                transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}>
                {Array.from({ length: 22 }).map((_, si) => {
                  const sx = ((si * 41 + wi * 17) % 140) - 25;
                  const sy = ((si * 29 + wi * 11) % 95) + 2;
                  const sz = si % 4 === 0 ? 2 : 1;
                  return (
                    <motion.div key={si} className="absolute rounded-full"
                      style={{ left: sx, top: `${sy}%`, width: sz, height: sz, background: si % 6 === 0 ? '#a5b4fc' : si % 4 === 0 ? '#67e8f9' : '#ffffff' }}
                      animate={{ opacity: [0.15, si % 3 === 0 ? 1 : 0.6, 0.15] }}
                      transition={{ duration: 2 + (si % 4) * 1.5, repeat: Infinity, delay: (si * 0.35) % 5 }}
                    />
                  );
                })}
              </motion.div>

              {/* Star layer 2 — slightly faster, opposite direction */}
              <motion.div className="absolute inset-0"
                animate={{ x: [0, w.dir * -18, 0] }}
                transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}>
                {Array.from({ length: 12 }).map((_, si) => {
                  const sx = ((si * 67 + wi * 23 + 10) % 120) - 15;
                  const sy = ((si * 47 + wi * 19 + 5) % 90) + 5;
                  return (
                    <motion.div key={si} className="absolute rounded-full"
                      style={{ left: sx, top: `${sy}%`, width: 1, height: 1, background: '#ffffff', opacity: 0.4 }}
                      animate={{ opacity: [0.1, 0.5, 0.1] }}
                      transition={{ duration: 3 + (si % 3), repeat: Infinity, delay: (si * 0.6) % 4 }}
                    />
                  );
                })}
              </motion.div>

              {/* Nebula cloud — drifts slowly */}
              <motion.div className="absolute rounded-full blur-xl pointer-events-none"
                style={{ width: 70, height: 50, left: '-10%', top: '15%', background: w.nebulaColor }}
                animate={{ x: [0, w.dir * 20, 0], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: wi * 2 }}
              />

              {/* Shooting star */}
              <motion.div className="absolute rounded-full"
                style={{ width: 20, height: 1, top: '30%', left: '-20%', background: `linear-gradient(90deg, transparent, white)`, opacity: 0 }}
                animate={{ left: ['-20%', '120%'], opacity: [0, 0.8, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 6 + wi * 4, ease: 'easeIn' }}
              />

              {/* Window frame cross */}
              <div className="absolute inset-x-0 top-1/2 h-px pointer-events-none" style={{ background: 'rgba(255,255,255,0.12)', zIndex: 2 }} />
              <div className="absolute inset-y-0 left-1/2 w-px pointer-events-none" style={{ background: 'rgba(255,255,255,0.12)', zIndex: 2 }} />

              {/* Inner window bevel */}
              <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.06), inset 2px 2px 0 rgba(255,255,255,0.04)' }} />
            </div>
          ))}

          {/* Bleumr Research Center — etched into back wall */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{ width: 200 }}>
            {/* Engraved panel — inset into wall */}
            <div className="relative flex flex-col items-center px-5 py-4 rounded-2xl"
              style={{
                background: 'linear-gradient(160deg, rgba(255,255,255,0.012) 0%, rgba(255,255,255,0.004) 100%)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>

              {/* App sphere */}
              <InlineStarSphere size={54} />

              {/* Wordmark */}
              <div className="mt-2.5 flex flex-col items-center gap-0.5">
                <motion.span
                  className="tracking-[0.22em] font-bold text-[11px] uppercase"
                  style={{ color: 'rgba(255,255,255,0.55)', letterSpacing: '0.25em', textShadow: '0 0 12px rgba(129,140,248,0.35)' }}
                  animate={{ opacity: [0.45, 0.7, 0.45] }}
                  transition={{ duration: 4, repeat: Infinity }}
                >
                  BLEUMR
                </motion.span>
                <span className="tracking-[0.18em] text-[7px] font-semibold uppercase"
                  style={{ color: 'rgba(129,140,248,0.4)', letterSpacing: '0.2em' }}>
                  WORKSPACE
                </span>
              </div>

              {/* Bottom accent line */}
              <div className="mt-3 flex items-center gap-1.5">
                {['#818cf8','#22d3ee','#34d399'].map((c, i) => (
                  <motion.div key={i} className="rounded-full"
                    style={{ width: 20, height: 1.5, background: c, opacity: 0.35 }}
                    animate={{ opacity: [0.25, 0.55, 0.25] }}
                    transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4 }}
                  />
                ))}
              </div>

              {/* Engraved edge highlight */}
              <div className="absolute top-0 inset-x-4 h-px rounded-full"
                style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)' }} />
            </div>
          </div>

          {/* Data packets traveling between agents when collaborating */}
          <AnimatePresence>
            {statuses.researcher === 'thinking' && (
              <DataPacket fromPct="20%" toPct="44%" color={AGENTS[0].accent} delay={0} />
            )}
            {statuses.synth === 'thinking' && (
              <DataPacket fromPct="46%" toPct="70%" color={AGENTS[1].accent} delay={0} />
            )}
          </AnimatePresence>

          {/* Agent stations: character seated at desk */}
          <div className="absolute bottom-14 left-0 right-0 flex items-end justify-around px-10">
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
                {/* Desk overlaps character bottom — seated illusion */}
                <Desk agent={agent} status={statuses[agent.id]} />
              </div>
            ))}
          </div>

          {/* Floor */}
          <div className="absolute bottom-0 left-0 right-0 h-14"
            style={{ background: 'linear-gradient(180deg,rgba(4,6,14,0) 0%,rgba(2,4,10,0.97) 100%)' }} />

          {/* Status dots bottom */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-around px-10">
            {AGENTS.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ background: 'rgba(6,9,20,0.88)', border: `1px solid ${statuses[a.id] !== 'idle' ? `${a.accent}40` : 'rgba(255,255,255,0.06)'}`, backdropFilter: 'blur(12px)' }}>
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

        {/* ── RIGHT: Control panel ─────────────────────────────────── */}
        <div className="w-[360px] flex flex-col shrink-0" style={{ background: 'rgba(255,255,255,0.012)' }}>

          {/* Output — fills available space, scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">

            {/* Empty state */}
            {outputs.length === 0 && phase === 'idle' && (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
                <div className="flex gap-3">
                  {AGENTS.map((a, i) => (
                    <motion.div key={a.id}
                      className="h-12 w-12 rounded-2xl flex items-center justify-center"
                      style={{ background: a.accentDim, border: `1px solid ${a.accent}30` }}
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}>
                      <a.Icon style={{ width: 20, height: 20, color: a.accent }} />
                    </motion.div>
                  ))}
                </div>
                <div>
                  <p className="text-[13px] font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>Your AI team is ready</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    Built for deep work — not quick answers. The team runs 5 rounds of real dialogue before Synth writes the final deliverable.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  <Bot className="h-3 w-3" /> 3 Groq models · <FlaskConical className="h-3 w-3" /> parallel strategy
                </div>
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
                <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl p-4"
                  style={{
                    background: isFinal ? a.accentDim : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isFinal ? `${a.accent}35` : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: isFinal ? `0 0 40px ${a.accent}14` : 'none',
                  }}>
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="h-7 w-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: a.accentDim }}>
                      <a.Icon style={{ width: 14, height: 14, color: a.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-bold text-white">{a.name}</span>
                      {isFinal && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider" style={{ color: a.accent }}>Final Answer</span>}
                    </div>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  </div>

                  {/* Content: only show inline if short. Large = download only, no preview. */}
                  {!isLarge && (
                    <p className={`text-[12px] leading-relaxed whitespace-pre-wrap mb-3 ${isFinal ? 'text-slate-200' : 'text-slate-500 line-clamp-4'}`}>
                      {o.text}
                    </p>
                  )}

                  {/* Smart format download strip */}
                  {(isLarge || isFinal) && (
                    <div className={isLarge ? '' : 'mt-3 pt-3'} style={isLarge ? {} : { borderTop: `1px solid ${a.accent}20` }}>
                      <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        Export as
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {formats.map(fmt => {
                          const meta = FORMAT_META.find(m => m.ext === fmt)!;
                          const isPrimary = fmt === formats[0];
                          return (
                            <button key={fmt} onClick={() => doDownload(fmt)}
                              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:scale-105 active:scale-95"
                              style={{
                                background: isPrimary ? `${a.accent}25` : 'rgba(255,255,255,0.05)',
                                color: isPrimary ? a.accent : 'rgba(255,255,255,0.45)',
                                border: `1px solid ${isPrimary ? `${a.accent}50` : 'rgba(255,255,255,0.1)'}`,
                              }}>
                              <span>{meta.icon}</span>
                              {meta.label}
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
            {streaming && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-4"
                style={{ background: AGENTS[2].accentDim, border: `1px solid ${AGENTS[2].accent}35`, boxShadow: `0 0 40px ${AGENTS[2].accent}12` }}>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="h-7 w-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: AGENTS[2].accentDim }}>
                    <Orbit style={{ width: 14, height: 14, color: AGENTS[2].accent }} />
                  </div>
                  <span className="text-[12px] font-bold text-white flex-1">Synth <span className="text-[9px] font-bold uppercase tracking-wider ml-1" style={{ color: AGENTS[2].accent }}>writing…</span></span>
                  <motion.div className="flex gap-1" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                    {[0, 1, 2].map(i => <div key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: AGENTS[2].accent }} />)}
                  </motion.div>
                </div>
                {/* Show a live word/char counter instead of dumping text */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <motion.div className="h-full rounded-full" style={{ background: AGENTS[2].accent }}
                      animate={{ width: [`${Math.min((streaming.length / 40), 100)}%`] }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color: AGENTS[2].accent }}>
                    {streaming.length.toLocaleString()} chars
                  </span>
                </div>
              </motion.div>
            )}

            {/* Thinking indicator */}
            {isRunning && !streaming && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {(() => {
                  const a = AGENTS.find(x => statuses[x.id] === 'thinking') ?? AGENTS[0];
                  return (
                    <>
                      <div className="h-7 w-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: a.accentDim }}>
                        <a.Icon style={{ width: 13, height: 13, color: a.accent }} />
                      </div>
                      <span className="text-[12px] font-medium flex-1 text-slate-500">{a.name} is thinking…</span>
                      <motion.div className="flex gap-1" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                        {[0, 1, 2].map(i => <div key={i} className="h-1 w-1 rounded-full bg-slate-700" />)}
                      </motion.div>
                    </>
                  );
                })()}
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input — pinned to bottom */}
          <div className="p-4 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isRunning) run(); }}
              placeholder="Give the team a task to research…"
              rows={2}
              className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-slate-700 outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', caretColor: '#818cf8', lineHeight: 1.5 }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(129,140,248,0.45)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
            />
            <div className="flex items-center gap-2 mt-2">
              {isRunning ? (
                <button onClick={reset}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-[13px] font-semibold transition-colors"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                  <X className="h-3.5 w-3.5" /> Stop
                </button>
              ) : (
                <button onClick={run} disabled={!input.trim()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-[13px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: input.trim() ? 'linear-gradient(135deg,#6366f1,#818cf8)' : 'rgba(99,102,241,0.15)', color: 'white', boxShadow: input.trim() ? '0 0 20px rgba(99,102,241,0.3)' : 'none' }}>
                  <Zap className="h-3.5 w-3.5" />
                  {phase === 'done' ? 'Run Again' : 'Launch Team'}
                  <span className="text-[10px] opacity-50 ml-0.5">⌘↵</span>
                </button>
              )}
              {!isRunning && outputs.length > 0 && (
                <button onClick={reset}
                  className="p-2 rounded-xl transition-colors text-slate-600 hover:text-slate-300 hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
