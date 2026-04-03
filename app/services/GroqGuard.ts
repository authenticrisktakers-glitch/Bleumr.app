/**
 * GroqGuard — rate limiter, request queue, cache, and circuit breaker for Groq API
 *
 * Prevents account bans by enforcing:
 * - Max 2 concurrent requests
 * - Min 200ms between requests
 * - Max 5 requests per second (sliding window)
 * - Response caching (identical prompts reuse results)
 * - Circuit breaker (stops all requests if errors spike)
 * - Agent loop cap (max 10 chained calls)
 */

// ── Configuration ─────────────────────────────────────────
const MAX_CONCURRENT = 2;          // max parallel requests to Groq
const MIN_DELAY_MS = 200;          // min ms between requests
const MAX_PER_SECOND = 5;          // sliding window rate limit
const CACHE_TTL_MS = 5 * 60_000;  // cache responses for 5 minutes
const CACHE_MAX_ENTRIES = 50;      // max cached responses
const CIRCUIT_ERROR_THRESHOLD = 5; // errors before circuit opens
const CIRCUIT_WINDOW_MS = 30_000;  // error window
const CIRCUIT_COOLDOWN_MS = 15_000;// cooldown before retrying after circuit opens
const AGENT_LOOP_MAX = 10;         // max chained/recursive calls

// ── State ─────────────────────────────────────────────────
let activeRequests = 0;
let lastRequestTime = 0;
const requestTimestamps: number[] = [];  // sliding window for rate limit
const errorTimestamps: number[] = [];    // sliding window for circuit breaker
let circuitOpen = false;
let circuitOpenedAt = 0;
let agentLoopCount = 0;
let agentLoopResetTimer: ReturnType<typeof setTimeout> | null = null;

// Request queue
type QueueEntry = {
  execute: () => Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
};
const queue: QueueEntry[] = [];
let processing = false;

// Response cache — LRU eviction (most recently accessed entries survive)
const cache = new Map<string, { response: string; timestamp: number }>();

// ── Cache (LRU) ──────────────────────────────────────────

/** Generate a cache key from messages (only cache non-streaming short prompts) */
function cacheKey(messages: { role: string; content: any }[]): string {
  // Only cache if last user message is short (likely repeated question)
  const last = messages[messages.length - 1];
  const text = typeof last?.content === 'string' ? last.content : '';
  if (text.length > 300) return ''; // don't cache long prompts
  return messages.map(m => `${m.role}:${typeof m.content === 'string' ? m.content : '[complex]'}`).join('|');
}

export function getCachedResponse(messages: { role: string; content: any }[]): string | null {
  const key = cacheKey(messages);
  if (!key) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // LRU: move to end of Map (most recently accessed = last)
  cache.delete(key);
  cache.set(key, entry);
  return entry.response;
}

export function setCachedResponse(messages: { role: string; content: any }[], response: string): void {
  const key = cacheKey(messages);
  if (!key || response.length < 10) return;
  // LRU eviction: delete oldest (first entry in Map) when at capacity
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  // If key already exists, delete first to move to end (LRU position)
  cache.delete(key);
  cache.set(key, { response, timestamp: Date.now() });
}

// ── Circuit Breaker ───────────────────────────────────────

function recordError(): void {
  const now = Date.now();
  errorTimestamps.push(now);
  // Prune old errors outside window (splice instead of shift loop for O(1) vs O(n²))
  const cutoff = now - CIRCUIT_WINDOW_MS;
  let i = 0;
  while (i < errorTimestamps.length && errorTimestamps[i] < cutoff) i++;
  if (i > 0) errorTimestamps.splice(0, i);
  if (errorTimestamps.length >= CIRCUIT_ERROR_THRESHOLD && !circuitOpen) {
    circuitOpen = true;
    circuitOpenedAt = now;
    console.warn(`[GroqGuard] Circuit OPEN — ${errorTimestamps.length} errors in ${CIRCUIT_WINDOW_MS / 1000}s. Cooling down ${CIRCUIT_COOLDOWN_MS / 1000}s.`);
  }
}

function isCircuitOpen(): boolean {
  if (!circuitOpen) return false;
  if (Date.now() - circuitOpenedAt > CIRCUIT_COOLDOWN_MS) {
    circuitOpen = false;
    errorTimestamps.length = 0;
    console.log('[GroqGuard] Circuit CLOSED — resuming requests.');
    return false;
  }
  return true;
}

export function reportGroqError(): void {
  recordError();
}

export function reportGroqSuccess(): void {
  // A success after circuit was half-open confirms recovery
  if (errorTimestamps.length > 0) {
    errorTimestamps.length = 0;
  }
}

// ── Agent Loop Guard ──────────────────────────────────────

export function incrementAgentLoop(): boolean {
  agentLoopCount++;
  // Reset loop counter after 30s of inactivity
  if (agentLoopResetTimer) clearTimeout(agentLoopResetTimer);
  agentLoopResetTimer = setTimeout(() => { agentLoopCount = 0; }, 30_000);

  if (agentLoopCount > AGENT_LOOP_MAX) {
    console.warn(`[GroqGuard] Agent loop cap reached (${AGENT_LOOP_MAX}). Stopping.`);
    return false; // signal to stop
  }
  return true; // ok to continue
}

