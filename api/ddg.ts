/**
 * Vercel Serverless Function — DDG search proxy
 * Proxies requests to DuckDuckGo HTML to bypass CORS in the browser PWA.
 * Route: /api/ddg?q=search+query
 */

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get('q') || '';

  if (!query) {
    return new Response('Missing ?q= parameter', { status: 400 });
  }

  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = await res.text();
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response('DDG proxy error', { status: 502 });
  }
}
