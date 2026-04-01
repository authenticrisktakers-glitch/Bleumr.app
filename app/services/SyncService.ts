/**
 * SyncService — generate tokens to transfer data between devices via Supabase.
 * Users generate an "API key" (sync token) in Settings, then enter it on another
 * device to pull their chat history, preferences, and profile.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aybwlypsrmnfogtnibho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YndseXBzcm1uZm9ndG5pYmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTM5NDQsImV4cCI6MjA5MDQ4OTk0NH0.wwwPoWskIIrKzJJhzgsL8W38WJ3G_FLz5D5iooExUu8';

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEVICE_ID = localStorage.getItem('bleumr_device_id') || (() => {
  const id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem('bleumr_device_id', id);
  return id;
})();

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SYNC-${seg()}-${seg()}-${seg()}`;
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

/** Generate a new sync token and push current device data to Supabase */
export async function createSyncToken(label?: string): Promise<{ token: string; error?: string }> {
  const token = generateToken();
  const data = collectSyncData();

  const { error } = await client.from('sync_tokens').insert({
    token,
    device_id: DEVICE_ID,
    label: label || 'My Device',
    data,
    active: true,
  });

  if (error) return { token: '', error: error.message };

  // Store locally so user can see their active token
  localStorage.setItem('bleumr_sync_token', token);
  return { token };
}

/** Update the data for an existing sync token (push latest state) */
export async function pushSyncData(token: string): Promise<{ error?: string }> {
  const data = collectSyncData();
  const { error } = await client.from('sync_tokens').update({
    data,
    updated_at: new Date().toISOString(),
  }).eq('token', token).eq('active', true);

  if (error) return { error: error.message };
  return {};
}

/** Pull data from a sync token onto this device */
export async function pullSyncData(token: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await client.from('sync_tokens')
    .select('*')
    .eq('token', token.trim().toUpperCase())
    .eq('active', true)
    .single();

  if (error || !data) return { success: false, error: error?.message || 'Token not found or expired' };

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { success: false, error: 'Token has expired. Generate a new one from the source device.' };
  }

  applySyncData(data.data as SyncData);
  return { success: true };
}

/** Revoke a sync token */
export async function revokeSyncToken(token: string): Promise<void> {
  await client.from('sync_tokens').update({ active: false }).eq('token', token);
  if (localStorage.getItem('bleumr_sync_token') === token) {
    localStorage.removeItem('bleumr_sync_token');
  }
}

/** Get the current device's active sync token */
export function getActiveSyncToken(): string | null {
  return localStorage.getItem('bleumr_sync_token');
}
