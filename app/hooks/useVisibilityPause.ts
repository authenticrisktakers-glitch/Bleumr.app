// ─── useVisibilityPause ──────────────────────────────────────────────────
// Tiny helper used by every long-running animation/render loop in Bleumr to
// stop burning CPU/GPU when the browser tab (or PWA window) is hidden.
//
// Why this exists:
//   When users switch tabs / minimise the window, browsers DO throttle
//   `requestAnimationFrame` to ~1Hz, but they don't actually pause the loop.
//   On low-end laptops and mobile devices, even that 1Hz wakeup keeps the
//   GPU spinning and the fan whirring. This helper makes every render loop
//   in the codebase explicitly stop drawing while `document.hidden === true`
//   and resume when the user comes back.
//
// Usage inside a useEffect:
//
//   useEffect(() => {
//     let raf = 0;
//     let paused = false;
//     let disposed = false;
//
//     const render = () => {
//       if (paused || disposed) return;
//       raf = requestAnimationFrame(render);
//       // ... draw frame ...
//     };
//
//     const stopVisibility = onPageVisibilityChange({
//       onHide: () => { paused = true; cancelAnimationFrame(raf); },
//       onShow: () => { if (!disposed && paused) { paused = false; render(); } },
//     });
//
//     // Honour initial hidden state on mount (e.g. tab opened in background)
//     if (typeof document !== 'undefined' && document.hidden) paused = true;
//     else render();
//
//     return () => {
//       disposed = true;
//       paused = true;
//       cancelAnimationFrame(raf);
//       stopVisibility();
//     };
//   }, []);

import { useEffect } from 'react';

export interface VisibilityHandlers {
  onHide?: () => void;
  onShow?: () => void;
}

/**
 * Subscribe to page visibility changes. Returns an unsubscribe function.
 * Safe to call in non-browser environments — it becomes a no-op.
 */
export function onPageVisibilityChange(handlers: VisibilityHandlers): () => void {
  if (typeof document === 'undefined') return () => {};

  const listener = () => {
    try {
      if (document.hidden) handlers.onHide?.();
      else handlers.onShow?.();
    } catch {
      /* swallow handler errors so one bad listener can't break others */
    }
  };

  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

/** Read the current document visibility synchronously. */
export function isPageHidden(): boolean {
  if (typeof document === 'undefined') return false;
  return document.hidden === true;
}

/**
 * Convenience hook for components that just need to know "is the tab hidden
 * right now" via a callback. Most callers prefer the imperative
 * `onPageVisibilityChange` helper above because they need to mutate refs
 * inside an existing useEffect, but this hook is here for completeness.
 */
export function useVisibilityPause(handlers: VisibilityHandlers) {
  useEffect(() => onPageVisibilityChange(handlers), [handlers.onHide, handlers.onShow]);
}
