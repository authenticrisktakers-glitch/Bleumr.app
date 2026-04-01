import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Check, User, Calendar, Mail, Phone, MapPin, Sparkles, Key, UserPlus } from 'lucide-react';
import { UserProfile, saveProfile } from '../services/UserProfile';
import { InlineStarSphere } from './InlineStarSphere';
import { cpuCores } from '../services/CPUAccelerator';
import SubscriptionService from '../services/SubscriptionService';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
}

interface Step {
  id: keyof Omit<UserProfile, 'createdAt'>;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  type?: string;
  hint?: string;
}

const STEPS: Step[] = [
  { id: 'name',     label: 'Your name',     placeholder: 'Full name',                icon: <User className="w-5 h-5" />,     hint: 'How should your agent address you?' },
  { id: 'birthday', label: 'Birthday',      placeholder: 'MM / DD / YYYY',           icon: <Calendar className="w-5 h-5" />, type: 'date', hint: 'Used to personalise your experience.' },
  { id: 'email',    label: 'Email',         placeholder: 'you@example.com',          icon: <Mail className="w-5 h-5" />,     type: 'email', hint: 'Stored locally. Never shared.' },
  { id: 'phone',    label: 'Phone',         placeholder: '+1 (555) 000-0000',        icon: <Phone className="w-5 h-5" />,    type: 'tel',   hint: 'For autofill only.' },
  { id: 'address',  label: 'Home address',  placeholder: '123 Main St, City, State', icon: <MapPin className="w-5 h-5" />,   hint: 'Used for local autofill tasks.' },
];

const STAR_COUNT = cpuCores >= 8 ? 420 : cpuCores >= 4 ? 260 : 140;
const CONNECT_RADIUS = 70;  // px from cursor — only closest stars get lines
const MAX_LINES      = 5;   // max lines drawn per frame
const SPHERE_R       = 118; // px — sphere barrier (100px radius + 18 buffer)

