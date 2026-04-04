/**
 * OrbitToast — Live orbit finding slide-in notification
 *
 * When a new orbit finding arrives (from background checks or in-chat captures),
 * a compact animated toast slides in from the bottom-right corner. This makes
 * JUMARI feel alive and in control — even when the user is in a different chat.
 *
 * - Auto-dismisses after 8 seconds
 * - Click navigates to the orbit's source thread
 * - Stacks up to 3 toasts, oldest auto-dismissed
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import { JumariOrbitIcon } from './OrbitIcon';
import { OrbitFinding } from '../services/OrbitService';

type EnrichedFinding = OrbitFinding & { orbitId: string; orbitTitle: string; threadId?: string };

interface OrbitToastItem {
  id: string;
  finding: EnrichedFinding;
  addedAt: number;
}

interface OrbitToastProps {
  onNavigateToThread?: (threadId: string) => void;
}

const MAX_TOASTS = 3;
const TOAST_DURATION = 8000; // 8 seconds

// ── Liquid Glass Tokens ──────────────────────────────────────────
const G = {
  bg:       'rgba(10,10,22,0.65)',
  border:   'rgba(99,102,241,0.2)',
  borderDim:'rgba(255,255,255,0.06)',
  blur:     'blur(32px) saturate(170%)',
  radius:   '4px',
  glow:     '0 0 20px rgba(99,102,241,0.15), 0 8px 32px rgba(0,0,0,0.5)',
  inset:    'inset 0 1px 0 rgba(255,255,255,0.05)',
};

export function OrbitToastContainer({ onNavigateToThread }: OrbitToastProps) {
  const [toasts, setToasts] = useState<OrbitToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Exposed via ref so App.tsx can push findings
  const addToast = useCallback((finding: EnrichedFinding) => {
    const item: OrbitToastItem = {
      id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      finding,
      addedAt: Date.now(),
    };

    setToasts(prev => {
      const next = [item, ...prev];
      // Cap at MAX_TOASTS — remove oldest
      if (next.length > MAX_TOASTS) {
        const removed = next.pop();
        if (removed) {
          const timer = timersRef.current.get(removed.id);
          if (timer) { clearTimeout(timer); timersRef.current.delete(removed.id); }
        }
      }
      return next;
    });

    // Auto-dismiss after TOAST_DURATION
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== item.id));
      timersRef.current.delete(item.id);
    }, TOAST_DURATION);
    timersRef.current.set(item.id, timer);
  }, []);

  // Expose addToast globally on window for App.tsx to call
  useEffect(() => {
    (window as any).__orbitToast = addToast;
    return () => { delete (window as any).__orbitToast; };
  }, [addToast]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const handleClick = useCallback((item: OrbitToastItem) => {
    if (item.finding.threadId && onNavigateToThread) {
      onNavigateToThread(item.finding.threadId);
    }
    dismissToast(item.id);
  }, [onNavigateToThread, dismissToast]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-2 pointer-events-none"
      style={{ maxWidth: 360, fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.9 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="pointer-events-auto cursor-pointer group"
            onClick={() => handleClick(item)}
            style={{
              background: G.bg,
              backdropFilter: G.blur,
              WebkitBackdropFilter: G.blur,
              border: `1px solid ${G.border}`,
              borderRadius: G.radius,
              boxShadow: `${G.glow}, ${G.inset}`,
              overflow: 'hidden',
            }}
          >
            {/* Progress bar — shrinks over TOAST_DURATION */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: TOAST_DURATION / 1000, ease: 'linear' }}
              style={{
                height: 2,
                background: 'linear-gradient(90deg, rgba(99,102,241,0.6), rgba(139,92,246,0.4))',
                transformOrigin: 'left',
              }}
            />

            <div className="px-3.5 py-2.5 flex items-center gap-2.5">
              {/* Orbit icon with pulse */}
              <div className="shrink-0 w-7 h-7 flex items-center justify-center" style={{
                borderRadius: '3px',
                background: 'rgba(99,102,241,0.1)',
                border: '1px solid rgba(99,102,241,0.15)',
              }}>
                <JumariOrbitIcon size={15} className="text-indigo-400" animated />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-indigo-400/80 font-semibold">
                    {item.finding.orbitTitle}
                  </span>
                  <span className="text-[9px] text-slate-600">just now</span>
                </div>
                <div className="text-[12px] text-slate-300 truncate mt-0.5 leading-snug">
                  {item.finding.content.replace(/[\n\r]+/g, ' ').slice(0, 90)}
                </div>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1">
                {item.finding.threadId && (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); dismissToast(item.id); }}
                  className="p-0.5 text-slate-700 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
