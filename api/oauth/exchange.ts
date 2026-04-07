/**
 * Vercel Serverless Function — OAuth token exchange
 *
 * Receives:  POST /api/oauth/exchange
 *   { provider, code, code_verifier, redirect_uri }
 *
 * Returns:
 *   { access_token, refresh_token?, expires_in?, scope?, user_id?, user_handle?, avatar_url? }
 *
 * The CLIENT SECRET for each provider lives ONLY in Vercel env vars and is
 * never sent to the browser. To add a provider:
 *   1. Set <PROVIDER>_CLIENT_ID and <PROVIDER>_CLIENT_SECRET in Vercel env
 *   2. Add a config entry to PROVIDER_CONFIGS below
 *   3. Optionally add a `fetchUserInfo` so the client can show the connected handle
 *
 * Required env vars (set per provider you support):
 *   TWITTER_CLIENT_ID         + TWITTER_CLIENT_SECRET
 *   INSTAGRAM_CLIENT_ID       + INSTAGRAM_CLIENT_SECRET
 *   FACEBOOK_CLIENT_ID        + FACEBOOK_CLIENT_SECRET
 *   LINKEDIN_CLIENT_ID        + LINKEDIN_CLIENT_SECRET
 *   TIKTOK_CLIENT_ID          + TIKTOK_CLIENT_SECRET
 */

export const config = { runtime: 'edge' };

interface ExchangePayload {
  provider: string;
  code: string;
  code_verifier?: string;
  redirect_uri: string;
}

interface ProviderTokenConfig {
  tokenUrl: string;
  pkce: boolean;
  /** Most providers want application/x-www-form-urlencoded; some want JSON */
  bodyFormat: 'form' | 'json';
  /** Optional Authorization header (e.g. Twitter wants Basic auth with client creds) */
  authHeader?: (clientId: string, secret: string) => string | undefined;
  /** Fetch user info to populate user_id/user_handle/avatar_url */
  fetchUserInfo?: (accessToken: string) => Promise<{ user_id?: string; user_handle?: string; avatar_url?: string }>;
}

const PROVIDER_CONFIGS: Record<string, ProviderTokenConfig> = {
  twitter: {
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    pkce: true,
    bodyFormat: 'form',
    authHeader: (id, secret) => `Basic ${btoa(`${id}:${secret}`)}`,
    fetchUserInfo: async (token) => {
      const r = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,id', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return {};
      const json = await r.json() as any;
      const u = json?.data || {};
      return {
        user_id: u.id,
        user_handle: u.username ? `@${u.username}` : undefined,
        avatar_url: u.profile_image_url,
      };
    },
  },
  instagram: {
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    pkce: false,
    bodyFormat: 'form',
    fetchUserInfo: async (token) => {
      const r = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
      if (!r.ok) return {};
      const json = await r.json() as any;
      return { user_id: json.id, user_handle: json.username ? `@${json.username}` : undefined };
    },
  },
  facebook: {
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    pkce: false,
    bodyFormat: 'form',
    fetchUserInfo: async (token) => {
      const r = await fetch(`https://graph.facebook.com/me?fields=id,name,picture&access_token=${encodeURIComponent(token)}`);
      if (!r.ok) return {};
      const json = await r.json() as any;
      return {
        user_id: json.id,
        user_handle: json.name,
        avatar_url: json?.picture?.data?.url,
      };
    },
  },
  linkedin: {
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    pkce: false,
    bodyFormat: 'form',
    fetchUserInfo: async (token) => {
      const r = await fetch('https://api.linkedin.com/v2/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return {};
      const json = await r.json() as any;
      const handle = [json.localizedFirstName, json.localizedLastName].filter(Boolean).join(' ');
      return { user_id: json.id, user_handle: handle || undefined };
    },
  },
  tiktok: {
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    pkce: true,
    bodyFormat: 'form',
    fetchUserInfo: async (token) => {
      const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return {};
      const json = await r.json() as any;
      const u = json?.data?.user || {};
      return {
        user_id: u.open_id,
        user_handle: u.display_name,
        avatar_url: u.avatar_url,
      };
    },
  },
};

function getEnv(name: string): string | undefined {
  return (typeof process !== 'undefined' ? process.env?.[name] : undefined) as string | undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export default async function handler(req: Request) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let payload: ExchangePayload;
  try {
    payload = await req.json() as ExchangePayload;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { provider, code, code_verifier, redirect_uri } = payload;
  if (!provider || !code || !redirect_uri) {
    return jsonResponse({ error: 'Missing required fields' }, 400);
  }

  const cfg = PROVIDER_CONFIGS[provider];
  if (!cfg) return jsonResponse({ error: `Unknown provider: ${provider}` }, 400);

  const envPrefix = provider.toUpperCase();
  const clientId = getEnv(`${envPrefix}_CLIENT_ID`);
  const clientSecret = getEnv(`${envPrefix}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) {
    return jsonResponse({ error: `${provider} not configured on server (missing env vars)` }, 500);
  }

  if (cfg.pkce && !code_verifier) {
    return jsonResponse({ error: 'code_verifier required for PKCE provider' }, 400);
  }

  // Build the token request
  const tokenParams: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri,
    client_id: clientId,
  };
  if (cfg.pkce && code_verifier) tokenParams.code_verifier = code_verifier;

  // Some providers require client_secret in the body, some in Authorization header
  if (!cfg.authHeader) {
    tokenParams.client_secret = clientSecret;
  }

  const headers: Record<string, string> = {};
  if (cfg.bodyFormat === 'form') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else {
    headers['Content-Type'] = 'application/json';
  }
  if (cfg.authHeader) {
    const authValue = cfg.authHeader(clientId, clientSecret);
    if (authValue) headers['Authorization'] = authValue;
  }
  headers['Accept'] = 'application/json';

  const body = cfg.bodyFormat === 'form'
    ? new URLSearchParams(tokenParams).toString()
    : JSON.stringify(tokenParams);

  let tokenRes: Response;
  try {
    tokenRes = await fetch(cfg.tokenUrl, { method: 'POST', headers, body });
  } catch (e) {
    return jsonResponse({ error: 'Provider unreachable' }, 502);
  }

  const text = await tokenRes.text();
  let tokenJson: any;
  try {
    tokenJson = JSON.parse(text);
  } catch {
    return jsonResponse({ error: `Provider returned non-JSON: ${text.slice(0, 200)}` }, 502);
  }

  if (!tokenRes.ok || !tokenJson.access_token) {
    return jsonResponse({
      error: tokenJson.error_description || tokenJson.error || `Token exchange failed (${tokenRes.status})`,
    }, 400);
  }

  // Fetch user info if available
  let userInfo: { user_id?: string; user_handle?: string; avatar_url?: string } = {};
  if (cfg.fetchUserInfo) {
    try {
      userInfo = await cfg.fetchUserInfo(tokenJson.access_token);
    } catch {
      // Non-fatal — we still return the token
    }
  }

  return jsonResponse({
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    expires_in: tokenJson.expires_in,
    scope: tokenJson.scope,
    ...userInfo,
  });
}
