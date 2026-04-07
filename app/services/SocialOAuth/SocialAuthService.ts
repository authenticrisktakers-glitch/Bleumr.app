/**
 * SocialAuth — main entry point
 *
 * Public API:
 *   connect(provider)        — opens OAuth popup, awaits postMessage, exchanges code, stores tokens
 *   disconnect(provider)     — wipes tokens from IDB
 *   getConnection(provider)  — returns the (non-sensitive) connection meta
 *   listConnections()        — returns all connection metas
 *   getAccessToken(provider) — returns a fresh access token, refreshing if needed
 *
 * The flow:
 *   1. Generate PKCE code_verifier + code_challenge (SHA-256)
 *   2. Generate random `state` (CSRF protection)
 *   3. Build the provider's auth URL with our redirect_uri + challenge + state
 *   4. window.open() the auth URL in a popup
 *   5. The popup completes OAuth on the provider's domain, then lands on
 *      /oauth-callback.html, which postMessage's { code, state } back to us
 *   6. We POST { provider, code, code_verifier, redirect_uri } to /api/oauth/exchange
 *   7. The Vercel function adds the client_secret, calls the provider's token
 *      endpoint, and returns the token blob
 *   8. We optionally fetch user info, then encrypt + store
 *
 * Mobile/standalone PWA fallback: if window.open is blocked or returns null,
 * we fall back to a full-page redirect using sessionStorage to persist verifier.
 */

import { getProvider, getRedirectUri, type SocialProvider } from './Providers';
import {
  saveConnection,
  getTokens,
  getConnection,
  listConnections,
  removeConnection,
  type Connection,
  type ConnectionMeta,
} from './TokenStore';

// ─── PKCE helpers ────────────────────────────────────────────────────────────

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer).slice(0, length);
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(64);
  const challengeBuf = await sha256(verifier);
  const challenge = base64UrlEncode(challengeBuf);
  return { verifier, challenge };
}

// ─── Pending flow tracking ──────────────────────────────────────────────────
//
// Stored in sessionStorage so the redirect-fallback path can pick it up after
// a full page navigation.

const PENDING_KEY = 'bleumr_oauth_pending';

interface PendingFlow {
  provider: SocialProvider;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  startedAt: number;
}

function savePending(p: PendingFlow): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

function loadPending(): PendingFlow | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) as PendingFlow : null;
  } catch { return null; }
}

function clearPending(): void {
  sessionStorage.removeItem(PENDING_KEY);
}

// ─── Auth URL builder ───────────────────────────────────────────────────────

function buildAuthUrl(provider: SocialProvider, state: string, codeChallenge: string): string {
  const cfg = getProvider(provider);
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  if (!cfg.clientId) throw new Error(`Missing client id for ${provider} (set VITE_${provider.toUpperCase()}_CLIENT_ID)`);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    state,
  });

  if (cfg.pkce) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  return `${cfg.authUrl}?${params.toString()}`;
}

// ─── Token exchange (calls our Vercel function) ─────────────────────────────

interface ExchangeResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;  // seconds
  scope?: string;
  user_id?: string;
  user_handle?: string;
  avatar_url?: string;
}

