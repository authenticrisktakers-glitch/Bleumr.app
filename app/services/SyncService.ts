/**
 * SyncService — generate tokens to transfer data between devices via Supabase.
 * Users generate an "API key" (sync token) in Settings, then enter it on another
 * device to pull their chat history, preferences, and profile.
 */

import { getSupabaseClient } from './SupabaseConfig';

const client = getSupabaseClient();

const DEVICE_ID = localStorage.getItem('bleumr_device_id') || (() => {
  const id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem('bleumr_device_id', id);
  return id;
})();

/** Generate a 6-digit numeric transfer code */
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export interface SyncData {
  version: 2;
  chatHistory: any[];
  preferences: Record<string, any>;
  userProfile: Record<string, any>;
  memories: any[];
  workspaceFiles: any[];
  designerProjects: any[];
  tradingData: Record<string, any>;
  bookmarks: any[];
  apiKeys: Record<string, any>;
  timestamp: string;
}

/** Safely parse JSON from localStorage, return null on failure */
function safeGet(key: string): any {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : null; } catch { return localStorage.getItem(key); }
}

/** Collect ALL transferable data from localStorage / app state */
function collectSyncData(): SyncData {
  // ── Chat History (threads + per-thread messages) ──
  const chatHistory: any[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('orbit_chat') || key.startsWith('orbit_thread_'))) {
      try { chatHistory.push({ key, value: JSON.parse(localStorage.getItem(key)!) }); } catch {}
    }
  }

  // ── Preferences (every setting the app stores) ──
  const prefKeys = [
    'orbit_tier', 'orbit_theme', 'orbit_sidebar_collapsed', 'orbit_voice_enabled',
    'orbit_model_preference', 'orbit_use_gemini', 'orbit_subscription_tier',
    'orbit_daily_usage', 'orbit_pro_daily_usage', 'orbit_learningMode',
    'orbit_strictMode', 'orbit_retryThreshold', 'orbit_approve_all',
    'orbit_onboarded', 'bleumr_config', 'bleumr_server_device_usage',
  ];
  const preferences: Record<string, any> = {};
  prefKeys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) preferences[k] = v; });

  // ── User Profile ──
  const userProfile: Record<string, any> = {};
  const profileKeys = [
    'orbit_user_profile', 'orbit_user_name', 'orbit_user_birthday',
    'orbit_user_email', 'orbit_user_phone', 'orbit_user_address',
  ];
  profileKeys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) userProfile[k] = v; });

  // ── Memories & Knowledge ──
  const memories: any[] = [];
  const memKeys = [
    'bleumr_memories_v2', 'bleumr_brain_memory', 'bleumr_cdn_libraries',
    'bleumr_god_agent_session', 'orbit_schedule_events', 'jumari_kr_cooldowns',
  ];
  memKeys.forEach(k => {
    const v = safeGet(k);
    if (v !== null) memories.push({ key: k, value: v });
  });

  // ── Mission Team workspace files ──
  const workspaceFiles: any[] = [];
  const wsRaw = safeGet('orbit_workspace_files');
  if (wsRaw) workspaceFiles.push({ key: 'orbit_workspace_files', value: wsRaw });

  // ── Web Designer projects ──
  const designerProjects: any[] = [];
  const dpRaw = safeGet('bleumr_web_designer_projects');
  if (dpRaw) designerProjects.push({ key: 'bleumr_web_designer_projects', value: dpRaw });

  // ── Trading data (portfolio, alerts, exchange configs) ──
  const tradingData: Record<string, any> = {};
  const tradingKeys = ['bleumr_trading_portfolio', 'bleumr_trading_alerts', 'bleumr_price_cache'];
  tradingKeys.forEach(k => { const v = safeGet(k); if (v !== null) tradingData[k] = v; });
  // Collect all exchange credentials (bleumr_exchange_*)
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('bleumr_exchange_')) {
      const v = safeGet(key);
      if (v !== null) tradingData[key] = v;
    }
  }

  // ── Bookmarks ──
  const bookmarks: any[] = [];
  const bmRaw = safeGet('orbit_bookmarks');
  if (bmRaw) bookmarks.push({ key: 'orbit_bookmarks', value: bmRaw });

  // ── API Keys (secure storage — grab from localStorage fallback for PWA) ──
  const apiKeys: Record<string, any> = {};
  const secureKeys = ['secure_orbit_api_key', 'secure_orbit_deepgram_key', 'secure_orbit_api_key_raw'];
  secureKeys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) apiKeys[k] = v; });

  return {
    version: 2,
    chatHistory, preferences, userProfile, memories,
    workspaceFiles, designerProjects, tradingData, bookmarks, apiKeys,
    timestamp: new Date().toISOString(),
  };
}

