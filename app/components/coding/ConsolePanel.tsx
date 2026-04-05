import React, { useState, useRef, useEffect, memo } from 'react';
import { Trash2, AlertTriangle, XCircle, Info, Terminal } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsoleEntry {
  id: string;
  type: 'log' | 'warn' | 'error' | 'info' | 'command';
  content: string;
  timestamp: number;
}

interface ConsolePanelProps {
  logs: ConsoleEntry[];
  onClear: () => void;
}

type FilterKey = 'all' | 'error' | 'warn' | 'command';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 500;

const MONO_FONT = "'SF Mono', 'Fira Code', 'Consolas', monospace";

const TYPE_STYLES: Record<ConsoleEntry['type'], { color: string; prefix: string; bg?: string }> = {
  log:     { color: '#e4e4e7',  prefix: '' },
  warn:    { color: '#fbbf24',  prefix: '\u26A0 ' },
  error:   { color: '#f87171',  prefix: '\u2715 ' },
  info:    { color: '#67e8f9',  prefix: '\u2139 ' },
  command: { color: '#4ade80',  prefix: '$ ', bg: 'rgba(74, 222, 128, 0.06)' },
};

const FILTER_CONFIG: { key: FilterKey; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'error',   label: 'Errors' },
  { key: 'warn',    label: 'Warnings' },
  { key: 'command', label: 'Commands' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

// ─── Entry Row ────────────────────────────────────────────────────────────────

const EntryRow = memo(({ entry }: { entry: ConsoleEntry }) => {
  const style = TYPE_STYLES[entry.type];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '4px 12px',
        gap: 8,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: style.bg || 'transparent',
        fontFamily: MONO_FONT,
        fontSize: 12,
        lineHeight: '18px',
        color: style.color,
      }}
      title={formatTime(entry.timestamp)}
    >
      {style.prefix && (
        <span
          style={{
            flexShrink: 0,
            width: 16,
            textAlign: 'center',
            userSelect: 'none',
          }}
        >
          {style.prefix.trim()}
        </span>
      )}
      <span
        style={{
          flex: 1,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          paddingLeft: style.prefix ? 0 : 24,
        }}
      >
        {entry.content}
      </span>
    </div>
  );
});

EntryRow.displayName = 'EntryRow';

// ─── Console Panel ────────────────────────────────────────────────────────────

const ConsolePanel: React.FC<ConsolePanelProps> = ({ logs, onClear }) => {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Trim to max entries
  const trimmed = logs.length > MAX_ENTRIES ? logs.slice(logs.length - MAX_ENTRIES) : logs;

  // Apply filter
  const filtered = activeFilter === 'all'
    ? trimmed
    : trimmed.filter((e) => e.type === activeFilter);

  // Count helpers for badges
  const errorCount = trimmed.filter((e) => e.type === 'error').length;
  const warnCount = trimmed.filter((e) => e.type === 'warn').length;

  // Track user scroll position — disable auto-scroll when user scrolls up
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    shouldAutoScroll.current = atBottom;
  };

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    const el = scrollRef.current;
    if (el && shouldAutoScroll.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filtered.length]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0a0a0f',
        color: '#e4e4e7',
        fontFamily: MONO_FONT,
        fontSize: 12,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
          flexShrink: 0,
        }}
      >
        {/* Left: title + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={14} style={{ opacity: 0.6 }} />
          <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: '0.02em' }}>
            Console
          </span>
          {trimmed.length > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 9999,
                background: 'rgba(255,255,255,0.08)',
                color: '#a1a1aa',
              }}
            >
              {trimmed.length}
            </span>
          )}
          {errorCount > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 9999,
                background: 'rgba(248,113,113,0.15)',
                color: '#f87171',
              }}
            >
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 9999,
                background: 'rgba(251,191,36,0.15)',
                color: '#fbbf24',
              }}
            >
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Right: filters + clear */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {FILTER_CONFIG.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: MONO_FONT,
                fontWeight: activeFilter === key ? 600 : 400,
                background: activeFilter === key
                  ? 'rgba(255,255,255,0.1)'
                  : 'transparent',
                color: activeFilter === key ? '#e4e4e7' : '#71717a',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (activeFilter !== key) {
                  (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa';
                }
              }}
              onMouseLeave={(e) => {
                if (activeFilter !== key) {
                  (e.currentTarget as HTMLButtonElement).style.color = '#71717a';
                }
              }}
            >
              {label}
            </button>
          ))}

          <div
            style={{
              width: 1,
              height: 14,
              background: 'rgba(255,255,255,0.1)',
              margin: '0 4px',
            }}
          />

          <button
            onClick={onClear}
            title="Clear console"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: '#71717a',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#e4e4e7';
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#71717a';
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Scroll area ────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: 0,
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: 80,
              gap: 8,
              color: '#52525b',
              userSelect: 'none',
            }}
          >
            <Terminal size={20} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: 12 }}>No output yet</span>
          </div>
        ) : (
          filtered.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export { ConsolePanel };
export type { ConsolePanelProps };
export default ConsolePanel;
