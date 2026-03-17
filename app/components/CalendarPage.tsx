import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Plus, Trash2, Clock, Sparkles, CalendarPlus, Check, Calendar, List, AlignJustify } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleEvent {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  startHour: number;  // 0–23
  endHour: number;    // 1–24
  color: string;
  note?: string;
}

interface SchedulerPageProps {
  onClose: () => void;
  onAskJumari?: (text: string) => void;
  jumpToDate?: Date | null;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export function loadScheduleEvents(): ScheduleEvent[] {
  try { return JSON.parse(localStorage.getItem('orbit_schedule_events') || '[]'); }
  catch { return []; }
}
export function saveScheduleEvents(events: ScheduleEvent[]) {
  localStorage.setItem('orbit_schedule_events', JSON.stringify(events));
}
export function addScheduleEvent(ev: Omit<ScheduleEvent, 'id' | 'color'> & { color?: string }) {
  const events = loadScheduleEvents();
  const palette = ['#6366f1','#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899'];
  const color = ev.color ?? palette[events.length % palette.length];
  const next = [...events, { ...ev, id: Date.now().toString(), color }];
  saveScheduleEvents(next);
  return next;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT  = 60;
const START_HOUR   = 6;
const END_HOUR     = 23;
const HOURS        = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_LONG    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const EVENT_COLORS = ['#6366f1','#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899'];

// ─── Utils ────────────────────────────────────────────────────────────────────

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate()-r.getDay()); return r; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function fmtHour(h: number) {
  if (h === 0) return '12 AM'; if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h-12} PM`;
}
function sameDay(a: Date, b: Date) { return toKey(a) === toKey(b); }

// ─── Glass token helpers ───────────────────────────────────────────────────────

const glass = {
  panel:   'rgba(8,10,22,0.52)',
  sidebar: 'rgba(6,8,18,0.45)',
  header:  'rgba(10,12,28,0.48)',
  card:    'rgba(255,255,255,0.032)',
  rim:     'rgba(255,255,255,0.07)',
  rimHot:  'rgba(255,255,255,0.13)',
  blur:    'blur(64px)',
  blurMd:  'blur(40px)',
  blurSm:  'blur(24px)',
};

// ─── Scheduling Toast ─────────────────────────────────────────────────────────

interface SchedulingToastProps {
  event: Pick<ScheduleEvent, 'title' | 'date' | 'startHour' | 'endHour'>;
  onDone: () => void;
}

export function SchedulingToast({ event, onDone }: SchedulingToastProps) {
  const [phase, setPhase] = useState<'enter' | 'filling' | 'done'>('enter');
  const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('filling'), 400);
    const t2 = setTimeout(() => setPhase('done'), 1600);
    const t3 = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m-1, d);
    return `${DAY_NAMES[dt.getDay()]}, ${MONTH_NAMES[m-1]} ${d}`;
  };
  const fmtTime = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:00 ${ampm}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
      className="fixed bottom-6 right-6 z-[10002] w-72 rounded-2xl overflow-hidden select-none"
      style={{
        background: 'rgba(8,10,22,0.72)',
        border: '1px solid rgba(99,102,241,0.28)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: glass.blurSm,
      }}
    >
      {/* Caustic rim */}
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5) 40%, rgba(139,92,246,0.4) 60%, transparent)' }} />
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <motion.div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.32)', boxShadow: '0 0 12px rgba(99,102,241,0.15)' }}
          animate={phase === 'done' ? { background: 'rgba(16,185,129,0.18)' } : {}}>
          <AnimatePresence mode="wait">
            {phase !== 'done'
              ? <motion.div key="cal" exit={{ opacity: 0 }}><CalendarPlus className="w-4 h-4 text-indigo-400" /></motion.div>
              : <motion.div key="chk" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                  <Check className="w-4 h-4 text-emerald-400" />
                </motion.div>
            }
          </AnimatePresence>
        </motion.div>
        <div>
          <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-widest leading-none mb-0.5">
            {phase === 'done' ? 'Added to Scheduler' : 'Scheduling…'}
          </p>
          <p className="text-white text-sm font-medium leading-tight">{event.title}</p>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {['date','time'].map(k => (
          <div key={k} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" style={{ opacity: k==='time' ? 0.6 : 1 }} />
            <AnimatePresence>
              {phase !== 'enter'
                ? <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: k==='time' ? 0.1 : 0 }}
                    className="text-xs" style={{ color: k==='time' ? '#94a3b8' : '#cbd5e1' }}>
                    {k==='date' ? fmtDate(event.date) : `${fmtTime(event.startHour)} – ${fmtTime(event.endHour)}`}
                  </motion.p>
                : <motion.div className="h-3 rounded animate-pulse" style={{ width: k==='date' ? 96 : 64, background: 'rgba(71,85,105,0.6)' }} />
              }
            </AnimatePresence>
          </div>
        ))}
      </div>
      <motion.div className="h-0.5" style={{ background: 'rgba(99,102,241,0.18)' }}>
        <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }}
          initial={{ width: '0%' }}
          animate={{ width: phase==='done' ? '100%' : phase==='filling' ? '70%' : '10%' }}
          transition={{ duration: phase==='done' ? 0.3 : 1.2, ease: 'easeOut' }} />
      </motion.div>
    </motion.div>
  );
}

// ─── Add-event modal ──────────────────────────────────────────────────────────

function EventModal({ date, defaultHour, onSave, onClose }: {
  date: Date; defaultHour: number;
  onSave: (ev: ScheduleEvent) => void; onClose: () => void;
}) {
  const [title,  setTitle]  = useState('');
  const [startH, setStartH] = useState(defaultHour);
  const [endH,   setEndH]   = useState(Math.min(defaultHour + 1, 23));
  const [color,  setColor]  = useState(EVENT_COLORS[0]);
  const [note,   setNote]   = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const save = () => {
    if (!title.trim()) return;
    onSave({ id: Date.now().toString(), title: title.trim(), date: toKey(date), startHour: startH, endHour: endH, color, note: note.trim() || undefined });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(12px)', background: 'rgba(2,4,12,0.4)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.93, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 16 }}
        transition={{ duration: 0.22, ease: 'easeOut' }} onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative"
        style={{
          background: 'rgba(8,10,22,0.7)',
          backdropFilter: 'blur(72px)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>
        {/* Top caustic rim */}
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.15) 45%, rgba(99,102,241,0.3) 60%, transparent 90%)' }} />
        {/* Ambient glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full pointer-events-none" style={{ background: 'rgba(99,102,241,0.08)', filter: 'blur(32px)' }} />

        <div className="relative flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h3 className="text-white font-light text-lg">New Event</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative px-6 py-5 flex flex-col gap-4">
          <input ref={ref} value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()} placeholder="What's happening?"
            className="w-full rounded-2xl px-4 py-3 text-white placeholder-slate-600 text-sm outline-none transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }} />
          <div className="flex gap-3 items-center">
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
            {[['Start', startH, (v: number) => { setStartH(v); if (endH <= v) setEndH(v+1); }],
              ['End',   endH,   setEndH]].map(([label, val, setter], i) => (
              <select key={i} value={val as number}
                onChange={e => (setter as (v: number) => void)(+e.target.value)}
                className="flex-1 rounded-xl px-3 py-2 text-white text-sm outline-none appearance-none cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                {HOURS.filter(h => i === 0 || h > startH).map(h => (
                  <option key={h} value={h} className="bg-[#0a0c1a]">{fmtHour(h)}</option>
                ))}
              </select>
            ))}
          </div>
          <div className="flex gap-2">
            {EVENT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-all"
                style={{
                  background: c,
                  outline: color===c ? '2px solid white' : '2px solid transparent',
                  outlineOffset: 2,
                  boxShadow: color===c ? `0 0 10px ${c}88` : 'none',
                }} />
            ))}
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note… (optional)" rows={2}
            className="w-full rounded-2xl px-4 py-3 text-white placeholder-slate-600 text-sm outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }} />
          <button onClick={save} disabled={!title.trim()}
            className="w-full py-3 rounded-2xl text-sm font-medium transition-all disabled:opacity-30 relative overflow-hidden"
            style={{ background: color + 'cc', color: '#fff', boxShadow: `0 4px 20px ${color}44` }}>
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'rgba(255,255,255,0.25)' }} />
            Add to Scheduler
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Mini calendar (left sidebar) ─────────────────────────────────────────────

function MiniCalendar({ selected, onSelect, events }: {
  selected: Date; onSelect: (d: Date) => void; events: ScheduleEvent[];
}) {
  const [viewMonth, setViewMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const today = new Date();

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDow    = startOfMonth(viewMonth).getDay();
  const cells: (Date | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const hasEvents = (d: Date) => events.some(e => e.date === toKey(d));

  return (
    <div className="select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewMonth(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
          className="p-1 rounded-lg hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[11px] font-semibold text-slate-300 tracking-wide">
          {MONTHS_SHORT[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <button onClick={() => setViewMonth(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
          className="p-1 rounded-lg hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-700 py-1">{d[0]}</div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isToday   = sameDay(d, today);
          const isSel     = sameDay(d, selected);
          const hasDot    = hasEvents(d);
          const isThisMonth = d.getMonth() === viewMonth.getMonth();
          return (
            <button key={i} onClick={() => { onSelect(d); setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
              className="relative flex flex-col items-center justify-center rounded-xl py-1.5 transition-all text-[11px]"
              style={{
                color: !isThisMonth ? 'rgba(255,255,255,0.1)' : isSel ? '#fff' : isToday ? '#a5b4fc' : '#94a3b8',
                background: isSel ? 'rgba(99,102,241,0.75)' : isToday && !isSel ? 'rgba(99,102,241,0.1)' : 'transparent',
                fontWeight: isToday || isSel ? 600 : 400,
                boxShadow: isSel ? '0 0 12px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.15)' : 'none',
              }}>
              {d.getDate()}
              {hasDot && !isSel && (
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400" style={{ boxShadow: '0 0 4px rgba(99,102,241,0.8)' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agenda list (left sidebar bottom) ────────────────────────────────────────

function AgendaList({ selectedDay, events, onEventClick }: {
  selectedDay: Date; events: ScheduleEvent[]; onEventClick: (ev: ScheduleEvent) => void;
}) {
  const upcoming = useMemo(() => {
    const start = toKey(selectedDay);
    const end = toKey(addDays(selectedDay, 14));
    return events
      .filter(e => e.date >= start && e.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);
  }, [selectedDay, events]);

  if (upcoming.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-2">
        <Calendar className="w-6 h-6 text-slate-800" />
        <p className="text-[11px] text-slate-700 text-center">No upcoming events</p>
      </div>
    );
  }

  let lastDate = '';
  return (
    <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 220, scrollbarWidth: 'none' }}>
      {upcoming.map(ev => {
        const showLabel = ev.date !== lastDate;
        lastDate = ev.date;
        const [y, m, d] = ev.date.split('-').map(Number);
        const dt = new Date(y, m-1, d);
        const isToday = toKey(dt) === toKey(new Date());
        return (
          <div key={ev.id}>
            {showLabel && (
              <div className="text-[9px] font-bold uppercase tracking-widest mt-2 mb-1 px-1"
                style={{ color: isToday ? '#818cf8' : 'rgba(255,255,255,0.18)' }}>
                {isToday ? 'Today' : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            )}
            <button onClick={() => onEventClick(ev)}
              className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/5">
              <div className="w-1 rounded-full self-stretch shrink-0" style={{ background: ev.color, boxShadow: `0 0 6px ${ev.color}88` }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-slate-200 truncate">{ev.title}</p>
                <p className="text-[9px] text-slate-600">{fmtHour(ev.startHour)} – {fmtHour(ev.endHour)}</p>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Week time-grid ────────────────────────────────────────────────────────────

function WeekGrid({ weekStart, events, onCellClick, onEventClick }: {
  weekStart: Date; events: ScheduleEvent[];
  onCellClick: (date: Date, hour: number) => void;
  onEventClick: (ev: ScheduleEvent) => void;
}) {
  const today    = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT; }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Day headers */}
      <div className="flex shrink-0 pl-14" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
        {weekDays.map((day, i) => {
          const isToday = sameDay(day, today);
          return (
            <div key={i} className="flex-1 flex flex-col items-center py-3 gap-1">
              <span className={`text-[9px] font-bold uppercase tracking-widest ${isToday ? 'text-indigo-400' : 'text-slate-600'}`}>
                {DAYS_SHORT[day.getDay()]}
              </span>
              <span className="text-sm font-light w-8 h-8 flex items-center justify-center rounded-full"
                style={isToday
                  ? { background: 'rgba(99,102,241,0.8)', color: '#fff', boxShadow: '0 0 16px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.2)' }
                  : { color: '#64748b' }}>
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
          {/* Hour labels */}
          <div className="w-14 shrink-0 relative">
            {HOURS.map((h, i) => (
              <div key={h} className="absolute right-2 text-[9px] text-slate-700 whitespace-nowrap select-none"
                style={{ top: i * HOUR_HEIGHT - 6 }}>{fmtHour(h)}</div>
            ))}
          </div>

          {/* Columns */}
          {weekDays.map((day, di) => {
            const isToday   = sameDay(day, today);
            const dayEvents = events.filter(e => e.date === toKey(day));
            return (
              <div key={di} className="flex-1 relative"
                style={{
                  borderLeft: '1px solid rgba(255,255,255,0.04)',
                  minHeight: HOURS.length * HOUR_HEIGHT,
                  background: isToday ? 'rgba(99,102,241,0.015)' : 'transparent',
                }}>

                {/* Hour rows */}
                {HOURS.map((h, hi) => (
                  <div key={h} className="absolute left-0 right-0 group cursor-pointer transition-colors hover:bg-indigo-500/[0.05]"
                    style={{ top: hi * HOUR_HEIGHT, height: HOUR_HEIGHT, borderTop: '1px solid rgba(255,255,255,0.035)' }}
                    onClick={() => onCellClick(day, h)}>
                    <div className="absolute left-0 right-0 top-1/2" style={{ borderTop: '1px dashed rgba(255,255,255,0.018)' }} />
                    <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-50 transition-opacity">
                      <Plus className="w-3 h-3 text-indigo-400" />
                    </div>
                  </div>
                ))}

                {/* Now line */}
                {isToday && (() => {
                  const now = new Date();
                  const mins = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
                  if (mins < 0 || mins > (END_HOUR - START_HOUR) * 60) return null;
                  return (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                      style={{ top: (mins / 60) * HOUR_HEIGHT }}>
                      <div className="w-2 h-2 rounded-full bg-indigo-400 -ml-1 shrink-0"
                        style={{ boxShadow: '0 0 8px rgba(99,102,241,0.9)' }} />
                      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.8), rgba(99,102,241,0.1))' }} />
                    </div>
                  );
                })()}

                {/* Events */}
                {dayEvents.map(ev => {
                  const top    = (ev.startHour - START_HOUR) * HOUR_HEIGHT + 2;
                  const height = Math.max((ev.endHour - ev.startHour) * HOUR_HEIGHT - 4, 24);
                  return (
                    <motion.div key={ev.id}
                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      className="absolute left-1 right-1 z-10 rounded-xl px-2.5 py-1.5 cursor-pointer overflow-hidden"
                      style={{ top, height, background: ev.color + '14', border: `1px solid ${ev.color}40`, backdropFilter: 'blur(8px)', boxShadow: `0 2px 16px ${ev.color}14, inset 0 1px 0 ${ev.color}20` }}
                      onClick={e => { e.stopPropagation(); onEventClick(ev); }}>
                      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: `linear-gradient(180deg, ${ev.color}ee, ${ev.color}99)` }} />
                      <div className="pl-2">
                        <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: ev.color }}>{ev.title}</p>
                        {height > 38 && <p className="text-[9px] text-slate-600 mt-0.5">{fmtHour(ev.startHour)} – {fmtHour(ev.endHour)}</p>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Day time-grid ─────────────────────────────────────────────────────────────

function DayGrid({ day, events, onCellClick, onEventClick }: {
  day: Date; events: ScheduleEvent[];
  onCellClick: (date: Date, hour: number) => void;
  onEventClick: (ev: ScheduleEvent) => void;
}) {
  const today     = new Date();
  const isToday   = sameDay(day, today);
  const dayEvents = events.filter(e => e.date === toKey(day)).sort((a,b) => a.startHour - b.startHour);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT; }, [day]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Day header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{DAYS_LONG[day.getDay()]}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-light text-white">{day.getDate()}</span>
            <span className="text-slate-500 text-sm">{MONTHS[day.getMonth()]} {day.getFullYear()}</span>
            {isToday && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-indigo-400" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', boxShadow: '0 0 8px rgba(99,102,241,0.15)' }}>Today</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-600">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
          <div className="w-16 shrink-0 relative">
            {HOURS.map((h, i) => (
              <div key={h} className="absolute right-3 text-[9px] text-slate-700 whitespace-nowrap select-none"
                style={{ top: i * HOUR_HEIGHT - 6 }}>{fmtHour(h)}</div>
            ))}
          </div>
          <div className="flex-1 relative" style={{ borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
            {HOURS.map((h, hi) => (
              <div key={h} className="absolute left-0 right-0 group cursor-pointer hover:bg-indigo-500/[0.05] transition-colors"
                style={{ top: hi * HOUR_HEIGHT, height: HOUR_HEIGHT, borderTop: '1px solid rgba(255,255,255,0.035)' }}
                onClick={() => onCellClick(day, h)}>
                <div className="absolute left-0 right-0 top-1/2" style={{ borderTop: '1px dashed rgba(255,255,255,0.018)' }} />
                <div className="absolute right-2 top-1 opacity-0 group-hover:opacity-50 transition-opacity">
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                </div>
              </div>
            ))}
            {isToday && (() => {
              const now  = new Date();
              const mins = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
              if (mins < 0 || mins > (END_HOUR - START_HOUR) * 60) return null;
              return (
                <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                  style={{ top: (mins / 60) * HOUR_HEIGHT }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 -ml-1.5 shrink-0"
                    style={{ boxShadow: '0 0 10px rgba(99,102,241,0.9)' }} />
                  <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.8), rgba(99,102,241,0.08))' }} />
                </div>
              );
            })()}
            {dayEvents.map(ev => {
              const top    = (ev.startHour - START_HOUR) * HOUR_HEIGHT + 2;
              const height = Math.max((ev.endHour - ev.startHour) * HOUR_HEIGHT - 4, 32);
              return (
                <motion.div key={ev.id}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  className="absolute left-2 right-2 z-10 rounded-2xl px-4 py-2.5 cursor-pointer overflow-hidden"
                  style={{ top, height, background: ev.color + '18', border: `1px solid ${ev.color}45`, backdropFilter: 'blur(12px)', boxShadow: `0 4px 20px ${ev.color}18, inset 0 1px 0 ${ev.color}25` }}
                  onClick={e => { e.stopPropagation(); onEventClick(ev); }}>
                  {/* Top rim on event */}
                  <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl" style={{ background: `linear-gradient(90deg, transparent, ${ev.color}60, transparent)` }} />
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ background: `linear-gradient(180deg, ${ev.color}ee, ${ev.color}88)` }} />
                  <div className="pl-2">
                    <p className="text-sm font-semibold" style={{ color: ev.color }}>{ev.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{fmtHour(ev.startHour)} – {fmtHour(ev.endHour)}</p>
                    {ev.note && height > 60 && <p className="text-[10px] text-slate-600 mt-1 line-clamp-2">{ev.note}</p>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Event detail modal ────────────────────────────────────────────────────────

function EventDetail({ ev, onClose, onDelete }: { ev: ScheduleEvent; onClose: () => void; onDelete: (id: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(12px)', background: 'rgba(2,4,12,0.4)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.93, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }} onClick={e => e.stopPropagation()}
        className="w-full max-w-xs rounded-3xl overflow-hidden shadow-2xl relative"
        style={{
          background: 'rgba(8,10,22,0.72)',
          backdropFilter: 'blur(72px)',
          border: `1px solid ${ev.color}30`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 40px ${ev.color}12, inset 0 1px 0 rgba(255,255,255,0.07)`,
        }}>
        {/* Top color stripe — refracted glow */}
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent 10%, ${ev.color}80 50%, transparent 90%)` }} />
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${ev.color}bb, ${ev.color}55)` }} />
        {/* Ambient color glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-16 pointer-events-none rounded-full" style={{ background: ev.color + '18', filter: 'blur(28px)' }} />
        <div className="relative px-6 py-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: ev.color, boxShadow: `0 0 10px ${ev.color}` }} />
              <h3 className="text-white font-light text-lg leading-snug">{ev.title}</h3>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/8 text-slate-500 hover:text-white transition-colors shrink-0 ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2.5 mb-5">
            <div className="flex items-center gap-2.5 text-slate-400">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className="text-sm">{fmtHour(ev.startHour)} – {fmtHour(ev.endHour)}</span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-500">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs">
                {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
          {ev.note && (
            <div className="mb-4 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-slate-400 text-sm leading-relaxed">{ev.note}</p>
            </div>
          )}
          <button onClick={() => { onDelete(ev.id); onClose(); }}
            className="flex items-center gap-2 text-red-400/50 hover:text-red-400 text-sm transition-colors">
            <Trash2 className="w-3.5 h-3.5" />Delete event
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Scheduler Page ────────────────────────────────────────────────────────────

type ViewMode = 'week' | 'day';

export function SchedulerPage({ onClose, onAskJumari, jumpToDate }: SchedulerPageProps) {
  const today = new Date();
  const [viewMode,    setViewMode]   = useState<ViewMode>('week');
  const [weekStart,   setWeekStart]  = useState(() => jumpToDate ? startOfWeek(jumpToDate) : startOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(() => jumpToDate ?? today);
  const [events,      setEvents]     = useState<ScheduleEvent[]>(loadScheduleEvents);
  const [addModal,    setAddModal]   = useState<{ date: Date; hour: number } | null>(null);
  const [detailEv,    setDetailEv]   = useState<ScheduleEvent | null>(null);

  // Listen for JUMARI-added events
  useEffect(() => {
    const handler = () => setEvents(loadScheduleEvents());
    window.addEventListener('orbit_schedule_update', handler);
    return () => window.removeEventListener('orbit_schedule_update', handler);
  }, []);

  // Jump to week when jumpToDate changes
  useEffect(() => {
    if (jumpToDate) {
      setWeekStart(startOfWeek(jumpToDate));
      setSelectedDay(jumpToDate);
    }
  }, [jumpToDate]);

  const prevPeriod = () => {
    if (viewMode === 'week') setWeekStart(d => addDays(d, -7));
    else setSelectedDay(d => addDays(d, -1));
  };
  const nextPeriod = () => {
    if (viewMode === 'week') setWeekStart(d => addDays(d, 7));
    else setSelectedDay(d => addDays(d, 1));
  };
  const goToday = () => { setWeekStart(startOfWeek(today)); setSelectedDay(today); };

  const handleAdd = (ev: ScheduleEvent) => {
    const next = [...events, ev];
    setEvents(next); saveScheduleEvents(next); setAddModal(null);
  };
  const handleDelete = (id: string) => {
    const next = events.filter(e => e.id !== id);
    setEvents(next); saveScheduleEvents(next); setDetailEv(null);
  };
  const handleCellClick = (date: Date, hour: number) => setAddModal({ date, hour });
  const handleEventClick = (ev: ScheduleEvent) => setDetailEv(ev);

  const handleDaySelect = (d: Date) => {
    setSelectedDay(d);
    setWeekStart(startOfWeek(d));
    setViewMode('day');
  };

  const periodLabel = viewMode === 'week'
    ? (() => {
        const s = weekStart, e = addDays(weekStart, 6);
        return s.getMonth() === e.getMonth()
          ? `${MONTHS[s.getMonth()]} ${s.getFullYear()}`
          : `${MONTHS_SHORT[s.getMonth()]} – ${MONTHS_SHORT[e.getMonth()]} ${s.getFullYear()}`;
      })()
    : selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const totalEvents = events.length;
  const todayEvents = events.filter(e => e.date === toKey(today)).length;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[10001] flex flex-col font-sans select-none overflow-hidden"
      style={{ background: 'rgba(3,4,12,0.55)', backdropFilter: glass.blur }}
    >
      {/* ── Ambient background glows ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute -bottom-24 right-16 w-80 h-80 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.2) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      {/* ── Top header ── */}
      <div className="relative flex items-center justify-between px-6 py-3.5 shrink-0 z-10"
        style={{
          background: glass.header,
          backdropFilter: glass.blurMd,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.04)',
        }}>
        {/* Caustic rim */}
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.1) 30%, rgba(99,102,241,0.2) 60%, transparent 95%)' }} />

        {/* Left — title + stats */}
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', boxShadow: '0 0 16px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
            <Calendar className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-white text-sm font-semibold tracking-wide leading-none">Scheduler</h1>
            <p className="text-slate-600 text-[10px] mt-0.5">
              {totalEvents} events · {todayEvents} today
            </p>
          </div>
        </div>

        {/* Center — nav */}
        <div className="flex items-center gap-1.5">
          <button onClick={prevPeriod}
            className="p-1.5 rounded-xl hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToday}
            className="px-3.5 py-1.5 rounded-xl text-[11px] font-medium text-slate-400 hover:text-white transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.035)' }}>
            Today
          </button>
          <button onClick={nextPeriod}
            className="p-1.5 rounded-xl hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-2 text-[12px] text-slate-400 font-light">{periodLabel}</span>
        </div>

        {/* Right — view toggle + actions */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}>
            {([['week','Week', AlignJustify], ['day','Day', List]] as const).map(([mode, label, Icon]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold transition-all"
                style={{
                  background: viewMode === mode ? 'rgba(99,102,241,0.22)' : 'transparent',
                  color: viewMode === mode ? '#a5b4fc' : 'rgba(255,255,255,0.22)',
                  borderRight: mode === 'week' ? '1px solid rgba(255,255,255,0.06)' : undefined,
                  boxShadow: viewMode === mode ? 'inset 0 1px 0 rgba(255,255,255,0.1)' : 'none',
                }}>
                <Icon className="w-3 h-3" />{label}
              </button>
            ))}
          </div>

          {/* Add event */}
          <button onClick={() => setAddModal({ date: viewMode === 'day' ? selectedDay : today, hour: 9 })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all text-white relative overflow-hidden"
            style={{ background: 'rgba(99,102,241,0.22)', border: '1px solid rgba(99,102,241,0.32)', boxShadow: '0 0 16px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
            <Plus className="w-3.5 h-3.5" />New
          </button>

          {/* Ask JUMARI */}
          {onAskJumari && (
            <button onClick={() => { onClose(); onAskJumari('I need help scheduling something — can you add it to my scheduler?'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-medium transition-colors text-indigo-300 hover:text-white"
              style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.06)' }}>
              <Sparkles className="w-3.5 h-3.5" />Ask JUMARI
            </button>
          )}

          <button onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Body: sidebar + main grid ── */}
      <div className="flex flex-1 min-h-0 relative z-10">

        {/* ── LEFT SIDEBAR ── */}
        <div className="w-64 shrink-0 flex flex-col overflow-hidden"
          style={{
            borderRight: '1px solid rgba(255,255,255,0.05)',
            background: glass.sidebar,
            backdropFilter: glass.blurMd,
          }}>
          {/* Sidebar rim */}
          <div className="absolute left-64 top-0 bottom-0 w-px pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.15), rgba(255,255,255,0.04) 30%, transparent 80%)' }} />

          <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>

            {/* Mini calendar — glass card */}
            <div className="rounded-2xl p-3 relative overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.028)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}>
              <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }} />
              <MiniCalendar
                selected={selectedDay}
                onSelect={handleDaySelect}
                events={events}
              />
            </div>

            {/* Divider */}
            <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)' }} />

            {/* Upcoming events */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <List className="w-3 h-3 text-slate-700" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700">Upcoming</span>
              </div>
              <AgendaList
                selectedDay={selectedDay}
                events={events}
                onEventClick={handleEventClick}
              />
            </div>

            {/* Divider */}
            <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)' }} />

            {/* Event color legend */}
            {events.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-2">All Events</div>
                <div className="flex flex-col gap-1">
                  {events.slice(-6).reverse().map(ev => (
                    <button key={ev.id} onClick={() => handleEventClick(ev)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/5 transition-colors text-left w-full">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ev.color, boxShadow: `0 0 5px ${ev.color}80` }} />
                      <span className="text-[10px] text-slate-500 truncate">{ev.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN AREA ── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <AnimatePresence mode="wait">
            {viewMode === 'week' ? (
              <motion.div key="week" className="flex flex-col flex-1 min-h-0"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
                <WeekGrid
                  weekStart={weekStart}
                  events={events}
                  onCellClick={handleCellClick}
                  onEventClick={handleEventClick}
                />
              </motion.div>
            ) : (
              <motion.div key="day" className="flex flex-col flex-1 min-h-0"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
                <DayGrid
                  day={selectedDay}
                  events={events}
                  onCellClick={handleCellClick}
                  onEventClick={handleEventClick}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {addModal && <EventModal date={addModal.date} defaultHour={addModal.hour} onSave={handleAdd} onClose={() => setAddModal(null)} />}
        {detailEv && <EventDetail ev={detailEv} onClose={() => setDetailEv(null)} onDelete={handleDelete} />}
      </AnimatePresence>
    </motion.div>
  );
}