// Immersive drifting star field with cursor-activated constellation lines
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef  = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let W = 0, H = 0, maxH = 0;
    const resize = () => {
      W = canvas.width  = window.innerWidth;
      // Never shrink height — prevents keyboard from cropping starfield
      maxH = Math.max(maxH, window.innerHeight, screen.height);
      H = canvas.height = maxH;
    };
    resize();
    window.addEventListener('resize', resize);

    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMove);

    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x:           Math.random(),
      y:           Math.random(),
      r:           Math.random() * 1.3 + 0.2,
      baseAlpha:   Math.random() * 0.45 + 0.08,
      twinkleSpd:  Math.random() * 0.0008 + 0.0003,
      twinklePhase:Math.random() * Math.PI * 2,
      driftSpd:    Math.random() * 0.014 + 0.004,
    }));

    let startTs: number | null = null;
    let raf: number;

    const draw = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = ts - startTs;

      ctx.fillStyle = '#020208';
      ctx.fillRect(0, 0, W, H);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Sphere center (sphere is 200px, centered ~40px above viewport midpoint)
      const spCX = W / 2;
      const spCY = H / 2 - 40;
      const cursorInSphere = (mx - spCX) ** 2 + (my - spCY) ** 2 < SPHERE_R * SPHERE_R;

      // Build screen-space positions; skip stars inside sphere barrier
      const pos: ({ sx: number; sy: number } | null)[] = new Array(STAR_COUNT);

      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < STAR_COUNT; i++) {
        const s  = stars[i];
        const tw = Math.sin(t * s.twinkleSpd + s.twinklePhase) * 0.5 + 0.5;
        const sx = ((s.x * W) + t * s.driftSpd) % W;
        const sy = s.y * H;
        // Skip star if it's inside the sphere barrier
        const inSphere = (sx - spCX) ** 2 + (sy - spCY) ** 2 < SPHERE_R * SPHERE_R;
        pos[i] = inSphere ? null : { sx, sy };
        if (!inSphere) {
          ctx.globalAlpha = s.baseAlpha * (0.4 + 0.6 * tw);
          ctx.fillRect(sx, sy, s.r, s.r);
        }
      }

      // Cursor lines — only when cursor is outside sphere and inside window
      if (!cursorInSphere && mx > 0 && my > 0 && mx < W && my < H) {
        // Collect nearby stars sorted by distance, cap at MAX_LINES
        const candidates: { dist: number; idx: number }[] = [];
        const CR2 = CONNECT_RADIUS * CONNECT_RADIUS;
        for (let i = 0; i < STAR_COUNT; i++) {
          const p = pos[i];
          if (!p) continue;
          const dx = p.sx - mx;
          const dy = p.sy - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < CR2) candidates.push({ dist: Math.sqrt(d2), idx: i });
        }
        candidates.sort((a, b) => a.dist - b.dist);
        const draw_count = Math.min(candidates.length, MAX_LINES);

        ctx.lineWidth = 1.2;
        for (let a = 0; a < draw_count; a++) {
          const p = pos[candidates[a].idx]!;
          const alpha = Math.min(1, (1 - candidates[a].dist / CONNECT_RADIUS) * 1.8);
          ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(mx, my);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ willChange: 'transform', display: 'block' }}
    />
  );
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [phase, setPhase]   = useState<'welcome' | 'usertype' | 'license' | 'form' | 'done'>('welcome');
  const [stepIdx, setStepIdx] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({
    name: '', birthday: '', email: '', phone: '', address: '',
  });
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseStatus, setLicenseStatus] = useState<'idle' | 'validating' | 'error'>('idle');
  const [licenseError, setLicenseError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const licenseRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase === 'form') setTimeout(() => inputRef.current?.focus(), 200);
    if (phase === 'license') setTimeout(() => licenseRef.current?.focus(), 200);
  }, [stepIdx, phase]);

  const handleLicenseSubmit = async () => {
    if (!licenseKey.trim()) return;
    setLicenseStatus('validating');
    setLicenseError('');
    try {
      const result = await SubscriptionService.activateLicenseKey(licenseKey.trim());
      if (result.success) {
        setLicenseStatus('idle');
        setPhase('form');
      } else {
        setLicenseStatus('error');
        setLicenseError(result.error || 'Invalid license key. Check and try again.');
      }
    } catch {
      setLicenseStatus('error');
      setLicenseError('Connection failed. Check your internet and try again.');
    }
  };

  const currentStep = STEPS[stepIdx];
  const progress    = (stepIdx / STEPS.length) * 100;

  const handleNext = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(s => s + 1);
    } else {
      const profile: UserProfile = {
        name:      values.name.trim() || 'User',
        birthday:  values.birthday,
        email:     values.email,
        phone:     values.phone,
        address:   values.address,
        createdAt: Date.now(),
      };
      saveProfile(profile);
      setPhase('done');
      setTimeout(() => onComplete(profile), 1800);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNext();
  };

  const canProceed = stepIdx === 0 ? values.name.trim().length > 0 : true;

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#020208]">
      <StarField />

      {/* Subtle deep-blue vignette center glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 55% 45% at 50% 60%, rgba(40,70,200,0.07) 0%, transparent 70%)' }}
      />

      <AnimatePresence mode="wait">

        {/* ── WELCOME ── */}
        {phase === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative z-10 flex flex-col items-center justify-center h-full gap-10"
          >
            {/* Sphere — center of screen */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 1, type: 'spring', bounce: 0.25 }}
            >
              <InlineStarSphere size={200} />
            </motion.div>

            {/* Get Started — bare text, dimmed, no pill */}
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.6, ease: 'easeOut' }}
              onClick={() => setPhase('usertype')}
              className="group flex items-center gap-2.5 text-slate-500 hover:text-slate-300 transition-colors duration-300 text-sm tracking-widest uppercase font-light"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-300" />
            </motion.button>
          </motion.div>
        )}

        {/* ── WELCOME — glass card with options ── */}
        {phase === 'usertype' && (
          <motion.div
            key="usertype"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="relative z-10 flex flex-col items-center justify-center h-full px-6"
          >
            {/* Glass card */}
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5, ease: 'easeOut' }}
              className="flex flex-col items-center gap-5 px-8 py-10 rounded-3xl max-w-xs w-full"
              style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <InlineStarSphere size={80} />

              <div className="text-center">
                <h2 className="text-lg font-semibold text-white/90 tracking-tight">Welcome to Bleumr</h2>
                <p className="text-[11px] text-white/25 mt-1 tracking-wide uppercase">Beta</p>
              </div>

              {/* New User */}
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.35 }}
                onClick={() => setPhase('form')}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <UserPlus className="w-4 h-4 text-indigo-400/70 shrink-0" />
                <div className="text-left">
                  <span className="text-[13px] font-medium text-white/70 block leading-tight">New User</span>
                  <span className="text-[10px] text-white/20">Set up your profile</span>
                </div>
                <ArrowRight className="w-3 h-3 text-white/15 ml-auto" />
              </motion.button>

              {/* Existing User */}
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.35 }}
                onClick={() => setPhase('license')}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <Key className="w-4 h-4 text-emerald-400/70 shrink-0" />
                <div className="text-left">
                  <span className="text-[13px] font-medium text-white/70 block leading-tight">Existing User</span>
                  <span className="text-[10px] text-white/20">Enter your license key</span>
                </div>
                <ArrowRight className="w-3 h-3 text-white/15 ml-auto" />
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {/* ── LICENSE KEY ENTRY ── */}
        {phase === 'license' && (
          <motion.div
            key="license"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="relative z-10 flex flex-col items-center justify-center h-full gap-6 px-6"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <InlineStarSphere size={100} />
            </motion.div>

            <div className="text-center">
              <h2 className="text-lg font-semibold text-white/90 tracking-tight mb-1.5">Welcome Back</h2>
              <p className="text-xs text-white/30">Enter your license key to continue</p>
            </div>

            <div className="w-full max-w-sm space-y-3">
              <input
                ref={licenseRef}
                value={licenseKey}
                onChange={e => { setLicenseKey(e.target.value.toUpperCase()); setLicenseError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLicenseSubmit()}
                placeholder="BLM-XXXXX-XXXXX-XXXXX"
                className="w-full px-4 py-3 rounded-xl text-center text-sm font-mono tracking-widest text-white/80 placeholder-white/15 outline-none transition-all focus:ring-1 focus:ring-emerald-500/30"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              />

              {licenseError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-red-400 text-center"
                >
                  {licenseError}
                </motion.p>
              )}

              <button
                onClick={handleLicenseSubmit}
                disabled={!licenseKey.trim() || licenseStatus === 'validating'}
                className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all disabled:opacity-30"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                {licenseStatus === 'validating' ? 'Validating...' : 'Activate'}
              </button>

              <button
                onClick={() => setPhase('usertype')}
                className="w-full py-2 text-xs text-white/20 hover:text-white/40 transition-colors"
              >
                Go back
              </button>
            </div>
          </motion.div>
        )}

        {/* ── FORM steps ── */}
        {phase === 'form' && (
          <motion.div
            key={`step-${stepIdx}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="relative z-10 w-full max-w-md px-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {/* Progress bar */}
            <div className="w-full h-[2px] bg-white/5 rounded-full mb-10 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #38bdf8, #818cf8)', width: `${progress}%` }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>

            {/* Step counter */}
            <p className="text-[10px] tracking-[0.3em] text-slate-600 uppercase mb-4">
              Step {stepIdx + 1} of {STEPS.length}
            </p>

            {/* Step icon + label */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sky-400">
                {currentStep.icon}
              </div>
              <h2 className="text-2xl font-light text-white tracking-tight">{currentStep.label}</h2>
            </div>

            {currentStep.hint && (
              <p className="text-slate-500 text-sm mb-6 ml-[52px]">{currentStep.hint}</p>
            )}

            {/* Input */}
            <div className="relative">
              <input
                ref={inputRef}
                type={currentStep.type || 'text'}
                value={values[currentStep.id]}
                onChange={e => setValues(v => ({ ...v, [currentStep.id]: e.target.value }))}
                onKeyDown={handleKeyDown}
                placeholder={currentStep.placeholder}
                className="w-full bg-white/[0.04] border border-white/10 focus:border-sky-500/40 rounded-2xl px-5 py-4 text-white placeholder-slate-600 text-base outline-none transition-all duration-300 focus:bg-black/40"
                style={{ backdropFilter: 'blur(16px)' }}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-6">
              {stepIdx > 0 ? (
                <button onClick={handleNext} className="text-slate-600 hover:text-slate-400 text-sm transition-colors">
                  Skip
                </button>
              ) : <div />}

              <button
                onClick={handleNext}
                disabled={!canProceed}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                  canProceed
                    ? 'bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/25 text-white'
                    : 'opacity-30 cursor-not-allowed text-slate-400 border border-white/5'
                }`}
              >
                {stepIdx === STEPS.length - 1 ? 'Finish' : 'Continue'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative z-10 flex flex-col items-center gap-6 text-center px-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
              className="w-20 h-20 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center"
            >
              <Check className="w-10 h-10 text-sky-400" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col items-center gap-2"
            >
              <h2 className="text-3xl font-light text-white">
                You're all set{values.name ? `, ${values.name.trim().split(' ')[0]}` : ''}
              </h2>
              <p className="text-slate-500 text-sm">Launching Bleumr…</p>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
