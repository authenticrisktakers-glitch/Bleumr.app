// ─── SocialAuth — Real OAuth for social platform connections ───────────────
// Uses Supabase Auth social providers (popup-based, works in PWA)
// Each platform gives us OAuth tokens we can use to call their APIs.

import { getSupabaseClient } from './SupabaseConfig';
import type { Provider } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface SocialConnection {
  id: string;
  platform: string;
  provider: Provider | 'custom';
  username: string;
  displayName: string;
  avatar?: string;
  accessToken?: string;
  refreshToken?: string;
  connected: boolean;
  connectedAt: number;
  expiresAt?: number;
}

// ─── Platform → Supabase Provider Mapping ─────────────────────────────────

export const PLATFORM_PROVIDERS: Record<string, {
  provider: Provider | 'custom';
  scopes: string;
  loginUrl?: string;
  name: string;
}> = {
  twitter: {
    provider: 'twitter',
    scopes: 'tweet.read tweet.write users.read follows.read follows.write like.read like.write offline.access',
    name: 'X / Twitter',
  },
  instagram: {
    // Instagram uses Facebook OAuth
    provider: 'facebook',
    scopes: 'instagram_basic,instagram_content_publish,instagram_manage_comments,pages_show_list',
    name: 'Instagram',
  },
  youtube: {
    provider: 'google',
    scopes: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl',
    name: 'YouTube',
  },
  linkedin: {
    provider: 'linkedin_oidc',
    scopes: 'openid profile email w_member_social',
    name: 'LinkedIn',
  },
  tiktok: {
    // TikTok not natively in Supabase — use custom popup flow
    provider: 'custom',
    scopes: '',
    loginUrl: 'https://www.tiktok.com/login',
    name: 'TikTok',
  },
  website: {
    provider: 'custom',
    scopes: '',
    name: 'Website',
  },
  email: {
    provider: 'custom',
    scopes: '',
    name: 'Email',
  },
};

// ─── Storage ──────────────────────────────────────────────────────────────

const CONNECTIONS_KEY = 'bleumr_social_connections';

export function loadConnections(): SocialConnection[] {
  try { return JSON.parse(localStorage.getItem(CONNECTIONS_KEY) || '[]'); }
  catch { return []; }
}

export function saveConnection(conn: SocialConnection): void {
  const all = loadConnections();
  const idx = all.findIndex(c => c.platform === conn.platform);
  if (idx >= 0) all[idx] = conn; else all.push(conn);
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(all));
}

export function removeConnection(platform: string): void {
  const filtered = loadConnections().filter(c => c.platform !== platform);
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(filtered));
}

export function getConnection(platform: string): SocialConnection | undefined {
  return loadConnections().find(c => c.platform === platform && c.connected);
}

export function isConnected(platform: string): boolean {
  return !!getConnection(platform);
}

// ─── OAuth Sign In (Supabase Auth popup) ──────────────────────────────────

export async function signInWithPlatform(platform: string): Promise<SocialConnection | null> {
  const config = PLATFORM_PROVIDERS[platform];
  if (!config) return null;

  // Platforms without Supabase OAuth support — open login page popup
  if (config.provider === 'custom') {
    return handleCustomSignIn(platform, config);
  }

  // Use Supabase Auth signInWithOAuth
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: config.provider as Provider,
      options: {
        scopes: config.scopes,
        redirectTo: window.location.origin + '/auth/callback',
        skipBrowserRedirect: true, // We want popup, not redirect
      },
    });

    if (error) throw error;
    if (!data.url) throw new Error('No OAuth URL returned');

    // Open popup
    const result = await openOAuthPopup(data.url, platform);

    if (result) {
      // Get the session after OAuth
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      const conn: SocialConnection = {
        id: `conn_${platform}_${Date.now()}`,
        platform,
        provider: config.provider as Provider,
        username: session?.user?.user_metadata?.preferred_username
               || session?.user?.user_metadata?.name
               || session?.user?.email
               || '@connected',
        displayName: session?.user?.user_metadata?.full_name
                   || session?.user?.user_metadata?.name
                   || config.name,
        avatar: session?.user?.user_metadata?.avatar_url,
        accessToken: session?.provider_token || undefined,
        refreshToken: session?.provider_refresh_token || undefined,
        connected: true,
        connectedAt: Date.now(),
        expiresAt: session?.expires_at ? session.expires_at * 1000 : undefined,
      };

      saveConnection(conn);
      return conn;
    }

    return null;
  } catch (err: any) {
    console.error(`[SocialAuth] ${platform} sign-in failed:`, err.message);

    // Fallback: open the platform's login page directly
    return handleCustomSignIn(platform, config);
  }
}

// ─── Custom sign-in (popup to platform login page) ────────────────────────

