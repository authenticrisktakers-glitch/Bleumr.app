/**
 * Platform detection — determines if running as Electron desktop app or PWA/web.
 * Used to gate features: Browser Agent, Apps, file system access are Electron-only.
 * Chat Agent, Web Designer, Scheduler work on both.
 */

export const IS_ELECTRON = typeof window !== 'undefined' && !!(window as any).orbit;
export const IS_PWA = !IS_ELECTRON;

/**
 * Auto-provision API keys for PWA users.
 * Fetches keys from Supabase edge function using built-in PWA trial license.
 * Keys are cached in localStorage so this only runs once.
 */
// Version-stamped cache key — bump to invalidate old cached keys on deploy
const PWA_KEYS_VERSION = 'v2';
const PWA_KEYS_CACHE = `bleumr_pwa_keys_${PWA_KEYS_VERSION}`;
const SUPABASE_URL = 'https://aybwlypsrmnfogtnibho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YndseXBzcm1uZm9ndG5pYmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTM5NDQsImV4cCI6MjA5MDQ4OTk0NH0.wwwPoWskIIrKzJJhzgsL8W38WJ3G_FLz5D5iooExUu8';

export interface PWAKeys {
  groq: string;
  deepgram: string;
}

export async function getPWAKeys(): Promise<PWAKeys> {
  // Clean up old versioned caches
  try { localStorage.removeItem('bleumr_pwa_keys'); } catch {}

  // Check cache first
  try {
    const cached = localStorage.getItem(PWA_KEYS_CACHE);
    if (cached) {
      const keys = JSON.parse(cached) as PWAKeys;
      if (keys.groq) return keys;
    }
  } catch {}

  // Fetch from Supabase — use a direct API call to get keys for PWA users
  // This calls the validate-license function with a special PWA flag
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-license?key=PWA-TRIAL`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.apiKeys) {
        const keys: PWAKeys = {
          groq: data.apiKeys.groq || '',
          deepgram: data.apiKeys.deepgram || '',
        };
        localStorage.setItem(PWA_KEYS_CACHE, JSON.stringify(keys));
        return keys;
      }
    }
  } catch (e) {
    console.warn('[PWA] Failed to fetch keys:', e);
  }

  return { groq: '', deepgram: '' };
}
