/**
 * setup-devices — One-shot edge function to create device_activations table.
 * Call once: GET ?admin_key=BLEUMR_ADMIN_2025
 * Delete after use.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  const url = new URL(req.url)
  if (url.searchParams.get('admin_key') !== 'BLEUMR_ADMIN_2025') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Use the postgres connection directly via supabase-js sql tagged template
  const statements = [
    `CREATE TABLE IF NOT EXISTS device_activations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      license_key_id uuid NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,
      device_fingerprint text NOT NULL,
      platform text DEFAULT 'unknown',
      first_seen_at timestamptz DEFAULT now(),
      last_seen_at timestamptz DEFAULT now(),
      UNIQUE(license_key_id, device_fingerprint)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_device_activations_lookup ON device_activations(license_key_id, device_fingerprint)`,
    `CREATE INDEX IF NOT EXISTS idx_device_activations_key ON device_activations(license_key_id)`,
    `ALTER TABLE device_activations ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN CREATE POLICY "service_full" ON device_activations FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ]

  const results: string[] = []
  for (const sql of statements) {
    try {
      // Try direct SQL via the Data API's rpc
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          'Content-Type': 'application/json',
        },
      })
      // RPC won't work for DDL, use postgres.js connection instead
      // Fall through to the pg approach below
    } catch {}

    // Use the Supabase Management API SQL endpoint
    try {
      const pgRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/pg/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      })
      if (pgRes.ok) {
        results.push(`✓ ${sql.slice(0, 60)}...`)
      } else {
        const err = await pgRes.text()
        results.push(`⚠ ${sql.slice(0, 60)}... → ${pgRes.status}: ${err.slice(0, 100)}`)
      }
    } catch (e: any) {
      results.push(`❌ ${sql.slice(0, 60)}... → ${e.message}`)
    }
  }

  // Verify table exists now
  const { error: checkErr } = await supabase.from('device_activations').select('id').limit(0)
  const tableExists = !checkErr

  return new Response(JSON.stringify({
    success: tableExists,
    message: tableExists ? 'device_activations table is ready!' : 'Table creation may need manual SQL — paste 007_device_activations.sql into SQL Editor',
    results,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
