/**
 * UserProfile — local identity stored in localStorage + Electron store.
 *
 * Two-layer persistence:
 *  1. localStorage  — fast synchronous reads (cleared if browser storage wiped)
 *  2. window.orbit.storage (Electron userData store) — survives app updates
 *     AND reinstalls on macOS because ~/Library/Application Support/<App>/
 *     is not removed during a standard uninstall / re-drag-install.
 *
 * On every save we write to both layers.
 * On startup, if localStorage is empty we restore from the Electron layer.
 */

export interface UserProfile {
  name: string;
  birthday: string;   // ISO date string, e.g. "1995-04-12"
  email: string;
  phone: string;
  address: string;
  createdAt: number;
}

const LS_KEY    = 'orbit_user_profile';
const STORE_KEY = 'orbit_user_profile';
const ONBOARDED = 'orbit_onboarded';

// ─── Synchronous helpers (localStorage) ──────────────────────────────────────

export function getProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  const json = JSON.stringify(profile);
  localStorage.setItem(LS_KEY, json);
  // Best-effort write to Electron store (non-blocking)
  _storeSet(STORE_KEY, json);
  _storeSet(ONBOARDED, '1');
}

export function clearProfile(): void {
  localStorage.removeItem(LS_KEY);
  // Do NOT clear the Electron store — we want "Add New Profile" to still
  // know the device has been through onboarding before (prevents re-trigger
  // on next launch). The new profile will overwrite when saved.
}

export function hasProfile(): boolean {
  return !!localStorage.getItem(LS_KEY);
}

// ─── Async restore (call once on app mount) ───────────────────────────────────

/**
 * Checks the Electron store for a saved profile.
 * If localStorage is empty but the store has a profile, restores it.
 * Returns the profile if found (restored or already in localStorage), else null.
 * Also returns whether the device has ever completed onboarding.
 */
export async function restoreProfileFromStore(): Promise<{
  profile: UserProfile | null;
  everOnboarded: boolean;
}> {
  // Fast path: localStorage already has it
  const local = getProfile();
  if (local) return { profile: local, everOnboarded: true };

  try {
    const orbitStore = (window as any).orbit?.storage;
    if (!orbitStore) return { profile: null, everOnboarded: false };

    const [storedProfile, storedOnboarded] = await Promise.all([
      orbitStore.get(STORE_KEY).catch(() => null),
      orbitStore.get(ONBOARDED).catch(() => null),
    ]);

    if (storedProfile) {
      const profile = JSON.parse(storedProfile) as UserProfile;
      // Restore to localStorage for future sync reads
      localStorage.setItem(LS_KEY, storedProfile);
      return { profile, everOnboarded: true };
    }

    return { profile: null, everOnboarded: !!storedOnboarded };
  } catch {
    return { profile: null, everOnboarded: false };
  }
}

// ─── Internal helper ──────────────────────────────────────────────────────────

function _storeSet(key: string, value: string): void {
  try {
    (window as any).orbit?.storage?.set(key, value);
  } catch { /* no-op outside Electron */ }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** "Jumar Washington" → "JW" */
export function getInitials(profile: UserProfile): string {
  const parts = profile.name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return profile.name.slice(0, 2).toUpperCase() || '??';
}

/** "Jumar Washington" → "Jumar" */
export function getFirstName(profile: UserProfile): string {
  return profile.name.trim().split(/\s+/)[0] || profile.name;
}
