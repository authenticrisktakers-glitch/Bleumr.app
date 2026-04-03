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
  chatHistory: any[];
  preferences: Record<string, any>;
  userProfile: Record<string, any>;
  memories: any[];
  timestamp: string;
}

/** Collect all transferable data from localStorage / app state */
function collectSyncData(): SyncData {
  const chatHistory: any[] = [];
  // Collect all chat threads + messages (orbit_chat_threads, orbit_thread_*)
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('orbit_chat') || key.startsWith('orbit_thread_'))) {
      try { chatHistory.push({ key, value: JSON.parse(localStorage.getItem(key)!) }); } catch {}
    }
  }

  // Collect preferences — everything the app stores
  const prefKeys = [
    'orbit_tier', 'orbit_theme', 'orbit_sidebar_collapsed', 'orbit_voice_enabled',
    'orbit_model_preference', 'orbit_use_gemini', 'orbit_subscription_tier',
    'orbit_daily_usage', 'orbit_learningMode', 'orbit_strictMode', 'orbit_retryThreshold',
    'bleumr_config',
  ];
  const preferences: Record<string, any> = {};
  prefKeys.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) preferences[k] = v;
  });

  // Collect user profile (stored as single JSON object)
  const userProfile: Record<string, any> = {};
  const profileRaw = localStorage.getItem('orbit_user_profile');
  if (profileRaw) userProfile['orbit_user_profile'] = profileRaw;
  // Also grab individual profile keys if they exist
  const profileKeys = ['orbit_user_name', 'orbit_user_birthday', 'orbit_user_email', 'orbit_user_phone', 'orbit_user_address'];
  profileKeys.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) userProfile[k] = v;
  });

  // Collect memories (MemoryService + BrainMemory)
  const memories: any[] = [];
  const memKeys = ['bleumr_memories_v2', 'bleumr_brain_memory', 'bleumr_cdn_libraries', 'bleumr_god_agent_session'];
  memKeys.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) {
      try { memories.push({ key: k, value: JSON.parse(v) }); } catch { memories.push({ key: k, value: v }); }
    }
  });

  // Collect schedule events
  const scheduleRaw = localStorage.getItem('orbit_schedule_events');
  if (scheduleRaw) {
    try { memories.push({ key: 'orbit_schedule_events', value: JSON.parse(scheduleRaw) }); } catch {}
  }

  return { chatHistory, preferences, userProfile, memories, timestamp: new Date().toISOString() };
}

/** Apply sync data to this device */
function applySyncData(data: SyncData) {
  // Restore chat history
  data.chatHistory?.forEach(item => {
    if (item.key && item.value) {
      localStorage.setItem(item.key, JSON.stringify(item.value));
    }
  });

  // Restore preferences
  if (data.preferences) {
    Object.entries(data.preferences).forEach(([k, v]) => {
      localStorage.setItem(k, String(v));
    });
  }

  // Restore user profile
  if (data.userProfile) {
    Object.entries(data.userProfile).forEach(([k, v]) => {
      localStorage.setItem(k, String(v));
    });
  }

  // Restore memories
  data.memories?.forEach(item => {
    if (item.key && item.value) {
      localStorage.setItem(item.key, JSON.stringify(item.value));
    }
  });
}

// ── Public API ─────────────────────────────────────────

/** Generate a temporary 6-digit transfer code (valid 60 seconds) and push data to Supabase */
export async function createSyncToken(label?: string): Promise<{ token: string; expiresAt: string; error?: string }> {
  const code = generateCode();
  const data = collectSyncData();
  const expiresAt = new Date(Date.now() + 60_000).toISOString(); // 60 seconds

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

  // Check 60-second expiry
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
