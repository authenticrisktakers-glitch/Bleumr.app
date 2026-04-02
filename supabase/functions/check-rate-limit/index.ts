/**
 * check-rate-limit — Supabase Edge Function
 *
 * DUAL rate limit enforcement:
 *   1. PER-DEVICE: Each device fingerprint gets its own daily counter.
 *      Clearing localStorage or reinstalling PWA does NOT reset this.
 *   2. TIER-WIDE: Central cooldown when the entire tier is overloaded.
 *
 * GET  ?tier=free&device_fp=abc123&action=check   → check remaining
 * GET  ?tier=free&device_fp=abc123&action=consume  → check + increment
 * POST { tier, device_fp, action }                 → same
 *
 * Admin: ?reset=true&admin_key=BLEUMR_ADMIN_2025&new_limit=50
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
    const url = new URL(req.url)
    let tier = url.searchParams.get('tier') || 'free'
    let deviceFp = url.searchParams.get('device_fp') || ''
    let action = url.searchParams.get('action') || 'check' // 'check' or 'consume'

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      tier = body.tier || tier
      deviceFp = body.device_fp || deviceFp
      action = body.action || action
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // ── Admin reset ──
    const resetRequested = url.searchParams.get('reset') === 'true'
    const adminKey = url.searchParams.get('admin_key')
    if (resetRequested && adminKey === 'BLEUMR_ADMIN_2025') {
      const newLimit = parseInt(url.searchParams.get('new_limit') || '0') || undefined
      const resetDevice = url.searchParams.get('device_fp') || ''
      const updates: Record<string, any> = {
        is_cooled_down: false,
        cooldown_until: null,
        updated_at: new Date().toISOString(),
      }
      if (newLimit) updates.daily_limit = newLimit

      // Clear tier-wide cooldown
      await supabase.from('tier_limits').update(updates).eq('tier', tier)

      // Optionally reset a specific device's usage
      if (resetDevice) {
        const today = new Date().toISOString().split('T')[0]
        await supabase
          .from('device_usage')
          .delete()
          .eq('device_fingerprint', resetDevice)
          .eq('date', today)
      }

      return new Response(
        JSON.stringify({ reset: true, tier, new_limit: newLimit || 'unchanged', device_reset: resetDevice || 'none' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Get tier limits ──
    const { data: limitRow } = await supabase
      .from('tier_limits')
      .select('daily_limit, cooldown_minutes, cooldown_until, is_cooled_down')
      .eq('tier', tier)
      .single()

    const dailyLimit = limitRow?.daily_limit ?? 20
    const cooldownMinutes = limitRow?.cooldown_minutes ?? 10
    const cooldownUntil = limitRow?.cooldown_until ? new Date(limitRow.cooldown_until) : null
    const isCooledDown = limitRow?.is_cooled_down ?? false

    // 0 = unlimited
    if (dailyLimit === 0) {
      return new Response(
        JSON.stringify({ allowed: true, remaining: -1, limit: 0, used: 0, device_used: 0, cooldown: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Check tier-wide cooldown ──
    if (isCooledDown && cooldownUntil) {
      const now = new Date()
      if (now < cooldownUntil) {
        const remainingSec = Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000)
        return new Response(
          JSON.stringify({
            allowed: false, remaining: 0, limit: dailyLimit, used: dailyLimit, device_used: 0,
            cooldown: true, cooldown_until: cooldownUntil.toISOString(),
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

    // ── Per-device usage check ──
    const today = new Date().toISOString().split('T')[0]
    let deviceUsed = 0

    if (deviceFp) {
      // Get this device's usage for today
      const { data: usageRow } = await supabase
        .from('device_usage')
        .select('request_count')
        .eq('device_fingerprint', deviceFp)
        .eq('date', today)
        .single()

      deviceUsed = usageRow?.request_count || 0

      // Per-device limit enforcement
      if (deviceUsed >= dailyLimit) {
        return new Response(
          JSON.stringify({
            allowed: false, remaining: 0, limit: dailyLimit,
            used: deviceUsed, device_used: deviceUsed,
            cooldown: false, limitReached: true,
            reason: `You've used all ${dailyLimit} messages today. ${tier === 'free' ? 'Upgrade to keep going.' : 'Try again tomorrow.'}`,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // If action is 'consume', increment the counter
      if (action === 'consume') {
        if (usageRow) {
          // Update existing row
          await supabase
            .from('device_usage')
            .update({
              request_count: deviceUsed + 1,
              last_request_at: new Date().toISOString(),
            })
            .eq('device_fingerprint', deviceFp)
            .eq('date', today)
        } else {
          // Insert new row for today
          await supabase
            .from('device_usage')
            .insert({
              device_fingerprint: deviceFp,
              tier,
              date: today,
              request_count: 1,
              last_request_at: new Date().toISOString(),
            })
        }
        deviceUsed += 1
      }
    }

    // ── Tier-wide count (for global cooldown trigger) ──
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('api_requests')
      .select('*', { count: 'exact', head: true })
      .eq('tier', tier)
      .gte('created_at', todayStart.toISOString())

    const tierUsed = count || 0

    // If tier-wide limit exceeded (e.g. 10x the per-device limit), trigger cooldown for all
    const tierWideLimit = dailyLimit * 10 // tier-wide pool is 10x per-device
    if (tierUsed >= tierWideLimit) {
      const cooldownEnd = new Date(Date.now() + cooldownMinutes * 60 * 1000)
      await supabase
        .from('tier_limits')
        .update({
          is_cooled_down: true,
          cooldown_until: cooldownEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('tier', tier)

      return new Response(
        JSON.stringify({
          allowed: false, remaining: 0, limit: dailyLimit,
          used: deviceUsed, device_used: deviceUsed, tier_used: tierUsed,
          cooldown: true, cooldown_until: cooldownEnd.toISOString(),
          cooldown_remaining_sec: cooldownMinutes * 60,
          reason: `${tier} tier limit reached. All ${tier} users are in a ${cooldownMinutes}-minute cooldown.`,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const remaining = Math.max(0, dailyLimit - deviceUsed)

    return new Response(
      JSON.stringify({
        allowed: true, remaining, limit: dailyLimit,
        used: deviceUsed, device_used: deviceUsed, tier_used: tierUsed,
        cooldown: false,
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
