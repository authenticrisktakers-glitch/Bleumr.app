/**
 * OrbitPanel — Notification feed for JUMARI Orbit findings
 *
 * NOT a management page. This is a notification center:
 * - Shows live feed of findings as orbits search
 * - Each finding links back to its source chat thread
 * - Click a finding → navigate to that conversation
 *
 * Orbits are triggered naturally in chat ("watch BTC for me")
 * — NOT through manual creation forms.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Clock, Zap, Sparkles, Bell,
  ChevronRight, MessageSquare, ExternalLink, CheckCheck
} from 'lucide-react';
import { JumariOrbitIcon } from './OrbitIcon';
import { orbitService, Orbit, OrbitFinding } from '../services/OrbitService';

interface OrbitPanelProps {
  onClose: () => void;
  onNavigateToThread?: (threadId: string) => void;
}

// ── Liquid Glass Design Tokens ─────────────────────────────────────
const G = {
  panel:    'rgba(8,8,18,0.35)',
  card:     'rgba(255,255,255,0.03)',
  cardHover:'rgba(255,255,255,0.06)',
  border:   'rgba(255,255,255,0.07)',
  borderLit:'rgba(99,102,241,0.18)',
  blur:     'blur(48px) saturate(180%)',
  blurSm:   'blur(24px) saturate(150%)',
  radius:   '4px',
  radiusSm: '2px',
  inset:    'inset 0 1px 0 rgba(255,255,255,0.04)',
};

type EnrichedFinding = OrbitFinding & { orbitId: string; orbitTitle: string; threadId?: string };

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Single notification item ──────────────────────────────────────

function NotificationItem({
  finding,
  onNavigate,
  onMarkRead,
}: {
  finding: EnrichedFinding;
  onNavigate: () => void;
  onMarkRead: () => void;
}) {
  // Auto-mark read after 3s visible
  useEffect(() => {
    if (!finding.read) {
      const timer = setTimeout(onMarkRead, 3000);
      return () => clearTimeout(timer);
    }
  }, [finding.read, onMarkRead]);

  return (
    <motion.button
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onNavigate}
      className="w-full text-left group"
      style={{
        borderRadius: G.radiusSm,
        background: 'transparent',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = G.cardHover; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div className="px-4 py-2 flex items-center gap-2.5">
        {/* Unread dot */}
        {!finding.read ? (
          <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-indigo-500" style={{ boxShadow: '0 0 4px rgba(99,102,241,0.5)' }} />
        ) : (
          <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-white/[0.06]" />
        )}

        {/* Compact content */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-indigo-400/70 font-medium shrink-0">{finding.orbitTitle}</span>
          <span className={`text-[12px] truncate ${finding.read ? 'text-slate-500' : 'text-slate-300'}`}>
            {finding.content.replace(/[\n\r]+/g, ' ').slice(0, 80)}
          </span>
        </div>

        {/* Time + arrow */}
        <span className="text-[9px] text-slate-600 shrink-0">{timeAgo(finding.timestamp)}</span>
        <ChevronRight className="w-3 h-3 text-slate-700 group-hover:text-indigo-400 shrink-0 transition-colors" />
      </div>
    </motion.button>
  );
}

// ── Active Orbit Status Strip ─────────────────────────────────────

