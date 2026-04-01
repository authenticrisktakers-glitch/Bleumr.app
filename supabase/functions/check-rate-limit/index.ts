/**
 * check-rate-limit — Supabase Edge Function
 *
 * Server-side rate limit enforcement. Counts today's requests for a session+tier
 * against the admin-configured limit in tier_limits table.
 *
 * GET  ?session_id=XXX&tier=free  → { allowed, remaining, limit, used }
 * POST { session_id, tier }       → same
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    let sessionId = ''
    let tier = 'free'

    const url = new URL(req.url)
    sessionId = url.searchParams.get('session_id') || ''
    tier = url.searchParams.get('tier') || 'free'

    if (!sessionId && req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      sessionId = body.session_id || ''
      tier = body.tier || 'free'
    }

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'Missing session_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Get the limit for this tier
    const { data: limitRow } = await supabase
      .from('tier_limits')
      .select('daily_limit')
      .eq('tier', tier)
      .single()

    const dailyLimit = limitRow?.daily_limit ?? 20

    // 0 = unlimited
    if (dailyLimit === 0) {
      return new Response(
        JSON.stringify({ allowed: true, remaining: -1, limit: 0, used: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Count today's requests for this session
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('api_requests')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .gte('created_at', todayStart.toISOString())

    const used = count || 0
    const remaining = Math.max(0, dailyLimit - used)
    const allowed = used < dailyLimit

    return new Response(
      JSON.stringify({ allowed, remaining, limit: dailyLimit, used }),
      {
        status: allowed ? 200 : 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
