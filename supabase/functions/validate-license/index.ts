/**
 * validate-license — Supabase Edge Function
 *
 * Validates a license key and returns API keys for the granted tier.
 * API keys are stored as Supabase Edge Function secrets (not in code).
 *
 * Required secrets (set via `supabase secrets set`):
 *   GROQ_API_KEY        — Groq inference key
 *   DEEPGRAM_API_KEY    — Deepgram TTS key
 *   SUPABASE_URL        — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    // Accept key from query param (?key=XXX) or JSON body ({ key: "XXX" })
    let licenseKey = ''

    const url = new URL(req.url)
    licenseKey = url.searchParams.get('key') || ''

    if (!licenseKey && req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      licenseKey = body.key || ''
    }

    licenseKey = licenseKey.trim().toUpperCase()

    if (!licenseKey) {
      return new Response(
        JSON.stringify({ error: 'Missing license key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // PWA trial — return API keys without requiring a real license
    if (licenseKey === 'PWA-TRIAL') {
      const apiKeys: Record<string, string> = {
        groq: Deno.env.get('GROQ_API_KEY') || '',
        deepgram: Deno.env.get('DEEPGRAM_API_KEY') || '',
      }
      return new Response(
        JSON.stringify({ tier: 'pro', apiKeys }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Connect to Supabase with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Look up the license key
    const { data: license, error } = await supabase
      .from('license_keys')
      .select('*')
      .eq('key', licenseKey)
      .single()

    if (error || !license) {
      return new Response(
        JSON.stringify({ error: 'Invalid license key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if active
    if (!license.active) {
      return new Response(
        JSON.stringify({ error: 'License key has been deactivated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check expiry
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'License key has expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check activation limit
    if (license.current_activations >= license.max_activations) {
      return new Response(
        JSON.stringify({ error: 'License key activation limit reached' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Increment activation count
    await supabase
      .from('license_keys')
      .update({ current_activations: license.current_activations + 1 })
      .eq('id', license.id)

    // Return tier + API keys from secrets
    const apiKeys: Record<string, string> = {
      groq: Deno.env.get('GROQ_API_KEY') || '',
      deepgram: Deno.env.get('DEEPGRAM_API_KEY') || '',
      gemini: Deno.env.get('GEMINI_API_KEY') || '',
    }

    return new Response(
      JSON.stringify({
        tier: license.tier,
        apiKeys,
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
