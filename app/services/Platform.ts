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
const PWA_KEYS_VERSION = 'v3';
const PWA_KEYS_CACHE = `bleumr_pwa_keys_${PWA_KEYS_VERSION}`;
const SUPABASE_URL = 'https://aybwlypsrmnfogtnibho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YndseXBzcm1uZm9ndG5pYmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTM5NDQsImV4cCI6MjA5MDQ4OTk0NH0.wwwPoWskIIrKzJJhzgsL8W38WJ3G_FLz5D5iooExUu8';

export interface PWAKeys {
  groq: string;
  deepgram: string;
}

// Cache expires after 24 hours — ensures rotated keys propagate within a day
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface CachedPWAKeys {
  keys: PWAKeys;
  cachedAt: number;
}

async function fetchPWAKeysFromServer(): Promise<PWAKeys | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-license?key=PWA-TRIAL`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[Platform] PWA keys fetch failed: HTTP ${res.status}`, errBody.slice(0, 300));
      return null;
    }
    const data = await res.json();
    if (data.apiKeys) {
      const keys: PWAKeys = {
        groq: data.apiKeys.groq || '',
        deepgram: data.apiKeys.deepgram || '',
      };
      // Cache with timestamp
      try {
        const cached: CachedPWAKeys = { keys, cachedAt: Date.now() };
        localStorage.setItem(PWA_KEYS_CACHE, JSON.stringify(cached));
      } catch (e) {
        console.warn('[Platform] Failed to cache keys:', e);
      }
      return keys;
    }
    return null;
  } catch (e: any) {
    console.warn('[Platform] Failed to fetch PWA keys:', e?.message || e);
    return null;
  }
}

export async function getPWAKeys(): Promise<PWAKeys> {
  // Clean up old versioned caches
  try { localStorage.removeItem('bleumr_pwa_keys'); } catch (e) {
    console.warn('[Platform] Failed to clean old cache key:', e);
  }
  try { localStorage.removeItem('bleumr_pwa_keys_v2'); } catch (e) {
    console.warn('[Platform] Failed to clean old cache key v2:', e);
  }

  // Check cache first — with expiry
  try {
    const raw = localStorage.getItem(PWA_KEYS_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Handle both old format (PWAKeys directly) and new format (CachedPWAKeys)
      if (parsed.cachedAt && parsed.keys) {
        // New format — check expiry
        const cached = parsed as CachedPWAKeys;
        if (cached.keys.groq && (Date.now() - cached.cachedAt) < CACHE_MAX_AGE_MS) {
          return cached.keys;
        }
        // Expired — fall through to fetch
      } else if (parsed.groq) {
        // Old format (no timestamp) — treat as expired, fetch fresh
        console.log('[Platform] Old cache format detected, refreshing keys');
      }
    }
  } catch (e) {
    console.warn('[Platform] Failed to read cached keys:', e);
  }

  // Fetch fresh from server
  const keys = await fetchPWAKeysFromServer();
  if (keys) return keys;

  // Offline fallback — use expired cache if server is unreachable
  try {
    const raw = localStorage.getItem(PWA_KEYS_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw);
      const fallbackKeys = parsed.keys || parsed;
      if (fallbackKeys.groq) {
        console.log('[Platform] Using expired cached keys as offline fallback');
        return fallbackKeys as PWAKeys;
      }
    }
  } catch {}

  return { groq: '', deepgram: '' };
}

/** Force-refresh PWA keys (clears cache, re-fetches from server) */
export async function refreshPWAKeys(): Promise<PWAKeys> {
  try { localStorage.removeItem(PWA_KEYS_CACHE); } catch {}
  const keys = await fetchPWAKeysFromServer();
  return keys || { groq: '', deepgram: '' };
}
