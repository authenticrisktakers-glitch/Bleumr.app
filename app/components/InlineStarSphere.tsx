import React, { useEffect, useRef, memo } from 'react';
import { cpuCores, isMobileDevice, frameIntervalMs } from '../services/CPUAccelerator';

interface InlineStarSphereProps {
  className?: string;
  size?: number;
  /** When false, renders a tiny static grey dot — no canvas, no RAF loop */
  active?: boolean;
}

// Star count scales with rendered size AND cpu tier — no reason to run
// 4000 stars for a 32px avatar. Formula: ~8 stars per CSS pixel of diameter,
// capped by CPU tier.
function starsForSize(size: number): number {
  const base = Math.round(size * size * 0.55);
  // Mobile gets drastically fewer stars to prevent overheating
  const tierCap = isMobileDevice
    ? (cpuCores >= 6 ? 600 : 300)
    : (cpuCores >= 8 ? 3000 : cpuCores >= 4 ? 1400 : 600);
  return Math.min(base, tierCap);
}

export const InlineStarSphere: React.FC<InlineStarSphereProps> = memo(function InlineStarSphere({
  className = '',
  size = 192,
  active = true,
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      const dpr = isMobileDevice ? 1 : Math.min(window.devicePixelRatio || 1, 2);
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
    let isVisible = true; // assume visible until observer says otherwise
    let lastFrameTime = 0;

    const render = (timestamp: number) => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // FPS throttle
      if (timestamp - lastFrameTime < frameIntervalMs) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = timestamp;

      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsedMs = timestamp - startTimestamp;

      ctx.clearRect(0, 0, size, size);

      if (cachedGradient) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = cachedGradient;
        ctx.fillRect(0, 0, size, size);

        ctx.globalCompositeOperation = 'lighter';
        const perspective = R * 2.5;

        for (let i = 0; i < numStars; i++) {
          const s = stars[i];
          const currentTheta = s.theta - elapsedMs * rotationSpeedPerMs;
          const x = R * s.sinPhi * Math.cos(currentTheta);
          const y = R * s.cosPhi;
          const z = R * s.sinPhi * Math.sin(currentTheta);

          if (z > -R * 0.15) {
            const scaleProjected = perspective / (perspective - z);
            const projectedX = centerX + x * scaleProjected;
            const projectedY = centerY + y * scaleProjected;
            const zRatio = z / R;
            const dx = Math.abs(projectedX - centerX);
            const dy = Math.abs(projectedY - centerY);
            const edgeRatio = Math.min(1, (dx + dy) / (R * 1.2));
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

    // IntersectionObserver — pause RAF when scrolled out of view
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
  }, [size]);

  // Inactive — no canvas, no RAF. Just a tiny static grey dot.
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
        style={{ width: size, height: size, willChange: 'contents', transform: 'translateZ(0)' }}
        className="block pointer-events-none"
      />
    </div>
  );
});
