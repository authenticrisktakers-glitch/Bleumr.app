-- Add note column to license_keys for admin annotations
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS note text;
