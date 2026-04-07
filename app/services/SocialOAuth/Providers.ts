/**
 * SocialAuth — Provider configs
 *
 * Each provider entry tells the client how to start the OAuth flow and the
 * server how to finish it. CLIENT IDs are public; CLIENT SECRETS live ONLY
 * in Vercel env vars (`*_CLIENT_SECRET`) and are read by `api/oauth/exchange.ts`.
 *
 * To add a provider:
 *  1. Register the app on the provider's developer portal
 *  2. Set the redirect URI to: https://app.bleumr.com/oauth-callback.html
 *  3. Add CLIENT_ID below (or read from env)
 *  4. Add CLIENT_SECRET to Vercel env vars (named `<PROVIDER>_CLIENT_SECRET`)
 *  5. Add the provider key to the social card type in AutomationBuilderPage
 */

export type SocialProvider = 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok';

export interface ProviderConfig {
  /** Internal id used as a map key */
  id: SocialProvider;
  /** Display name shown in UI */
  name: string;
  /** Brand emoji */
  icon: string;
  /** Public OAuth client id (safe to ship in the bundle) */
  clientId: string;
  /** OAuth 2.0 authorize endpoint */
  authUrl: string;
  /** OAuth 2.0 token endpoint (called server-side from /api/oauth/exchange) */
  tokenUrl: string;
  /** Scopes requested for the access token. Pick the minimum needed. */
  scopes: string[];
  /** Whether the provider supports PKCE (Twitter does, most others do too) */
  pkce: boolean;
  /** Optional user-info endpoint to fetch the connected user's handle/id */
  userInfoUrl?: string;
}

// Read public client ids from env (Vite exposes VITE_* to the client)
const env = (import.meta as any).env || {};

export const PROVIDERS: Record<SocialProvider, ProviderConfig> = {
  twitter: {
    id: 'twitter',
    name: 'X / Twitter',
    icon: '𝕏',
    clientId: env.VITE_TWITTER_CLIENT_ID || '',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    pkce: true,
    userInfoUrl: 'https://api.twitter.com/2/users/me',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    icon: '📸',
    clientId: env.VITE_INSTAGRAM_CLIENT_ID || '',
    authUrl: 'https://api.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    scopes: ['user_profile', 'user_media'],
    pkce: false, // Instagram Basic Display does not support PKCE
    userInfoUrl: 'https://graph.instagram.com/me?fields=id,username',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    icon: '📘',
    clientId: env.VITE_FACEBOOK_CLIENT_ID || '',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
    pkce: false,
    userInfoUrl: 'https://graph.facebook.com/me?fields=id,name',
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '💼',
    clientId: env.VITE_LINKEDIN_CLIENT_ID || '',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['w_member_social', 'r_liteprofile'],
    pkce: false,
    userInfoUrl: 'https://api.linkedin.com/v2/me',
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    icon: '🎵',
    clientId: env.VITE_TIKTOK_CLIENT_ID || '',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.upload'],
    pkce: true,
    userInfoUrl: 'https://open.tiktokapis.com/v2/user/info/',
  },
};

/**
 * The single redirect URI registered with every provider's developer console.
 * Must match exactly (https, no trailing slash variations).
 */
export function getRedirectUri(): string {
  // In dev, fall back to the current origin so localhost works
  if (typeof window === 'undefined') return 'https://app.bleumr.com/oauth-callback.html';
  return `${window.location.origin}/oauth-callback.html`;
}

export function getProvider(id: SocialProvider): ProviderConfig | null {
  return PROVIDERS[id] || null;
}
