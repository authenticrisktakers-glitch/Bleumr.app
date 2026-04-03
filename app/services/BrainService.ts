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

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './SupabaseConfig';

function getClient(): SupabaseClient {
  return getSupabaseClient();
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

// ─── Groq training constants ─────────────────────────────────────────────────
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const TEACHER_MODEL = 'llama-3.3-70b-versatile'; // best quality for distillation

const TEACHER_PROMPT = `You are a knowledge distillation engine. Your job is to extract clean, reusable knowledge from a conversation.

Given a USER QUESTION and an AI RESPONSE, produce a JSON object with:
- "answer": A clean, standalone, factual answer (no conversational fluff, no "I think", no "Sure!", no filler). This answer should work for anyone asking a similar question in the future. 200-800 words max.
- "tags": Array of 5-8 lowercase keyword tags for search matching.
- "category": One of: general, factual, coding, capability, creative, bleumr
- "quality": float 0.0-1.0 rating of how reusable/factual this knowledge is. Rate LOW (< 0.3) if the answer is opinion-based, time-sensitive, too personal, or vague. Rate HIGH (> 0.7) if it's factual, evergreen, and universally useful.
- "skip": boolean — true if this Q&A should NOT be stored (greetings, personal questions, time-sensitive data, pure opinion, commands)

ONLY output the JSON. No markdown, no explanation.`;

/**
 * GROQ TRAINING LOOP — the core learning mechanism.
 *
 * After Groq answers a user, this function:
 * 1. Sends the Q&A to Groq as a "teacher" call
 * 2. Groq distills it into clean, reusable knowledge
 * 3. Stores the distilled knowledge (NOT the raw conversational response)
 * 4. Deduplicates against existing entries
 *
 * This means brain entries are HIGHER QUALITY than raw chat responses.
 * Groq literally teaches JUMARI what to remember.
 */
export async function distillAndStore(question: string, groqResponse: string, apiKey?: string): Promise<void> {
  try {
    await refreshConfig();
    if (!config.learning_enabled) return;
    if (writeCount >= MAX_WRITES_PER_SESSION) return;
    if (shouldSkipLearning(question)) return;
    if (isGarbage(groqResponse)) return;

    const pattern = normalizeQuestion(question);
    if (pattern.length < 4) return;

    // Check for near-duplicate first (cheap — no API call)
    const { data: existing } = await getClient().rpc('brain_search', {
      q_pattern: pattern,
      q_tags: [],
      min_conf: 0,
      min_sim: 0.7,
    });

    if (existing && existing.length > 0) {
      // Duplicate — bump confidence on existing entry instead of creating new
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

    // ── Groq Teacher Call — distill knowledge ──
    // If we have an API key, ask Groq to distill. Otherwise fall back to raw storage.
    let distilled: { answer: string; tags: string[]; category: string; quality: number; skip: boolean } | null = null;

    const key = apiKey || await getApiKeyFromStorage();
    if (key) {
      try {
        const teacherRes = await fetch(GROQ_ENDPOINT, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: TEACHER_MODEL,
            messages: [
              { role: 'system', content: TEACHER_PROMPT },
              { role: 'user', content: `USER QUESTION:\n${question.slice(0, 500)}\n\nAI RESPONSE:\n${groqResponse.slice(0, 3000)}` },
            ],
            stream: false,
            max_completion_tokens: 1024,
            temperature: 0.2, // low temp for factual distillation
          }),
        });

        if (teacherRes.ok) {
          const teacherData = await teacherRes.json();
          const raw = teacherData.choices?.[0]?.message?.content?.trim();
          if (raw) {
            // Parse JSON — Groq might wrap in ```json blocks
            const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
            try {
              distilled = JSON.parse(jsonStr);
            } catch {
              // Try extracting JSON from within the response
              const match = jsonStr.match(/\{[\s\S]*\}/);
              if (match) distilled = JSON.parse(match[0]);
            }
          }
        }
      } catch {} // teacher call failed — fall back to raw
    }

    // If teacher said skip, respect it
    if (distilled?.skip) return;

    // Use distilled knowledge if available, otherwise fall back to raw
    const finalAnswer = distilled?.answer || groqResponse.slice(0, 4000);
    const finalTags = distilled?.tags || extractTags(question + ' ' + groqResponse);
    const finalCategory = distilled?.category || detectCategory(question);
    const qualityBoost = distilled?.quality || 0;

    // Quality gate — if Groq rated it below 0.3, don't store
    if (distilled && qualityBoost < 0.3) return;

    // Initial confidence: 0.5 base + quality bonus (max 0.15)
    // High-quality distilled entries start closer to serving threshold
    const initialConfidence = Math.min(0.75, 0.5 + (qualityBoost > 0.7 ? 0.15 : qualityBoost > 0.5 ? 0.08 : 0));
    const status = config.require_admin_review ? 'pending_review' : 'active';
    const source = distilled ? 'groq_trained' : 'groq_distill';

    await getClient().from('brain_entries').insert({
      question_pattern: pattern,
      question_raw: question.slice(0, 500),
      answer: finalAnswer.slice(0, 4000),
      category: finalCategory,
      tags: finalTags,
      confidence: initialConfidence,
      source,
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
 * Consolidation — use Groq to merge and improve existing brain entries.
 * Called from admin panel or on a schedule. Takes low-confidence or similar
 * entries and asks Groq to produce one clean, improved version.
 */
export async function consolidateEntries(entryIds: string[], apiKey: string): Promise<boolean> {
  try {
    const { data: entries } = await getClient()
      .from('brain_entries')
      .select('*')
      .in('id', entryIds);

    if (!entries || entries.length < 2) return false;

    const entrySummary = entries.map((e: any) =>
      `Q: ${e.question_raw}\nA: ${e.answer?.slice(0, 500)}\nConfidence: ${e.confidence}\nHits: ${e.hit_count}`
    ).join('\n---\n');

    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TEACHER_MODEL,
        messages: [
          { role: 'system', content: `You are merging similar knowledge entries into one superior entry. Given multiple Q&A pairs about the same topic, produce ONE JSON object with: "question" (best version of the question), "answer" (comprehensive merged answer, 200-800 words), "tags" (5-8 keywords), "category" (general/factual/coding/capability/creative/bleumr). ONLY output JSON.` },
          { role: 'user', content: entrySummary },
        ],
        stream: false,
        max_completion_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return false;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return false;

    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    const merged = JSON.parse(jsonStr.match(/\{[\s\S]*\}/)?.[0] || jsonStr);

    // Archive old entries
    for (const e of entries) {
      await getClient()
        .from('brain_entries')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', e.id);
    }

    // Create merged entry with boosted confidence
    const bestConf = Math.max(...entries.map((e: any) => e.confidence || 0));
    const totalHits = entries.reduce((s: number, e: any) => s + (e.hit_count || 0), 0);

    await getClient().from('brain_entries').insert({
      question_pattern: normalizeQuestion(merged.question || entries[0].question_raw),
      question_raw: (merged.question || entries[0].question_raw).slice(0, 500),
      answer: merged.answer.slice(0, 4000),
      category: merged.category || entries[0].category,
      tags: merged.tags || entries[0].tags,
      confidence: Math.min(1.0, bestConf + 0.1),
      hit_count: totalHits,
      source: 'groq_trained',
      status: 'active',
      reviewed_by_admin: true,
      parent_id: entries[0].id, // link to first entry for history
    });

    return true;
  } catch {
    return false;
  }
}

/** Helper — get stored API key for background teacher calls */
async function getApiKeyFromStorage(): Promise<string | null> {
  try {
    // Try SecureStorage first (Electron), then localStorage fallback
    const key = localStorage.getItem('orbit_api_key_raw') ||
                localStorage.getItem('bleumr_pwa_keys_v3');
    if (key) {
      try {
        const parsed = JSON.parse(key);
        return parsed.groq || parsed.apiKey || null;
      } catch {
        return key; // raw string
      }
    }
    // Check SecureStorage wrapper
    if ((window as any).orbit?.storage?.getSecure) {
      return await (window as any).orbit.storage.getSecure('orbit_api_key');
    }
  } catch {}
  return null;
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

      // If heavily downvoted (3+ thumbs_down), flag for review
      if (signal === 'thumbs_down' && (data.thumbs_down || 0) + 1 >= 3) {
        await getClient().from('brain_entries').update({
          status: 'needs_review',
          updated_at: new Date().toISOString(),
        }).eq('id', entryId);
        console.log(`[BrainService] Entry ${entryId} flagged for review — ${(data.thumbs_down || 0) + 1} downvotes`);
      }
    }
  } catch (e: any) {
    console.warn('[BrainService] Feedback recording failed:', e.message);
  }
}

/**
 * Get feedback analytics — used by consciousness daemon to understand quality trends.
 * Returns aggregate stats on which categories users like/dislike.
 */
export async function getFeedbackAnalytics(): Promise<{
  totalUp: number; totalDown: number;
  byCategory: Record<string, { up: number; down: number; ratio: number }>;
  worstEntries: { id: string; question: string; downvotes: number }[];
} | null> {
  try {
    // Entries with most negative feedback
    const { data: worst } = await getClient()
      .from('brain_entries')
      .select('id, question_raw, thumbs_down, thumbs_up, category')
      .gt('thumbs_down', 0)
      .order('thumbs_down', { ascending: false })
      .limit(10);

    if (!worst) return null;

    let totalUp = 0, totalDown = 0;
    const byCategory: Record<string, { up: number; down: number; ratio: number }> = {};

    // Aggregate all entries with any feedback
    const { data: all } = await getClient()
      .from('brain_entries')
      .select('category, thumbs_up, thumbs_down')
      .or('thumbs_up.gt.0,thumbs_down.gt.0');

    for (const entry of all || []) {
      const cat = entry.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = { up: 0, down: 0, ratio: 0 };
      byCategory[cat].up += entry.thumbs_up || 0;
      byCategory[cat].down += entry.thumbs_down || 0;
      totalUp += entry.thumbs_up || 0;
      totalDown += entry.thumbs_down || 0;
    }

    // Calculate ratios
    for (const cat of Object.keys(byCategory)) {
      const { up, down } = byCategory[cat];
      byCategory[cat].ratio = up + down > 0 ? up / (up + down) : 0;
    }

    return {
      totalUp,
      totalDown,
      byCategory,
      worstEntries: worst.map(w => ({
        id: w.id,
        question: w.question_raw,
        downvotes: w.thumbs_down || 0,
      })),
    };
  } catch {
    return null;
  }
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
