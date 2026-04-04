/**
 * OrbitIcon — Custom JUMARI Orbit brand icon
 *
 * Design: A tilted elliptical orbit ring with a glowing node/satellite,
 * and a central "eye" dot — represents autonomous watching + orbital path.
 * Not a generic icon — unique to Bleumr/JUMARI.
 */

import React from 'react';

interface OrbitIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  animated?: boolean;
}

export function JumariOrbitIcon({ size = 16, className = '', style, animated = false }: OrbitIconProps) {
  const id = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.6" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={`${id}-node`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer tilted orbit ring — 30deg tilt for depth */}
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="4.5"
        transform="rotate(-30 12 12)"
        stroke={`url(#${id}-ring)`}
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />

      {/* Inner smaller orbit ring — opposite tilt */}
      <ellipse
        cx="12"
        cy="12"
        rx="7"
        ry="3"
        transform="rotate(35 12 12)"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeOpacity="0.25"
        fill="none"
        strokeDasharray="2.5 3"
      />

      {/* Central core — the "eye" */}
      <circle
        cx="12"
        cy="12"
        r="2.2"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeOpacity="0.5"
      />
      <circle
        cx="12"
        cy="12"
        r="0.9"
        fill="currentColor"
        fillOpacity="0.9"
      />

      {/* Satellite node — the active watcher */}
      <g filter={`url(#${id}-glow)`}>
        <circle
          cx="19.5"
          cy="7.5"
          r="2"
          fill={`url(#${id}-node)`}
        >
          {animated && (
            <animate
              attributeName="r"
              values="1.8;2.3;1.8"
              dur="2s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      </g>

      {/* Satellite glow halo */}
      <circle
        cx="19.5"
        cy="7.5"
        r="3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.15"
      >
        {animated && (
          <animate
            attributeName="r"
            values="3;4;3"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
        {animated && (
          <animate
            attributeName="stroke-opacity"
            values="0.15;0.05;0.15"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* Second smaller node — trailing satellite */}
      <circle
        cx="5"
        cy="15.5"
        r="1.1"
        fill="currentColor"
        fillOpacity="0.4"
      >
        {animated && (
          <animate
            attributeName="fill-opacity"
            values="0.4;0.7;0.4"
            dur="3s"
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  );
}
