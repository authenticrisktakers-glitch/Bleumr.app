-- Device Usage — per-device daily request tracking
-- Survives PWA uninstall because fingerprint is hardware-based
-- Server is source of truth — localStorage counts are just optimistic cache

CREATE TABLE IF NOT EXISTS device_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint text NOT NULL,
  tier text NOT NULL DEFAULT 'free',
  date date NOT NULL DEFAULT CURRENT_DATE,
  request_count int NOT NULL DEFAULT 0,
  last_request_at timestamptz DEFAULT now(),

  -- One row per device per day
  UNIQUE(device_fingerprint, date)
);

-- Fast lookup for rate limit checks
CREATE INDEX IF NOT EXISTS idx_device_usage_lookup
  ON device_usage(device_fingerprint, date);

-- Admin queries by tier
CREATE INDEX IF NOT EXISTS idx_device_usage_tier
  ON device_usage(tier, date);

-- RLS
ALTER TABLE device_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_usage_open" ON device_usage
  FOR ALL USING (true) WITH CHECK (true);
