/**
 * check-update — Supabase Edge Function
 *
 * Returns the latest version info + download URLs for Bleumr.
 * The Mac .command updater and in-app updater both hit this endpoint.
 *
 * GET ?platform=mac_arm64  → latest version + arm64 DMG URL
 * GET ?platform=mac_x64    → latest version + x64 DMG URL
 * GET ?platform=win         → latest version + exe URL
 * GET ?platform=linux       → latest version + AppImage URL
 * GET ?current=1.3.0        → also returns needs_update boolean
 *
 * Version source: checks GitHub Releases API first, falls back to
 * the app_config table if GitHub is unreachable.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

const GITHUB_OWNER = 'authenticrisktakers-glitch'
const GITHUB_REPO = 'Bleumr.app'
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

interface ReleaseInfo {
  version: string
  published_at: string
  release_notes: string
  downloads: Record<string, string>
}

// Simple semver compare: returns true if remote > local
function isNewer(remote: string, local: string): boolean {
  const r = remote.replace(/^v/, '').split('.').map(Number)
  const l = local.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true
    if ((r[i] || 0) < (l[i] || 0)) return false
  }
  return false
}

async function getLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(GITHUB_API, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Bleumr-Updater/1.0',
      },
    })
    if (!res.ok) return null

    const data = await res.json()
    const version = (data.tag_name || '').replace(/^v/, '')
    const assets: any[] = data.assets || []

    // Map assets to platform download URLs
    const downloads: Record<string, string> = {}
    for (const asset of assets) {
      const name: string = asset.name || ''
      const url: string = asset.browser_download_url || ''
      if (!url) continue

      if (name.endsWith('-arm64.dmg')) downloads['mac_arm64'] = url
      else if (name.endsWith('.dmg') && !name.includes('arm64')) downloads['mac_x64'] = url
      else if (name.endsWith('.exe') && !name.includes('blockmap')) downloads['win'] = url
      else if (name.endsWith('.AppImage')) downloads['linux'] = url
      else if (name.endsWith('.deb')) downloads['linux_deb'] = url
    }

    return {
      version,
      published_at: data.published_at || '',
      release_notes: data.body || '',
      downloads,
    }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const platform = url.searchParams.get('platform') || 'mac_arm64'
    const currentVersion = url.searchParams.get('current') || ''

    const release = await getLatestRelease()

    if (!release) {
      return new Response(
        JSON.stringify({ error: 'Could not fetch latest release', fallback: true }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const downloadUrl = release.downloads[platform] || release.downloads['mac_arm64'] || ''
    const needsUpdate = currentVersion ? isNewer(release.version, currentVersion) : null

    return new Response(
      JSON.stringify({
        version: release.version,
        current: currentVersion || null,
        needs_update: needsUpdate,
        download_url: downloadUrl,
        all_downloads: release.downloads,
        published_at: release.published_at,
        release_notes: release.release_notes.slice(0, 2000),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
