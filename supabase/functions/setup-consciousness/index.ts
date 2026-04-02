/**
 * setup-consciousness — One-time Supabase Edge Function
 * Creates the consciousness tables for JUMARI's self-evolution system.
 * Call once: GET ?admin_key=BLEUMR_ADMIN_2025
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const adminKey = url.searchParams.get('admin_key')
  if (adminKey !== 'BLEUMR_ADMIN_2025') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const results: string[] = []

  // Execute SQL statements via rpc or direct query
  const statements = [
    // consciousness_log
    `CREATE TABLE IF NOT EXISTS consciousness_log (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      cycle_id text NOT NULL,
      type text NOT NULL,
      content text NOT NULL,
      file_context text,
      confidence float DEFAULT 0.5,
      priority text DEFAULT 'medium',
      tags text[] DEFAULT '{}',
      created_at timestamptz DEFAULT now()
    )`,
    // consciousness_cycles
    `CREATE TABLE IF NOT EXISTS consciousness_cycles (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      cycle_id text NOT NULL,
      started_at timestamptz NOT NULL,
      completed_at timestamptz NOT NULL,
      files_analyzed int DEFAULT 0,
      thoughts_generated int DEFAULT 0,
      drafts_written int DEFAULT 0,
      groq_calls_used int DEFAULT 0,
      quality_score float DEFAULT 0,
      errors text[] DEFAULT '{}',
      created_at timestamptz DEFAULT now()
    )`,
    // consciousness_config
    `CREATE TABLE IF NOT EXISTS consciousness_config (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz DEFAULT now()
    )`,
    // RLS
    `ALTER TABLE consciousness_log ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE consciousness_cycles ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE consciousness_config ENABLE ROW LEVEL SECURITY`,
    // Policies — open for all (daemon uses anon key, admin uses service role)
    `DROP POLICY IF EXISTS "open_all_log" ON consciousness_log`,
    `CREATE POLICY "open_all_log" ON consciousness_log FOR ALL USING (true) WITH CHECK (true)`,
    `DROP POLICY IF EXISTS "open_all_cycles" ON consciousness_cycles`,
    `CREATE POLICY "open_all_cycles" ON consciousness_cycles FOR ALL USING (true) WITH CHECK (true)`,
    `DROP POLICY IF EXISTS "open_all_config" ON consciousness_config`,
    `CREATE POLICY "open_all_config" ON consciousness_config FOR ALL USING (true) WITH CHECK (true)`,
    // Default config
    `INSERT INTO consciousness_config (key, value) VALUES ('enabled', 'true') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO consciousness_config (key, value) VALUES ('run_now', 'false') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO consciousness_config (key, value) VALUES ('interval_hours', '2') ON CONFLICT (key) DO NOTHING`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_consciousness_log_created ON consciousness_log (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_consciousness_log_cycle ON consciousness_log (cycle_id)`,
    `CREATE INDEX IF NOT EXISTS idx_consciousness_log_type ON consciousness_log (type)`,
    `CREATE INDEX IF NOT EXISTS idx_consciousness_cycles_created ON consciousness_cycles (created_at DESC)`,
  ]

  for (const sql of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { query: sql })
      if (error) {
        // rpc might not exist — try raw query through PostgREST won't work
        // Just report what we tried
        results.push(`⚠ ${sql.slice(0, 60)}... → ${error.message}`)
      } else {
        results.push(`✓ ${sql.slice(0, 60)}...`)
      }
    } catch (e: any) {
      results.push(`❌ ${sql.slice(0, 60)}... → ${e.message}`)
    }
  }

  return new Response(
    JSON.stringify({
      message: 'Setup attempted. If rpc failed, paste setup.sql into the Supabase SQL Editor.',
      results
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
