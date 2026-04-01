/**
 * BrainService — JUMARI's centralized self-learning knowledge base
 *
 * How it works:
 *   1. Before any Groq call, queryBrain() checks for a matching answer
 *   2. If confidence + similarity are high enough → serve directly (no API call)
 *   3. After Groq responds, distillAndStore() extracts the Q&A and saves it
 *   4. Confidence rises with positive feedback, drops with negative
 *   5. Over time, more questions are answered from the brain, fewer from Groq
 *
 * All knowledge is centralized in Supabase — every user teaches JUMARI,
 * every user benefits from the collective knowledge.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aybwlypsrmnfogtnibho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YndseXBzcm1uZm9ndG5pYmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTM5NDQsImV4cCI6MjA5MDQ4OTk0NH0.wwwPoWskIIrKzJJhzgsL8W38WJ3G_FLz5D5iooExUu8';

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

// ─── Config (fetched from brain_config table) ────────────────────────────────
interface BrainConfig {
  min_confidence_to_serve: number;
  min_match_score: number;
  auto_approve_threshold: number;
  max_entries: number;
  learning_enabled: boolean;
  require_admin_review: boolean;
}

const DEFAULT_CONFIG: BrainConfig = {
  min_confidence_to_serve: 0.6,
  min_match_score: 0.4,
  auto_approve_threshold: 0.8,
  max_entries: 5000,
  learning_enabled: true,
  require_admin_review: false,
};

let config: BrainConfig = { ...DEFAULT_CONFIG };
let configLastFetched = 0;
const CONFIG_TTL = 5 * 60 * 1000; // 5 min

async function refreshConfig(): Promise<void> {
  if (Date.now() - configLastFetched < CONFIG_TTL) return;
  try {
    const { data } = await getClient().from('brain_config').select('key, value');
    if (data) {
      for (const row of data) {
        const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        if (row.key in config) (config as any)[row.key] = val;
      }
    }
    configLastFetched = Date.now();
  } catch {}
}

// Fetch on load
if (typeof window !== 'undefined') refreshConfig();

// ─── Stop words for normalization ────────────────────────────────────────────
const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must','can','could',
  'i','me','my','mine','we','us','our','you','your','yours','he','him','his','she','her',
  'it','its','they','them','their','this','that','these','those','what','which','who','whom',
  'how','when','where','why','if','then','than','but','and','or','not','no','so','very',
  'just','about','also','too','like','for','from','with','without','in','on','at','to','of',
  'by','up','out','off','over','under','again','further','into','through','during','before',
  'after','above','below','between','same','each','few','more','most','other','some','such',
  'only','own','than','all','both','any','here','there','now','please','tell','explain',
  'know','think','want','need','help','get','make','go','come','take','give','say','said',
]);

// ─── Question normalization ──────────────────────────────────────────────────
function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\w\s]/g, '')         // strip punctuation
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .sort()                          // alphabetical → "weather new york" = "new york weather"
    .join(' ')
    .slice(0, 200);
}

// ─── Tag extraction ──────────────────────────────────────────────────────────
function extractTags(text: string): string[] {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  const freq = new Map<string, number>();
  for (const w of words) {
    if (w.length > 2 && !STOP_WORDS.has(w)) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

// ─── Category detection ──────────────────────────────────────────────────────
function detectCategory(q: string): string {
  const lower = q.toLowerCase();
  if (/\b(code|function|class|import|export|react|javascript|typescript|python|html|css|api|debug|error|bug)\b/.test(lower)) return 'coding';
  if (/\b(bleumr|jumari|orbit|stellur|license|subscription|tier)\b/.test(lower)) return 'bleumr';
  if (/\b(create|write|story|poem|song|design|imagine|draw)\b/.test(lower)) return 'creative';
  if (/\b(what is|define|meaning|capital|population|who is|when was|how many|fact)\b/.test(lower)) return 'factual';
  if (/\b(can you|are you able|do you|feature|capability)\b/.test(lower)) return 'capability';
  return 'general';
}

// ─── Skip patterns (never learn from these) ──────────────────────────────────
function shouldSkipLearning(q: string): boolean {
  const lower = q.toLowerCase().trim();
  // Greetings
  if (/^(hi|hello|hey|yo|sup|what'?s? up|good morning|good night|gm|gn)\b/.test(lower)) return true;
  // Identity questions (context-dependent)
  if (/^(who are you|what are you|what'?s? your name)\b/.test(lower)) return true;
  // Commands / scheduling
  if (/^(open|navigate|go to|set reminder|remind me|schedule|timer)\b/.test(lower)) return true;
  // Image generation
  if (/\b(generate|create|make|draw).*(image|picture|photo|art)\b/.test(lower)) return true;
  // Too short
  if (lower.split(/\s+/).length < 3) return true;
  return false;
}

// ─── Refusal / garbage detection ─────────────────────────────────────────────
function isGarbage(response: string): boolean {
  if (response.length < 30) return true;
  if (response.length > 8000) return true;
  const lower = response.toLowerCase();
  // Refusals
  if (/i can'?t (help|assist|do that)|i'?m not able to|as an ai/i.test(lower)) return true;
  // Strong uncertainty
  if (/i'?m not (sure|certain)|i don'?t (know|have).*information/i.test(lower)) return true;
  // Repetition detection (same 20-char chunk appears 3+ times)
  const chunk = response.slice(0, 20);
  if ((response.match(new RegExp(chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 3) return true;
  return false;
}

// ─── Session/device helpers ──────────────────────────────────────────────────
function getSessionId(): string {
  return localStorage.getItem('orbit_session_id') || 'unknown';
}
function getDeviceId(): string {
  return localStorage.getItem('orbit_device_id') || 'unknown';
}

// Rate limit: max brain writes per session
let writeCount = 0;
const MAX_WRITES_PER_SESSION = 30;

// ─── Public API ──────────────────────────────────────────────────────────────

export interface BrainResult {
  id: string;
  answer: string;
  confidence: number;
  sim_score: number;
  source: string;
  category: string;
}

/**
 * Query JUMARI's brain for a matching answer.
 * Returns the best match if confidence and similarity thresholds are met.
 * Returns null if no match → caller should proceed with Groq.
 */
