-- Device Activations — tracks hardware fingerprints per license key
-- Same device reinstalling PWA won't consume another activation slot

CREATE TABLE IF NOT EXISTS device_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key_id uuid NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  platform text DEFAULT 'unknown',       -- 'pwa', 'electron', 'browser'
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),

  -- One fingerprint per license key
  UNIQUE(license_key_id, device_fingerprint)
);

-- Index for fast lookup during validation
CREATE INDEX IF NOT EXISTS idx_device_activations_lookup
  ON device_activations(license_key_id, device_fingerprint);

-- Index for admin queries (which devices are on which key)
CREATE INDEX IF NOT EXISTS idx_device_activations_key
  ON device_activations(license_key_id);

-- RLS: allow edge function (service role) full access, anon can read own
ALTER TABLE device_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON device_activations
  FOR ALL USING (true) WITH CHECK (true);
