-- Analytics tables for Bleumr admin dashboard

-- Track every AI API request
CREATE TABLE IF NOT EXISTS api_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  device_id text,
  tier text DEFAULT 'free',
  service text NOT NULL,          -- 'groq', 'gemini', 'pollinations', 'huggingface', 'duckduckgo'
  endpoint text,
  model text,
  action text,                     -- 'chat', 'vision', 'image_gen', 'search', 'follow_ups', 'tts'
  status text DEFAULT 'success',   -- 'success', 'error', 'timeout'
  error_message text,
  status_code int,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  created_at timestamptz DEFAULT now()
);

-- Track active sessions
CREATE TABLE IF NOT EXISTS active_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text UNIQUE NOT NULL,
  device_id text,
  tier text DEFAULT 'free',
  platform text,                   -- 'electron', 'pwa', 'browser'
  user_agent text,
  started_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  request_count int DEFAULT 0,
  error_count int DEFAULT 0
);

-- Enable RLS (service_role bypasses it, anon key can insert)
ALTER TABLE api_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- Allow inserts from anon key (client telemetry)
CREATE POLICY "Allow anon insert" ON api_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon insert" ON active_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON active_sessions FOR UPDATE USING (true) WITH CHECK (true);

-- Indexes for fast dashboard queries
CREATE INDEX idx_api_requests_created ON api_requests (created_at DESC);
CREATE INDEX idx_api_requests_session ON api_requests (session_id);
CREATE INDEX idx_api_requests_service ON api_requests (service);
CREATE INDEX idx_api_requests_status ON api_requests (status);
CREATE INDEX idx_active_sessions_last_seen ON active_sessions (last_seen_at DESC);
