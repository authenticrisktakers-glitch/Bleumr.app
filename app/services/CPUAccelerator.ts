/**
 * CPUAccelerator — uses navigator.hardwareConcurrency to adapt
 * animation quality to the user's hardware at runtime.
 *
 * tier: 'high' (8+ cores) | 'medium' (4–7 cores) | 'low' (1–3 cores)
 */

export const cpuCores: number =
  typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

export type PerformanceTier = 'high' | 'medium' | 'low';

export const performanceTier: PerformanceTier =
  cpuCores >= 8 ? 'high' : cpuCores >= 4 ? 'medium' : 'low';

/** How many star particles to render in StarSphere (scales with CPU) */
export const starCount =
  performanceTier === 'high' ? 120 : performanceTier === 'medium' ? 70 : 35;

/** Animation frame budget in ms (lower = smoother on fast machines) */
export const frameBudgetMs =
  performanceTier === 'high' ? 16 : performanceTier === 'medium' ? 24 : 33;

/** Whether to enable blur-heavy glass effects */
export const enableGlassBlur = performanceTier !== 'low';

/** Shimmer animation duration — faster on faster machines */
export const shimmerDuration =
  performanceTier === 'high' ? '2.5s' : performanceTier === 'medium' ? '3.5s' : '5s';

console.log(
  `[CPUAccelerator] ${cpuCores} cores detected → tier: ${performanceTier}`,
);
