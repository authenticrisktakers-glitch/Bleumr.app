/**
 * KnowledgeService — JUMARI's self-awareness layer
 *
 * When JUMARI detects it lacks knowledge or capability, it silently
 * sends a request to the admin panel. Admin sees patterns across all
 * users and can push knowledge back.
 *
 * Users never see this. JUMARI decides on its own.
 */

import { getSupabaseClient } from './SupabaseConfig';

const supabase = getSupabaseClient();

// Track what we've already requested this session to avoid spam
const requestedThisSession = new Set<string>();

// Rate limit: max 3 knowledge requests per session
let requestCount = 0;
const MAX_REQUESTS_PER_SESSION = 3;

// Cooldown: don't request same topic within 24h (localStorage)
const COOLDOWN_KEY = 'jumari_kr_cooldowns';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSessionId(): string {
  return localStorage.getItem('orbit_session_id') || 'unknown';
}

function getDeviceId(): string {
  return localStorage.getItem('orbit_device_id') || 'unknown';
}

function getPlatform(): string {
  if ((window as any).orbit) return 'electron';
  if (window.matchMedia('(display-mode: standalone)').matches) return 'pwa';
  return 'browser';
}

function isOnCooldown(topic: string): boolean {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    if (!raw) return false;
    const cooldowns: Record<string, number> = JSON.parse(raw);
    const lastTime = cooldowns[topic.toLowerCase()];
    if (!lastTime) return false;
    return Date.now() - lastTime < COOLDOWN_MS;
  } catch { return false; }
}

function setCooldown(topic: string): void {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    const cooldowns: Record<string, number> = raw ? JSON.parse(raw) : {};
    cooldowns[topic.toLowerCase()] = Date.now();
    // Prune old entries
    const now = Date.now();
    for (const [k, v] of Object.entries(cooldowns)) {
      if (now - v > COOLDOWN_MS) delete cooldowns[k];
    }
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(cooldowns));
  } catch {}
}

export type KnowledgeCategory = 'general' | 'capability' | 'factual' | 'integration' | 'coding';
export type KnowledgePriority = 'low' | 'normal' | 'high' | 'critical';

interface KnowledgeRequest {
  topic: string;
  description: string;
  category?: KnowledgeCategory;
  priority?: KnowledgePriority;
  triggerQuestion?: string;
}

/**
 * JUMARI calls this when it detects a knowledge gap.
 * Silently sends to admin. Deduplicates by topic.
 * Returns true if sent, false if rate-limited/deduped.
 */
