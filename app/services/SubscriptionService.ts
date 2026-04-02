/**
 * SubscriptionService — manages free/pro/stellur tier state and daily usage limits.
 *
 * Architecture:
 *   • Limits fetched from server (tier_limits table) — admin-configurable
 *   • Server-side enforcement via check-rate-limit edge function
 *   • Local counters kept as optimistic cache, server is source of truth
 *   • License key → Supabase validates → returns tier + API keys
 *   • API keys stored in SecureStorage (never bundled in source)
 */

import { SecureStorage } from './SecureStorage';
import { getDeviceFingerprint } from './DeviceFingerprint';

export type SubscriptionTier = 'free' | 'pro' | 'stellur';

export interface ApiKeys {
  groq: string;
  deepgram: string;
  gemini: string;
}

// Fallback limits if server is unreachable — admin can override via tier_limits table
let FREE_DAILY_LIMIT = 20;
let PRO_DAILY_LIMIT = 200;
const TIER_STORAGE_KEY = 'orbit_subscription_tier';
const USAGE_STORAGE_KEY = 'orbit_daily_usage';
const PRO_USAGE_STORAGE_KEY = 'orbit_pro_daily_usage';
const LIMITS_CACHE_KEY = 'orbit_tier_limits';

interface TierCache {
  tier: SubscriptionTier;
  licenseKey: string;
  cachedAt: number; // ms epoch
}

interface UsageRecord {
  date: string; // YYYY-MM-DD
  count: number;
}

// ─── Supabase config ─────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://aybwlypsrmnfogtnibho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YndseXBzcm1uZm9ndG5pYmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTM5NDQsImV4cCI6MjA5MDQ4OTk0NH0.wwwPoWskIIrKzJJhzgsL8W38WJ3G_FLz5D5iooExUu8';
const VALIDATE_URL = `${SUPABASE_URL}/functions/v1/validate-license`;
const RATE_LIMIT_URL = `${SUPABASE_URL}/functions/v1/check-rate-limit`;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LIMITS_CACHE_TTL = 5 * 60 * 1000; // 5 min — limits don't change often