function OrbitStatusStrip({ orbits }: { orbits: Orbit[] }) {
  const active = orbits.filter(o => o.status === 'active');
  if (active.length === 0) return null;

  return (
    <div className="px-4 py-3 flex flex-wrap gap-2" style={{ borderBottom: `1px solid ${G.border}` }}>
      {active.map(orbit => (
        <div
          key={orbit.id}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium"
          style={{
            borderRadius: G.radiusSm,
            background: 'rgba(99,102,241,0.06)',
            border: `1px solid ${G.borderLit}`,
            color: 'rgba(165,180,252,0.9)',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {orbit.title}
          <span className="text-slate-600 ml-0.5">
            · {orbit.findings.filter(f => !f.read).length} new
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Notification Panel ───────────────────────────────────────

export function OrbitPanel({ onClose, onNavigateToThread }: OrbitPanelProps) {
  const [orbits, setOrbits] = useState<Orbit[]>(() => orbitService.getAll());
  const [findings, setFindings] = useState<EnrichedFinding[]>(() => orbitService.getAllFindings());

  useEffect(() => {
    const unsub = orbitService.subscribe(() => {
      setOrbits(orbitService.getAll());
      setFindings(orbitService.getAllFindings());
    });
    return unsub;
  }, []);


  const unreadCount = findings.filter(f => !f.read).length;

  const handleNavigate = useCallback((finding: EnrichedFinding) => {
    if (finding.threadId && onNavigateToThread) {
      orbitService.markFindingRead(finding.orbitId, finding.id);
      onClose();
      onNavigateToThread(finding.threadId);
    }
  }, [onClose, onNavigateToThread]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-stretch" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Notification Panel — liquid glass, sharp edges */}
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 32, stiffness: 350 }}
        className="relative ml-auto w-full max-w-[420px] h-full flex flex-col overflow-hidden"
        style={{
          background: G.panel,
          backdropFilter: G.blur,
          WebkitBackdropFilter: G.blur,
          borderLeft: `1px solid ${G.border}`,
          boxShadow: `-24px 0 80px rgba(0,0,0,0.5), ${G.inset}`,
        }}
      >
        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${G.border}`, background: 'rgba(255,255,255,0.015)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center" style={{
              borderRadius: G.radiusSm,
              background: 'rgba(99,102,241,0.1)',
              border: `1px solid ${G.borderLit}`,
            }}>
              <JumariOrbitIcon size={18} className="text-indigo-400" animated />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-white tracking-tight">JUMARI Orbit</h2>
              <p className="text-[10px] text-slate-500">
                {unreadCount > 0 ? `${unreadCount} new finding${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => orbitService.markAllRead()}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-white transition-colors"
                style={{ borderRadius: G.radiusSm, border: `1px solid ${G.border}` }}
              >
                <CheckCheck className="w-3 h-3" />
                Read all
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              style={{ borderRadius: G.radiusSm }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active orbits strip */}
        <OrbitStatusStrip orbits={orbits} />

        {/* Findings feed */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
          {findings.length > 0 ? (
            <div className="py-1">
              {findings.map((finding, i) => (
                <React.Fragment key={finding.id}>
                  <NotificationItem
                    finding={finding}
                    onNavigate={() => handleNavigate(finding)}
                    onMarkRead={() => orbitService.markFindingRead(finding.orbitId, finding.id)}
                  />
                  {i < findings.length - 1 && (
                    <div className="mx-4" style={{ height: 1, background: G.border }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-20 px-6">
              <div className="w-14 h-14 flex items-center justify-center mb-4" style={{
                borderRadius: G.radius,
                background: 'rgba(99,102,241,0.06)',
                border: `1px solid ${G.borderLit}`,
              }}>
                <JumariOrbitIcon size={28} className="text-indigo-400/40" />
              </div>
              <div className="text-[13px] text-slate-400 font-medium mb-1 text-center">No notifications yet</div>
              <div className="text-[11px] text-slate-600 text-center max-w-[240px] leading-relaxed">
                Start an orbit by asking JUMARI to watch or track something in chat
              </div>
              <div className="mt-4 px-3 py-2 text-[11px] text-slate-500 italic" style={{
                borderRadius: G.radius,
                background: G.card,
                border: `1px solid ${G.border}`,
              }}>
                "Watch bitcoin price for me"
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-2.5 text-center text-[9px] uppercase tracking-[0.2em] text-slate-600"
          style={{ borderTop: `1px solid ${G.border}`, background: 'rgba(255,255,255,0.01)' }}>
          Always thinking. Never idle.
        </div>
      </motion.div>
    </div>
  );
}
