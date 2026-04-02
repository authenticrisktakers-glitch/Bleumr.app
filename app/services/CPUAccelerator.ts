/**
 * CPUAccelerator — adapts animation quality to device capability.
 * Mobile devices get extra throttling to prevent overheating,
 * regardless of core count.
 */

export const cpuCores: number =
  typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

/** Detect mobile / tablet (thermal-constrained devices) */
export const isMobileDevice: boolean = typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
  ('ontouchstart' in window && navigator.maxTouchPoints > 1));

/** Detect if running as installed PWA */
export const isPWAMode: boolean = typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true);

export type PerformanceTier = 'high' | 'medium' | 'low';

// Mobile devices always get 'low' or 'medium' — never 'high'
// This prevents phones from overheating even with 8 cores
export const performanceTier: PerformanceTier =
  isMobileDevice
    ? (cpuCores >= 6 ? 'medium' : 'low')
    : (cpuCores >= 8 ? 'high' : cpuCores >= 4 ? 'medium' : 'low');

/** How many star particles to render in StarSphere (scales with CPU) */
export const starCount =
  performanceTier === 'high' ? 120 : performanceTier === 'medium' ? 70 : 35;

/** Target FPS — mobile caps at 30fps to save battery */
export const targetFPS: number =
  isMobileDevice ? 30 : (performanceTier === 'high' ? 60 : 45);

/** Frame interval in ms for throttled animation loops */
export const frameIntervalMs: number = 1000 / targetFPS;

/** Animation frame budget in ms (lower = smoother on fast machines) */
export const frameBudgetMs =
  performanceTier === 'high' ? 16 : performanceTier === 'medium' ? 24 : 33;

/** Whether to enable blur-heavy glass effects */
export const enableGlassBlur = performanceTier !== 'low';

/** Shimmer animation duration — faster on faster machines */
export const shimmerDuration =
  performanceTier === 'high' ? '2.5s' : performanceTier === 'medium' ? '3.5s' : '5s';

console.log(
  `[CPUAccelerator] ${cpuCores} cores, mobile=${isMobileDevice}, pwa=${isPWAMode} → tier: ${performanceTier}, fps: ${targetFPS}`,
);
