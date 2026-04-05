import React, { useEffect, useRef, memo, useCallback } from 'react';
import { cpuCores, isMobileDevice, frameIntervalMs } from '../services/CPUAccelerator';

interface InlineStarSphereProps {
  className?: string;
  size?: number;
  /** When false, renders a tiny static grey dot — no canvas, no RAF loop */
  active?: boolean;
  /** Enable touch/pointer drag to spin the sphere (mobile PWA idle state) */
  interactive?: boolean;
}

// Star count scales with rendered size AND cpu tier
function starsForSize(size: number): number {
  const base = Math.round(size * size * 0.7);
  const tierCap = isMobileDevice
    ? (cpuCores >= 6 ? 1250 : 650)
    : (cpuCores >= 8 ? 4000 : cpuCores >= 4 ? 2000 : 800);
  return Math.min(base, tierCap);
}

export const InlineStarSphere: React.FC<InlineStarSphereProps> = memo(function InlineStarSphere({
  className = '',
  size = 192,
  active = true,
  interactive = false,
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Interactive drag state (refs survive re-renders, no reflow) ──────────
  const dragActive = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const manualYaw = useRef(0);
  const manualPitch = useRef(0);
  const velocityYaw = useRef(0);
  const velocityPitch = useRef(0);
  const lastDragTime = useRef(0);
  const interacting = useRef(false);
  // Smoothed velocity (averages last few drags to prevent jitter)
  const velSamplesY = useRef<number[]>([]);
  const velSamplesP = useRef<number[]>([]);

  // ── Pointer handlers ────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!interactive) return;
    dragActive.current = true;
    interacting.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    velocityYaw.current = 0;
    velocityPitch.current = 0;
    velSamplesY.current = [];
    velSamplesP.current = [];
    lastDragTime.current = performance.now();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [interactive]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragActive.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    const now = performance.now();
    const dt = Math.max(1, now - lastDragTime.current);

    const sensitivity = 3.5 / size;
    manualYaw.current += dx * sensitivity;
    manualPitch.current += dy * sensitivity;
    manualPitch.current = Math.max(-1.2, Math.min(1.2, manualPitch.current));

    // Collect velocity samples for smooth momentum on release
    const vy = (dx * sensitivity) / dt * 16;
    const vp = (dy * sensitivity) / dt * 16;
    velSamplesY.current.push(vy);
    velSamplesP.current.push(vp);
    if (velSamplesY.current.length > 4) velSamplesY.current.shift();
    if (velSamplesP.current.length > 4) velSamplesP.current.shift();

    lastPointer.current = { x: e.clientX, y: e.clientY };
    lastDragTime.current = now;
  }, [size]);

  const onPointerUp = useCallback(() => {
    dragActive.current = false;
    // Average the last few velocity samples for smooth momentum
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    velocityYaw.current = avg(velSamplesY.current);
    velocityPitch.current = avg(velSamplesP.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const numStars = starsForSize(size);
    const centerX = size / 2;
    const centerY = size / 2;
    const R = size * 0.35;
    const rotationSpeedPerMs = (2 * Math.PI) / 40000;
    let startTimestamp: number | null = null;
    let cachedGradient: CanvasGradient | null = null;

    const colors = ['#ffffff', '#ffffff', '#ffffff', '#e6f2ff', '#baddff', '#70b5ff'];
    const stars = Array.from({ length: numStars }, () => {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * 2 * Math.PI;
      return {
        theta,
        sinPhi: Math.sin(phi),
        cosPhi: Math.cos(phi),
        size: Math.random() * 0.6 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        isBright: Math.random() > 0.4,
      };
    });

    const setupCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      cachedGradient = ctx.createRadialGradient(
        centerX, centerY, R * 0.5,
        centerX, centerY, R * 1.3
      );
      cachedGradient.addColorStop(0, 'rgba(15, 45, 130, 0.6)');
      cachedGradient.addColorStop(0.5, 'rgba(10, 25, 80, 0.25)');
      cachedGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    };
    setupCanvas();

    let animationFrameId: number;
    let isVisible = true;
    let lastFrameTime = 0;

    const render = (timestamp: number) => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // ── FPS strategy: full speed during interaction, throttled when idle ──
      const isActive = interactive && interacting.current;
      const throttleMs = isActive ? 0 : frameIntervalMs;
      if (throttleMs > 0 && timestamp - lastFrameTime < throttleMs) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = timestamp;

      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsedMs = timestamp - startTimestamp;

      // ── Momentum decay (smooth coasting after release) ────────────────
      if (interactive && !dragActive.current && interacting.current) {
        const friction = 0.965;          // longer coast than before
        manualYaw.current += velocityYaw.current;
        manualPitch.current += velocityPitch.current;
        manualPitch.current = Math.max(-1.2, Math.min(1.2, manualPitch.current));
        velocityYaw.current *= friction;
        velocityPitch.current *= friction;

        // Gently return pitch to upright when coasting
        manualPitch.current *= 0.997;

        // End interaction once momentum dies
        if (Math.abs(velocityYaw.current) < 0.00003 && Math.abs(velocityPitch.current) < 0.00003) {
          interacting.current = false;
        }
      }

      ctx.clearRect(0, 0, size, size);

      if (cachedGradient) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = cachedGradient;
        ctx.fillRect(0, 0, size, size);

        ctx.globalCompositeOperation = 'lighter';
        const perspective = R * 2.5;

        // Auto-rotation slows while user is interacting
        const autoWeight = interacting.current ? 0.12 : 1;
        const autoRot = elapsedMs * rotationSpeedPerMs * autoWeight;

        const pitchAngle = interactive ? manualPitch.current : 0;
        const cosPitch = Math.cos(pitchAngle);
        const sinPitch = Math.sin(pitchAngle);

        for (let i = 0; i < numStars; i++) {
          const s = stars[i];
          const currentTheta = s.theta - autoRot + (interactive ? manualYaw.current : 0);

          const x0 = R * s.sinPhi * Math.cos(currentTheta);
          const y0 = R * s.cosPhi;
          const z0 = R * s.sinPhi * Math.sin(currentTheta);

          const x = x0;
          const y = y0 * cosPitch - z0 * sinPitch;
          const z = y0 * sinPitch + z0 * cosPitch;

          if (z > -R * 0.15) {
            const scaleProjected = perspective / (perspective - z);
            const projectedX = centerX + x * scaleProjected;
            const projectedY = centerY + y * scaleProjected;
            const zRatio = z / R;
            const edgeDx = Math.abs(projectedX - centerX);
            const edgeDy = Math.abs(projectedY - centerY);
            const edgeRatio = Math.min(1, (edgeDx + edgeDy) / (R * 1.2));
            let opacity = Math.min(1, Math.max(0, zRatio + 0.3));
            if (edgeRatio > 0.8) opacity = Math.min(1, opacity + (edgeRatio - 0.8) * 1.5);
            let finalSize = s.size * scaleProjected;
            if (s.isBright) {
              opacity = Math.min(1, opacity * 2.5);
              finalSize *= 1 + 0.4 * Math.sin(elapsedMs * 0.003 + s.theta);
            }
            ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(projectedX, projectedY, finalSize, 0, Math.PI * 2);
            ctx.fill();
            if (s.isBright && finalSize > 0.15) {
              ctx.beginPath();
              ctx.arc(projectedX, projectedY, finalSize * 0.5, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
            }
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      animationFrameId = requestAnimationFrame(render);
    };

    const observer = new IntersectionObserver(
      ([entry]) => { isVisible = entry.isIntersecting; },
      { threshold: 0 }
    );
    observer.observe(container);

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, [size, interactive]);

  if (!active) {
    return (
      <div
        className={`rounded-full bg-slate-700/50 ${className}`}
        style={{ width: 8, height: 8 }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? onPointerUp : undefined}
        onPointerCancel={interactive ? onPointerUp : undefined}
        style={{
          width: size,
          height: size,
          willChange: 'contents',
          transform: 'translateZ(0)',
          touchAction: interactive ? 'none' : undefined,
          cursor: interactive ? 'grab' : undefined,
        }}
        className={`block ${interactive ? '' : 'pointer-events-none'}`}
      />
    </div>
  );
});
