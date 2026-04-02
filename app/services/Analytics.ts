/**
 * Analytics telemetry service — reports API usage and errors to Supabase
 * for the Bleumr admin dashboard.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDeviceFingerprint, getDeviceFingerprintSync } from './DeviceFingerprint';

const SUPABASE_URL = 'https://aybwlypsrmnfogtnibho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YndseXBzcm1uZm9ndG5pYmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTM5NDQsImV4cCI6MjA5MDQ4OTk0NH0.wwwPoWskIIrKzJJhzgsL8W38WJ3G_FLz5D5iooExUu8';

const IS_ELECTRON = typeof window !== 'undefined' && !!(window as any).orbit;

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

// Persistent session ID for this app instance — also stored in localStorage
// so other services (KnowledgeService) can access it
const SESSION_ID = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
localStorage.setItem('orbit_session_id', SESSION_ID);

// Device ID: use hardware fingerprint if available, fall back to random ID
// The fingerprint survives PWA uninstall/reinstall — same device = same ID
const LEGACY_DEVICE_ID = localStorage.getItem('bleumr_device_id') || (() => {
  const id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem('bleumr_device_id', id);
  return id;
})();

// Start with legacy ID, upgrade to fingerprint once computed
let DEVICE_ID = getDeviceFingerprintSync() || LEGACY_DEVICE_ID;

// Async: compute fingerprint in background and update device ID
getDeviceFingerprint().then(fp => {
  DEVICE_ID = fp;
  // Store fingerprint as the canonical device ID for all services
  localStorage.setItem('bleumr_device_id', fp);
  localStorage.setItem('bleumr_device_fp', fp);
  localStorage.setItem('orbit_device_id', fp);
}).catch(() => {});

// Also store legacy for KnowledgeService compatibility
localStorage.setItem('orbit_device_id', DEVICE_ID);

function getPlatform(): string {
  if (IS_ELECTRON) return 'electron';
  if ((navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches) return 'pwa';
  return 'browser';
}

function getTier(): string {
  try {
    const raw = localStorage.getItem('orbit_subscription_tier');
    if (raw) {
      const data = JSON.parse(raw);
      if (data.tier) return data.tier;
    }
  } catch {}
  return 'free';
}

// ── Queue + batch to avoid spamming ────────────────────
let requestQueue: any[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushQueue, 2000);
}

async function flushQueue() {
  flushTimer = null;
  if (requestQueue.length === 0) return;
  const batch = requestQueue.splice(0, 50);
  try {
    await getClient().from('api_requests').insert(batch);
  } catch (e) {
    // Silent fail — telemetry should never break the app
  }
}

// ── Public API ─────────────────────────────────────────

export interface ApiEvent {
  service: string;       // 'groq' | 'gemini' | 'pollinations' | 'huggingface' | 'duckduckgo' | 'deepgram'
  model?: string;
  action: string;        // 'chat' | 'vision' | 'image_gen' | 'search' | 'follow_ups' | 'tts' | 'model_list'
  endpoint?: string;
  status?: 'success' | 'error' | 'timeout';
  error_message?: string;
  status_code?: number;
  latency_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export function trackApiRequest(event: ApiEvent) {
  const row = {
    session_id: SESSION_ID,
    device_id: DEVICE_ID,
    tier: getTier(),
    service: event.service,
    endpoint: event.endpoint || null,
    model: event.model || null,
    action: event.action,
    status: event.status || 'success',
    error_message: event.error_message || null,
    status_code: event.status_code || null,
    latency_ms: event.latency_ms || null,
    input_tokens: event.input_tokens || null,
    output_tokens: event.output_tokens || null,
  };
  requestQueue.push(row);
  scheduleFlush();
}

// Convenience wrappers
export function trackError(service: string, action: string, error: string, statusCode?: number) {
  trackApiRequest({ service, action, status: 'error', error_message: error.slice(0, 500), status_code: statusCode });
}

export function trackSuccess(service: string, action: string, model?: string, latencyMs?: number) {
  trackApiRequest({ service, action, status: 'success', model, latency_ms: latencyMs });
}

// ── Session heartbeat ──────────────────────────────────
let sessionRegistered = false;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let localRequestCount = 0;
let localErrorCount = 0;

function getUserName(): string {
  try {
    const raw = localStorage.getItem('orbit_user_profile');
    if (raw) { const p = JSON.parse(raw); return p.name || ''; }
  } catch {}
  return '';
}

export function registerSession() {
  if (sessionRegistered) return;
  sessionRegistered = true;

  const sessionData = {
    session_id: SESSION_ID,
    device_id: DEVICE_ID,
    tier: getTier(),
    platform: getPlatform(),
    user_agent: navigator.userAgent.slice(0, 300),
    user_name: getUserName(),
    request_count: 0,
    error_count: 0,
  };

  getClient().from('active_sessions').upsert(sessionData, { onConflict: 'session_id' }).then(() => {});

  // Heartbeat every 30s
  heartbeatInterval = setInterval(async () => {
    try {
      await getClient().from('active_sessions').update({
        last_seen_at: new Date().toISOString(),
        request_count: localRequestCount,
        error_count: localErrorCount,
        tier: getTier(),
        user_name: getUserName(),
      }).eq('session_id', SESSION_ID);
    } catch (_) {}
  }, 30000);
}

export function incrementRequestCount() { localRequestCount++; }
export function incrementErrorCount() { localErrorCount++; }

// Global error handlers — catch anything that slips through
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    trackError('app', 'uncaught_error', `${event.message} at ${event.filename}:${event.lineno}`);
    incrementErrorCount();
  });

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || event.reason?.toString?.() || 'Unhandled promise rejection';
    trackError('app', 'unhandled_rejection', msg.slice(0, 500));
    incrementErrorCount();
  });

  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    if (requestQueue.length > 0) {
      const batch = requestQueue.splice(0);
      const payload = JSON.stringify(batch);
      navigator.sendBeacon?.(
        `${SUPABASE_URL}/rest/v1/api_requests`,
        new Blob([payload], { type: 'application/json' })
      );
    }
  });
}

// Auto-register session on app load — don't wait for first chat
// This ensures ALL users who open the app appear in admin sessions panel
if (typeof window !== 'undefined') {
  // Small delay to let the app initialize (tier, platform detection)
  setTimeout(() => registerSession(), 1500);
}

export { SESSION_ID, DEVICE_ID };
