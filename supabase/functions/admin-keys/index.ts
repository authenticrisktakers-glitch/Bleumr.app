/**
 * admin-keys — Supabase Edge Function
 *
 * Full CRUD admin panel for license keys.
 * Protected by BLEUMR_ADMIN_KEY secret.
 *
 * Endpoints (all require ?admin_key=...):
 *   GET    /admin-keys?action=list          — list all keys with expiry timers
 *   GET    /admin-keys?action=expiring       — keys expiring within 7 days
 *   GET    /admin-keys?action=stats          — dashboard stats
 *   POST   /admin-keys?action=create         — generate a new key (30-day default)
 *   POST   /admin-keys?action=update         — update key properties
 *   POST   /admin-keys?action=deactivate     — deactivate a key
 *   POST   /admin-keys?action=reactivate     — reactivate a key
 *   POST   /admin-keys?action=extend         — extend expiry by N days
 *   POST   /admin-keys?action=delete         — permanently delete a key
 *   POST   /admin-keys?action=revoke_devices — clear device activations for a key
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

const ADMIN_KEY = Deno.env.get('BLEUMR_ADMIN_KEY') || 'BLEUMR_ADMIN_2025'
const DEFAULT_EXPIRY_DAYS = 30

/** Generate a BLM-XXXXX-XXXXX-XXXXX format key */
function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 to avoid confusion
  const segment = () => Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `BLM-${segment()}-${segment()}-${segment()}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const adminKey = url.searchParams.get('admin_key') || ''
  const action = url.searchParams.get('action') || ''

  // Auth check
  if (adminKey !== ADMIN_KEY) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: Record<string, any> = {}
  if (req.method === 'POST') {
    body = await req.json().catch(() => ({}))
  }

  try {
    // ─── LIST ALL KEYS ─────────────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await supabase
        .from('license_keys')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      // Enrich with time-to-expiry and device count
      const now = Date.now()
      const enriched = await Promise.all((data || []).map(async (key: any) => {
        // Get device count
        let deviceCount = 0
        try {
          const { count } = await supabase
            .from('device_activations')
            .select('*', { count: 'exact', head: true })
            .eq('license_key_id', key.id)
          deviceCount = count || 0
        } catch {}

        const expiresAt = key.expires_at ? new Date(key.expires_at).getTime() : null
        const msRemaining = expiresAt ? expiresAt - now : null
        const daysRemaining = msRemaining !== null ? Math.ceil(msRemaining / 86400000) : null
        const isExpired = daysRemaining !== null && daysRemaining <= 0

        return {
          ...key,
          days_remaining: daysRemaining,
          is_expired: isExpired,
          device_count: deviceCount,
          status: !key.active ? 'deactivated' : isExpired ? 'expired' : 'active',
        }
      }))

      return new Response(
        JSON.stringify({ keys: enriched, total: enriched.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── EXPIRING SOON (within 7 days) ──────────────────────────────────
    if (action === 'expiring') {
      const withinDays = parseInt(url.searchParams.get('days') || '7')
      const cutoff = new Date(Date.now() + withinDays * 86400000).toISOString()

      const { data, error } = await supabase
        .from('license_keys')
        .select('*')
        .eq('active', true)
        .not('expires_at', 'is', null)
        .lte('expires_at', cutoff)
        .order('expires_at', { ascending: true })

      if (error) throw error

      const now = Date.now()
      const enriched = (data || []).map((key: any) => {
        const expiresAt = new Date(key.expires_at).getTime()
        const msRemaining = expiresAt - now
        const daysRemaining = Math.ceil(msRemaining / 86400000)
        const hoursRemaining = Math.ceil(msRemaining / 3600000)

        return {
          ...key,
          days_remaining: daysRemaining,
          hours_remaining: hoursRemaining,
          is_expired: daysRemaining <= 0,
          urgency: daysRemaining <= 0 ? 'expired' : daysRemaining <= 1 ? 'critical' : daysRemaining <= 3 ? 'warning' : 'upcoming',
        }
      })

      return new Response(
        JSON.stringify({ expiring: enriched, total: enriched.length, within_days: withinDays }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── DASHBOARD STATS ────────────────────────────────────────────────
    if (action === 'stats') {
      const { data: allKeys } = await supabase.from('license_keys').select('*')
      const keys = allKeys || []
      const now = Date.now()

      const total = keys.length
      const active = keys.filter((k: any) => k.active && (!k.expires_at || new Date(k.expires_at).getTime() > now)).length
      const expired = keys.filter((k: any) => k.expires_at && new Date(k.expires_at).getTime() <= now).length
      const deactivated = keys.filter((k: any) => !k.active).length
      const expiringIn7 = keys.filter((k: any) => {
        if (!k.active || !k.expires_at) return false
        const remaining = new Date(k.expires_at).getTime() - now
        return remaining > 0 && remaining <= 7 * 86400000
      }).length
      const proKeys = keys.filter((k: any) => k.tier === 'pro').length
      const stellurKeys = keys.filter((k: any) => k.tier === 'stellur').length
      const totalActivations = keys.reduce((sum: number, k: any) => sum + (k.current_activations || 0), 0)

      return new Response(
        JSON.stringify({ total, active, expired, deactivated, expiring_in_7_days: expiringIn7, pro_keys: proKeys, stellur_keys: stellurKeys, total_activations: totalActivations }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── CREATE KEY ─────────────────────────────────────────────────────
    if (action === 'create') {
      const tier = body.tier || 'pro'
      const maxActivations = body.max_activations ?? 3
      const expiryDays = body.expiry_days ?? DEFAULT_EXPIRY_DAYS
      const customKey = body.custom_key?.trim().toUpperCase() || ''
      const note = body.note || ''

      if (!['pro', 'stellur'].includes(tier)) {
        return new Response(JSON.stringify({ error: 'Invalid tier. Must be "pro" or "stellur".' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const key = customKey || generateLicenseKey()
      const expiresAt = expiryDays > 0
        ? new Date(Date.now() + expiryDays * 86400000).toISOString()
        : null // 0 = never expires

      const { data, error } = await supabase
        .from('license_keys')
        .insert({
          key,
          tier,
          active: true,
          max_activations: maxActivations,
          current_activations: 0,
          expires_at: expiresAt,
          note: note || null,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return new Response(JSON.stringify({ error: 'A key with that value already exists.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        throw error
      }

      return new Response(
        JSON.stringify({ success: true, key: data, message: `Key created: ${key} (${tier}, expires in ${expiryDays} days)` }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── UPDATE KEY ─────────────────────────────────────────────────────
    if (action === 'update') {
      const keyId = body.id
      if (!keyId) return new Response(JSON.stringify({ error: 'Missing key id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const updates: Record<string, any> = {}
      if (body.tier !== undefined) updates.tier = body.tier
      if (body.max_activations !== undefined) updates.max_activations = body.max_activations
      if (body.active !== undefined) updates.active = body.active
      if (body.expires_at !== undefined) updates.expires_at = body.expires_at
      if (body.note !== undefined) updates.note = body.note

      const { data, error } = await supabase
        .from('license_keys')
        .update(updates)
        .eq('id', keyId)
        .select()
        .single()

      if (error) throw error

      return new Response(
        JSON.stringify({ success: true, key: data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── DEACTIVATE KEY ─────────────────────────────────────────────────
    if (action === 'deactivate') {
      const keyId = body.id
      if (!keyId) return new Response(JSON.stringify({ error: 'Missing key id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const { error } = await supabase.from('license_keys').update({ active: false }).eq('id', keyId)
      if (error) throw error

      return new Response(
        JSON.stringify({ success: true, message: 'Key deactivated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── REACTIVATE KEY ─────────────────────────────────────────────────
    if (action === 'reactivate') {
      const keyId = body.id
      if (!keyId) return new Response(JSON.stringify({ error: 'Missing key id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const { error } = await supabase.from('license_keys').update({ active: true }).eq('id', keyId)
      if (error) throw error

      return new Response(
        JSON.stringify({ success: true, message: 'Key reactivated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── EXTEND EXPIRY ──────────────────────────────────────────────────
    if (action === 'extend') {
      const keyId = body.id
      const days = body.days ?? 30
      if (!keyId) return new Response(JSON.stringify({ error: 'Missing key id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      // Get current key
      const { data: existing } = await supabase.from('license_keys').select('expires_at').eq('id', keyId).single()
      if (!existing) return new Response(JSON.stringify({ error: 'Key not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      // Extend from current expiry or from now (if already expired)
      const base = existing.expires_at && new Date(existing.expires_at).getTime() > Date.now()
        ? new Date(existing.expires_at).getTime()
        : Date.now()
      const newExpiry = new Date(base + days * 86400000).toISOString()

      const { error } = await supabase.from('license_keys').update({ expires_at: newExpiry, active: true }).eq('id', keyId)
      if (error) throw error

      return new Response(
        JSON.stringify({ success: true, new_expires_at: newExpiry, message: `Extended by ${days} days` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── DELETE KEY ─────────────────────────────────────────────────────
    if (action === 'delete') {
      const keyId = body.id
      if (!keyId) return new Response(JSON.stringify({ error: 'Missing key id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      // Delete device activations first (FK cascade should handle, but be safe)
      await supabase.from('device_activations').delete().eq('license_key_id', keyId)
      const { error } = await supabase.from('license_keys').delete().eq('id', keyId)
      if (error) throw error

      return new Response(
        JSON.stringify({ success: true, message: 'Key permanently deleted' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── REVOKE DEVICES ─────────────────────────────────────────────────
    if (action === 'revoke_devices') {
      const keyId = body.id
      if (!keyId) return new Response(JSON.stringify({ error: 'Missing key id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      await supabase.from('device_activations').delete().eq('license_key_id', keyId)
      await supabase.from('license_keys').update({ current_activations: 0 }).eq('id', keyId)

      return new Response(
        JSON.stringify({ success: true, message: 'All device activations revoked, activation count reset to 0' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Use: list, expiring, stats, create, update, deactivate, reactivate, extend, delete, revoke_devices` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[admin-keys] Error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