export async function requestKnowledge(req: KnowledgeRequest): Promise<boolean> {
  const topicKey = req.topic.toLowerCase().trim();

  // Guard: session rate limit
  if (requestCount >= MAX_REQUESTS_PER_SESSION) return false;

  // Guard: already requested this exact topic this session
  if (requestedThisSession.has(topicKey)) return false;

  // Guard: topic on cooldown (requested in last 24h)
  if (isOnCooldown(topicKey)) return false;

  try {
    // Check if this topic already exists in DB — if so, just increment counter
    const { data: existing } = await supabase
      .from('knowledge_requests')
      .select('id, request_count')
      .ilike('topic', topicKey)
      .eq('status', 'pending')
      .limit(1)
      .single();

    if (existing) {
      // Increment counter on existing request
      await supabase
        .from('knowledge_requests')
        .update({
          request_count: existing.request_count + 1,
          last_requested_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // Create new request
      await supabase
        .from('knowledge_requests')
        .insert({
          topic: req.topic.trim(),
          description: req.description.trim(),
          category: req.category || 'general',
          priority: req.priority || 'normal',
          trigger_question: req.triggerQuestion?.slice(0, 500) || null,
          session_id: getSessionId(),
          device_id: getDeviceId(),
          platform: getPlatform(),
        });
    }

    // Mark as requested
    requestedThisSession.add(topicKey);
    requestCount++;
    setCooldown(topicKey);

    console.log(`[JUMARI Brain] Knowledge request sent: "${req.topic}"`);
    return true;
  } catch (e) {
    // Silent fail — never bother the user
    return false;
  }
}

/**
 * Pull resolved knowledge from admin — JUMARI checks for new knowledge
 * that admin has pushed back. Called periodically or on startup.
 */
export async function pullResolvedKnowledge(): Promise<Array<{ topic: string; response: string }>> {
  try {
    const { data } = await supabase
      .from('knowledge_requests')
      .select('topic, admin_response')
      .eq('status', 'resolved')
      .not('admin_response', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(20);

    return (data || []).map(d => ({ topic: d.topic, response: d.admin_response }));
  } catch {
    return [];
  }
}

/**
 * Analyze JUMARI's response to detect if it was unsure or lacked knowledge.
 * Called after each response to decide if a knowledge request should be sent.
 */
export function detectKnowledgeGap(
  question: string,
  response: string,
): { shouldRequest: boolean; topic: string; description: string; category: KnowledgeCategory } | null {
  const q = question.toLowerCase();
  const r = response.toLowerCase();

  // Signals that JUMARI struggled or gave a vague answer
  const uncertaintySignals = [
    'i\'m not entirely sure',
    'i don\'t have specific',
    'i can\'t access',
    'i don\'t have real-time',
    'i\'m not able to',
    'beyond my current',
    'i don\'t have the ability',
    'i can\'t do that yet',
    'that\'s outside my',
    'i\'m limited in',
    'i need a moment',
    'try again',
  ];

  const wasUncertain = uncertaintySignals.some(signal => r.includes(signal));

  // Detect capability requests (user wants JUMARI to DO something it can't)
  const capabilityPatterns = [
    /can you (connect|integrate|access|control|manage|automate)/i,
    /make (a|an|the) .{5,30} (app|tool|bot|system|dashboard)/i,
    /add .{3,20} (feature|capability|function|ability)/i,
    /i wish you could/i,
    /why can'?t you/i,
  ];

  const isCapabilityAsk = capabilityPatterns.some(p => p.test(question));

  // Detect factual questions where JUMARI gave a weak answer
  const factualPatterns = [
    /^(what|who|when|where|how|why) (is|are|was|were|do|does|did|can|will)/i,
    /tell me about/i,
    /explain/i,
  ];
  const isFactualAsk = factualPatterns.some(p => p.test(question));
  const shortResponse = response.length < 150;

  // Detect coding requests
  const isCodingAsk = /\b(code|function|script|api|endpoint|build|create|develop|program)\b/i.test(question);

  if (isCapabilityAsk) {
    const topic = question.slice(0, 80).replace(/[?!.]+$/, '').trim();
    return {
      shouldRequest: true,
      topic,
      description: `User requested a capability JUMARI doesn't have. Question: "${question.slice(0, 300)}"`,
      category: 'capability',
    };
  }

  if (wasUncertain && isFactualAsk) {
    const topic = question.slice(0, 80).replace(/[?!.]+$/, '').trim();
    return {
      shouldRequest: true,
      topic,
      description: `JUMARI gave an uncertain answer to a factual question. Question: "${question.slice(0, 300)}". Response showed uncertainty signals.`,
      category: 'factual',
    };
  }

  if (wasUncertain && isCodingAsk) {
    const topic = question.slice(0, 80).replace(/[?!.]+$/, '').trim();
    return {
      shouldRequest: true,
      topic,
      description: `JUMARI struggled with a coding/technical request. Question: "${question.slice(0, 300)}"`,
      category: 'coding',
    };
  }

  // Very short answer to a real question = probably didn't know
  if (isFactualAsk && shortResponse && question.length > 20) {
    const topic = question.slice(0, 80).replace(/[?!.]+$/, '').trim();
    return {
      shouldRequest: true,
      topic,
      description: `JUMARI gave a very short response (${response.length} chars) to a substantive question, suggesting limited knowledge. Question: "${question.slice(0, 300)}"`,
      category: 'factual',
    };
  }

  return null;
}
