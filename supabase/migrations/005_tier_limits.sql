-- Tier rate limits — admin-configurable central daily request caps per tier
-- When a tier exceeds its limit, ALL users in that tier enter cooldown
CREATE TABLE IF NOT EXISTS tier_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tier text UNIQUE NOT NULL CHECK (tier IN ('free', 'pro', 'stellur')),
  daily_limit int NOT NULL DEFAULT 0,              -- 0 = unlimited
  cooldown_minutes int NOT NULL DEFAULT 10,        -- how long cooldown lasts
  cooldown_until timestamptz,                      -- when cooldown expires (null = not in cooldown)
  is_cooled_down boolean NOT NULL DEFAULT false,   -- quick check flag
  updated_at timestamptz DEFAULT now()
);

-- Seed defaults
INSERT INTO tier_limits (tier, daily_limit, cooldown_minutes) VALUES
  ('free', 20, 10),
  ('pro', 200, 10),
  ('stellur', 0, 10)    -- 0 = unlimited
ON CONFLICT (tier) DO NOTHING;

-- RLS: service_role can do everything, anon can read (client needs to fetch limits + cooldown state)
ALTER TABLE tier_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_tier_limits" ON tier_limits FOR SELECT TO anon USING (true);
