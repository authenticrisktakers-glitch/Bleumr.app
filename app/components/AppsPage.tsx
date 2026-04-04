import React from 'react';
import { X } from 'lucide-react';

interface AppsPageProps {
  onClose: () => void;
  onOpenCoding: () => void;
  onOpenTrading: () => void;
  onOpenWebDesigner: () => void;
}

// ─── Custom App Icons (unique, not generic) ────────────────────────────────

function CodeLabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <rect x="3" y="4" width="26" height="24" rx="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M3 10h26" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <circle cx="7" cy="7" r="1" fill="currentColor" opacity="0.5" />
      <circle cx="10.5" cy="7" r="1" fill="currentColor" opacity="0.35" />
      <circle cx="14" cy="7" r="1" fill="currentColor" opacity="0.2" />
      <path d="M9 17l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="14.5" y1="15" x2="11.5" y2="25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <rect x="21" y="15" width="1.5" height="9" rx="0.75" fill="currentColor" opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.2s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

function TradingIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <rect x="5" y="12" width="3.5" height="8" rx="0.8" fill="currentColor" opacity="0.35" />
      <line x1="6.75" y1="10" x2="6.75" y2="12" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <line x1="6.75" y1="20" x2="6.75" y2="23" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <rect x="11" y="8" width="3.5" height="10" rx="0.8" fill="currentColor" opacity="0.7" />
      <line x1="12.75" y1="5" x2="12.75" y2="8" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <line x1="12.75" y1="18" x2="12.75" y2="21" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <rect x="17" y="14" width="3.5" height="6" rx="0.8" fill="currentColor" opacity="0.35" />
      <line x1="18.75" y1="11" x2="18.75" y2="14" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <line x1="18.75" y1="20" x2="18.75" y2="24" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <rect x="23" y="6" width="3.5" height="12" rx="0.8" fill="currentColor" opacity="0.9" />
      <line x1="24.75" y1="3" x2="24.75" y2="6" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
      <line x1="24.75" y1="18" x2="24.75" y2="22" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
      <path d="M6 22 L12.5 14 L18.5 18 L25 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" strokeDasharray="2 2" />
      <line x1="3" y1="27" x2="29" y2="27" stroke="currentColor" strokeWidth="1" opacity="0.2" />
    </svg>
  );
}

function WebDesignerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      {/* Browser frame */}
      <rect x="2" y="4" width="28" height="22" rx="2.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M2 9.5h28" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <circle cx="5.5" cy="6.8" r="0.8" fill="currentColor" opacity="0.4" />
      <circle cx="8.5" cy="6.8" r="0.8" fill="currentColor" opacity="0.3" />
      <circle cx="11.5" cy="6.8" r="0.8" fill="currentColor" opacity="0.2" />
      {/* Layout blocks — Figma-like artboard */}
      <rect x="5" y="12" width="9" height="3.5" rx="0.8" fill="currentColor" opacity="0.7" />
      <rect x="5" y="17" width="9" height="6" rx="0.8" fill="currentColor" opacity="0.3" />
      <rect x="16" y="12" width="11" height="11" rx="0.8" fill="currentColor" opacity="0.15" />
      {/* AI sparkle */}
      <path d="M23 15l1.2-2.5L25.5 15l-1.3 2.5z" fill="currentColor" opacity="0.9" />
      <path d="M21 18l0.7-1.5 0.8 1.5-0.8 1.5z" fill="currentColor" opacity="0.6" />
      {/* Cursor pointer */}
      <path d="M19 20l2.5 5.5 1-1.2 1.8 0.7-2.5-5.5-1.5 1.2z" fill="currentColor" opacity="0.8" stroke="currentColor" strokeWidth="0.4" />
    </svg>
  );
}

// ─── App Definitions ────────────────────────────────────────────────────────

const apps = [
  {
    id: 'webdesigner',
    label: 'Web Designer',
    Icon: WebDesignerIcon,
    color: 'text-violet-400',
    iconBg: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    action: 'onOpenWebDesigner' as const,
  },
  {
    id: 'code',
    label: 'CODE Bleu',
    Icon: CodeLabIcon,
    color: 'text-emerald-400',
    iconBg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    action: 'onOpenCoding' as const,
  },
  {
    id: 'trading',
    label: 'Trading',
    Icon: TradingIcon,
    color: 'text-amber-400',
    iconBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    action: 'onOpenTrading' as const,
  },
];

export function AppsPage({ onClose, onOpenCoding, onOpenTrading, onOpenWebDesigner }: AppsPageProps) {
  const handlers = { onOpenCoding, onOpenTrading, onOpenWebDesigner };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: 'rgba(15,15,15,0.85)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      }}
    >
      {/* Close button — top right, floating like Launchpad */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-10 p-2 rounded-full text-white/30 hover:text-white/80 hover:bg-white/10 transition-all"
      >
        <X className="w-5 h-5" />
      </button>

      {/* App Grid — centered like Launchpad */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-16">
          {apps.map(app => {
            const { Icon } = app;
            return (
              <button
                key={app.id}
                onClick={() => {
                  handlers[app.action]();
                  onClose();
                }}
                className="group flex flex-col items-center gap-2.5 transition-transform hover:scale-110 active:scale-95"
              >
                {/* Icon square — rounded like macOS app icons */}
                <div
                  className="w-[72px] h-[72px] rounded-[16px] flex items-center justify-center shadow-lg transition-shadow group-hover:shadow-xl"
                  style={{
                    background: app.iconBg,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                  }}
                >
                  <Icon className="w-9 h-9 text-white" />
                </div>
                {/* Label — small white text below like Launchpad */}
                <span className="text-[12px] font-medium text-white/80 drop-shadow-sm">
                  {app.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