async function exchangeCode(
  provider: SocialProvider,
  code: string,
  codeVerifier: string,
): Promise<ExchangeResponse> {
  const res = await fetch('/api/oauth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      code,
      code_verifier: codeVerifier,
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<ExchangeResponse>;
}

// ─── Public: connect ────────────────────────────────────────────────────────

/**
 * Begin the OAuth flow for a provider. Resolves with the new Connection on
 * success, rejects on failure or user cancel.
 *
 * MUST be called from a user gesture (click handler) or popup will be blocked.
 */
export async function connect(provider: SocialProvider): Promise<Connection> {
  const cfg = getProvider(provider);
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);

  const { verifier, challenge } = await generatePkce();
  const state = randomString(32);
  const redirectUri = getRedirectUri();

  const pending: PendingFlow = {
    provider,
    state,
    codeVerifier: verifier,
    redirectUri,
    startedAt: Date.now(),
  };
  savePending(pending);

  const authUrl = buildAuthUrl(provider, state, challenge);

  // Try popup first (best UX on desktop). Falls back to full-page redirect.
  const popup = window.open(authUrl, 'bleumr_oauth', 'width=600,height=720,resizable=yes,scrollbars=yes');
  if (!popup) {
    // Popup blocked — fall back to full-page redirect.
    // After redirect, /oauth-callback.html will postMessage to opener (none),
    // detect that, and redirect back to the app root with #code=...&state=...
    // The app root should call `handleRedirectCallback()` on mount to finish the flow.
    window.location.assign(authUrl);
    // We'll never resolve in this context — the page is unloading.
    return new Promise(() => {});
  }

  // Wait for the popup to postMessage the code back
  return new Promise<Connection>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(closeWatcher);
    };

    const onMessage = async (e: MessageEvent) => {
      // Same-origin only — the callback page lives on our domain
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; code?: string; state?: string; error?: string };
      if (data?.type !== 'bleumr_oauth_callback') return;
      if (data.state !== pending.state) return;

      settled = true;
      cleanup();
      try { popup.close(); } catch {}

      if (data.error) {
        clearPending();
        reject(new Error(data.error));
        return;
      }
      if (!data.code) {
        clearPending();
        reject(new Error('No code returned from provider'));
        return;
      }

      try {
        const tokens = await exchangeCode(provider, data.code, pending.codeVerifier);
        const meta: ConnectionMeta = {
          handle: tokens.user_handle || 'connected',
          userId: tokens.user_id || '',
          avatarUrl: tokens.avatar_url,
          connectedAt: Date.now(),
          expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : 0,
          scopes: (tokens.scope || cfg.scopes.join(' ')).split(/[\s,]+/).filter(Boolean),
        };
        await saveConnection(provider, {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        }, meta);
        clearPending();
        resolve({ provider, ...meta });
      } catch (err) {
        clearPending();
        reject(err);
      }
    };

    window.addEventListener('message', onMessage);

    // Watch for popup close without sending a message → user canceled
    const closeWatcher = setInterval(() => {
      if (!popup.closed) return;
      if (settled) return;
      cleanup();
      clearPending();
      reject(new Error('Authorization canceled'));
    }, 500);
  });
}

/**
 * Handle the redirect-fallback flow. Call this on app mount — if there's a
 * `#code=...&state=...` in the URL hash AND a pending flow in sessionStorage,
 * exchange and store, then clean the URL.
 */
export async function handleRedirectCallback(): Promise<Connection | null> {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash || !hash.includes('code=')) return null;

  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;

  const pending = loadPending();
  if (!pending || pending.state !== state) return null;

  const cfg = getProvider(pending.provider);
  if (!cfg) return null;

  try {
    const tokens = await exchangeCode(pending.provider, code, pending.codeVerifier);
    const meta: ConnectionMeta = {
      handle: tokens.user_handle || 'connected',
      userId: tokens.user_id || '',
      avatarUrl: tokens.avatar_url,
      connectedAt: Date.now(),
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : 0,
      scopes: (tokens.scope || cfg.scopes.join(' ')).split(/[\s,]+/).filter(Boolean),
    };
    await saveConnection(pending.provider, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    }, meta);
    clearPending();
    // Clean hash
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return { provider: pending.provider, ...meta };
  } catch {
    clearPending();
    return null;
  }
}

/** Disconnect a provider — wipes tokens. Does NOT revoke server-side. */
export async function disconnect(provider: SocialProvider): Promise<void> {
  await removeConnection(provider);
}

/**
 * Get a fresh access token for a provider, or null if not connected.
 * (Refresh-token rotation is a v2 enhancement — for now we just return whatever
 * we have and let the caller handle expiry.)
 */
export async function getAccessToken(provider: SocialProvider): Promise<string | null> {
  const tokens = await getTokens(provider);
  return tokens?.accessToken || null;
}

// Re-export storage helpers
export { getConnection, listConnections };
export type { Connection } from './TokenStore';
