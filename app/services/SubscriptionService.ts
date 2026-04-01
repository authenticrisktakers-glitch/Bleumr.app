/**
 * SubscriptionService — manages free/pro/stellur tier state and daily usage limits.
 *
 * Architecture:
 *   • Free usage tracked in localStorage (daily counter, resets at midnight)
 *   • Paid tier validated against Supabase Edge Function (24h TTL cache)
 *   • License key → Supabase validates → returns tier + API keys
 *   • API keys stored in SecureStorage (never bundled in source)
 */

import { SecureStorage } from './SecureStorage';

export type SubscriptionTier = 'free' | 'pro' | 'stellur';

export interface ApiKeys {
  groq: string;
  deepgram: string;
  gemini: string;
}

const FREE_DAILY_LIMIT = 20;
const PRO_DAILY_LIMIT = 200;   // hidden — never shown in UI, silently enforced
const TIER_STORAGE_KEY = 'orbit_subscription_tier';
const USAGE_STORAGE_KEY = 'orbit_daily_usage';
const PRO_USAGE_STORAGE_KEY = 'orbit_pro_daily_usage';

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

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class SubscriptionService {
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

  async validateLicenseKey(key: string): Promise<{ tier: SubscriptionTier; apiKeys?: ApiKeys } | null> {
    const trimmed = key.trim().toUpperCase();
    if (!trimmed) return null;

    try {
      const res = await fetch(`${VALIDATE_URL}?key=${encodeURIComponent(trimmed)}`, {
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
        return { tier, apiKeys: data.apiKeys as ApiKeys };
      }
      return null;
    } catch {
      return null;
    }
  }

  async activateLicenseKey(key: string): Promise<{ success: boolean; tier?: SubscriptionTier; error?: string }> {
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

    return { success: true, tier: result.tier };
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
    return next;
  }

  // ── Gating ──────────────────────────────────────────────────────────────────

  canSendMessage(): { allowed: boolean; limitReached?: boolean; remaining: number; reason?: string } {
    const tier = this.getTier();

    if (tier === 'stellur') {
      return { allowed: true, remaining: Infinity };
    }

    if (tier === 'pro') {
      // Silently enforce limit — no counter shown to user
      const proUsage = this._getProDailyUsage();
      if (proUsage >= PRO_DAILY_LIMIT) {
        return {
          allowed: false,
          limitReached: true,
          remaining: 0,
          reason: `You've reached your daily limit. Upgrade to STELLUR for truly unlimited usage.`,
        };
      }
      return { allowed: true, remaining: Infinity }; // remaining shown as infinite to Pro users
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
