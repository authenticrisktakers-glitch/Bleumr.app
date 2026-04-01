-- JUMARI Brain — centralized self-learning knowledge base
-- All users contribute, all users benefit. Groq dependency decreases over time.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Core knowledge entries
CREATE TABLE IF NOT EXISTS brain_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_pattern text NOT NULL,          -- normalized (lowercase, no stop words, sorted)
  question_raw text NOT NULL,              -- original question
  answer text NOT NULL,                    -- distilled answer
  category text DEFAULT 'general',         -- general, factual, coding, capability, creative, bleumr
  tags text[] DEFAULT '{}',                -- keyword tags for search
  confidence float DEFAULT 0.5,            -- 0.0-1.0, rises with positive signals
  hit_count int DEFAULT 0,                 -- times served instead of Groq
  miss_count int DEFAULT 0,
  thumbs_up int DEFAULT 0,
  thumbs_down int DEFAULT 0,
  source text DEFAULT 'groq_distill',      -- groq_distill, admin_push, knowledge_request
  status text DEFAULT 'active',            -- active, pending_review, rejected, archived
  version int DEFAULT 1,
  parent_id uuid,                          -- previous version for rollback
  created_by_session text,
  created_by_device text,
  reviewed_by_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX idx_brain_entries_pattern_trgm ON brain_entries USING GIN (question_pattern gin_trgm_ops);
CREATE INDEX idx_brain_entries_tags ON brain_entries USING GIN (tags);
CREATE INDEX idx_brain_entries_active ON brain_entries (status, confidence DESC);
CREATE INDEX idx_brain_entries_category ON brain_entries (category);

-- Feedback signals from users
CREATE TABLE IF NOT EXISTS brain_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id uuid REFERENCES brain_entries(id) ON DELETE CASCADE,
  session_id text,
  device_id text,
  signal text NOT NULL,  -- thumbs_up, thumbs_down, used_groq_after
  created_at timestamptz DEFAULT now()
);

-- Admin-tunable config knobs
CREATE TABLE IF NOT EXISTS brain_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Seed config defaults
INSERT INTO brain_config (key, value) VALUES
  ('min_confidence_to_serve', '0.6'),
  ('min_match_score', '0.4'),
  ('auto_approve_threshold', '0.8'),
  ('max_entries', '5000'),
  ('learning_enabled', 'true'),
  ('require_admin_review', 'false')
ON CONFLICT (key) DO NOTHING;

-- RPC function for trigram similarity search
CREATE OR REPLACE FUNCTION brain_search(
  q_pattern text,
  q_tags text[],
  min_conf float DEFAULT 0.6,
  min_sim float DEFAULT 0.4
)
RETURNS TABLE(
  id uuid,
  question_pattern text,
  question_raw text,
  answer text,
  category text,
  tags text[],
  confidence float,
  hit_count int,
  source text,
  sim_score float
) AS $$
  SELECT
    be.id, be.question_pattern, be.question_raw, be.answer,
    be.category, be.tags, be.confidence::float, be.hit_count, be.source,
    similarity(be.question_pattern, q_pattern)::float as sim_score
  FROM brain_entries be
  WHERE be.status = 'active'
    AND be.confidence >= min_conf
    AND similarity(be.question_pattern, q_pattern) >= min_sim
  ORDER BY similarity(be.question_pattern, q_pattern) DESC, be.confidence DESC
  LIMIT 3
$$ LANGUAGE sql STABLE;

-- RLS
ALTER TABLE brain_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_config ENABLE ROW LEVEL SECURITY;

-- Clients can read active brain entries and config
CREATE POLICY "anon_select_brain_entries" ON brain_entries FOR SELECT TO anon USING (status = 'active');
CREATE POLICY "anon_insert_brain_entries" ON brain_entries FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_brain_config" ON brain_config FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_brain_feedback" ON brain_feedback FOR INSERT TO anon WITH CHECK (true);
