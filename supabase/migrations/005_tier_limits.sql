-- Tier rate limits — admin-configurable daily request caps per tier
CREATE TABLE IF NOT EXISTS tier_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tier text UNIQUE NOT NULL CHECK (tier IN ('free', 'pro', 'stellur')),
  daily_limit int NOT NULL DEFAULT 0,       -- 0 = unlimited
  updated_at timestamptz DEFAULT now()
);

-- Seed defaults
INSERT INTO tier_limits (tier, daily_limit) VALUES
  ('free', 20),
  ('pro', 200),
  ('stellur', 0)    -- 0 = unlimited
ON CONFLICT (tier) DO NOTHING;

-- RLS: service_role can do everything, anon can read (client needs to fetch limits)
ALTER TABLE tier_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_tier_limits" ON tier_limits FOR SELECT TO anon USING (true);
