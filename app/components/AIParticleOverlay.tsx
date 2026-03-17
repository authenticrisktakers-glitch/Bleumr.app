import React from 'react';

interface AIParticleOverlayProps {
  isActive: boolean;
}

export function AIParticleOverlay({ isActive }: AIParticleOverlayProps) {
  return (
    <div 
      className={`absolute inset-0 pointer-events-none z-50 transition-opacity duration-1000 ease-in-out ${
        isActive ? 'opacity-100 visible' : 'opacity-0 invisible'
      }`}
    >
      <style>{`
        @keyframes soft-breathe {
          0% { box-shadow: inset 0 0 100px 10px rgba(99, 102, 241, 0.3), inset 0 0 140px 20px rgba(34, 211, 238, 0.2); }
          50% { box-shadow: inset 0 0 120px 20px rgba(168, 85, 247, 0.3), inset 0 0 180px 30px rgba(99, 102, 241, 0.25); }
          100% { box-shadow: inset 0 0 100px 10px rgba(99, 102, 241, 0.3), inset 0 0 140px 20px rgba(34, 211, 238, 0.2); }
        }
        @keyframes fog-drift-1 {
          0%, 100% { transform: translate(0%, 0%) scale(1); opacity: 0.7; }
          50% { transform: translate(3%, 5%) scale(1.1); opacity: 1; }
        }
        @keyframes fog-drift-2 {
          0%, 100% { transform: translate(0%, 0%) scale(1.1); opacity: 0.8; }
          50% { transform: translate(-4%, -3%) scale(1); opacity: 1; }
        }
        @keyframes fog-drift-3 {
          0%, 100% { transform: translate(0%, 0%) scale(1); opacity: 0.7; }
          50% { transform: translate(-3%, 4%) scale(1.1); opacity: 0.9; }
        }
      `}</style>
      
      {/* Edge Glow - Visible but not blinding */}
      <div 
        className="absolute inset-0 pointer-events-none rounded-tl-lg transition-all duration-1000 mix-blend-screen"
        style={{ animation: 'soft-breathe 6s ease-in-out infinite' }}
      />
      
      {/* Medium Fog Layers - Visible, soft, screen blended for luminosity */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-tl-lg mix-blend-screen">
        
        {/* Indigo Fog */}
        <div 
          className="absolute -top-[10%] -left-[10%] w-[85%] h-[85%]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.45) 0%, rgba(99,102,241,0.15) 50%, transparent 75%)',
            filter: 'blur(100px)',
            animation: 'fog-drift-1 12s ease-in-out infinite'
          }}
        />
        
        {/* Purple Fog */}
        <div 
          className="absolute -bottom-[15%] -right-[10%] w-[90%] h-[90%]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(168,85,247,0.4) 0%, rgba(168,85,247,0.1) 50%, transparent 75%)',
            filter: 'blur(110px)',
            animation: 'fog-drift-2 15s ease-in-out infinite'
          }}
        />
        
        {/* Cyan Fog */}
        <div 
          className="absolute top-[10%] -right-[5%] w-[75%] h-[75%]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(34,211,238,0.45) 0%, rgba(34,211,238,0.15) 50%, transparent 75%)',
            filter: 'blur(90px)',
            animation: 'fog-drift-3 13s ease-in-out infinite'
          }}
        />
      </div>
      
      {/* Subtle Noise Texture for smoke realism */}
      <div 
        className="absolute inset-0 opacity-[0.08] pointer-events-none rounded-tl-lg mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />
    </div>
  );
}
