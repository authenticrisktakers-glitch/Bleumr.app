-- JUMARI Consciousness — Supabase tables
-- Run this in the Supabase SQL editor to set up the tables

-- Thought log — every thought JUMARI has
CREATE TABLE IF NOT EXISTS consciousness_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id text NOT NULL,
  type text NOT NULL,
  content text NOT NULL,
  file_context text,
  confidence float DEFAULT 0.5,
  priority text DEFAULT 'medium',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Cycle results — summary of each evolution cycle
CREATE TABLE IF NOT EXISTS consciousness_cycles (
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
);

-- Admin config — toggle consciousness on/off, trigger manual runs
CREATE TABLE IF NOT EXISTS consciousness_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Default config
INSERT INTO consciousness_config (key, value) VALUES ('enabled', 'true') ON CONFLICT (key) DO NOTHING;
INSERT INTO consciousness_config (key, value) VALUES ('run_now', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO consciousness_config (key, value) VALUES ('interval_hours', '2') ON CONFLICT (key) DO NOTHING;

-- RLS — open for daemon (anon key) and admin (service role)
ALTER TABLE consciousness_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE consciousness_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE consciousness_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "open_all_log" ON consciousness_log;
DROP POLICY IF EXISTS "open_all_cycles" ON consciousness_cycles;
DROP POLICY IF EXISTS "open_all_config" ON consciousness_config;

-- Allow full access for both anon and service_role
CREATE POLICY "open_all_log" ON consciousness_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all_cycles" ON consciousness_cycles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all_config" ON consciousness_config FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_consciousness_log_created ON consciousness_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consciousness_log_cycle ON consciousness_log (cycle_id);
CREATE INDEX IF NOT EXISTS idx_consciousness_log_type ON consciousness_log (type);
CREATE INDEX IF NOT EXISTS idx_consciousness_cycles_created ON consciousness_cycles (created_at DESC);
