import React, { useEffect, useRef } from 'react';

interface MiniStarSphereButtonProps {
  onClick: () => void;
  className?: string;
  size?: number;
  paused?: boolean;
}

export const MiniStarSphereButton: React.FC<MiniStarSphereButtonProps> = ({
  onClick,
  className = '',
  size = 36,
  paused = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Use alpha: false for better performance if we draw our own solid background
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = size;
    let height = size;
    let centerX = size / 2;
    let centerY = size / 2;
    // Sphere radius
    let R = size * 0.35;
    
    const rotationSpeedPerMs = (2 * Math.PI) / 40000; 
    let startTimestamp: number | null = null;
    let cachedGradient: CanvasGradient | null = null;

    const numStars = 1350; 
    const stars: any[] = [];
    const colors = ['#ffffff', '#ffffff', '#ffffff', '#e6f2ff', '#baddff', '#70b5ff'];

    for (let i = 0; i < numStars; i++) {
      const phi = Math.acos(2 * Math.random() - 1); 
      const theta = Math.random() * 2 * Math.PI;
      
      stars.push({
        theta,
        sinPhi: Math.sin(phi),
        cosPhi: Math.cos(phi),
        size: Math.random() * 0.6 + 0.2, 
        color: colors[Math.floor(Math.random() * colors.length)],
        isBright: Math.random() > 0.4,
      });
    }

    const setupCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      
      cachedGradient = ctx.createRadialGradient(centerX, centerY, R * 0.5, centerX, centerY, R * 1.3);
      cachedGradient.addColorStop(0, 'rgba(15, 45, 130, 0.6)');
      cachedGradient.addColorStop(0.5, 'rgba(10, 25, 80, 0.25)');
      cachedGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    };

    setupCanvas();

    let lastElapsedMs = 0;

    const render = (timestamp: number) => {
      animationFrameId = requestAnimationFrame(render);
      if (pausedRef.current) {
        startTimestamp = timestamp - lastElapsedMs;
        return;
      }
      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsedMs = timestamp - startTimestamp;
      lastElapsedMs = elapsedMs;

      // Dark background matching the header
      ctx.fillStyle = '#111113';
      ctx.fillRect(0, 0, width, height);

      if (cachedGradient) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = cachedGradient;
        ctx.fillRect(0, 0, width, height);

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
            const projectedX = centerX + (x * scaleProjected);
            const projectedY = centerY + (y * scaleProjected);

            const zRatio = (z / R); 
            const dx = Math.abs(projectedX - centerX);
            const dy = Math.abs(projectedY - centerY);
            const edgeRatio = Math.min(1, (dx + dy) / (R * 1.2));

            let opacity = Math.min(1, Math.max(0, zRatio + 0.3));
            
            if (edgeRatio > 0.8) {
              opacity = Math.min(1, opacity + (edgeRatio - 0.8) * 1.5);
            }

            let finalSize = s.size * scaleProjected;
            
            if (s.isBright) {
              opacity = Math.min(1, opacity * 2.5);
              finalSize *= (1 + 0.4 * Math.sin(elapsedMs * 0.003 + s.theta));
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
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [size]);

  return (
    <button
      onClick={onClick}
      className={`relative group flex items-center justify-center rounded-full overflow-hidden border border-white/10 hover:border-indigo-500/50 hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all active:scale-95 cursor-pointer ${className}`}
      style={{ width: size, height: size }}
      aria-label="Open AI Assistant"
      title="Open AI Assistant"
    >
      <canvas 
        ref={canvasRef} 
        style={{ width: size, height: size }}
        className="block pointer-events-none"
      />
      
      {/* Inner lighting effect */}
      <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_4px_rgba(255,255,255,0.15)] pointer-events-none group-hover:shadow-[inset_0_2px_10px_rgba(255,255,255,0.3)] transition-shadow" />
      
      {/* Top subtle highlight */}
      <div className="absolute top-0 inset-x-2 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </button>
  );
};
