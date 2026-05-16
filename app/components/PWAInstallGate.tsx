/**
 * PWA Install Gate — shown ONLY on mobile web (not desktop web, not Electron).
 *
 * Desktop web users use the platform straight in the browser; mobile web users
 * are asked to add Bleumr to their home screen for the full PWA experience.
 * Electron is always "installed" so it is never gated.
 */
import { useRef, useEffect } from 'react';
import { InlineStarSphere } from './InlineStarSphere';
import { cpuCores, isMobileDevice } from '../services/CPUAccelerator';
import { IS_ELECTRON, IS_PWA } from '../services/Platform';
import { onPageVisibilityChange } from '../hooks/useVisibilityPause';

const PWA_STAR_COUNT = cpuCores >= 8 ? 300 : cpuCores >= 4 ? 180 : 100;

// Lightweight starfield for the install gate (no sphere barrier, no cursor lines — just drifting stars)
function PWAInstallStarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let W = 0, H = 0, maxH = 0;
    const resize = () => { W = canvas.width = window.innerWidth; maxH = Math.max(maxH, window.innerHeight, screen.height); H = canvas.height = maxH; };
    resize();
    window.addEventListener('resize', resize);
    const stars = Array.from({ length: PWA_STAR_COUNT }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.3 + 0.2,
      baseAlpha: Math.random() * 0.5 + 0.08,
      twinkleSpd: Math.random() * 0.0008 + 0.0003,
      twinklePhase: Math.random() * Math.PI * 2,
      driftSpd: Math.random() * 0.012 + 0.003,
    }));
    let startTs: number | null = null;
    let raf: number = 0;
    let paused = false;
    let disposed = false;
    const draw = (ts: number) => {
      if (disposed || paused) return;
      if (startTs === null) startTs = ts;
      const t = ts - startTs;
      ctx.fillStyle = '#020208';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < PWA_STAR_COUNT; i++) {
        const s = stars[i];
        const tw = Math.sin(t * s.twinkleSpd + s.twinklePhase) * 0.5 + 0.5;
        const sx = ((s.x * W) + t * s.driftSpd) % W;
        const sy = s.y * H;
        ctx.globalAlpha = s.baseAlpha * (0.4 + 0.6 * tw);
        ctx.fillRect(sx, sy, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    const stopVisibility = onPageVisibilityChange({
      onHide: () => { paused = true; cancelAnimationFrame(raf); },
      onShow: () => {
        if (disposed || !paused) return;
        paused = false;
        startTs = null;
        raf = requestAnimationFrame(draw);
      },
    });
    if (typeof document !== 'undefined' && document.hidden) {
      paused = true;
    } else {
      raf = requestAnimationFrame(draw);
    }
    return () => {
      disposed = true;
      paused = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      stopVisibility();
    };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

function isStandaloneMode(): boolean {
  if (IS_ELECTRON) return true; // Electron is always "installed"
  // Dev bypass — ?standalone=1 in URL
  if (new URLSearchParams(window.location.search).get('standalone') === '1') return true;
  // iOS standalone
  if ((navigator as any).standalone === true) return true;
  // Android / desktop PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  return false;
}

/**
 * True only when the install gate should block the app: a mobile web browser
 * that has not installed the PWA. Desktop web and Electron are never gated.
 */
export function shouldShowInstallGate(): boolean {
  return IS_PWA && isMobileDevice && !isStandaloneMode();
}

export default function PWAInstallGate() {
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  return (
    <div className="fixed inset-0 z-[99999] overflow-hidden text-white font-sans"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', background: '#020208' }}>
      {/* Starfield canvas */}
      <PWAInstallStarField />
      {/* Content overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
        <div className="flex flex-col items-center gap-5 max-w-sm text-center">
          {/* Animated sphere */}
          <div className="mb-2">
            <InlineStarSphere size={120} />
          </div>

          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-300 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
            Install Bleumr
          </h1>
          <p className="text-sm text-slate-400/80 leading-relaxed max-w-xs">
            Add to your home screen for the full experience — offline access, faster loads, and a native feel.
          </p>

          {isIOS ? (
            <div className="flex flex-col gap-3 w-full mt-2">
              {[
                { n: '1', text: <>Tap the <span className="inline-flex items-center mx-1 px-1.5 py-0.5 bg-white/10 rounded text-white text-xs font-semibold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> Share button</> },
                { n: '2', text: <>Scroll and tap <span className="font-semibold text-white">"Add to Home Screen"</span></> },
                { n: '3', text: <>Tap <span className="font-semibold text-white">"Add"</span> to install</> },
              ].map((step) => (
                <div key={step.n} className="flex items-center gap-3 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl px-4 py-3 text-left">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-400/20 flex items-center justify-center shrink-0">
                    <span className="text-violet-300 text-sm font-bold">{step.n}</span>
                  </div>
                  <p className="text-[13px] text-slate-300">{step.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3 w-full mt-2">
              {[
                { n: '1', text: <>Tap the <span className="font-semibold text-white">menu</span> (three dots) in your browser</> },
                { n: '2', text: <>Tap <span className="font-semibold text-white">"Add to Home Screen"</span> or <span className="font-semibold text-white">"Install App"</span></> },
              ].map((step) => (
                <div key={step.n} className="flex items-center gap-3 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl px-4 py-3 text-left">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-400/20 flex items-center justify-center shrink-0">
                    <span className="text-violet-300 text-sm font-bold">{step.n}</span>
                  </div>
                  <p className="text-[13px] text-slate-300">{step.text}</p>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-500/60 mt-3">Open Bleumr from your home screen to get started.</p>
          <p className="text-[9px] text-slate-600/40 mt-1">Created by Jumar Washington</p>
        </div>
      </div>
    </div>
  );
}
