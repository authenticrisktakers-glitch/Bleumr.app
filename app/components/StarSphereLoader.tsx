import React, { useEffect, useRef, memo } from 'react';
import { performanceTier, isMobileDevice, frameIntervalMs } from '../services/CPUAccelerator';

// Star count — aggressive mobile reduction to prevent overheating
const BG_STAR_COUNT = isMobileDevice
  ? (performanceTier === 'medium' ? 400 : 200)
  : (performanceTier === 'high' ? 2200 : performanceTier === 'medium' ? 1200 : 500);

// Mobile uses 1x DPR for canvas — saves 4x fill rate vs 2x retina
const CANVAS_DPR = isMobileDevice ? 1 : (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1);

export const StarSphereLoader = memo(function StarSphereLoader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let startTimestamp: number | null = null;
    let lastFrameTime = 0;

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
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * CANVAS_DPR;
      canvas.height = height * CANVAS_DPR;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(CANVAS_DPR, CANVAS_DPR);
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const render = (timestamp: number) => {
      // FPS throttle — skip frames to stay within budget
      if (timestamp - lastFrameTime < frameIntervalMs) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = timestamp;

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
      style={{ willChange: 'transform' }}
    />
  );
});
