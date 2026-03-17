import React, { useEffect, useRef, memo } from 'react';
import { cpuCores } from '../services/CPUAccelerator';

// Background star count scaled to CPU tier — no need to animate 3500 stars
// on a 2-core machine running the entire app at the same time.
const BG_STAR_COUNT = cpuCores >= 8 ? 2200 : cpuCores >= 4 ? 1200 : 500;

export const StarSphereLoader = memo(function StarSphereLoader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Opaque background — enables additive blending without alpha compositing cost
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let startTimestamp: number | null = null;

    const bgStars = Array.from({ length: BG_STAR_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 1.2 + 0.3,
      baseAlpha: Math.random() * 0.4 + 0.1,
      twinkleSpeed: Math.random() * 0.001 + 0.0005,
      twinklePhase: Math.random() * Math.PI * 2,
      driftSpeed: Math.random() * 0.015 + 0.005,
    }));

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const render = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsedMs = timestamp - startTimestamp;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      if (width > 0 && height > 0) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < BG_STAR_COUNT; i++) {
          const bg = bgStars[i];
          const twinkle = Math.sin(elapsedMs * bg.twinkleSpeed + bg.twinklePhase) * 0.5 + 0.5;
          ctx.globalAlpha = bg.baseAlpha * twinkle;
          const finalX = ((bg.x * width) + elapsedMs * bg.driftSpeed) % width;
          ctx.fillRect(finalX, bg.y * height, bg.size, bg.size);
        }
        ctx.globalAlpha = 1;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-screen h-screen block z-0 pointer-events-none"
      // hint compositor to promote to own layer — avoids repaints touching layout
      style={{ willChange: 'transform' }}
    />
  );
});
