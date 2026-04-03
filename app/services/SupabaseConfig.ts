/**
 * SupabaseConfig — Single source of truth for Supabase credentials.
 *
 * Every service that talks to Supabase imports from here.
 * No more hardcoded URLs and keys scattered across 6+ files.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://aybwlypsrmnfogtnibho.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YndseXBzcm1uZm9ndG5pYmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTM5NDQsImV4cCI6MjA5MDQ4OTk0NH0.wwwPoWskIIrKzJJhzgsL8W38WJ3G_FLz5D5iooExUu8';

/** Standard headers for raw REST calls to Supabase */
export const SUPABASE_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
} as const;

/** Shared singleton Supabase client */
let _client: SupabaseClient | null = null;
export function getSupabaseClient(): SupabaseClient {
  if (!_client) _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _client;
}
