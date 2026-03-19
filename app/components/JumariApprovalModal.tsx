import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SafetyCheckRequest } from '../engine/SafetyMiddleware';

export function JumariApprovalModal() {
  const [request, setRequest] = useState<SafetyCheckRequest | null>(null);
  const [callbacks, setCallbacks] = useState<{ approve: () => void; deny: () => void } | null>(null);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setRequest(e.detail.request);
      setCallbacks({ approve: e.detail.approve, deny: e.detail.deny });
    };
    const timeoutHandler = () => {
      setRequest(null);
      setCallbacks(null);
    };
    window.addEventListener('jumari_require_approval' as any, handler);
    window.addEventListener('jumari_approval_timeout' as any, timeoutHandler);
    return () => {
      window.removeEventListener('jumari_require_approval' as any, handler);
      window.removeEventListener('jumari_approval_timeout' as any, timeoutHandler);
    };
  }, []);

  if (!request || !callbacks) return null;

  // Plain-English message — never show code or JSON
  const displayMessage = request.message ?? (() => {
    const t = request.actionType;
    if (t === 'PURCHASE') return 'JUMARI is about to complete a purchase.';
    if (t === 'SEND_EMAIL') return 'JUMARI is about to send an email.';
    if (t === 'POST_CONTENT') return 'JUMARI is about to post content.';
    if (t === 'DELETE_DATA') return 'JUMARI is about to delete data.';
    if (t === 'MODIFY_DATA') return 'JUMARI is about to modify data on the page.';
    return 'JUMARI is about to perform an action.';
  })();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-end justify-center pb-8"
        style={{ pointerEvents: 'none' }}
      >
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 16, opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          style={{ pointerEvents: 'auto' }}
        >
          {/* Glass card — sharp corners, no border-radius */}
          <div
            style={{
              background: 'rgba(18, 18, 22, 0.72)',
              backdropFilter: 'blur(28px) saturate(180%)',
              WebkitBackdropFilter: 'blur(28px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderTop: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
              borderRadius: 0,
              minWidth: 340,
              maxWidth: 420,
            }}
          >
            {/* Top label strip */}
            <div
              className="flex items-center gap-2 px-4 py-2 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              {/* Pulsing amber dot */}
              <div className="relative flex items-center justify-center">
                <span
                  className="absolute w-3 h-3 rounded-full animate-ping"
                  style={{ background: 'rgba(251,191,36,0.35)' }}
                />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/80">
                Permission Required
              </span>
            </div>

            {/* Message */}
            <div className="px-4 pt-3 pb-4">
              <p
                className="text-[13px] leading-snug"
                style={{ color: 'rgba(255,255,255,0.88)', fontWeight: 400 }}
              >
                {displayMessage}
              </p>
              <p
                className="text-[11px] mt-1"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                Do you give permission?
              </p>

              {/* Buttons */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => { callbacks.deny(); setRequest(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-all active:scale-95"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 0,
                    color: 'rgba(255,255,255,0.55)',
                  }}
                >
                  <X className="w-3 h-3" />
                  Deny
                </button>
                <button
                  onClick={() => { callbacks.approve(); setRequest(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition-all active:scale-95"
                  style={{
                    background: 'rgba(251,191,36,0.15)',
                    border: '1px solid rgba(251,191,36,0.30)',
                    borderRadius: 0,
                    color: '#fbbf24',
                  }}
                >
                  <Check className="w-3 h-3" />
                  Allow
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
