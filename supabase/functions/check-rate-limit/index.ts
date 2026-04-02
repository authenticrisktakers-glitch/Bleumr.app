/**
 * check-rate-limit — Supabase Edge Function
 *
 * CENTRAL rate limit enforcement. Counts ALL requests across ALL users in a tier
 * against the admin-configured daily limit. When a tier exceeds its limit, ALL
 * users in that tier enter a cooldown period (admin-configurable, default 10 min).
 *
 * GET  ?tier=free  → { allowed, remaining, limit, used, cooldown, cooldown_until }
 * POST { tier }    → same
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
    let tier = 'free'

    const url = new URL(req.url)
    tier = url.searchParams.get('tier') || 'free'

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      tier = body.tier || tier
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // ── Admin reset: ?reset=true&new_limit=50&admin_key=BLEUMR_ADMIN ──
    const resetRequested = url.searchParams.get('reset') === 'true'
    const adminKey = url.searchParams.get('admin_key')
    if (resetRequested && adminKey === 'BLEUMR_ADMIN_2025') {
      const newLimit = parseInt(url.searchParams.get('new_limit') || '0') || undefined
      const updates: Record<string, any> = {
        is_cooled_down: false,
        cooldown_until: null,
        updated_at: new Date().toISOString(),
      }
      if (newLimit) updates.daily_limit = newLimit

      // Clear today's request count so cooldown doesn't instantly re-trigger
      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)
      await supabase
        .from('api_requests')
        .delete()
        .eq('tier', tier)
        .gte('created_at', todayStart.toISOString())

      await supabase.from('tier_limits').update(updates).eq('tier', tier)

      return new Response(
        JSON.stringify({ reset: true, tier, new_limit: newLimit || 'unchanged', requests_cleared: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the limit config for this tier
    const { data: limitRow } = await supabase
      .from('tier_limits')
      .select('daily_limit, cooldown_minutes, cooldown_until, is_cooled_down')
      .eq('tier', tier)
      .single()

    const dailyLimit = limitRow?.daily_limit ?? 20
    const cooldownMinutes = limitRow?.cooldown_minutes ?? 10
    const cooldownUntil = limitRow?.cooldown_until ? new Date(limitRow.cooldown_until) : null
    const isCooledDown = limitRow?.is_cooled_down ?? false

    // 0 = unlimited — no rate limit
    if (dailyLimit === 0) {
      return new Response(
        JSON.stringify({ allowed: true, remaining: -1, limit: 0, used: 0, cooldown: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if tier is currently in cooldown
    if (isCooledDown && cooldownUntil) {
      const now = new Date()
      if (now < cooldownUntil) {
        // Still in cooldown
        const remainingSec = Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000)
        return new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            limit: dailyLimit,
            used: dailyLimit,
            cooldown: true,
            cooldown_until: cooldownUntil.toISOString(),
            cooldown_remaining_sec: remainingSec,
            reason: `${tier} tier is in cooldown. Try again in ${Math.ceil(remainingSec / 60)} minute${remainingSec > 60 ? 's' : ''}.`,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        // Cooldown expired — lift it
        await supabase
          .from('tier_limits')
          .update({ is_cooled_down: false, cooldown_until: null, updated_at: new Date().toISOString() })
          .eq('tier', tier)
      }
    }

    // Count ALL requests for this tier today (central/global count)
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('api_requests')
      .select('*', { count: 'exact', head: true })
      .eq('tier', tier)
      .gte('created_at', todayStart.toISOString())

    const used = count || 0
    const remaining = Math.max(0, dailyLimit - used)

    // If over limit, trigger cooldown for the entire tier
    if (used >= dailyLimit) {
      const cooldownEnd = new Date(Date.now() + cooldownMinutes * 60 * 1000)

      await supabase
        .from('tier_limits')
        .update({
          is_cooled_down: true,
          cooldown_until: cooldownEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('tier', tier)

      const remainingSec = cooldownMinutes * 60
      return new Response(
        JSON.stringify({
          allowed: false,
          remaining: 0,
          limit: dailyLimit,
          used,
          cooldown: true,
          cooldown_until: cooldownEnd.toISOString(),
          cooldown_remaining_sec: remainingSec,
          reason: `${tier} tier limit reached. All ${tier} users are in a ${cooldownMinutes}-minute cooldown.`,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ allowed: true, remaining, limit: dailyLimit, used, cooldown: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
