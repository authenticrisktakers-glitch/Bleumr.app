/**
 * cors-proxy — Supabase Edge Function
 *
 * First-party CORS proxy for Bleumr's PWA web search.
 * Fetches a URL server-side and returns the response with CORS headers.
 *
 * GET ?url=https://html.duckduckgo.com/html/?q=test
 *
 * Security:
 * - Only allows whitelisted domains (DuckDuckGo for now)
 * - 10s fetch timeout
 * - 500KB response size cap
 * - Rate limited by Supabase's built-in edge function limits
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

const ALLOWED_DOMAINS = [
  'html.duckduckgo.com',
  'duckduckgo.com',
  'lite.duckduckgo.com',
];

const MAX_RESPONSE_SIZE = 500_000; // 500KB
const FETCH_TIMEOUT_MS = 10_000;   // 10s

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const params = new URL(req.url).searchParams;
    const targetUrl = params.get('url');

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing ?url= parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL and check domain whitelist
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!ALLOWED_DOMAINS.includes(parsed.hostname)) {
      return new Response(
        JSON.stringify({ error: `Domain not allowed: ${parsed.hostname}` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (e: any) {
      clearTimeout(timer);
      const msg = e.name === 'AbortError' ? 'Upstream fetch timed out (10s)' : e.message;
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    clearTimeout(timer);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream returned ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read body with size cap
    const reader = res.body?.getReader();
    if (!reader) {
      return new Response(
        JSON.stringify({ error: 'No response body' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      if (totalSize > MAX_RESPONSE_SIZE) {
        reader.cancel();
        break;
      }
      chunks.push(value);
    }

    // Concatenate chunks
    const body = new Uint8Array(totalSize > MAX_RESPONSE_SIZE ? MAX_RESPONSE_SIZE : totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      const remaining = body.byteLength - offset;
      if (remaining <= 0) break;
      const slice = chunk.byteLength > remaining ? chunk.slice(0, remaining) : chunk;
      body.set(slice, offset);
      offset += slice.byteLength;
    }

    const contentType = res.headers.get('content-type') || 'text/html; charset=utf-8';

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'X-Proxy-Source': 'bleumr-cors-proxy',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal proxy error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
