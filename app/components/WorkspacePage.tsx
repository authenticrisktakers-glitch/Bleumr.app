import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search, Layers3, X, Zap, CheckCircle2, Bot, FlaskConical, Orbit, Sparkles } from 'lucide-react';

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
interface WorkspacePageProps { onClose: () => void; apiKey: string }

// ─── Seated character SVG ─────────────────────────────────────────────────────
// Shows upper body only — desk overlaps lower half to create seated illusion
function SeatedCharacter({ agent, status, selected, onClick }: {
  agent: typeof AGENTS[number];
  status: AgentStatus;
  selected: boolean;
  onClick: () => void;
}) {
  const thinking = status === 'thinking';
  const done = status === 'done';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center outline-none select-none"
      style={{ cursor: 'pointer' }}
    >
      {/* Thought bubble */}
      <AnimatePresence>
        {thinking && (
          <motion.div key="bubble"
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

// ─── Floating doc ─────────────────────────────────────────────────────────────
function FloatingDoc({ x, y, rot, delay }: { x: number; y: number; rot: number; delay: number }) {
  return (
    <motion.div className="absolute pointer-events-none"
      style={{ left: x, top: y }}
      animate={{ y: [0, -8, 0], rotate: [rot, rot + 5, rot] }}
      transition={{ duration: 5 + delay * 0.7, repeat: Infinity, delay, ease: 'easeInOut' }}
    >
      <div style={{ width: 36, height: 48, borderRadius: 10, background: 'linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)' }}>
        {[52, 40, 48, 32].map((w, i) => (
          <div key={i} className="mx-auto rounded-full" style={{ marginTop: i === 0 ? 9 : 5, height: 1.5, width: `${w}%`, background: 'rgba(255,255,255,0.28)' }} />
        ))}
      </div>
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
  { key: 'planning', label: 'Plan', color: '#818cf8' },
  { key: 'researching', label: 'Research', color: '#22d3ee' },
  { key: 'synthesizing', label: 'Compose', color: '#34d399' },
  { key: 'done', label: 'Done', color: '#34d399' },
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
export function WorkspacePage({ onClose, apiKey }: WorkspacePageProps) {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [statuses, setStatuses] = useState<Record<AgentId, AgentStatus>>({ planner: 'idle', researcher: 'idle', synth: 'idle' });
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [streaming, setStreaming] = useState('');
  const [selected, setSelected] = useState<AgentId | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [outputs, streaming]);

  const setStatus = (id: AgentId, s: AgentStatus) => setStatuses(p => ({ ...p, [id]: s }));

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

  // ── Run the 3-model pipeline ───────────────────────────────────────────────
  const run = useCallback(async () => {
    if (!input.trim() || !apiKey) return;
    const task = input.trim();
    setInput(''); setOutputs([]); setStreaming('');
    setStatuses({ planner: 'idle', researcher: 'idle', synth: 'idle' });

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    try {
      // ── Round 1: Planner proposes initial strategy ───────────────────
      setPhase('planning');
      setStatus('planner', 'thinking');

      const plan = await groq(
        AGENTS[0].model,
        [
          { role: 'system', content: `You are Planner, one of three AI agents working as a team on a shared task. Your job is to open the collaboration by proposing a clear strategic plan. Think deeply. Produce a numbered execution plan (4–6 steps) that covers the full scope of the task. Be specific. No fluff.` },
          { role: 'user', content: `Team task: ${task}\n\nPropose your plan:` },
        ],
        signal,
      );

      setStatus('planner', 'done');
      setOutputs(p => [...p, { id: 'planner', text: plan }]);

      // ── Round 2: Researcher challenges and enriches the plan ─────────
      setPhase('researching');
      setStatus('researcher', 'thinking');

      const research = await groq(
        AGENTS[1].model,
        [
          { role: 'system', content: `You are Researcher, one of three AI agents working as a team. Planner has laid out a strategy. Your job is to: (1) identify any gaps or weak assumptions in the plan, (2) gather and supply all relevant facts, data, examples, case studies, and context needed to execute it well. Be comprehensive and rigorous. Push back on the plan where needed and fill in what's missing.` },
          { role: 'user', content: `Team task: ${task}\n\nPlanner's strategy:\n${plan}\n\nYour research, analysis, and critique:` },
        ],
        signal,
      );

      setStatus('researcher', 'done');
      setOutputs(p => [...p, { id: 'researcher', text: research }]);

      // ── Round 3: Planner refines based on Researcher's findings ──────
      setPhase('planning');
      setStatus('planner', 'thinking');

      const refinedPlan = await groq(
        AGENTS[0].model,
        [
          { role: 'system', content: `You are Planner revisiting your strategy after Researcher's input. Absorb their findings, address gaps they identified, and produce a REVISED final execution plan. Make it sharper, more detailed, and grounded in the research. Keep it numbered and actionable.` },
          { role: 'user', content: `Task: ${task}\n\nYour original plan:\n${plan}\n\nResearcher's findings and critique:\n${research}\n\nRevised final plan:` },
        ],
        signal,
      );

      setStatus('planner', 'done');
      setOutputs(p => [...p, { id: 'planner', text: `[Revised]\n${refinedPlan}` }]);

      // ── Round 4: Synth composes the final answer from the full conversation ──
      setPhase('synthesizing');
      setStatus('synth', 'thinking');
      let full = '';
      setStreaming('');

      await groq(
        AGENTS[2].model,
        [
          { role: 'system', content: `You are Synth, the final agent in the team. You have the full conversation between Planner and Researcher — their strategies, research, critiques, and revised plan. Your job is to synthesize everything into the best possible final deliverable for the user. Write it as a complete, polished, professional output. Use markdown (headers, bullets, tables, code blocks) where it helps clarity. Do not summarize — actually deliver the full answer.` },
          { role: 'user', content: `Task: ${task}\n\n--- PLANNER (initial) ---\n${plan}\n\n--- RESEARCHER ---\n${research}\n\n--- PLANNER (revised) ---\n${refinedPlan}\n\nWrite the final comprehensive answer:` },
        ],
        signal,
        (tok) => { full += tok; setStreaming(s => s + tok); },
      );

      setStatus('synth', 'done');
      setOutputs(p => [...p, { id: 'synth', text: full }]);
      setStreaming('');
      setPhase('done');

    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[Workspace]', e.message);
      setPhase('idle');
      setStatuses({ planner: 'idle', researcher: 'idle', synth: 'idle' });
    }
  }, [input, apiKey, groq]);

  const reset = () => {
    abortRef.current?.abort();
    setPhase('idle');
    setStatuses({ planner: 'idle', researcher: 'idle', synth: 'idle' });
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
            { style: { left: 24 }, nebulaColor: 'rgba(99,102,241,0.18)', planetColor: ['#818cf8','#312e81'], planetGlow: '#818cf8', dir: -1 },
            { style: { right: 24 }, nebulaColor: 'rgba(52,211,153,0.14)', planetColor: ['#34d399','#064e3b'], planetGlow: '#34d399', dir: 1 },
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

              {/* Planet orbiting slowly */}
              <motion.div className="absolute rounded-full"
                style={{ width: 18, height: 18, bottom: '16%', right: '12%', background: `radial-gradient(circle at 35% 30%, ${w.planetColor[0]}, ${w.planetColor[1]})`, boxShadow: `0 0 12px ${w.planetGlow}60` }}
                animate={{ y: [0, -8, 0], x: [0, w.dir * 4, 0] }}
                transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
              >
                {/* Planet ring */}
                <div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${w.planetGlow}40`, transform: 'scale(1.6) rotate(-25deg)', borderRadius: '50%' }} />
              </motion.div>

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

              {/* The SVG mark — orbital rings around a core */}
              <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <radialGradient id="core-grad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.4" />
                  </radialGradient>
                </defs>
                {/* Outer ring */}
                <motion.circle cx="19" cy="19" r="17" stroke="rgba(129,140,248,0.25)" strokeWidth="0.8" fill="none"
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                  style={{ transformOrigin: '19px 19px' }}
                />
                {/* Tilted orbital ring */}
                <motion.ellipse cx="19" cy="19" rx="17" ry="6" stroke="rgba(34,211,238,0.3)" strokeWidth="0.8" fill="none"
                  animate={{ rotate: [0, -360] }}
                  transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                  style={{ transformOrigin: '19px 19px' }}
                />
                {/* Inner ring */}
                <circle cx="19" cy="19" r="10" stroke="rgba(129,140,248,0.15)" strokeWidth="0.6" fill="none" />
                {/* Core */}
                <circle cx="19" cy="19" r="4.5" fill="url(#core-grad)" />
                <motion.circle cx="19" cy="19" r="4.5" fill="none" stroke="#818cf8" strokeWidth="0.8"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                />
                {/* Orbiting dot on outer ring */}
                <motion.circle cx="36" cy="19" r="2" fill="#818cf8"
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                  style={{ transformOrigin: '19px 19px' }}
                />
                {/* Orbiting dot on tilted ring */}
                <motion.circle cx="36" cy="19" r="1.5" fill="#22d3ee"
                  animate={{ rotate: [0, -360] }}
                  transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                  style={{ transformOrigin: '19px 19px' }}
                />
              </svg>

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
                  RESEARCH CENTER
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

          {/* Floating papers */}
          <FloatingDoc x={28} y={140} rot={-7} delay={0} />
          <FloatingDoc x={130} y={108} rot={4} delay={1.3} />
          <FloatingDoc x={300} y={95} rot={-4} delay={0.8} />
          <FloatingDoc x={430} y={118} rot={6} delay={2} />

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
                    Planner maps the task → Researcher digs deep → Synth writes the final answer. Three models, one result.
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

              const downloadFile = () => {
                const slug = (outputs.find(x => x.id === 'planner')?.text ?? 'workspace')
                  .split('\n')[0].replace(/[^a-z0-9 ]/gi, '').trim().slice(0, 40).replace(/\s+/g, '_').toLowerCase() || 'workspace_output';
                const blob = new Blob([o.text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a2 = document.createElement('a');
                a2.href = url; a2.download = `${slug}.txt`;
                a2.click(); URL.revokeObjectURL(url);
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
                    {/* Download button for large outputs */}
                    {isLarge && (
                      <button onClick={downloadFile}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors"
                        style={{ background: `${a.accent}20`, color: a.accent, border: `1px solid ${a.accent}40` }}>
                        ↓ .txt
                      </button>
                    )}
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  </div>
                  {/* Large outputs: show short preview + download prompt */}
                  {isFinal && isLarge ? (
                    <div>
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-slate-200 line-clamp-6">{o.text}</p>
                      <button onClick={downloadFile}
                        className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-2 text-[12px] font-semibold transition-colors"
                        style={{ background: `${a.accent}15`, border: `1px solid ${a.accent}30`, color: a.accent }}>
                        <span>↓</span> Download full output as .txt
                      </button>
                    </div>
                  ) : (
                    <p className={`text-[12px] leading-relaxed whitespace-pre-wrap ${isFinal ? 'text-slate-200' : 'text-slate-500 line-clamp-4'}`}>
                      {o.text}
                    </p>
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
                <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-slate-200">{streaming}</p>
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
