import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Plus, Trash2, Clock, LayoutGrid, Sparkles, CalendarPlus, Check } from 'lucide-react';

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
  jumpToDate?: Date | null; // when set, scheduler navigates to the week containing this date
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function loadScheduleEvents(): ScheduleEvent[] {
  try {
    const raw = localStorage.getItem('orbit_schedule_events');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveScheduleEvents(events: ScheduleEvent[]) {
  localStorage.setItem('orbit_schedule_events', JSON.stringify(events));
}

export function addScheduleEvent(ev: Omit<ScheduleEvent, 'id' | 'color'> & { color?: string }) {
  const events = loadScheduleEvents();
  const colors = ['#6366f1','#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899'];
  const color  = ev.color ?? colors[events.length % colors.length];
  const next   = [...events, { ...ev, id: Date.now().toString(), color }];
  saveScheduleEvents(next);
  return next;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 64;
const START_HOUR  = 6;
const END_HOUR    = 23;
const HOURS       = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const DAYS_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const EVENT_COLORS = ['#6366f1','#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899'];

// ─── Utils ────────────────────────────────────────────────────────────────────

function toKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function addDays(date: Date, n: number) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
function startOfWeek(date: Date) { const d = new Date(date); d.setDate(d.getDate()-d.getDay()); return d; }
function fmtHour(h: number) {
  if (h===0) return '12 AM'; if (h===12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h-12} PM`;
}

// ─── Add-event modal ─────────────────────────────────────────────────────────

function EventModal({ date, defaultHour, onSave, onClose }: {
  date: Date; defaultHour: number;
  onSave: (ev: ScheduleEvent) => void; onClose: () => void;
}) {
  const [title,  setTitle]  = useState('');
  const [startH, setStartH] = useState(defaultHour);
  const [endH,   setEndH]   = useState(Math.min(defaultHour+1, 23));
  const [color,  setColor]  = useState(EVENT_COLORS[0]);
  const [note,   setNote]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const save = () => {
    if (!title.trim()) return;
    onSave({ id: Date.now().toString(), title: title.trim(), date: toKey(date), startHour: startH, endHour: endH, color, note: note.trim()||undefined });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{ background:'rgba(10,10,20,0.92)', backdropFilter:'blur(40px)', border:'1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5">
          <div>
            <h3 className="text-white font-light text-lg">New Event</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {date.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <input
            ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key==='Enter' && save()}
            placeholder="What's happening?"
            className="w-full bg-white/5 border border-white/10 focus:border-indigo-500/50 rounded-2xl px-4 py-3 text-white placeholder-slate-600 text-sm outline-none transition-colors"
          />

          <div className="flex gap-3 items-center">
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
            <select value={startH} onChange={e => { const v=+e.target.value; setStartH(v); if(endH<=v) setEndH(v+1); }}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none appearance-none cursor-pointer">
              {HOURS.map(h => <option key={h} value={h} className="bg-[#0e0e1a]">{fmtHour(h)}</option>)}
            </select>
            <span className="text-slate-600 text-sm">to</span>
            <select value={endH} onChange={e => setEndH(+e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none appearance-none cursor-pointer">
              {HOURS.filter(h => h>startH).map(h => <option key={h} value={h} className="bg-[#0e0e1a]">{fmtHour(h)}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            {EVENT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-all"
                style={{ background:c, outline: color===c ? '2px solid white' : '2px solid transparent', outlineOffset:2 }} />
            ))}
          </div>

          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note... (optional)" rows={2}
            className="w-full bg-white/5 border border-white/10 focus:border-indigo-500/50 rounded-2xl px-4 py-3 text-white placeholder-slate-600 text-sm outline-none resize-none transition-colors" />

          <button onClick={save} disabled={!title.trim()}
            className="w-full py-3 rounded-2xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: color+'cc', color:'#fff' }}>
            Add to Scheduler
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Scheduling Toast ─────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatToastDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAY_NAMES[dt.getDay()]}, ${MONTH_NAMES[m - 1]} ${d}`;
}

function formatToastTime(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:00 ${ampm}`;
}

interface SchedulingToastProps {
  event: Pick<ScheduleEvent, 'title' | 'date' | 'startHour' | 'endHour'>;
  onDone: () => void;
}

export function SchedulingToast({ event, onDone }: SchedulingToastProps) {
  const [phase, setPhase] = useState<'enter' | 'filling' | 'done'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('filling'), 400);
    const t2 = setTimeout(() => setPhase('done'), 1600);
    const t3 = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
      className="fixed bottom-6 right-6 z-[10002] w-72 rounded-2xl overflow-hidden select-none"
      style={{
        background: 'rgba(13,13,20,0.92)',
        border: '1px solid rgba(99,102,241,0.3)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)',
        backdropFilter: 'blur(24px)',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <motion.div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)' }}
          animate={phase === 'done' ? { background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)' } : {}}
          transition={{ duration: 0.4 }}
        >
          <AnimatePresence mode="wait">
            {phase !== 'done' ? (
              <motion.div key="cal" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <CalendarPlus className="w-4 h-4 text-indigo-400" />
              </motion.div>
            ) : (
              <motion.div key="check" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                <Check className="w-4 h-4 text-emerald-400" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <div>
          <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-widest leading-none mb-0.5">
            {phase === 'done' ? 'Added to Scheduler' : 'Scheduling…'}
          </p>
          <p className="text-white text-sm font-medium leading-tight">{event.title}</p>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2">
        {/* Date row */}
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
          <AnimatePresence>
            {phase !== 'enter' ? (
              <motion.p
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35 }}
                className="text-slate-300 text-xs"
              >
                {formatToastDate(event.date)}
              </motion.p>
            ) : (
              <motion.div className="h-3 w-24 rounded bg-slate-700/60 animate-pulse" />
            )}
          </AnimatePresence>
        </div>

        {/* Time row */}
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/60 shrink-0" />
          <AnimatePresence>
            {phase !== 'enter' ? (
              <motion.p
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.1 }}
                className="text-slate-400 text-xs"
              >
                {formatToastTime(event.startHour)} – {formatToastTime(event.endHour)}
              </motion.p>
            ) : (
              <motion.div className="h-3 w-16 rounded bg-slate-700/60 animate-pulse" />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Progress bar */}
      <motion.div
        className="h-0.5"
        style={{ background: 'rgba(99,102,241,0.25)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
          initial={{ width: '0%' }}
          animate={{ width: phase === 'done' ? '100%' : phase === 'filling' ? '70%' : '10%' }}
          transition={{ duration: phase === 'done' ? 0.3 : 1.2, ease: 'easeOut' }}
        />
      </motion.div>
    </motion.div>
  );
}

// ─── Scheduler Page ───────────────────────────────────────────────────────────

export function SchedulerPage({ onClose, onAskJumari, jumpToDate }: SchedulerPageProps) {
  const today     = new Date();
  const [weekStart, setWeekStart] = useState(() => jumpToDate ? startOfWeek(jumpToDate) : startOfWeek(today));
  const [events,    setEvents]    = useState<ScheduleEvent[]>(loadScheduleEvents);
  const [addModal,  setAddModal]  = useState<{ date: Date; hour: number } | null>(null);
  const [detailEv,  setDetailEv]  = useState<ScheduleEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for new events added by JUMARI (via storage event)
  useEffect(() => {
    const handler = () => setEvents(loadScheduleEvents());
    window.addEventListener('orbit_schedule_update', handler);
    return () => window.removeEventListener('orbit_schedule_update', handler);
  }, []);

  // Jump to the week of a newly added event whenever jumpToDate changes
  useEffect(() => {
    if (jumpToDate) setWeekStart(startOfWeek(jumpToDate));
  }, [jumpToDate]);

  // Scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT;
  }, []);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));
  const goToday  = () => setWeekStart(startOfWeek(today));

  const eventsFor = (date: Date) => events.filter(e => e.date === toKey(date));

  const handleAdd = (ev: ScheduleEvent) => {
    const next = [...events, ev];
    setEvents(next);
    saveScheduleEvents(next);
    setAddModal(null);
  };

  const handleDelete = (id: string) => {
    const next = events.filter(e => e.id !== id);
    setEvents(next);
    saveScheduleEvents(next);
    setDetailEv(null);
  };

  const monthLabel = (() => {
    const s = weekStart, e = addDays(weekStart, 6);
    return s.getMonth() === e.getMonth()
      ? `${MONTHS[s.getMonth()]} ${s.getFullYear()}`
      : `${MONTHS[s.getMonth()]} – ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed inset-0 z-[10001] flex flex-col font-sans select-none"
      style={{ background: 'rgba(5,5,12,0.94)', backdropFilter: 'blur(48px)' }}
    >

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Left */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)' }}>
            <LayoutGrid className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-white text-base font-light tracking-wide">Scheduler</h1>
            <p className="text-slate-500 text-xs">{monthLabel}</p>
          </div>
        </div>

        {/* Center: week nav */}
        <div className="flex items-center gap-2">
          <button onClick={prevWeek}
            className="p-2 rounded-xl hover:bg-white/6 text-slate-400 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToday}
            className="px-4 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition-colors"
            style={{ border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)' }}>
            Today
          </button>
          <button onClick={nextWeek}
            className="p-2 rounded-xl hover:bg-white/6 text-slate-400 hover:text-white transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {onAskJumari && (
            <button
              onClick={() => { onClose(); onAskJumari('I need help scheduling something — can you add it to my scheduler?'); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors text-indigo-300 hover:text-white"
              style={{ border:'1px solid rgba(99,102,241,0.3)', background:'rgba(99,102,241,0.08)' }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ask JUMARI
            </button>
          )}
          <button onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/6 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Day column headers ── */}
      <div className="flex shrink-0 pl-[52px]"
        style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        {weekDays.map((day, i) => {
          const isToday = toKey(day) === toKey(today);
          return (
            <div key={i} className="flex-1 flex flex-col items-center py-3 gap-1.5">
              <span className={`text-[10px] font-semibold uppercase tracking-widest ${isToday ? 'text-indigo-400' : 'text-slate-600'}`}>
                {DAYS_SHORT[day.getDay()]}
              </span>
              <span className={`text-base font-light w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                isToday ? 'text-white' : 'text-slate-400'
              }`}
                style={isToday ? { background:'rgba(99,102,241,0.85)', boxShadow:'0 0 12px rgba(99,102,241,0.4)' } : {}}
              >
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Time grid ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth:'none' }}>
        <div className="flex" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>

          {/* Hour labels */}
          <div className="w-[52px] shrink-0 relative">
            {HOURS.map((h, i) => (
              <div key={h} className="absolute right-2 text-[10px] text-slate-700 select-none whitespace-nowrap"
                style={{ top: i * HOUR_HEIGHT - 7 }}>
                {fmtHour(h)}
              </div>
            ))}
          </div>

          {/* Columns */}
          {weekDays.map((day, di) => {
            const isToday   = toKey(day) === toKey(today);
            const dayEvents = eventsFor(day);

            return (
              <div key={di} className="flex-1 relative"
                style={{ borderLeft:'1px solid rgba(255,255,255,0.04)', minHeight: HOURS.length * HOUR_HEIGHT }}>

                {/* Hour rows */}
                {HOURS.map((h, hi) => (
                  <div key={h}
                    className="absolute left-0 right-0 group cursor-pointer transition-colors hover:bg-white/[0.012]"
                    style={{ top: hi * HOUR_HEIGHT, height: HOUR_HEIGHT, borderTop:'1px solid rgba(255,255,255,0.04)' }}
                    onClick={() => setAddModal({ date: day, hour: h })}
                  >
                    {/* Half-hour */}
                    <div className="absolute left-0 right-0 top-1/2" style={{ borderTop:'1px solid rgba(255,255,255,0.02)' }} />
                    <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-30 transition-opacity">
                      <Plus className="w-3 h-3 text-slate-300" />
                    </div>
                  </div>
                ))}

                {/* Today now-line */}
                {isToday && (() => {
                  const now  = new Date();
                  const mins = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
                  if (mins < 0 || mins > (END_HOUR - START_HOUR) * 60) return null;
                  return (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                      style={{ top: (mins / 60) * HOUR_HEIGHT }}>
                      <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0 -ml-1"
                        style={{ boxShadow:'0 0 6px rgba(99,102,241,0.8)' }} />
                      <div className="flex-1 h-px bg-indigo-400/50" />
                    </div>
                  );
                })()}

                {/* Events */}
                {dayEvents.map(ev => {
                  const top    = (ev.startHour - START_HOUR) * HOUR_HEIGHT + 2;
                  const height = Math.max((ev.endHour - ev.startHour) * HOUR_HEIGHT - 4, 22);
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute left-1 right-1 z-10 rounded-xl px-2.5 py-1.5 cursor-pointer overflow-hidden"
                      style={{
                        top, height,
                        background: ev.color + '1a',
                        border: `1px solid ${ev.color}40`,
                        backdropFilter: 'blur(12px)',
                        boxShadow: `0 2px 12px ${ev.color}18`,
                      }}
                      onClick={e => { e.stopPropagation(); setDetailEv(ev); }}
                    >
                      <div className="w-1 h-full absolute left-0 top-0 rounded-l-xl" style={{ background: ev.color + 'cc' }} />
                      <div className="pl-2">
                        <div className="text-[11px] font-medium leading-tight truncate" style={{ color: ev.color }}>
                          {ev.title}
                        </div>
                        {height > 36 && (
                          <div className="text-[10px] text-slate-600 mt-0.5">
                            {fmtHour(ev.startHour)} – {fmtHour(ev.endHour)}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Add event modal ── */}
      <AnimatePresence>
        {addModal && (
          <EventModal
            date={addModal.date} defaultHour={addModal.hour}
            onSave={handleAdd} onClose={() => setAddModal(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Event detail modal ── */}
      <AnimatePresence>
        {detailEv && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
            onClick={() => setDetailEv(null)}
          >
            <motion.div
              initial={{ scale: 0.93, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 12 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl overflow-hidden shadow-2xl"
              style={{ background:'rgba(10,10,20,0.95)', backdropFilter:'blur(40px)', border:`1px solid ${detailEv.color}30` }}
            >
              <div className="h-0.5 w-full" style={{ background: detailEv.color }} />
              <div className="px-6 py-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-white font-light text-lg leading-snug pr-4">{detailEv.title}</h3>
                  <button onClick={() => setDetailEv(null)}
                    className="p-1.5 rounded-full hover:bg-white/8 text-slate-500 hover:text-white transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{fmtHour(detailEv.startHour)} – {fmtHour(detailEv.endHour)}</span>
                </div>
                <div className="text-slate-600 text-xs mb-4">
                  {new Date(detailEv.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
                </div>
                {detailEv.note && (
                  <p className="text-slate-400 text-sm mb-4 bg-white/[0.04] rounded-xl px-3 py-2.5 border border-white/5 leading-relaxed">
                    {detailEv.note}
                  </p>
                )}
                <button onClick={() => handleDelete(detailEv.id)}
                  className="flex items-center gap-2 text-red-400/70 hover:text-red-400 text-sm transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