/** Safely write a value to localStorage (handles both strings and objects) */
function safeSet(key: string, value: any) {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

/** Apply sync data to this device — restores EVERYTHING */
function applySyncData(data: SyncData) {
  // ── Chat History ──
  data.chatHistory?.forEach(item => {
    if (item.key && item.value) safeSet(item.key, item.value);
  });

  // ── Preferences ──
  if (data.preferences) {
    Object.entries(data.preferences).forEach(([k, v]) => localStorage.setItem(k, String(v)));
  }

  // ── User Profile ──
  if (data.userProfile) {
    Object.entries(data.userProfile).forEach(([k, v]) => localStorage.setItem(k, String(v)));
  }

  // ── Memories & Knowledge ──
  data.memories?.forEach(item => {
    if (item.key && item.value) safeSet(item.key, item.value);
  });

  // ── Mission Team workspace files ──
  data.workspaceFiles?.forEach(item => {
    if (item.key && item.value) safeSet(item.key, item.value);
  });

  // ── Web Designer projects ──
  data.designerProjects?.forEach(item => {
    if (item.key && item.value) safeSet(item.key, item.value);
  });

  // ── Trading data (portfolio, alerts, exchange configs) ──
  if (data.tradingData) {
    Object.entries(data.tradingData).forEach(([k, v]) => safeSet(k, v));
  }

  // ── Bookmarks ──
  data.bookmarks?.forEach(item => {
    if (item.key && item.value) safeSet(item.key, item.value);
  });

  // ── API Keys (restore to localStorage — SecureStorage will pick them up) ──
  if (data.apiKeys) {
    Object.entries(data.apiKeys).forEach(([k, v]) => localStorage.setItem(k, String(v)));
  }
}

// ── Public API ─────────────────────────────────────────

/** Generate a temporary 6-digit transfer code (valid 2 minutes) and push data to Supabase */
export async function createSyncToken(label?: string): Promise<{ token: string; expiresAt: string; error?: string }> {
  const code = generateCode();
  const data = collectSyncData();
  const expiresAt = new Date(Date.now() + 120_000).toISOString(); // 2 minutes

  // Deactivate any previous codes from this device first
  await client.from('sync_tokens').update({ active: false }).eq('device_id', DEVICE_ID);

  const { error } = await client.from('sync_tokens').insert({
    token: code,
    device_id: DEVICE_ID,
    label: label || 'My Device',
    data,
    active: true,
    expires_at: expiresAt,
  });

  if (error) return { token: '', expiresAt: '', error: error.message };

  localStorage.setItem('bleumr_sync_token', code);
  localStorage.setItem('bleumr_sync_expires', expiresAt);
  return { token: code, expiresAt };
}

/** Pull data using a 6-digit transfer code */
export async function pullSyncData(code: string): Promise<{ success: boolean; error?: string }> {
  const trimmed = code.trim().replace(/\D/g, ''); // strip non-digits
  if (trimmed.length !== 6) return { success: false, error: 'Enter a valid 6-digit code' };

  const { data, error } = await client.from('sync_tokens')
    .select('*')
    .eq('token', trimmed)
    .eq('active', true)
    .single();

  if (error || !data) return { success: false, error: 'Code not found or already used' };

  // Check 2-minute expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Auto-deactivate expired code
    await client.from('sync_tokens').update({ active: false }).eq('token', trimmed);
    return { success: false, error: 'Code expired. Generate a new one from the source device.' };
  }

  applySyncData(data.data as SyncData);

  // Deactivate after successful pull (one-time use)
  await client.from('sync_tokens').update({ active: false }).eq('token', trimmed);

  return { success: true };
}

/** Revoke a transfer code */
export async function revokeSyncToken(code: string): Promise<void> {
  await client.from('sync_tokens').update({ active: false }).eq('token', code);
  localStorage.removeItem('bleumr_sync_token');
  localStorage.removeItem('bleumr_sync_expires');
}

/** Get the current device's active code + expiry (null if expired or absent) */
export function getActiveSyncToken(): { code: string; expiresAt: string } | null {
  const code = localStorage.getItem('bleumr_sync_token');
  const expiresAt = localStorage.getItem('bleumr_sync_expires');
  if (!code || !expiresAt) return null;
  if (new Date(expiresAt) < new Date()) {
    // Expired locally — clean up
    localStorage.removeItem('bleumr_sync_token');
    localStorage.removeItem('bleumr_sync_expires');
    return null;
  }
  return { code, expiresAt };
}