export async function queryBrain(question: string): Promise<BrainResult | null> {
  try {
    await refreshConfig();
    if (!config.learning_enabled) return null;
    if (shouldSkipLearning(question)) return null;

    const pattern = normalizeQuestion(question);
    if (pattern.length < 4) return null; // too little to match on

    const tags = extractTags(question);

    const { data, error } = await getClient().rpc('brain_search', {
      q_pattern: pattern,
      q_tags: tags,
      min_conf: config.min_confidence_to_serve,
      min_sim: config.min_match_score,
    });

    if (error || !data || data.length === 0) return null;

    const best = data[0];

    // Increment hit count (fire-and-forget)
    getClient()
      .from('brain_entries')
      .update({ hit_count: (best.hit_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', best.id)
      .then(() => {});

    return {
      id: best.id,
      answer: best.answer,
      confidence: best.confidence,
      sim_score: best.sim_score,
      source: best.source,
      category: best.category,
    };
  } catch {
    return null; // fail open — if brain errors, fall through to Groq
  }
}

/**
 * After Groq responds, distill the Q&A and store it in the brain.
 * Applies garbage filters. Deduplicates against existing entries.
 */
export async function distillAndStore(question: string, groqResponse: string): Promise<void> {
  try {
    await refreshConfig();
    if (!config.learning_enabled) return;
    if (writeCount >= MAX_WRITES_PER_SESSION) return;
    if (shouldSkipLearning(question)) return;
    if (isGarbage(groqResponse)) return;

    const pattern = normalizeQuestion(question);
    if (pattern.length < 4) return;

    // Check for near-duplicate
    const { data: existing } = await getClient().rpc('brain_search', {
      q_pattern: pattern,
      q_tags: [],
      min_conf: 0,    // check all entries, not just high-confidence
      min_sim: 0.7,   // high threshold for "same question"
    });

    if (existing && existing.length > 0) {
      // Duplicate — bump confidence on existing entry
      const entry = existing[0];
      const newConf = Math.min(1.0, (entry.confidence || 0.5) + 0.05);
      await getClient()
        .from('brain_entries')
        .update({
          confidence: newConf,
          hit_count: (entry.hit_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id);
      return;
    }

    // New entry
    const tags = extractTags(question + ' ' + groqResponse);
    const category = detectCategory(question);
    const status = config.require_admin_review ? 'pending_review' : 'active';

    await getClient().from('brain_entries').insert({
      question_pattern: pattern,
      question_raw: question.slice(0, 500),
      answer: groqResponse.slice(0, 4000),
      category,
      tags,
      confidence: 0.5,
      source: 'groq_distill',
      status,
      created_by_session: getSessionId(),
      created_by_device: getDeviceId(),
    });

    writeCount++;
  } catch {
    // Fail silently — learning is best-effort
  }
}

/**
 * Report user feedback on a brain-served answer.
 */
export async function reportFeedback(entryId: string, signal: 'thumbs_up' | 'thumbs_down' | 'used_groq_after'): Promise<void> {
  try {
    // Record feedback
    await getClient().from('brain_feedback').insert({
      entry_id: entryId,
      session_id: getSessionId(),
      device_id: getDeviceId(),
      signal,
    });

    // Adjust confidence
    const confDelta = signal === 'thumbs_up' ? 0.1 : signal === 'thumbs_down' ? -0.15 : -0.2;

    // Read current, then update (can't do atomic increment with anon key, but close enough)
    const { data } = await getClient()
      .from('brain_entries')
      .select('confidence, thumbs_up, thumbs_down')
      .eq('id', entryId)
      .single();

    if (data) {
      const newConf = Math.max(0, Math.min(1.0, (data.confidence || 0.5) + confDelta));
      const update: any = { confidence: newConf, updated_at: new Date().toISOString() };
      if (signal === 'thumbs_up') update.thumbs_up = (data.thumbs_up || 0) + 1;
      if (signal === 'thumbs_down') update.thumbs_down = (data.thumbs_down || 0) + 1;

      await getClient().from('brain_entries').update(update).eq('id', entryId);
    }
  } catch {}
}

/**
 * Admin-push: create a brain entry directly (high confidence, pre-approved).
 */
export async function teachBrain(question: string, answer: string, category?: string): Promise<boolean> {
  try {
    const pattern = normalizeQuestion(question);
    const tags = extractTags(question + ' ' + answer);
    await getClient().from('brain_entries').insert({
      question_pattern: pattern,
      question_raw: question.slice(0, 500),
      answer: answer.slice(0, 4000),
      category: category || detectCategory(question),
      tags,
      confidence: 0.9,
      source: 'admin_push',
      status: 'active',
      reviewed_by_admin: true,
      created_by_session: getSessionId(),
      created_by_device: getDeviceId(),
    });
    return true;
  } catch {
    return false;
  }
}

export { refreshConfig as refreshBrainConfig };
