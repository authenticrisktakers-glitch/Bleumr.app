import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BLEUMR_AGENT_PREFIX } from '../services/BleumrLore';
import { addScheduleEvent } from './CalendarPage';
import { trackError } from '../services/Analytics';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search as SearchIcon, Layers3, X, Zap, CheckCircle2, Bot, Orbit, Sparkles, Archive, Pencil, Download, Trash2, Plus, FolderOpen } from 'lucide-react';
import { IS_ELECTRON } from '../services/Platform';
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

// Extract the last 1–2 complete sentences from an agent's response for the speech bubble.
// Only updates when a sentence ends (. ! ?) → no token-by-token choppiness.
function getLastCompleteSentences(text: string, maxChars = 180): string {
  const clean = text.replace(/[#*`>_~]/g, '').replace(/\s+/g, ' ').trim();
  const matches = clean.match(/[^.!?\n]+[.!?]+/g);
  if (!matches || matches.length === 0) return '';
  let result = '';
  for (let i = matches.length - 1; i >= 0; i--) {
    const s = matches[i].trim();
    if (!s || s.length < 8) continue;
    const candidate = result ? s + ' ' + result : s;
    if (candidate.length <= maxChars) result = candidate;
    else break;
  }
  return result;
}

function AstronautCharacter({ agent, status, selected, onClick, streamText, phaseLabel }: {
  agent: typeof AGENTS[number];
  status: AgentStatus;
  selected: boolean;
  onClick: () => void;
  streamText?: string;
  phaseLabel?: string;
}) {
  const thinking = status === 'thinking';
  const done = status === 'done';
  const label = phaseLabel || (thinking ? 'Thinking…' : '');
  // Show last complete sentence from the agent's actual output
  const bubbleText = streamText ? getLastCompleteSentences(streamText, 180) : '';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center outline-none select-none"
      style={{ cursor: 'pointer' }}
    >
      {/* Speech bubble — shows real conversation text when available, status label otherwise */}
      <AnimatePresence mode="wait">
        {thinking && (bubbleText || label) && (
          <motion.div key={bubbleText ? 'convo' : 'status'}
            initial={{ opacity: 0, y: 8, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={{ duration: 0.28 }}
            className="absolute pointer-events-none"
            style={{
              bottom: '112%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 50,
              width: bubbleText ? 220 : 'auto',
            }}
          >
            <div className="rounded-2xl px-3 py-2"
              style={{
                background: `linear-gradient(135deg, rgba(10,12,28,0.97), rgba(6,8,20,0.97))`,
                border: `1px solid ${agent.accent}55`,
                boxShadow: `0 4px 20px rgba(0,0,0,0.6), 0 0 0 1px ${agent.accent}15`,
                backdropFilter: 'blur(12px)',
                whiteSpace: bubbleText ? 'normal' : 'nowrap',
              }}
            >
              {/* Header row — name + pulse dot */}
              <div className="flex items-center gap-1.5 mb-1">
                <motion.div
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: agent.accent, willChange: 'opacity' }}
                  animate={{ opacity: [1, 0.25, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: agent.accent }}>
                  {label || agent.name}
                </span>
              </div>
              {/* Actual words */}
              {bubbleText ? (
                <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)', wordBreak: 'break-word' }}>
                  {bubbleText}
                </p>
              ) : null}
            </div>
            {/* Tail */}
            <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -6, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${agent.accent}50` }} />
            <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -5, width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid rgba(6,8,20,0.97)' }} />
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
        style={{ width: 80, height: 24, background: agent.accent, willChange: 'opacity' }}
        animate={{ opacity: thinking ? [0.3, 0.7, 0.3] : done ? 0.5 : selected ? 0.35 : 0.15 }}
        transition={{ duration: 1.4, repeat: Infinity }}
      />

      {/* Seated astronaut SVG — white suit, dark visor, arms resting on desk */}
      <motion.div
        animate={thinking ? { y: [0, -2, 0] } : { y: 0 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ willChange: 'transform' }}
      >
        <svg width="90" height="100" viewBox="0 0 90 100" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="visible">
          <defs>
            <radialGradient id={`suit-${agent.id}`} cx="32%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#dce9f4" />
              <stop offset="100%" stopColor="#a8c2d8" />
            </radialGradient>
            <radialGradient id={`helm-${agent.id}`} cx="30%" cy="25%" r="75%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#c0d6e8" />
            </radialGradient>
            <radialGradient id={`visor-${agent.id}`} cx="28%" cy="28%" r="70%">
              <stop offset="0%" stopColor="#1a2535" />
              <stop offset="100%" stopColor="#060d18" />
            </radialGradient>
            <linearGradient id={`chair-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          {/* ── Chair (subtle — mostly hidden behind desk) ── */}
          <ellipse cx="45" cy="84" rx="27" ry="16" fill={`url(#chair-${agent.id})`} opacity="0.65" />

          {/* ── Left arm — rounded organic pill, angled naturally ── */}
          <motion.g
            animate={thinking ? { rotate: [0, -4, 0], translateY: [0, 1.5, 0] } : { rotate: 0, translateY: 0 }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '15px 68px', willChange: 'transform' }}
          >
            <ellipse cx="11" cy="72" rx="7" ry="13" fill={`url(#suit-${agent.id})`} transform="rotate(-8 11 72)" />
            <ellipse cx="10" cy="76" rx="6.5" ry="2.2" fill={agent.accent} opacity="0.45" transform="rotate(-8 10 76)" />
            <ellipse cx="9" cy="90" rx="6" ry="10" fill={`url(#suit-${agent.id})`} transform="rotate(-14 9 90)" />
            <ellipse cx="8" cy="102" rx="8" ry="4.5" fill={agent.accent} opacity="0.85" />
            <ellipse cx="6.5" cy="100.5" rx="3" ry="1.4" fill="rgba(255,255,255,0.38)" />
          </motion.g>

          {/* ── Right arm ── */}
          <motion.g
            animate={thinking ? { rotate: [0, 4, 0], translateY: [0, 1.5, 0] } : { rotate: 0, translateY: 0 }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
            style={{ transformOrigin: '75px 68px' }}
          >
            <ellipse cx="79" cy="72" rx="7" ry="13" fill={`url(#suit-${agent.id})`} transform="rotate(8 79 72)" />
            <ellipse cx="80" cy="76" rx="6.5" ry="2.2" fill={agent.accent} opacity="0.45" transform="rotate(8 80 76)" />
            <ellipse cx="81" cy="90" rx="6" ry="10" fill={`url(#suit-${agent.id})`} transform="rotate(14 81 90)" />
            <ellipse cx="82" cy="102" rx="8" ry="4.5" fill={agent.accent} opacity="0.85" />
            <ellipse cx="83.5" cy="100.5" rx="3" ry="1.4" fill="rgba(255,255,255,0.38)" />
          </motion.g>

          {/* ── Suit torso — organic tapered path, NOT a rectangle ── */}
          <path d="M17 98 C15 83,14 69,16 62 Q20 52,45 52 Q70 52,74 62 C76 69,75 83,73 98 Z"
            fill={`url(#suit-${agent.id})`} />
          {/* Shoulder humps — round bumps, clearly not the monitor */}
          <ellipse cx="19" cy="61" rx="9" ry="7" fill={`url(#suit-${agent.id})`} />
          <ellipse cx="71" cy="61" rx="9" ry="7" fill={`url(#suit-${agent.id})`} />
          {/* Shoulder accent arcs */}
          <path d="M12 63 Q17 56 25 59" stroke={agent.accent} strokeWidth="2.2" fill="none" opacity="0.5" strokeLinecap="round" />
          <path d="M78 63 Q73 56 65 59" stroke={agent.accent} strokeWidth="2.2" fill="none" opacity="0.5" strokeLinecap="round" />
          {/* Mission patches */}
          <circle cx="24" cy="59" r="5" fill="rgba(0,0,0,0.4)" stroke={`${agent.accent}88`} strokeWidth="1.2" />
          <circle cx="24" cy="59" r="2.5" fill={agent.accent} opacity="0.85" />
          <circle cx="66" cy="59" r="5" fill="rgba(0,0,0,0.4)" stroke={`${agent.accent}88`} strokeWidth="1.2" />
          <circle cx="66" cy="59" r="2.5" fill={agent.accent} opacity="0.85" />
          {/* Chest life-support unit */}
          <rect x="33" y="63" width="24" height="20" rx="4.5" fill="rgba(4,8,20,0.80)" stroke={`${agent.accent}60`} strokeWidth="1.2" />
          <line x1="36" y1="69" x2="54" y2="69" stroke={agent.accent} strokeWidth="0.8" opacity="0.42" />
          <line x1="36" y1="73" x2="54" y2="73" stroke={agent.accent} strokeWidth="0.8" opacity="0.42" />
          <circle cx="37" cy="66" r="2" fill={agent.accent} opacity="0.95" />
          <circle cx="43" cy="66" r="1.4" fill="rgba(255,255,255,0.45)" />
          {/* Lower suit color wash — breaks white-rectangle look */}
          <path d="M20 84 Q45 89 70 84 L73 98 C56 101,34 101,17 98 Z"
            fill={agent.accent} opacity="0.11" />

          {/* ── Helmet neck ring ── */}
          <ellipse cx="45" cy="51" rx="14" ry="4.2" fill={`url(#suit-${agent.id})`} />
          <ellipse cx="45" cy="51" rx="14" ry="4.2" stroke={`${agent.accent}55`} strokeWidth="1" fill="none" />

          {/* ── Helmet ── */}
          <motion.g
            animate={thinking ? { rotate: [0, 2, 0, -1.5, 0] } : { rotate: 0 }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '45px 25px' }}
          >
            {/* Outer shell */}
            <circle cx="45" cy="25" r="23" fill={`url(#helm-${agent.id})`} stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
            {/* Dark visor */}
            <ellipse cx="45" cy="28" rx="14" ry="12" fill={`url(#visor-${agent.id})`} />
            <ellipse cx="45" cy="28" rx="14" ry="12" stroke={agent.accent} strokeWidth="1.8" fill="none" opacity="0.75" />
            {/* Visor shine */}
            <ellipse cx="36" cy="21" rx="4.5" ry="2.8" fill="rgba(255,255,255,0.48)" transform="rotate(-28,36,21)" />
            <ellipse cx="34" cy="24" rx="2.2" ry="1.3" fill="rgba(255,255,255,0.22)" transform="rotate(-28,34,24)" />
            {/* Shell highlight arc */}
            <path d="M24 12 Q45 1 66 12" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M22 26 Q22 17 25 11" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            <path d="M68 26 Q68 17 65 11" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            {/* Planner: commander band */}
            {agent.id === 'planner' && (
              <rect x="26" y="7" width="38" height="3.5" rx="1.75" fill={agent.accent} opacity="0.4" />
            )}
            {/* Researcher: HUD scan lines in visor */}
            {agent.id === 'researcher' && (
              <g opacity="0.48">
                <line x1="36" y1="26" x2="54" y2="26" stroke={agent.accent} strokeWidth="0.9" />
                <line x1="34" y1="30" x2="56" y2="30" stroke={agent.accent} strokeWidth="0.9" />
                <circle cx="38" cy="33" r="2.2" stroke={agent.accent} strokeWidth="0.9" fill="none" />
              </g>
            )}
            {/* Synth: comm antenna */}
            {agent.id === 'synth' && (
              <g>
                <line x1="58" y1="5" x2="64" y2="-3" stroke={agent.accent} strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="65" cy="-5" r="3.5" fill={agent.accent} opacity="0.92" />
                <circle cx="65" cy="-5" r="1.4" fill="white" opacity="0.88" />
              </g>
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

// ─── Mission desk — astronaut sits behind this ────────────────────────────────
function Desk({ agent, status }: { agent: typeof AGENTS[number]; status: AgentStatus }) {
  const active = status !== 'idle';
  const thinking = status === 'thinking';

  return (
    <div className="relative" style={{ width: 186, zIndex: 10 }}>

      {/* ── Standing monitor — rises above the desk surface ── */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 84, zIndex: 3 }}>
        {/* Monitor back panel — we see the BACK, no screen content visible */}
        <div className="relative rounded-md overflow-hidden"
          style={{
            width: 72,
            height: 44,
            background: 'linear-gradient(160deg,#0e1220 0%,#080b14 100%)',
            border: '1.5px solid rgba(255,255,255,0.1)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
          }}>
          {/* Vent slots on the back panel */}
          {[12, 18, 24].map(y => (
            <div key={y} className="absolute rounded-full" style={{ left: 8, right: 8, top: y, height: 1.5, background: 'rgba(255,255,255,0.05)' }} />
          ))}
          {/* Brand logo mark — faint on back */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2" style={{ width: 10, height: 10, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)' }} />
          {/* Power LED — only indicator visible on back */}
          <motion.div className="absolute bottom-1.5 right-2 rounded-full"
            style={{ width: 3, height: 3, background: active ? agent.accent : '#0a0c12', boxShadow: active ? `0 0 4px ${agent.accent}` : 'none' }}
            animate={thinking ? { opacity: [1, 0.2, 1] } : {}} transition={{ duration: 1.4, repeat: Infinity }} />
        </div>
        {/* Monitor neck */}
        <div className="mx-auto" style={{ width: 6, height: 9, background: 'linear-gradient(180deg,#1a2035,#0b1018)', borderLeft: '1px solid rgba(255,255,255,0.07)', borderRight: '1px solid rgba(255,255,255,0.07)' }} />
        {/* Monitor base */}
        <div className="mx-auto rounded-sm" style={{ width: 30, height: 4, background: 'linear-gradient(180deg,#1e2840,#0b1018)', border: '1px solid rgba(255,255,255,0.09)' }} />
      </div>

      {/* ── Desk top surface — thin front-edge visible from front ── */}
      <div className="relative rounded-tl-xl rounded-tr-xl overflow-visible"
        style={{
          height: 13,
          background: 'linear-gradient(170deg,#1e2540 0%,#151c30 55%,#0f1422 100%)',
          border: `1px solid ${active ? agent.accent+'55' : 'rgba(255,255,255,0.1)'}`,
          borderBottom: 'none',
          boxShadow: active
            ? `0 -4px 28px ${agent.accent}18, inset 0 1px 0 rgba(255,255,255,0.1)`
            : 'inset 0 1px 0 rgba(255,255,255,0.07)',
          zIndex: 4,
        }}
      >
        {/* Surface top rim glow */}
        <div className="absolute inset-x-0 top-0 rounded-tl-xl rounded-tr-xl"
          style={{ height: 2.5, background: `linear-gradient(90deg,transparent,${active ? agent.accent+'45':'rgba(255,255,255,0.12)'},transparent)` }} />

        {/* Coffee mug — LEFT side, sits on desk surface */}
        <div className="absolute" style={{ left: 8, top: -18 }}>
          {active && [0, 5].map((dx, si) => (
            <motion.div key={si} className="absolute rounded-full"
              style={{ left: 2+dx, top: -9, width: 2, height: 7, background: 'rgba(148,163,184,0.22)' }}
              animate={{ y:[0,-6,0], opacity:[0,0.5,0] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: si*0.4 }}
            />
          ))}
          <div style={{ width: 15, height: 18, background: 'linear-gradient(180deg,#2a3347,#18202e)', border: '1.5px solid rgba(255,255,255,0.14)', borderRadius: '2px 2px 5px 5px' }}>
            <div style={{ margin: '2px auto 0', width: 9, height: 3, background: `${agent.accent}70`, borderRadius: 1 }} />
          </div>
          <div className="absolute" style={{ right: -5, top: 4, width: 5, height: 8, borderRadius: '0 50% 50% 0', border: '1.5px solid rgba(255,255,255,0.13)', borderLeft: 'none' }} />
        </div>

        {/* Mouse — right side, on desk surface */}
        <div className="absolute" style={{ right: 12, top: -18, width: 12, height: 17, background: '#090d16', border: `1px solid ${active ? agent.accent+'35':'rgba(255,255,255,0.09)'}`, borderRadius: 6 }}>
          <div className="absolute top-1 left-1/2 -translate-x-1/2" style={{ width: 1, height: 6, background: 'rgba(255,255,255,0.08)' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ width: 4, height: 4, background: active ? `${agent.accent}50` : 'rgba(255,255,255,0.06)' }} />
        </div>

        {/* No screen glow on desk — we see the monitor's back, not the screen */}
      </div>

      {/* ── DESK FRONT EDGE — thin bright lip ── */}
      <div style={{ height: 5, background: `linear-gradient(180deg,${active ? agent.accent+'40':'rgba(255,255,255,0.18)'} 0%,rgba(255,255,255,0.04) 100%)`, position: 'relative', zIndex: 4 }} />

      {/* ── DESK FRONT PANEL ── */}
      <div className="relative"
        style={{
          height: 46,
          background: 'linear-gradient(180deg,#121928 0%,#090d16 60%,#06080f 100%)',
          border: `1px solid ${active ? agent.accent+'38' : 'rgba(255,255,255,0.09)'}`,
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          boxShadow: active ? `0 6px 24px ${agent.accent}15, inset 0 -1px 0 rgba(0,0,0,0.5)` : '0 6px 16px rgba(0,0,0,0.6)',
          zIndex: 4,
        }}>
        {/* Keyboard on the desk front panel — front-facing */}
        <div className="absolute rounded-sm"
          style={{ top: 5, left: '50%', transform: 'translateX(-50%)', width: 84, height: 12, background: '#07090f', border: `1px solid ${active ? agent.accent+'40':'rgba(255,255,255,0.09)'}`, boxShadow: active ? `0 0 8px ${agent.accent}12` : 'none' }}>
          {Array.from({ length: 2 }).map((_, row) => (
            <div key={row} className="flex gap-px px-1.5" style={{ marginTop: row === 0 ? 1.5 : 2 }}>
              {Array.from({ length: 12 }).map((_, col) => (
                <motion.div key={col} className="flex-1 rounded-sm"
                  style={{ height: 2.5, background: active ? `${agent.accent}60` : 'rgba(255,255,255,0.1)' }}
                  animate={thinking && (row * 12 + col) % 5 === 0 ? { opacity: [0.4, 1, 0.4] } : {}}
                  transition={{ duration: 0.35, repeat: Infinity, delay: col * 0.03 + row * 0.06 }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Nameplate */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 8, width: 60, height: 14, background: 'rgba(0,0,0,0.6)', border: `1px solid ${agent.accent}50`, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', color: agent.accent }}>{agent.name}</span>
        </div>

        {/* Cable port */}
        <div className="absolute" style={{ right: 12, top: '50%', transform: 'translateY(-50%)', width: 4, height: 4, background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '50%' }} />

        {/* Active glow strip along bottom edge */}
        {active && <motion.div className="absolute bottom-0 left-10 right-10 rounded-t"
          style={{ height: 2, background: `linear-gradient(90deg,transparent,${agent.accent}90,transparent)` }}
          animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.6, repeat: Infinity }}
        />}
      </div>

      {/* ── Desk legs ── */}
      <div className="flex justify-between" style={{ paddingLeft: 12, paddingRight: 12, position: 'relative', zIndex: 4 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ width: 10, height: 24, background: 'linear-gradient(180deg,#0e1220 0%,#05070c 100%)', border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none', borderRadius: '0 0 4px 4px' }} />
        ))}
      </div>

      {/* Floor shadow */}
      <div className="rounded-full mx-auto" style={{ width: 152, height: 7, background: 'rgba(0,0,0,0.6)', filter: 'blur(7px)', marginTop: 2 }} />
    </div>
  );
}


// ─── Smart download helpers ───────────────────────────────────────────────────
type ExportFormat = 'pdf' | 'md' | 'html' | 'csv' | 'json' | 'txt';

interface FormatMeta { ext: ExportFormat; label: string; mime: string; icon: string }
const FORMAT_META: FormatMeta[] = [
  { ext: 'pdf',  label: 'PDF',   mime: 'text/html',       icon: '📄' },
  { ext: 'html', label: 'HTML',  mime: 'text/html',       icon: '📊' },
  { ext: 'md',   label: '.md',   mime: 'text/markdown',   icon: '📝' },
  { ext: 'csv',  label: '.csv',  mime: 'text/csv',        icon: '📋' },
  { ext: 'json', label: '.json', mime: 'application/json',icon: '🗂' },
  { ext: 'txt',  label: '.txt',  mime: 'text/plain',      icon: '📄' },
];

// ─── Document template system ─────────────────────────────────────────────────

type DocType =
  | 'business_plan'
  | 'research_report'
  | 'strategy'
  | 'competitive_analysis'
  | 'marketing_plan'
  | 'investment_memo'
  | 'technical_doc'
  | 'project_plan'
  | 'content_strategy'
  | 'generic';

function detectDocType(task: string): DocType {
  const t = task.toLowerCase();
  if (/business plan|startup plan|company plan|venture plan/.test(t))        return 'business_plan';
  if (/invest|pitch deck|term sheet|valuation|funding|seed|series [a-c]/.test(t)) return 'investment_memo';
  if (/competit|market landscape|competitor|benchmark|compare compan/.test(t)) return 'competitive_analysis';
  if (/market(ing)? plan|go.to.market|gtm|campaign|launch plan|brand strat/.test(t)) return 'marketing_plan';
  if (/research|analysis|study|findings|survey|data|report/.test(t))         return 'research_report';
  if (/strategy|strategic|roadmap|vision|long.term|direction/.test(t))       return 'strategy';
  if (/technical|architecture|system design|infra|stack|engineering|api/.test(t)) return 'technical_doc';
  if (/project plan|sprint|timeline|milestone|deliverable|scope/.test(t))    return 'project_plan';
  if (/content|editorial|blog|seo|social media|copy|newsletter/.test(t))     return 'content_strategy';
  return 'generic';
}

function getDocTemplate(docType: DocType, task: string): string {
  const templates: Record<DocType, string> = {
    business_plan: `
DOCUMENT TYPE: Business Plan
REQUIRED STRUCTURE — follow this exactly:
# [Company / Venture Name]
## Executive Summary
One compelling paragraph: what the business is, who it serves, why now, what it needs.

## The Problem
What pain exists. Who suffers from it. How big the gap is. Real evidence.

## The Solution
What the product/service does. Key differentiators. Why it's better than status quo.

## Market Opportunity
TAM / SAM / SOM with real numbers. Market trends supporting timing.

## Business Model
How it makes money. Pricing structure. Unit economics if calculable.

## Go-To-Market Strategy
Launch channel, customer acquisition approach, first 90 days, growth levers.

## Competitive Landscape
| Competitor | Strength | Weakness | Our Edge |
Fill this table.

## Traction & Milestones
What exists today. What the next 6–12 months look like. Key metrics to hit.

## Team
Key roles needed / present. Why this team can execute.

## Financial Projections
Year 1–3 revenue targets. Key cost assumptions. Path to profitability.

## Next Steps
3–5 specific, actionable items to move forward this week.`,

    investment_memo: `
DOCUMENT TYPE: Investment Memo
REQUIRED STRUCTURE — follow this exactly:
# Investment Memo: [Company / Opportunity Name]
## The Opportunity
One crisp paragraph — why this investment is worth considering now.

## Market Size & Timing
TAM/SAM/SOM. Why the market is ready. Tailwinds. Data-backed.

## Business Model
Revenue streams. Unit economics. Scalability. Margins.

## Traction
Revenue, users, growth rate, retention, key partnerships — whatever exists.

## Competitive Moat
What makes this defensible. Network effects, IP, switching costs, brand.

## Team
Founders and key hires. Relevant experience. Why them.

## Deal Terms
Raise amount, valuation, instrument (SAFE/equity), use of funds breakdown.

## Risks & Mitigations
| Risk | Likelihood | Mitigation |
Table format.

## Return Scenario Analysis
Bear / Base / Bull case outcomes with rationale.

## Recommendation
Clear verdict: invest / pass / follow-up. With reasoning.

## Next Steps
What happens next. Due diligence items. Decision timeline.`,

    competitive_analysis: `
DOCUMENT TYPE: Competitive Analysis
REQUIRED STRUCTURE — follow this exactly:
# Competitive Analysis: [Market / Category]
## Executive Summary
Market overview in 3 sentences. Who the main players are. Key battleground.

## Market Overview
Size, growth rate, key trends. Who is winning and why today.

## Competitor Profiles
For each major competitor (minimum 3):
### [Competitor Name]
- **Founded / Size:**
- **Core Offering:**
- **Target Customer:**
- **Pricing Model:**
- **Key Strengths:**
- **Known Weaknesses:**

## Head-to-Head Comparison
| Feature / Dimension | [Us / Target] | Competitor A | Competitor B | Competitor C |
Fill every cell with specific data.

## Positioning Map
Describe the X/Y axes (e.g. price vs. quality) and where each player sits.

## Whitespace & Gaps
Where the market is underserved. What no one is doing well.

## Strategic Recommendations
What to do based on this analysis. Where to compete, where to avoid.

## Next Steps
3–5 specific actions to take based on findings.`,

    marketing_plan: `
DOCUMENT TYPE: Marketing Plan
REQUIRED STRUCTURE — follow this exactly:
# Marketing Plan: [Product / Brand]
## Executive Summary
Goal, timeframe, top-line strategy, expected outcome.

## Target Audience
Primary persona (demographics, psychographics, pain points, channels they use).
Secondary persona if relevant.

## Positioning & Messaging
Core value proposition. Tagline. Key messages per audience segment.

## Channel Strategy
For each channel (minimum 4 — pick what's relevant):
### [Channel Name]
- **Goal:**
- **Tactics:**
- **Content types:**
- **KPIs:**
- **Budget allocation:**

## Campaign Calendar
| Month | Campaign | Channel | Goal | Budget |
Fill for next 3–6 months.

## Budget Breakdown
Total budget. Allocation by channel. Expected CAC and ROAS.

## KPIs & Success Metrics
What we measure. Baseline. Target. How we track.

## Next Steps
3–5 specific actions to begin immediately.`,

    research_report: `
DOCUMENT TYPE: Research Report
REQUIRED STRUCTURE — follow this exactly:
# Research Report: [Topic]
## Abstract
What this report covers, why it matters, and the core conclusion in 2–3 sentences.

## Key Findings
5–7 bullet points. The most important things someone should take away.

## Background & Context
Why this topic matters. What's been established. What's still unknown.

## Methodology
How this analysis was conducted. Sources used. Scope and limitations.

## Detailed Analysis
Break into thematic sections with subheadings. Use data, examples, and evidence. Include tables where comparisons exist.

## What the Data Shows
The patterns, trends, or conclusions the analysis surfaces.

## Implications
What this means for the reader's situation, industry, or decision.

## Recommendations
Specific, prioritized actions based on findings.

## Appendix / Sources
List key references, data points, or sources cited.

## Next Steps
What to do with this information.`,

    strategy: `
DOCUMENT TYPE: Strategic Plan
REQUIRED STRUCTURE — follow this exactly:
# Strategic Plan: [Organization / Initiative]
## Executive Summary
Where we are. Where we're going. How we get there. 1 paragraph.

## Situation Analysis
### Strengths
### Weaknesses
### Opportunities
### Threats
(Full SWOT — be specific, not generic)

## Strategic Objectives
3–5 objectives. Each should be specific and measurable.

## Strategic Pillars
For each pillar:
### Pillar [N]: [Name]
- **What it means:**
- **Why it matters:**
- **Key initiatives:**
- **Owner / Accountable:**
- **Success metric:**

## Execution Roadmap
| Initiative | Q1 | Q2 | Q3 | Q4 | Owner | KPI |
Fill the full year.

## Resource Requirements
People, budget, technology, partnerships needed.

## Risk Register
| Risk | Impact | Probability | Mitigation |
Table format.

## KPIs & Measurement Cadence
What we track. How often. Who reviews.

## Next Steps
Immediate actions to activate this strategy.`,

    technical_doc: `
DOCUMENT TYPE: Technical Document
REQUIRED STRUCTURE — follow this exactly:
# [System / Architecture / Feature Name]
## Overview
What this system does. Who uses it. Why it was built this way.

## Architecture Diagram (Description)
Describe the components and how they connect. Use ASCII diagram or structured list.

## Core Components
For each component:
### [Component Name]
- **Purpose:**
- **Technology:**
- **Interfaces:**
- **Key decisions / tradeoffs:**

## Data Flow
Step-by-step: how data moves through the system. Inputs → Processing → Outputs.

## API / Interface Contracts
Endpoints, schemas, or interfaces. Use code blocks for specifics.

## Infrastructure & Deployment
Where it runs. How it's deployed. Environment configuration.

## Security Considerations
Auth, data protection, threat model, known risks.

## Scaling & Performance
Bottlenecks. Scaling strategy. SLAs or latency targets.

## Known Limitations & Tech Debt
Be honest about what's imperfect and why.

## Runbook / Operational Notes
How to deploy, monitor, debug, and roll back.

## Next Steps
What gets built next. Prioritized.`,

    project_plan: `
DOCUMENT TYPE: Project Plan
REQUIRED STRUCTURE — follow this exactly:
# Project Plan: [Project Name]
## Project Overview
Goal, scope, key stakeholders, success definition.

## Objectives & Success Criteria
| Objective | Success Metric | Target |
Table format.

## Scope
### In Scope
### Out of Scope
### Assumptions

## Team & Roles
| Role | Responsibility | Person |
Table format.

## Milestones & Timeline
| Milestone | Deliverable | Due Date | Owner | Status |
Fill for each phase.

## Detailed Task Breakdown
For each phase:
### Phase [N]: [Name]
- [ ] Task 1
- [ ] Task 2
(Checkable tasks)

## Budget
| Category | Estimated Cost | Notes |
Table format.

## Risk Register
| Risk | Impact | Probability | Mitigation | Owner |

## Dependencies
What this project depends on. What depends on this project.

## Communication Plan
How the team stays aligned. Cadence, tools, escalation path.

## Next Steps
First 5 things to do to activate this plan.`,

    content_strategy: `
DOCUMENT TYPE: Content Strategy
REQUIRED STRUCTURE — follow this exactly:
# Content Strategy: [Brand / Product]
## Executive Summary
Content goal, primary channel, audience, expected outcome.

## Audience & Voice
### Primary Audience
Who they are. What they care about. Where they consume content.
### Brand Voice & Tone
Adjectives. Examples of on-brand vs. off-brand language.

## Content Pillars
3–5 themes that anchor all content:
### Pillar [N]: [Name]
- **Why it matters to audience:**
- **Content types:**
- **Example topics:**

## Channel Strategy
| Channel | Goal | Format | Frequency | KPI |
Table format.

## Editorial Calendar
| Week | Topic | Pillar | Format | Channel | CTA |
Fill 4–8 weeks.

## SEO / Discovery
Target keywords. Content gaps. Competitive search landscape.

## Distribution & Promotion
How each piece gets amplified after publishing.

## Metrics & Measurement
What success looks like. Monthly / quarterly review cadence.

## Next Steps
First content pieces to produce. Publication targets.`,

    generic: `
DOCUMENT TYPE: Strategic Deliverable
REQUIRED STRUCTURE — follow this exactly:
# [Title Derived From Task]
## Executive Summary
The full answer to the task in 2–3 sentences. What was asked, what was found, what is recommended.

## Key Findings
5–7 bullet points of the most important takeaways.

## Background
Context needed to understand this document.

## Analysis
The core substance. Break into clear sections with ## subheadings. Use tables for comparisons. Use numbered lists for processes. Use bullet lists for options.

## Recommendations
Specific, prioritized actions. Not vague advice — real steps.

## Implementation Considerations
What could go wrong. Dependencies. Resources needed.

## Next Steps
3–5 specific things to do right now, this week.`,
  };

  return templates[docType];
}

/** Detect which formats are most relevant given content + original task */
function detectFormats(text: string, task: string): ExportFormat[] {
  const hasMarkdownTable = /\|.+\|.+\|/.test(text);
  const taskLc           = task.toLowerCase();
  const wantsData        = /table|spreadsheet|csv|data|dataset|numbers|metrics|kpi/i.test(taskLc);
  const wantsJson        = /json|api|schema|struct|object/i.test(taskLc);

  // PDF is always the primary output — it's the professional deliverable format
  const out: ExportFormat[] = ['pdf', 'html', 'md'];
  if (hasMarkdownTable || wantsData) out.push('csv');
  if (wantsJson)                     out.push('json');
  out.push('txt');
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
    return text.split('\n').map(l => `"${l.replace(/"/g, '""')}"`).join('\n');
  }

  if (format === 'json') {
    return JSON.stringify({ task, generated: new Date().toISOString(), content: text }, null, 2);
  }

  if (format === 'html' || format === 'pdf') {
    const dateStr  = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    const colors   = ['#818cf8','#22d3ee','#34d399','#f59e0b','#f87171','#c084fc','#fb7185'];

    // ── Collect ALL markdown tables for chart generation ─────────────────
    const allTables: Array<{ headers: string[]; rows: string[][] }> = [];
    const tableRegex = /(\|.+\|\n)([\s\S]*?)(?=\n[^|]|\n$|$)/g;
    let tm: RegExpExecArray | null;
    const fullText = text;
    while ((tm = tableRegex.exec(fullText)) !== null) {
      const block = tm[0];
      const lines = block.split('\n').filter(l => /\|.+\|/.test(l) && !/^[\s|:-]+$/.test(l));
      if (lines.length >= 2) {
        const headers = lines[0].split('|').map(s => s.trim()).filter(Boolean);
        const rows    = lines.slice(1).map(l => l.split('|').map(s => s.trim()).filter(Boolean));
        allTables.push({ headers, rows });
      }
    }

    // Build chart blocks for tables with numeric columns
    const chartBlocks: string[] = [];
    allTables.forEach((tbl, ti) => {
      const numericCols = tbl.headers.slice(1).map((h, ci) => ({
        h, ci,
        vals: tbl.rows.map(r => parseFloat(r[ci + 1])).filter(v => !isNaN(v)),
      })).filter(c => c.vals.length >= tbl.rows.length * 0.5);
      if (numericCols.length === 0) return;
      const labels   = JSON.stringify(tbl.rows.map(r => r[0] || ''));
      const datasets = JSON.stringify(numericCols.map(({ h, ci, vals: _ }) => ({
        label: h,
        data:  tbl.rows.map(r => parseFloat(r[ci + 1]) || 0),
        backgroundColor: colors[ci % colors.length] + '99',
        borderColor:     colors[ci % colors.length],
        borderWidth: 2,
        borderRadius: 4,
      })));
      chartBlocks.push(`<div class="chart-wrap"><canvas id="chart${ti}"></canvas></div>
<script>
(function(){
  var ctx=document.getElementById('chart${ti}');
  if(!ctx)return;
  new Chart(ctx,{type:'bar',data:{labels:${labels},datasets:${datasets}},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:12}}}},scales:{x:{ticks:{color:'#64748b'},grid:{color:'rgba(255,255,255,0.05)'}},y:{ticks:{color:'#64748b'},grid:{color:'rgba(255,255,255,0.05)'},beginAtZero:true}}}});
})();
</script>`);
    });

    // ── Markdown → HTML ───────────────────────────────────────────────────
    const md2html = (md: string): string => {
      const lines  = md.split('\n');
      const output: string[] = [];
      let inList   = false;
      let listType = 'ul';
      let inTable  = false;
      let tableHtml = '';

      const flushList = () => {
        if (inList) { output.push(`</${listType}>`); inList = false; }
      };
      const flushTable = () => {
        if (inTable) { output.push('</tbody></table></div>'); inTable = false; tableHtml = ''; }
      };

      lines.forEach((line, i) => {
        // Table
        if (/^\|.+\|/.test(line)) {
          if (/^[\s|:-]+$/.test(line)) return; // separator row
          flushList();
          const cells = line.split('|').map(s => s.trim()).filter(Boolean);
          if (!inTable) {
            // first row = header
            inTable = true;
            output.push('<div class="table-wrap"><table><thead><tr>' +
              cells.map(c => `<th>${inlineFormat(c)}</th>`).join('') +
              '</tr></thead><tbody>');
          } else {
            output.push('<tr>' + cells.map(c => `<td>${inlineFormat(c)}</td>`).join('') + '</tr>');
          }
          return;
        }
        if (inTable) flushTable();

        // Headings
        const h4 = line.match(/^####\s+(.+)/);
        const h3 = line.match(/^###\s+(.+)/);
        const h2 = line.match(/^##\s+(.+)/);
        const h1 = line.match(/^#\s+(.+)/);
        if (h1) { flushList(); output.push(`<h1>${inlineFormat(h1[1])}</h1>`); return; }
        if (h2) { flushList(); output.push(`<h2>${inlineFormat(h2[1])}</h2>`); return; }
        if (h3) { flushList(); output.push(`<h3>${inlineFormat(h3[1])}</h3>`); return; }
        if (h4) { flushList(); output.push(`<h4>${inlineFormat(h4[1])}</h4>`); return; }

        // Code block
        if (line.startsWith('```')) {
          flushList();
          // just push a marker; handled by later replace
          output.push(line); return;
        }

        // Bullets
        const ul = line.match(/^[-*]\s+(.+)/);
        const ol = line.match(/^(\d+)\.\s+(.+)/);
        const cb = line.match(/^- \[([x ])\]\s+(.+)/i);
        if (cb) {
          if (!inList || listType !== 'ul') { flushList(); output.push('<ul class="checklist">'); inList = true; listType = 'ul'; }
          const checked = cb[1].toLowerCase() === 'x';
          output.push(`<li class="check-item ${checked ? 'checked' : ''}">${inlineFormat(cb[2])}</li>`);
          return;
        }
        if (ul) {
          if (!inList || listType !== 'ul') { flushList(); output.push('<ul>'); inList = true; listType = 'ul'; }
          output.push(`<li>${inlineFormat(ul[1])}</li>`); return;
        }
        if (ol) {
          if (!inList || listType !== 'ol') { flushList(); output.push('<ol>'); inList = true; listType = 'ol'; }
          output.push(`<li>${inlineFormat(ol[2])}</li>`); return;
        }

        flushList();

        // HR
        if (/^---+$/.test(line.trim())) { output.push('<hr />'); return; }

        // Blank line
        if (!line.trim()) { output.push(''); return; }

        // Paragraph
        output.push(`<p>${inlineFormat(line)}</p>`);
      });

      flushList();
      flushTable();

      // Fix code blocks
      let html = output.join('\n');
      html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
      return html;
    };

    const inlineFormat = (s: string) => s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // ── Extract H2 sections for sidebar TOC ──────────────────────────────
    const h2Matches = [...text.matchAll(/^##\s+(.+)$/gm)].map(m => m[1]);
    const tocHtml = h2Matches.length > 1
      ? `<nav class="toc"><div class="toc-title">Contents</div><ul>${
          h2Matches.map((h, i) => `<li><a href="#sec${i}">${h}</a></li>`).join('')
        }</ul></nav>`
      : '';

    // Inject section IDs
    let bodyHtml = md2html(text);
    let secIdx   = 0;
    bodyHtml = bodyHtml.replace(/<h2>/g, () => `<h2 id="sec${secIdx++}">`);

    // Append chart blocks after the first table-wrap each
    let chartIdx = 0;
    bodyHtml = bodyHtml.replace(/<\/div>\n(?=<[^t])/g, (m) => {
      if (chartIdx < chartBlocks.length) return m + chartBlocks[chartIdx++] + '\n';
      return m;
    });
    // Append remaining charts at end
    while (chartIdx < chartBlocks.length) bodyHtml += chartBlocks[chartIdx++];

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${task.slice(0, 80)}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
/* ── Base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --ink: #1e293b; --ink2: #334155; --ink3: #475569;
  --accent: #4f46e5; --accent2: #0ea5e9; --accent3: #10b981;
  --bg: #ffffff; --bg2: #f8fafc; --bg3: #f1f5f9;
  --border: #e2e8f0; --border2: #cbd5e1;
  --radius: 10px;
}
html { font-size: 15px; }
body {
  background: var(--bg); color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
  line-height: 1.75;
}

/* ── Cover ── */
.cover {
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0c1a3a 100%);
  color: #fff; padding: 72px 64px 60px; position: relative; overflow: hidden;
  page-break-after: always;
}
.cover::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse 80% 60% at 70% 40%, rgba(99,102,241,0.25) 0%, transparent 70%);
  pointer-events: none;
}
.cover-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(99,102,241,0.25); border: 1px solid rgba(99,102,241,0.5);
  color: #a5b4fc; border-radius: 20px; padding: 4px 14px; font-size: .7rem;
  font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 28px;
}
.cover h1 {
  font-size: 2.6rem; font-weight: 800; line-height: 1.2; color: #fff;
  max-width: 720px; margin-bottom: 20px;
}
.cover-sub {
  font-size: 1rem; color: rgba(255,255,255,0.55); max-width: 600px; margin-bottom: 48px;
}
.cover-meta {
  display: flex; gap: 32px; flex-wrap: wrap;
  border-top: 1px solid rgba(255,255,255,0.12); padding-top: 24px;
}
.cover-meta-item { display: flex; flex-direction: column; gap: 2px; }
.cover-meta-label { font-size: .65rem; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: .08em; }
.cover-meta-value { font-size: .85rem; color: rgba(255,255,255,0.8); font-weight: 500; }

/* ── Layout ── */
.layout { display: flex; align-items: flex-start; max-width: 1100px; margin: 0 auto; padding: 0 24px; }
.toc {
  width: 220px; flex-shrink: 0; position: sticky; top: 32px;
  padding: 24px 0 24px 0; margin-right: 40px; align-self: flex-start;
}
.toc-title {
  font-size: .65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink3); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--accent);
  display: inline-block;
}
.toc ul { list-style: none; }
.toc li { margin: 0; }
.toc a {
  display: block; padding: 5px 0; font-size: .78rem; color: var(--ink3);
  text-decoration: none; border-left: 2px solid transparent;
  padding-left: 10px; transition: all .15s;
}
.toc a:hover { color: var(--accent); border-color: var(--accent); }

.main { flex: 1; min-width: 0; padding: 40px 0 80px; }

/* ── Headings ── */
h1 { font-size: 1.9rem; font-weight: 800; color: var(--ink); margin: 0 0 8px; line-height: 1.25; }
h2 {
  font-size: 1.2rem; font-weight: 700; color: var(--ink);
  margin: 44px 0 14px; padding-bottom: 8px;
  border-bottom: 2px solid var(--border);
  display: flex; align-items: center; gap: 10px;
}
h2::before {
  content: ''; display: inline-block; width: 4px; height: 18px;
  background: linear-gradient(180deg, var(--accent), var(--accent2));
  border-radius: 2px; flex-shrink: 0;
}
h3 { font-size: 1rem; font-weight: 700; color: var(--ink2); margin: 28px 0 10px; }
h4 { font-size: .9rem; font-weight: 600; color: var(--ink3); margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .05em; }

/* ── Body copy ── */
p { margin: 10px 0; color: var(--ink2); }
ul, ol { margin: 10px 0 10px 22px; color: var(--ink2); }
li { margin: 5px 0; }
strong { color: var(--ink); font-weight: 600; }
em { font-style: italic; color: var(--ink2); }
a { color: var(--accent); text-decoration: underline; }
hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }

/* ── Checklist ── */
.checklist { list-style: none; margin-left: 0; }
.check-item { padding: 4px 0 4px 26px; position: relative; }
.check-item::before {
  content: '☐'; position: absolute; left: 0; color: var(--ink3); font-size: 1rem;
}
.check-item.checked::before { content: '☑'; color: var(--accent3); }

/* ── Tables ── */
.table-wrap { overflow-x: auto; margin: 20px 0; border-radius: var(--radius); border: 1px solid var(--border); }
table { width: 100%; border-collapse: collapse; font-size: .875rem; }
thead { background: linear-gradient(135deg, #4f46e5, #0ea5e9); }
thead th { color: #fff; font-weight: 600; padding: 11px 16px; text-align: left; white-space: nowrap; }
tbody tr { border-bottom: 1px solid var(--border); transition: background .1s; }
tbody tr:last-child { border-bottom: none; }
tbody tr:nth-child(even) { background: var(--bg3); }
tbody tr:hover { background: #eff6ff; }
td { padding: 10px 16px; color: var(--ink2); vertical-align: top; }

/* ── Code ── */
code { background: #f1f5f9; color: #4f46e5; padding: 2px 6px; border-radius: 4px; font-size: .85em; font-family: 'SF Mono', 'Fira Code', monospace; }
pre { background: #0f172a; border-radius: var(--radius); padding: 20px; overflow-x: auto; margin: 16px 0; }
pre code { background: none; color: #e2e8f0; padding: 0; font-size: .85rem; }

/* ── Charts ── */
.chart-wrap { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; margin: 24px 0; max-width: 680px; }

/* ── Print / PDF ── */
@media print {
  @page { size: A4; margin: 20mm 18mm; }
  body { font-size: 13px; }
  .cover { page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .toc { display: none; }
  .layout { display: block; padding: 0; }
  .main { padding: 0; }
  h2 { page-break-after: avoid; margin-top: 28px; }
  h3 { page-break-after: avoid; }
  .table-wrap, .chart-wrap { page-break-inside: avoid; }
  thead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover-badge, h2::before { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover">
  <div class="cover-badge">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#a5b4fc" stroke-width="1.5"/><path d="M6 3v3l2 1" stroke="#a5b4fc" stroke-width="1.2" stroke-linecap="round"/></svg>
    Bleumr Mission Team · 3-Agent Synthesis
  </div>
  <h1>${task}</h1>
  <p class="cover-sub">A professional deliverable produced by Planner, Researcher, and Synth — the Bleumr Mission Team intelligence system.</p>
  <div class="cover-meta">
    <div class="cover-meta-item">
      <span class="cover-meta-label">Generated</span>
      <span class="cover-meta-value">${dateStr}</span>
    </div>
    <div class="cover-meta-item">
      <span class="cover-meta-label">System</span>
      <span class="cover-meta-value">JUMARI 1.0 · Bleumr</span>
    </div>
    <div class="cover-meta-item">
      <span class="cover-meta-label">Rounds</span>
      <span class="cover-meta-value">5 Agent Dialogue Rounds</span>
    </div>
    <div class="cover-meta-item">
      <span class="cover-meta-label">Classification</span>
      <span class="cover-meta-value">Confidential</span>
    </div>
  </div>
</div>

<!-- Body -->
<div class="layout">
  ${tocHtml}
  <div class="main">
    ${bodyHtml}
  </div>
</div>

</body>
</html>`;
  }

  return text;
}

function triggerDownload(content: string, filename: string, mime: string, isPdf = false) {
  if (isPdf) {
    // Wrap content in a print-ready HTML page and download as HTML (user can print to PDF from there)
    const htmlContent = content.startsWith('<') ? content : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1a1a1a}h1,h2,h3{margin-top:1.5em}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}</style></head><body>${content.replace(/\n/g,'<br>')}</body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return;
  }
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
                      if (meta) triggerDownload(file.content, `${file.name}.${file.format}`, meta.mime, file.format === 'pdf');
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
  statuses, agentStreaming: agentBubble, agentPhaseLabel, selected, onSelect, fileCount, onCabinetClick,
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
          style={{ width: 200, height: 200, background: 'radial-gradient(circle,rgba(99,102,241,0.07) 0%,transparent 70%)', filter: 'blur(8px)', willChange: 'transform', transform: 'translateZ(0)' }} />
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

        // Use the sentence-complete bubble text (no per-token choppiness)
        const cleanBubble = agentBubble[agent.id] || '';

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
  // agentBubble only updates when a complete sentence is detected — no per-token choppiness
  const [agentBubble, setAgentBubble] = useState<Record<AgentId, string>>({ planner: '', researcher: '', synth: '' });
  const [agentPhaseLabel, setAgentPhaseLabel] = useState<Record<AgentId, string>>({ planner: '', researcher: '', synth: '' });
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [lastTask, setLastTask] = useState('');
  const [viewMode, setViewMode] = useState<'side' | 'top'>(IS_ELECTRON ? 'side' : 'top');
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
  const appendAgentStream = (id: AgentId, tok: string) => setAgentStreaming(p => {
    const next = p[id] + tok;
    // Only update the bubble when a complete sentence lands
    const sentence = getLastCompleteSentences(next, 180);
    if (sentence) setAgentBubble(b => ({ ...b, [id]: sentence }));
    return { ...p, [id]: next };
  });
  const clearAgentStream = (id: AgentId) => {
    setAgentStreaming(p => ({ ...p, [id]: '' }));
    setAgentBubble(b => ({ ...b, [id]: '' }));
  };

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

      const docType = detectDocType(task);
      const docTemplate = getDocTemplate(docType, task);

      await groq(
        AGENTS[2].model,
        [
          {
            role: 'system',
            content: `${BLEUMR_AGENT_PREFIX}
You're Synth — the final writer on the Bleumr Mission Team. You just watched Planner and Researcher debate for four rounds. Now you write the finished deliverable. Not a recap — the actual document someone would pay a consultant $5,000 to produce.

STRICT RULES:
- Follow the document template structure below EXACTLY — every section, in order
- Fill every section with real, specific content from the agent conversation — no placeholders, no "TBD"
- Every table must be fully populated with real data
- Use real numbers, real timelines, real examples wherever possible
- If a section has no data from the conversation, use your knowledge to fill it intelligently
- Write at McKinsey / Tier-1 consultant level — precise, structured, actionable
- THOROUGH: this is a deep-work document saved to File Cabinet — make every section worth reading
- Produce markdown output only — no preamble, no "here is your document", just the document itself

${docTemplate}`,
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

Write the complete final deliverable following the template structure exactly:`,
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

      // Parse any <schedule> tags Synth may have emitted and fire toast + open scheduler
      const schedRegex = /<schedule>([\s\S]*?)<\/schedule>/gi;
      let schedMatch;
      let foundSchedule = false;
      while ((schedMatch = schedRegex.exec(full)) !== null) {
        try {
          const data = JSON.parse(schedMatch[1].trim());
          if (data.title && data.date) {
            addScheduleEvent(data);
            window.dispatchEvent(new Event('orbit_schedule_update'));
            window.dispatchEvent(new CustomEvent('orbit_scheduling_toast', { detail: data }));
            foundSchedule = true;
          }
        } catch { /* ignore malformed tags */ }
      }
      if (foundSchedule) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('orbit_open_scheduler')), 900);
      }

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
      trackError('groq', 'workspace', e?.message || 'Mission team orchestration failed');
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
    <div className="flex flex-col h-full overflow-y-auto sm:overflow-hidden" style={{ background: 'linear-gradient(135deg,#04060e 0%,#060a18 60%,#040810 100%)', fontFamily: 'inherit' }}>

      {/* Minimal top bar — pl-[90px] clears macOS hiddenInset traffic lights */}
      <div className="flex items-center justify-between pr-4 py-2 shrink-0 sticky top-0 z-[60]"
        style={{ paddingLeft: IS_ELECTRON ? 90 : 16, paddingTop: IS_ELECTRON ? undefined : 'env(safe-area-inset-top)', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(4,6,14,0.95)', backdropFilter: 'blur(20px)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2">
          {phase !== 'idle' && <PhaseRail phase={phase} />}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          {IS_ELECTRON && <div className="flex items-center rounded-xl overflow-hidden"
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
          </div>}
          <button onClick={onClose}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col sm:flex-row flex-1 min-h-0">

        {/* ── LEFT: Office ────────────────────────────────────────── */}
        <div className="relative flex-1 overflow-hidden min-h-[280px] sm:min-h-0" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>

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

          {/* ══ ROOM SHAPE — clearly front-facing 2D ══════════════════════════════ */}

          {/* Base fill */}
          <div className="absolute inset-0" style={{ background: '#090b12' }} />

          {/* ── Ceiling slab ── */}
          <div className="absolute top-0 left-0 right-0" style={{ height: '10%', background: 'linear-gradient(180deg,#1e2234 0%,#131829 100%)', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
            {/* Crown moulding */}
            <div className="absolute bottom-0 left-0 right-0" style={{ height: 1.5, background: 'rgba(255,255,255,0.14)' }} />
            {/* Recessed panel lines */}
            {[25, 50, 75].map(pct => (
              <div key={pct} className="absolute top-2 bottom-2" style={{ left: `${pct}%`, width: 1, background: 'rgba(255,255,255,0.04)' }} />
            ))}
            {/* Overhead strip lights — 3 glowing bars */}
            {[22, 50, 78].map((pct, li) => (
              <div key={pct} className="absolute bottom-0" style={{ left: `${pct}%`, transform: 'translateX(-50%)', width: 100 }}>
                {/* Light bar housing */}
                <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, height: 4, background: 'rgba(30,35,55,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 }} />
                {/* Glowing tube */}
                <motion.div style={{ position: 'absolute', bottom: 3, left: 4, right: 4, height: 2.5, background: 'linear-gradient(90deg,rgba(200,215,255,0.15),rgba(220,235,255,0.55),rgba(200,215,255,0.15))', borderRadius: 2, boxShadow: '0 0 8px rgba(200,220,255,0.5), 0 0 16px rgba(180,200,255,0.25)' }}
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 4, repeat: Infinity, delay: li * 1.2 }}
                />
                {/* Light cone cast down onto room */}
                <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ bottom: -40, width: 130, height: 40, background: 'radial-gradient(ellipse at 50% 0%, rgba(180,200,255,0.07) 0%, transparent 70%)', filter: 'blur(4px)' }} />
              </div>
            ))}
          </div>



          {/* ── Back wall (full width) ── */}
          <div className="absolute" style={{ top: '10%', bottom: '22%', left: 0, right: 0, background: 'linear-gradient(180deg,#0e1222 0%,#0b0f1c 100%)' }}>
            {/* Vertical panel dividers */}
            {[20, 40, 60, 80].map(pct => (
              <div key={pct} className="absolute top-0 bottom-0" style={{ left: `${pct}%`, width: 1, background: 'linear-gradient(180deg,transparent,rgba(255,255,255,0.04),transparent)' }} />
            ))}
            {/* Chair-rail moulding */}
            <div className="absolute left-0 right-0" style={{ bottom: '28%', height: 2, background: 'rgba(255,255,255,0.07)' }} />
            <div className="absolute left-0 right-0" style={{ bottom: 'calc(28% + 3px)', height: 1, background: 'rgba(255,255,255,0.03)' }} />
            {/* Subtle horizontal grain */}
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 5px,rgba(255,255,255,0.007) 5px,rgba(255,255,255,0.007) 6px)', opacity: 0.6 }} />
            {/* Ceiling-bounce bloom from lights */}
            <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: '18%', background: 'linear-gradient(180deg,rgba(140,160,220,0.05) 0%,transparent 100%)' }} />

          </div>

          {/* ── Floor — with perspective lines converging to vanishing point ── */}
          <div className="absolute left-0 right-0 bottom-0" style={{ height: '22%', background: 'linear-gradient(180deg,#0d1118 0%,#080b12 100%)', borderTop: '2px solid rgba(255,255,255,0.08)' }}>
            {/* Baseboard trim line */}
            <div className="absolute top-0 left-0 right-0" style={{ height: 1.5, background: 'rgba(255,255,255,0.14)' }} />
            {/* Perspective floor planks — lines fan from vanishing point at top-centre */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {[-40, -22, -8, 0, 8, 22, 40, 55, 70, 85, 100, 115, 130].map((x, i) => (
                <line key={i} x1={x} y1="0" x2={50 + (x - 50) * 3.5} y2="100" stroke="rgba(255,255,255,0.032)" strokeWidth="0.45" />
              ))}
              {[18, 36, 55, 75].map(y => (
                <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.028)" strokeWidth="0.45" />
              ))}
            </svg>
            {/* Chair mats — subtle rectangles under each station */}
            {[18, 50, 82].map((pct, i) => (
              <div key={i} className="absolute top-0 rounded-sm"
                style={{ left: `${pct - 10}%`, width: '18%', height: '60%', background: `linear-gradient(180deg,rgba(${i===0?'99,102,241':i===1?'6,182,212':'16,185,129'},0.04) 0%,transparent 100%)`, border: `1px solid rgba(${i===0?'99,102,241':i===1?'6,182,212':'16,185,129'},0.06)`, borderBottom: 'none' }} />
            ))}
            {/* Floor gloss near base */}
            <div className="absolute bottom-0 left-0 right-0" style={{ height: '30%', background: 'linear-gradient(180deg,transparent 0%,rgba(80,100,200,0.04) 100%)' }} />
            {/* Light cone pools from overhead lights hitting the floor */}
            {[22, 50, 78].map(pct => (
              <div key={pct} className="absolute top-0 pointer-events-none" style={{ left: `${pct}%`, transform: 'translateX(-50%)', width: 120, height: '100%', background: 'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(180,200,255,0.045) 0%, transparent 70%)' }} />
            ))}
          </div>



          {/* ── Windows — pushed to edges, no overlap with center sign ── */}
          {([
            { style: { left: 0 }, nebulaColor: 'rgba(99,102,241,0.22)', dir: -1 as const },
            { style: { right: 0 }, nebulaColor: 'rgba(52,211,153,0.16)', dir: 1 as const },
          ]).map((w, wi) => (
            <div key={wi} className="absolute rounded-2xl overflow-hidden"
              style={{
                width: 220, height: 250,
                top: '7%',
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
          {[{ left: 0 }, { right: 0 }].map((pos, wi) => (
            <div key={wi} className="absolute rounded-b-sm"
              style={{
                width: 230, height: 8, top: 'calc(7% + 250px)',
                ...pos,
                background: 'linear-gradient(180deg,#1a1d28,#12141e)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }} />
          ))}

          {/* ── Ambient light pools from windows onto floor ── */}
          <div className="absolute pointer-events-none" style={{ left: 0, width: 200, bottom: '16%', height: 80, background: 'radial-gradient(ellipse 80% 50% at 30% 100%,rgba(99,102,241,0.06) 0%,transparent 70%)' }} />
          <div className="absolute pointer-events-none" style={{ right: 0, width: 200, bottom: '16%', height: 80, background: 'radial-gradient(ellipse 80% 50% at 70% 100%,rgba(52,211,153,0.05) 0%,transparent 70%)' }} />

          {/* ── File cabinet — standing on the floor between researcher and synth ── */}
          <div className="absolute" style={{ bottom: 50, left: 'calc(63% - 26px)', zIndex: 5 }}>
            <FileCabinetVisual fileCount={wsFiles.length} onClick={() => setCabinetOpen(true)} />
            {/* Floor shadow to ground it */}
            <div className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ bottom: -6, width: 44, height: 6, background: 'rgba(0,0,0,0.55)', filter: 'blur(4px)' }} />
          </div>

          {/* Bleumr Workspace — big centered sign on back wall */}
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{ top: '7%', width: 300, zIndex: 5 }}>
            <div className="relative flex flex-col items-center px-8 py-6 rounded-2xl"
              style={{
                background: 'linear-gradient(160deg, rgba(255,255,255,0.024) 0%, rgba(255,255,255,0.008) 100%)',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.7), inset 0 -1px 0 rgba(255,255,255,0.05), 0 2px 0 rgba(255,255,255,0.07), 0 0 60px rgba(99,102,241,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
              <InlineStarSphere size={90} />
              <div className="mt-4 flex flex-col items-center gap-1">
                <motion.span className="tracking-[0.3em] font-black text-[22px] uppercase"
                  style={{ color: 'rgba(255,255,255,0.82)', textShadow: '0 0 28px rgba(129,140,248,0.6), 0 0 60px rgba(129,140,248,0.3)' }}
                  animate={{ opacity: [0.65, 1, 0.65] }}
                  transition={{ duration: 4, repeat: Infinity }}>
                  BLEUMR
                </motion.span>
                <span className="tracking-[0.32em] text-[11px] font-bold uppercase"
                  style={{ color: 'rgba(129,140,248,0.7)', textShadow: '0 0 12px rgba(129,140,248,0.4)' }}>
                  MISSION TEAM
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                {['#818cf8','#22d3ee','#34d399'].map((c, i) => (
                  <motion.div key={i} className="rounded-full"
                    style={{ width: 28, height: 2.5, background: c }}
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4 }}
                  />
                ))}
              </div>
              <div className="absolute top-0 inset-x-6 h-px rounded-full"
                style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)' }} />
              <div className="absolute bottom-0 inset-x-6 h-px rounded-full"
                style={{ background: 'linear-gradient(90deg,transparent,rgba(129,140,248,0.12),transparent)' }} />
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
          <div className="absolute left-0 right-0 flex items-end justify-around px-1 sm:px-6" style={{ bottom: 42 }}>
            {AGENTS.map(agent => (
              <div key={agent.id} className="relative flex-shrink-0" style={{ width: 'min(30vw, 210px)', height: 'min(42vw, 280px)' }}>

                {/* Chair mat glow on floor */}
                <motion.div className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
                  style={{ bottom: -8, width: 160, height: 14, background: agent.accent, filter: 'blur(12px)', zIndex: 0 }}
                  animate={{ opacity: statuses[agent.id] === 'thinking' ? [0.1, 0.28, 0.1] : statuses[agent.id] === 'done' ? 0.14 : 0.06 }}
                  transition={{ duration: 2, repeat: Infinity }}
                />

                {/* Character — helmet peeks above standing monitor */}
                <div className="absolute left-1/2 -translate-x-1/2 origin-bottom scale-[0.55] sm:scale-100" style={{ bottom: 88, zIndex: 1 }}>
                  <AstronautCharacter
                    agent={agent}
                    status={statuses[agent.id]}
                    selected={selected === agent.id}
                    onClick={() => setSelected(p => p === agent.id ? null : agent.id)}
                    streamText={agentBubble[agent.id]}
                    phaseLabel={agentPhaseLabel[agent.id]}
                  />
                </div>

                {/* Desk — in front of character, covering lower body / chair */}
                <div className="absolute left-1/2 -translate-x-1/2 origin-bottom scale-[0.55] sm:scale-100" style={{ bottom: 0, zIndex: 2 }}>
                  <Desk agent={agent} status={statuses[agent.id]} />
                </div>
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
        <div className="w-full sm:w-[340px] flex flex-col shrink-0 relative overflow-hidden min-h-[50vh] sm:min-h-0"
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
                const ext  = fmt === 'pdf' ? 'pdf' : fmt;
                triggerDownload(buildContent(o.text, fmt, lastTask), `${slug}.${ext}`, meta.mime, fmt === 'pdf');
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
                      style={{ color: isFinal ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)', display: '-webkit-box', WebkitLineClamp: isFinal ? 8 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