async function handleCustomSignIn(
  platform: string,
  config: typeof PLATFORM_PROVIDERS[string],
): Promise<SocialConnection | null> {
  const urls: Record<string, string> = {
    twitter:   'https://x.com/i/flow/login',
    instagram: 'https://www.instagram.com/accounts/login/',
    tiktok:    'https://www.tiktok.com/login',
    youtube:   'https://accounts.google.com/signin',
    linkedin:  'https://www.linkedin.com/login',
    website:   '',
    email:     '',
  };

  const loginUrl = config.loginUrl || urls[platform];
  if (!loginUrl) {
    // website/email don't need sign-in
    const conn: SocialConnection = {
      id: `conn_${platform}_${Date.now()}`,
      platform,
      provider: 'custom',
      username: 'configured',
      displayName: config.name,
      connected: true,
      connectedAt: Date.now(),
    };
    saveConnection(conn);
    return conn;
  }

  const closed = await openLoginPopup(loginUrl, platform);

  if (closed) {
    const conn: SocialConnection = {
      id: `conn_${platform}_${Date.now()}`,
      platform,
      provider: 'custom',
      username: '@connected',
      displayName: config.name,
      connected: true,
      connectedAt: Date.now(),
    };
    saveConnection(conn);
    return conn;
  }

  return null;
}

// ─── Popup Utilities ──────────────────────────────────────────────────────

function openOAuthPopup(url: string, platform: string): Promise<boolean> {
  const w = 500, h = 700;
  const left = Math.round((screen.width - w) / 2);
  const top = Math.round((screen.height - h) / 2);

  const popup = window.open(
    url,
    `${platform}_oauth`,
    `width=${w},height=${h},left=${left},top=${top},popup=yes,toolbar=no,menubar=no,location=yes,status=yes`,
  );

  if (!popup) {
    // Popup blocked — fallback to redirect
    window.location.href = url;
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    // Check for callback URL or popup close
    const check = setInterval(() => {
      try {
        // Check if popup navigated to our callback URL
        if (popup.location?.href?.includes('/auth/callback')) {
          clearInterval(check);
          popup.close();
          resolve(true);
          return;
        }
      } catch {
        // Cross-origin — can't read location, that's fine
      }

      if (popup.closed) {
        clearInterval(check);
        resolve(true);
      }
    }, 300);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(check);
      if (!popup.closed) popup.close();
      resolve(false);
    }, 300_000);
  });
}

function openLoginPopup(url: string, platform: string): Promise<boolean> {
  const w = 480, h = 640;
  const left = Math.round((screen.width - w) / 2);
  const top = Math.round((screen.height - h) / 2);

  const popup = window.open(
    url,
    `${platform}_login`,
    `width=${w},height=${h},left=${left},top=${top},popup=yes,toolbar=no,menubar=no,location=yes`,
  );

  if (!popup) return Promise.resolve(false);

  return new Promise(resolve => {
    const poll = setInterval(() => {
      if (popup.closed) { clearInterval(poll); resolve(true); }
    }, 400);
    setTimeout(() => { clearInterval(poll); resolve(popup.closed); }, 300_000);
  });
}

// ─── Disconnect ───────────────────────────────────────────────────────────

export async function disconnectPlatform(platform: string): Promise<void> {
  removeConnection(platform);

  // If this was an OAuth connection, try to sign out from Supabase auth too
  const config = PLATFORM_PROVIDERS[platform];
  if (config?.provider !== 'custom') {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Non-critical
    }
  }
}

// ─── Refresh token if expired ─────────────────────────────────────────────

export async function refreshConnectionIfNeeded(platform: string): Promise<SocialConnection | null> {
  const conn = getConnection(platform);
  if (!conn) return null;

  // If no expiry or not expired yet, return as-is
  if (!conn.expiresAt || conn.expiresAt > Date.now()) return conn;

  // Try to refresh via Supabase
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;

    const session = data.session;
    if (session) {
      conn.accessToken = session.provider_token || conn.accessToken;
      conn.refreshToken = session.provider_refresh_token || conn.refreshToken;
      conn.expiresAt = session.expires_at ? session.expires_at * 1000 : undefined;
      saveConnection(conn);
    }
    return conn;
  } catch {
    return conn;
  }
}

// ─── Check if provider is configured in Supabase ─────────────────────────

export async function checkProviderAvailability(platform: string): Promise<'oauth' | 'popup' | 'none'> {
  const config = PLATFORM_PROVIDERS[platform];
  if (!config) return 'none';
  if (config.provider === 'custom') return 'popup';

  // Try to get OAuth URL — if Supabase has the provider configured, it'll work
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: config.provider as Provider,
      options: {
        scopes: config.scopes,
        redirectTo: window.location.origin + '/auth/callback',
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) return 'popup';
    return 'oauth';
  } catch {
    return 'popup';
  }
}
