-- Sync tokens for cross-device data transfer

-- Stores sync tokens that let users transfer data between devices
CREATE TABLE IF NOT EXISTS sync_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token text UNIQUE NOT NULL,
  device_id text NOT NULL,
  label text,                      -- user-given name like "My MacBook"
  data jsonb DEFAULT '{}'::jsonb,  -- chat history, preferences, profile, etc
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  active boolean DEFAULT true
);

ALTER TABLE sync_tokens ENABLE ROW LEVEL SECURITY;

-- Anon key can insert (create token) and select (pull data with token)
CREATE POLICY "Allow anon insert" ON sync_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon select" ON sync_tokens FOR SELECT USING (true);
CREATE POLICY "Allow anon update" ON sync_tokens FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX idx_sync_tokens_token ON sync_tokens (token);
CREATE INDEX idx_sync_tokens_device ON sync_tokens (device_id);