// Fetch admin-configured limits from server on startup
async function fetchTierLimits() {
  try {
    const cached = localStorage.getItem(LIMITS_CACHE_KEY);
    if (cached) {
      const { limits, ts } = JSON.parse(cached);
      if (Date.now() - ts < LIMITS_CACHE_TTL) {
        if (limits.free !== undefined) FREE_DAILY_LIMIT = limits.free;
        if (limits.pro !== undefined) PRO_DAILY_LIMIT = limits.pro;
        return;
      }
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tier_limits?select=tier,daily_limit`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (res.ok) {
      const rows: { tier: string; daily_limit: number }[] = await res.json();
      const limits: Record<string, number> = {};
      for (const r of rows) limits[r.tier] = r.daily_limit;
      if (limits.free !== undefined) FREE_DAILY_LIMIT = limits.free;
      if (limits.pro !== undefined) PRO_DAILY_LIMIT = limits.pro;
      localStorage.setItem(LIMITS_CACHE_KEY, JSON.stringify({ limits, ts: Date.now() }));
    }
  } catch {}
}

// Fire on load
if (typeof window !== 'undefined') {
  fetchTierLimits();
  // Poll server every 30s to pick up cooldowns triggered by other users
  setInterval(async () => {
    try {
      const tierRaw = localStorage.getItem(TIER_STORAGE_KEY);
      const tier = tierRaw ? (JSON.parse(tierRaw) as { tier: string }).tier || 'free' : 'free';
      const fp = localStorage.getItem('bleumr_device_fp') || '';
      const params = new URLSearchParams({ tier });
      if (fp) params.set('device_fp', fp);
      const res = await fetch(`${RATE_LIMIT_URL}?${params.toString()}`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (res.status === 429) {
        const data = await res.json();
        if (data.cooldown && data.cooldown_until) {
          localStorage.setItem(COOLDOWN_CACHE_KEY, JSON.stringify({
            tier, cooldown_until: data.cooldown_until, reason: data.reason || 'Cooldown active',
          }));
        }
      } else if (res.ok) {
        localStorage.removeItem(COOLDOWN_CACHE_KEY);
      }
    } catch {}
  }, 30000);
}

// Cooldown state — cached locally so we don't spam the server
const COOLDOWN_CACHE_KEY = 'orbit_cooldown_state';

interface CooldownState {
  tier: string;
  cooldown_until: string; // ISO
  reason: string;
}

function getCooldownState(): CooldownState | null {
  try {
    const raw = localStorage.getItem(COOLDOWN_CACHE_KEY);
    if (!raw) return null;
    const state: CooldownState = JSON.parse(raw);
    if (new Date(state.cooldown_until) <= new Date()) {
      localStorage.removeItem(COOLDOWN_CACHE_KEY);
      return null;
    }
    return state;
  } catch { return null; }
}

class SubscriptionService {
  // ── Central server-side rate limit check ───────────────────────────────────

  /** Check central rate limit against the server. Tier-wide limit — all users in a tier share the same pool. */
  async checkServerRateLimit(): Promise<{
    allowed: boolean; remaining: number; limit: number; used: number;
    cooldown?: boolean; cooldown_until?: string; cooldown_remaining_sec?: number; reason?: string;
  } | null> {
    // Always hit the server — admin resets must propagate immediately.
    // Local cache is only used as a fast fallback when the server is unreachable.
    try {
      const tier = this.getTier();
      const fp = localStorage.getItem('bleumr_device_fp') || '';
      const params = new URLSearchParams({ tier });
      if (fp) params.set('device_fp', fp);
      const res = await fetch(`${RATE_LIMIT_URL}?${params.toString()}`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (res.ok || res.status === 429) {
        const data = await res.json();
        // Cache cooldown state locally (only for offline fallback)
        if (data.cooldown && data.cooldown_until) {
          const state: CooldownState = { tier, cooldown_until: data.cooldown_until, reason: data.reason || 'Cooldown active' };
          try { localStorage.setItem(COOLDOWN_CACHE_KEY, JSON.stringify(state)); } catch {}
        } else {
          try { localStorage.removeItem(COOLDOWN_CACHE_KEY); } catch {}
        }
        // Cache server device usage count — source of truth for canSendMessage
        if (data.device_used !== undefined) {
          this._setServerDeviceUsage(data.device_used);
        }
        return data;
      }
    } catch {
      // Server unreachable — fall back to cached cooldown if available
      const cached = getCooldownState();
      if (cached && cached.tier === this.getTier()) {
        const remainingSec = Math.ceil((new Date(cached.cooldown_until).getTime() - Date.now()) / 1000);
        return {
          allowed: false, remaining: 0, limit: 0, used: 0,
          cooldown: true, cooldown_until: cached.cooldown_until,
          cooldown_remaining_sec: remainingSec, reason: cached.reason,
        };
      }
    }
    return null;
  }

  /** Check if in cooldown (local cache — instant, no network) */
  isInCooldown(): { active: boolean; reason?: string; remainingSec?: number } {
    const state = getCooldownState();
    if (!state || state.tier !== this.getTier()) return { active: false };
    const remainingSec = Math.ceil((new Date(state.cooldown_until).getTime() - Date.now()) / 1000);
    return { active: true, reason: state.reason, remainingSec };
  }

  /** Re-fetch admin-configured limits from server */
  async refreshLimits(): Promise<void> {
    try { localStorage.removeItem(LIMITS_CACHE_KEY); } catch {}
    await fetchTierLimits();
  }

  // ── Tier ────────────────────────────────────────────────────────────────────

  getTier(): SubscriptionTier {
    try {
      const raw = localStorage.getItem(TIER_STORAGE_KEY);
      if (!raw) return 'free';
      const data: TierCache = JSON.parse(raw);
      if (Date.now() - data.cachedAt > CACHE_TTL_MS) {
        // Cache expired — re-validate in background, return cached value for now
        if (data.licenseKey) {
          this.validateLicenseKey(data.licenseKey).then(result => {
            if (result) this._saveTierCache(result.tier, data.licenseKey);
            else this.clearTier();
          });
        }
        return data.tier; // optimistic while revalidating
      }
      return data.tier;
    } catch {
      return 'free';
    }
  }

  getLicenseKey(): string {
    try {
      const raw = localStorage.getItem(TIER_STORAGE_KEY);
      if (!raw) return '';
      const data: TierCache = JSON.parse(raw);
      return data.licenseKey || '';
    } catch {
      return '';
    }
  }

  clearTier() {
    try {
      localStorage.removeItem(TIER_STORAGE_KEY);
    } catch {}
  }

  private _saveTierCache(tier: SubscriptionTier, licenseKey: string) {
    try {
      const cache: TierCache = { tier, licenseKey, cachedAt: Date.now() };
      localStorage.setItem(TIER_STORAGE_KEY, JSON.stringify(cache));
    } catch {}
  }

  // ── License key validation ──────────────────────────────────────────────────

  async validateLicenseKey(key: string): Promise<{ tier: SubscriptionTier; apiKeys?: ApiKeys; expiresAt?: string; activationsUsed?: number; maxActivations?: number } | null> {
    const trimmed = key.trim().toUpperCase();
    if (!trimmed) return null;

    try {
      // Get device fingerprint to send with validation
      // This ensures same device doesn't consume multiple activation slots
      let deviceFp = '';
      try { deviceFp = await getDeviceFingerprint(); } catch {}

      const platform = typeof window !== 'undefined' && (window as any).orbit ? 'electron'
        : (navigator as any).standalone || window.matchMedia?.('(display-mode: standalone)').matches ? 'pwa'
        : 'browser';

      const params = new URLSearchParams({ key: trimmed });
      if (deviceFp) params.set('device_fp', deviceFp);
      params.set('platform', platform);

      const res = await fetch(`${VALIDATE_URL}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const tier = data?.tier as SubscriptionTier;
      if (tier === 'pro' || tier === 'stellur') {
        return {
          tier,
          apiKeys: data.apiKeys as ApiKeys,
          expiresAt: data.expires_at || data.expiresAt || undefined,
          activationsUsed: data.activations_used ?? data.activationsUsed ?? undefined,
          maxActivations: data.max_activations ?? data.maxActivations ?? undefined,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async activateLicenseKey(key: string): Promise<{ success: boolean; tier?: SubscriptionTier; error?: string; expiresAt?: string; activationsUsed?: number; maxActivations?: number }> {
    const trimmed = key.trim();
    if (!trimmed) return { success: false, error: 'Please enter a license key.' };

    const result = await this.validateLicenseKey(trimmed);
    if (!result) return { success: false, error: 'Invalid or expired license key. Check your email and try again.' };

    // Save tier
    this._saveTierCache(result.tier, trimmed);

    // Store API keys securely (encrypted in Electron, localStorage in dev)
    if (result.apiKeys) {
      if (result.apiKeys.groq) await SecureStorage.set('orbit_api_key', result.apiKeys.groq);
      if (result.apiKeys.deepgram) await SecureStorage.set('orbit_deepgram_key', result.apiKeys.deepgram);
      if (result.apiKeys.gemini) await SecureStorage.set('orbit_gemini_key', result.apiKeys.gemini);
    }

    return {
      success: true,
      tier: result.tier,
      expiresAt: result.expiresAt,
      activationsUsed: result.activationsUsed,
      maxActivations: result.maxActivations,
    };
  }

  /** Load API keys from SecureStorage (previously fetched from Supabase) */
  async getStoredApiKeys(): Promise<Partial<ApiKeys>> {
    const [groq, deepgram, gemini] = await Promise.all([
      SecureStorage.get('orbit_api_key'),
      SecureStorage.get('orbit_deepgram_key'),
      SecureStorage.get('orbit_gemini_key'),
    ]);
    return {
      groq: groq || '',
      deepgram: deepgram || '',
      gemini: gemini || '',
    };
  }

  // ── Daily usage ─────────────────────────────────────────────────────────────

  private _getTodayStr(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  getDailyUsage(): number {
    try {
      const raw = localStorage.getItem(USAGE_STORAGE_KEY);
      if (!raw) return 0;
      const data: UsageRecord = JSON.parse(raw);
      if (data.date !== this._getTodayStr()) return 0;
      return data.count;
    } catch {
      return 0;
    }
  }

  // Pro usage tracked separately — never exposed in UI
  private _getProDailyUsage(): number {
    try {
      const raw = localStorage.getItem(PRO_USAGE_STORAGE_KEY);
      if (!raw) return 0;
      const data: UsageRecord = JSON.parse(raw);
      if (data.date !== this._getTodayStr()) return 0;
      return data.count;
    } catch {
      return 0;
    }
  }

  private _incrementProUsage(): number {
    const today = this._getTodayStr();
    const next = this._getProDailyUsage() + 1;
    try {
      localStorage.setItem(PRO_USAGE_STORAGE_KEY, JSON.stringify({ date: today, count: next }));
    } catch {}
    return next;
  }

  incrementUsage(): number {
    const tier = this.getTier();
    if (tier === 'pro') return this._incrementProUsage();
    const today = this._getTodayStr();
    const current = this.getDailyUsage();
    const next = current + 1;
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify({ date: today, count: next }));
    } catch {}

    // Also consume on server (fire-and-forget) — server is source of truth
    const fp = localStorage.getItem('bleumr_device_fp') || '';
    if (fp) {
      const params = new URLSearchParams({ tier, device_fp: fp, action: 'consume' });
      fetch(`${RATE_LIMIT_URL}?${params.toString()}`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      }).catch(() => {});
    }

    return next;
  }

  // ── Gating ──────────────────────────────────────────────────────────────────

  canSendMessage(): { allowed: boolean; limitReached?: boolean; remaining: number; reason?: string; cooldown?: boolean } {
    // ── Check central cooldown first (instant, no network) ──
    const cd = this.isInCooldown();
    if (cd.active) {
      const mins = Math.ceil((cd.remainingSec || 0) / 60);
      return {
        allowed: false,
        limitReached: true,
        remaining: 0,
        cooldown: true,
        reason: `⚡ Absorbing solar energy — please try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
      };
    }

    // Check server-synced device usage (survives reinstall)
    const serverUsage = this._getServerDeviceUsage();
    if (serverUsage !== null) {
      // Server data available — use it as source of truth
      const tier = this.getTier();
      if (tier === 'stellur') return { allowed: true, remaining: Infinity };
      const limit = tier === 'pro' ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
      if (limit === 0) return { allowed: true, remaining: Infinity }; // unlimited
      const remaining = Math.max(0, limit - serverUsage);
      if (remaining === 0) {
        return {
          allowed: false, limitReached: true, remaining: 0,
          reason: tier === 'free'
            ? `You've used all ${FREE_DAILY_LIMIT} free messages today. Upgrade to keep going.`
            : `You've reached your daily limit. Upgrade to STELLUR for truly unlimited usage.`,
        };
      }
      return { allowed: true, remaining };
    }

    // Fallback to localStorage counts if server data isn't cached yet
    const tier = this.getTier();

    if (tier === 'stellur') {
      return { allowed: true, remaining: Infinity };
    }

    if (tier === 'pro') {
      const proUsage = this._getProDailyUsage();
      if (proUsage >= PRO_DAILY_LIMIT) {
        return {
          allowed: false,
          limitReached: true,
          remaining: 0,
          reason: `You've reached your daily limit. Upgrade to STELLUR for truly unlimited usage.`,
        };
      }
      return { allowed: true, remaining: Infinity };
    }

    // Free tier
    const usage = this.getDailyUsage();
    const remaining = Math.max(0, FREE_DAILY_LIMIT - usage);
    if (remaining === 0) {
      return {
        allowed: false,
        limitReached: true,
        remaining: 0,
        reason: `You've used all ${FREE_DAILY_LIMIT} free messages today. Upgrade to keep going.`,
      };
    }
    return { allowed: true, remaining };
  }

  // ── Server device usage cache ──
  private _getServerDeviceUsage(): number | null {
    try {
      const raw = localStorage.getItem('bleumr_server_device_usage');
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Only valid if from today and less than 60s old
      if (data.date !== this._getTodayStr()) return null;
      if (Date.now() - data.ts > 60000) return null;
      return data.used;
    } catch { return null; }
  }

  private _setServerDeviceUsage(used: number) {
    try {
      localStorage.setItem('bleumr_server_device_usage', JSON.stringify({
        date: this._getTodayStr(), used, ts: Date.now(),
      }));
    } catch {}
  }

  canUseBrowserAgent(): boolean {
    // Unlocked for all tiers until payment system is live
    return true;
  }

  getRemainingMessages(): number {
    const tier = this.getTier();
    if (tier !== 'free') return Infinity;
    return Math.max(0, FREE_DAILY_LIMIT - this.getDailyUsage());
  }

  getFreeDailyLimit(): number {
    return FREE_DAILY_LIMIT;
  }
}

export default new SubscriptionService();