export function resetAgentLoop(): void {
  agentLoopCount = 0;
}

// ── Rate Limiter ──────────────────────────────────────────

/** Prune request timestamps older than 1 second (splice is O(1) amortized vs shift loop O(n²)) */
function pruneTimestamps(): void {
  const cutoff = Date.now() - 1000;
  let i = 0;
  while (i < requestTimestamps.length && requestTimestamps[i] < cutoff) i++;
  if (i > 0) requestTimestamps.splice(0, i);
}

function canSendNow(): boolean {
  if (isCircuitOpen()) return false;
  if (activeRequests >= MAX_CONCURRENT) return false;
  pruneTimestamps();
  if (requestTimestamps.length >= MAX_PER_SECOND) return false;
  const timeSinceLast = Date.now() - lastRequestTime;
  if (timeSinceLast < adaptiveDelayMs) return false;
  return true;
}

function waitForSlot(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (canSendNow()) {
        resolve();
      } else {
        setTimeout(check, 50); // check every 50ms
      }
    };
    check();
  });
}

// ── Queue Processor ───────────────────────────────────────

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    await waitForSlot();
    const entry = queue.shift();
    if (!entry) break;

    activeRequests++;
    lastRequestTime = Date.now();
    requestTimestamps.push(Date.now());

    try {
      await entry.execute();
      entry.resolve();
    } catch (err: any) {
      entry.reject(err);
    } finally {
      activeRequests--;
    }
  }

  processing = false;
}

// ── Public API ────────────────────────────────────────────

/**
 * Enqueue a Groq API call. The call will be rate-limited and queued.
 * Returns a promise that resolves when the call completes.
 */
export function enqueueGroqRequest(execute: () => Promise<void>): Promise<void> {
  // Check circuit breaker first
  if (isCircuitOpen()) {
    return Promise.reject(new Error('CIRCUIT_OPEN'));
  }

  return new Promise<void>((resolve, reject) => {
    queue.push({ execute, resolve, reject });
    processQueue();
  });
}

/**
 * Wrap a fetch call to Groq — handles rate limiting automatically.
 * For streaming calls, pass the entire stream handler as `execute`.
 */
// Adaptive delay — adjusted from Groq response headers
let adaptiveDelayMs = MIN_DELAY_MS;

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000; // 1s, 2s, 4s exponential backoff

export async function guardedGroqFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  if (isCircuitOpen()) {
    throw new Error('CIRCUIT_OPEN');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Wait for backoff on retries (exponential: 1s, 2s, 4s)
    if (attempt > 0) {
      const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.log(`[GroqGuard] Retry ${attempt}/${MAX_RETRIES} after ${Math.round(backoffMs)}ms`);
      await new Promise(r => setTimeout(r, backoffMs));
      // Re-check circuit between retries
      if (isCircuitOpen()) throw new Error('CIRCUIT_OPEN');
    }

    await waitForSlot();
    activeRequests++;
    lastRequestTime = Date.now();
    requestTimestamps.push(Date.now());

    let shouldRetry = false;
    try {
      const res = await fetch(url, init);
      if (res.ok) {
        reportGroqSuccess();
        const remaining = res.headers.get('x-ratelimit-remaining-requests');
        if (remaining !== null) {
          const rem = parseInt(remaining, 10);
          if (rem < 5) {
            adaptiveDelayMs = Math.min(2000, adaptiveDelayMs * 1.5);
          } else if (rem > 20) {
            adaptiveDelayMs = Math.max(MIN_DELAY_MS, adaptiveDelayMs * 0.8);
          }
        }
        return res;
      } else if (res.status === 429) {
        reportGroqError();
        const retryAfter = res.headers.get('retry-after');
        if (retryAfter) {
          adaptiveDelayMs = Math.min(5000, parseInt(retryAfter, 10) * 1000);
        } else {
          adaptiveDelayMs = Math.min(5000, adaptiveDelayMs * 2);
        }
        lastError = new Error(`Groq API rate limited (429)`);
        shouldRetry = true;
      } else if (res.status >= 500) {
        reportGroqError();
        lastError = new Error(`Groq API server error (${res.status})`);
        shouldRetry = true;
      } else {
        // 4xx non-429 — don't retry (bad request, auth error, etc.)
        return res;
      }
    } catch (err: any) {
      reportGroqError();
      lastError = err;
      shouldRetry = true;
    } finally {
      activeRequests--;
    }
    if (!shouldRetry) break;
  }

  // All retries exhausted
  throw lastError || new Error('Groq API request failed after retries');
}

// ── Cache Management ─────────────────────────────────────

/** Clear all cached responses (useful for admin/debug or after key rotation) */
export function clearGroqCache(): void {
  cache.clear();
  console.log('[GroqGuard] Response cache cleared.');
}

// ── Stats (for admin/debug) ───────────────────────────────

export function getGuardStats() {
  pruneTimestamps();
  return {
    activeRequests,
    queueLength: queue.length,
    requestsThisSecond: requestTimestamps.length,
    circuitOpen,
    circuitCooldownRemaining: circuitOpen ? Math.max(0, CIRCUIT_COOLDOWN_MS - (Date.now() - circuitOpenedAt)) : 0,
    agentLoopCount,
    cacheSize: cache.size,
    recentErrors: errorTimestamps.length,
  };
}
