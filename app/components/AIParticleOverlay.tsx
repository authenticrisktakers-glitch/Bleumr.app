import React from 'react';

interface AIParticleOverlayProps {
  isActive: boolean;
}

export function AIParticleOverlay({ isActive }: AIParticleOverlayProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-500 ease-out"
      style={{ opacity: isActive ? 1 : 0 }}
      aria-hidden="true"
    >
      {/* Very subtle edge pulse — just a faint perimeter glow, not a fog wall */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 40px 6px rgba(99,102,241,0.12), inset 0 0 80px 12px rgba(34,211,238,0.06)',
          animation: isActive ? 'blmr-breathe 4s ease-in-out infinite' : 'none',
        }}
      />

      <style>{`
        @keyframes blmr-breathe {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1;   }
        }
      `}</style>
    </div>
  );
}
