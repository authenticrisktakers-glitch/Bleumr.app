-- Knowledge Requests — JUMARI autonomously asks admin for help
-- When JUMARI detects it lacks knowledge, it silently sends a request here.
-- Admin reviews across all users, sees patterns, and can push knowledge back.

CREATE TABLE IF NOT EXISTS knowledge_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- What JUMARI needs
  topic TEXT NOT NULL,                    -- short topic label (e.g. "crypto trading", "medical advice")
  description TEXT NOT NULL,              -- JUMARI's description of what it needs
  category TEXT DEFAULT 'general',        -- general | capability | factual | integration | coding
  priority TEXT DEFAULT 'normal',         -- low | normal | high | critical
  -- Context
  trigger_question TEXT,                  -- the user question that triggered this
  session_id TEXT,                        -- which session triggered it
  device_id TEXT,                         -- which device
  platform TEXT DEFAULT 'unknown',        -- electron | pwa | browser
  -- Admin response
  status TEXT DEFAULT 'pending',          -- pending | reviewing | resolved | dismissed
  admin_response TEXT,                    -- admin's knowledge/instructions to push back
  resolved_at TIMESTAMPTZ,
  -- Dedup
  request_count INT DEFAULT 1,           -- how many times this topic was requested (dedup counter)
  last_requested_at TIMESTAMPTZ DEFAULT now(),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_kr_status ON knowledge_requests(status);
CREATE INDEX idx_kr_topic ON knowledge_requests(topic);
CREATE INDEX idx_kr_category ON knowledge_requests(category);
CREATE INDEX idx_kr_created ON knowledge_requests(created_at DESC);

-- RLS — allow anon insert (from JUMARI clients) and select (to pull resolved knowledge)
ALTER TABLE knowledge_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_kr" ON knowledge_requests
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_resolved" ON knowledge_requests
  FOR SELECT TO anon USING (status = 'resolved');
