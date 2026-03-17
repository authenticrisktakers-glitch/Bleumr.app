/**
 * UserProfile — fully local, localStorage-backed user identity
 * No backend, no Supabase. Everything lives on device.
 */

export interface UserProfile {
  name: string;
  birthday: string;   // ISO date string, e.g. "1995-04-12"
  email: string;
  phone: string;
  address: string;
  createdAt: number;
}

const KEY = 'orbit_user_profile';

export function getProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  localStorage.removeItem(KEY);
}

export function hasProfile(): boolean {
  return !!localStorage.getItem(KEY);
}

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
