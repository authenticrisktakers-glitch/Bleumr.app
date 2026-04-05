/**
 * UsageBudget — Solar Energy (SE) token tracking system.
 *
 * Tracks REAL Groq API token usage (prompt_tokens + completion_tokens) under
 * the hood, but presents usage to the user as "Solar Energy" (SE).
 *
 *   1 SE = 1,000 tokens
 *
 * DAILY TOKEN BUDGETS (profitable per tier):
 *   Free:     50,000 tokens/day  (50 SE)   — ~$1.05/mo cost, revenue $0 (loss leader)
 *   Pro:     300,000 tokens/day (300 SE)    — ~$6.30/mo cost, revenue $9/mo
 *   Stellur: 1,000,000 tokens/day (1000 SE) — ~$20.70/mo cost, revenue $25/mo
 *
 * Two recording paths:
 *   1. recordTokens(prompt, completion, action?) — record REAL token counts from API response
 *   2. consume(action, tier) — FALLBACK using estimated token costs when real counts unavailable
 *
 * All user-facing display values are in Solar Energy units (tokens / 1000).
 */

// ── Estimated tokens per action (for pre-flight canAfford checks) ───────────

export type UsageAction =
  | 'chat'            // Normal chat message
  | 'chat_8b'         // Chat on 8B model (cheaper)
  | 'code_bleu'       // Code Bleu tool call iteration
  | 'code_agent'      // Code Bleu sub-agent (FileScout, Lint, etc.)
  | 'orbit_cloud'     // Orbit check using cloud AI
  | 'orbit_local'     // Orbit check using local AI (free)
  | 'mission_team'    // Mission Team research task
  | 'image_gen'       // Image generation (Pollinations -- free)
  | 'image_analysis'  // Vision model
  | 'voice'           // Voice chat round (TTS + STT + response)
  | 'web_designer'    // Web Designer generation
  | 'browser_agent'   // Browser Agent step
  | 'game_gen'        // BleuBaseGG frame generation
  | 'web_search'      // Web search (DDG -- free)
  | 'follow_up';      // Follow-up question generation

/**
 * Estimated token cost per action.
 * Used for pre-flight canAfford() checks before an API call is made.
 * When the real token count comes back from the API, use recordTokens() instead.
 */
export const ESTIMATED_TOKENS: Record<UsageAction, number> = {
  chat:           4400,   // ~4K input + 400 output
  chat_8b:        2200,   // smaller model
  code_bleu:      6000,   // tools + context
  code_agent:     3000,   // sub-agent
  orbit_cloud:    4000,   // system prompt + search + response
  orbit_local:    0,      // free — runs locally
  mission_team:   13000,  // 3 sequential calls
  image_gen:      0,      // Pollinations free API
  image_analysis: 3000,   // vision model
  voice:          4400,   // Groq + Deepgram TTS
  web_designer:   5000,   // code generation
  browser_agent:  5000,   // per autonomous step
  game_gen:       0,      // free
  web_search:     0,      // DDG free
  follow_up:      1000,   // small call for suggestions
};

// Backward compat alias — old code may reference CREDIT_COSTS
export const CREDIT_COSTS = ESTIMATED_TOKENS;

// ── Daily token budgets per tier ─────────────────────────────────────────────

export const DAILY_TOKEN_BUDGETS: Record<string, number> = {
  free:     50_000,     //  50 SE — ~$1.05/mo cost, loss leader
  pro:     300_000,     // 300 SE — ~$6.30/mo cost, revenue $9/mo
  stellur: 1_000_000,   // 1000 SE — ~$20.70/mo cost, revenue $25/mo
};

// Backward compat alias
export const DAILY_BUDGETS = DAILY_TOKEN_BUDGETS;

// ── Solar Energy conversion ──────────────────────────────────────────────────

const TOKENS_PER_SE = 1000;

function tokensToSE(tokens: number): number {
  return Math.round((tokens / TOKENS_PER_SE) * 10) / 10; // 1 decimal place
}

function seToTokens(se: number): number {
  return se * TOKENS_PER_SE;
}

// ── Bonus packs (purchasable top-ups in SE) ──────────────────────────────────

export const BONUS_PACKS = [
  { id: 'pack_50',  se: 50,  tokens: 50_000,  price: '$1.99',  cents: 199  },
  { id: 'pack_250', se: 250, tokens: 250_000, price: '$7.99',  cents: 799  },
  { id: 'pack_750', se: 750, tokens: 750_000, price: '$19.99', cents: 1999 },
];

// Backward compat alias
export const CREDIT_PACKS = BONUS_PACKS;

// ── Storage keys ─────────────────────────────────────────────────────────────

const BUDGET_KEY = 'bleumr_usage_budget';
const BONUS_KEY = 'bleumr_bonus_credits';

interface BudgetRecord {
  date: string;                                    // YYYY-MM-DD
  tokensUsed: number;                              // total tokens consumed today
  breakdown: Partial<Record<UsageAction, number>>; // tokens per action type
  apiCalls: number;                                // total API calls today
}

interface BonusRecord {
  tokens: number;       // remaining purchased bonus tokens
  lastPurchase?: string; // ISO date
}

// ── Helper ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ── The service ──────────────────────────────────────────────────────────────

class UsageBudgetService {

  // ── Internal state ────────────────────────────────────────────────────────

  private _getBudget(): BudgetRecord {
    try {
      const raw = localStorage.getItem(BUDGET_KEY);
      if (!raw) return { date: todayStr(), tokensUsed: 0, breakdown: {}, apiCalls: 0 };
      const data = JSON.parse(raw);

      // Reset if new day
      if (data.date !== todayStr()) {
        return { date: todayStr(), tokensUsed: 0, breakdown: {}, apiCalls: 0 };
      }

      // Migration from old credit-based format: if `used` exists but `tokensUsed` does not
      if (data.used !== undefined && data.tokensUsed === undefined) {
        return { date: todayStr(), tokensUsed: 0, breakdown: {}, apiCalls: 0 };
      }

      return data as BudgetRecord;
    } catch {
      return { date: todayStr(), tokensUsed: 0, breakdown: {}, apiCalls: 0 };
    }
  }

  private _saveBudget(record: BudgetRecord) {
    try {
      localStorage.setItem(BUDGET_KEY, JSON.stringify(record));
    } catch { /* localStorage full or unavailable */ }
  }

  private _getBonus(): BonusRecord {
    try {
      const raw = localStorage.getItem(BONUS_KEY);
      if (!raw) return { tokens: 0 };
      const data = JSON.parse(raw);

      // Migration from old credit-based format
      if (data.credits !== undefined && data.tokens === undefined) {
        return { tokens: 0 };
      }

      return data as BonusRecord;
    } catch {
      return { tokens: 0 };
    }
  }

  private _saveBonus(record: BonusRecord) {
    try {
      localStorage.setItem(BONUS_KEY, JSON.stringify(record));
    } catch { /* localStorage full or unavailable */ }
  }

  // ── Core: Record REAL token usage from API responses ────────────────────

  /**
   * Record actual token usage from a Groq API response.
   * This is the PRIMARY recording method -- always prefer this over consume().
   *
   * @param promptTokens - tokens used for the prompt/input
   * @param completionTokens - tokens used for the completion/output
   * @param action - optional action type for breakdown tracking
   */
  recordTokens(promptTokens: number, completionTokens: number, action?: UsageAction): void {
    const totalTokens = promptTokens + completionTokens;
    if (totalTokens <= 0) return;

    const record = this._getBudget();
    record.tokensUsed += totalTokens;
    record.apiCalls += 1;

    if (action) {
      record.breakdown[action] = (record.breakdown[action] || 0) + totalTokens;
    }

    record.date = todayStr();
    this._saveBudget(record);
    this._notify();
  }

  // ── Core: Pre-flight check ────────────────────────────────────────────────

  /**
   * Check if an action is affordable based on estimated token cost.
   * Returns { allowed, cost, remaining, reason? }
   *
   * `cost` and `remaining` are in TOKENS (not SE) for internal consistency.
   * The reason string uses SE for user-facing messaging.
   */
  canAfford(action: UsageAction, tier: string): {
    allowed: boolean;
    cost: number;
    remaining: number;
    reason?: string;
  } {
    const cost = ESTIMATED_TOKENS[action] ?? 4400;

    // Free actions always allowed
    if (cost === 0) return { allowed: true, cost: 0, remaining: this.getRemaining(tier) };

    const remaining = this.getRemaining(tier);

    if (remaining < cost) {
      const budget = this.getDailyBudget(tier);
      const bonus = this._getBonus().tokens;
      const dailyLeft = Math.max(0, budget - this.getTokensUsedToday());

      let reason: string;
      const budgetSE = tokensToSE(budget);

      if (dailyLeft <= 0 && bonus <= 0) {
        reason = tier === 'free'
          ? `You've used all ${budgetSE} Solar Energy today. Upgrade to Pro for 6x more.`
          : tier === 'pro'
            ? `You've used all ${budgetSE} SE today. Buy a top-up or upgrade to Stellur.`
            : `You've used all ${budgetSE} SE today. Grab a Solar Energy top-up to keep going.`;
      } else {
        const remainingSE = tokensToSE(remaining);
        const costSE = tokensToSE(cost);
        reason = `This action needs ~${costSE} SE but you only have ${remainingSE} SE left.`;
      }

      return { allowed: false, cost, remaining, reason };
    }

    return { allowed: true, cost, remaining };
  }

  // ── Core: Fallback consume (estimated tokens) ─────────────────────────────

  /**
   * Consume estimated tokens for an action.
   * Use this as a FALLBACK when real token counts from API response are not available.
   * Prefer recordTokens() when you have actual usage data.
   *
   * Deducts from daily budget first, then bonus tokens.
   * Returns false if insufficient tokens.
   */
  consume(action: UsageAction, tier: string): boolean {
    const cost = ESTIMATED_TOKENS[action] ?? 4400;
    if (cost === 0) return true; // Free action

    const budget = this.getDailyBudget(tier);
    const record = this._getBudget();
    const bonus = this._getBonus();
    const dailyLeft = Math.max(0, budget - record.tokensUsed);
    const totalLeft = dailyLeft + bonus.tokens;

    if (totalLeft < cost) return false; // Can't afford

    // Deduct from daily budget first
    let toDeduct = cost;
    const dailyDeduct = Math.min(toDeduct, dailyLeft);
    record.tokensUsed += dailyDeduct;
    toDeduct -= dailyDeduct;

    // Overflow into bonus tokens
    if (toDeduct > 0) {
      bonus.tokens = Math.max(0, bonus.tokens - toDeduct);
      this._saveBonus(bonus);
    }

    // Track breakdown
    record.breakdown[action] = (record.breakdown[action] || 0) + cost;
    record.apiCalls += 1;
    record.date = todayStr();
    this._saveBudget(record);

    this._notify();
    return true;
  }

  // ── Bonus tokens (purchasable top-ups) ─────────────────────────────────

  /**
   * Add purchased bonus tokens.
   * @param amount - tokens to add (e.g. 50000 for 50 SE pack)
   */
  addBonusCredits(amount: number) {
    const bonus = this._getBonus();
    bonus.tokens += amount;
    bonus.lastPurchase = new Date().toISOString();
    this._saveBonus(bonus);
    this._notify();
  }

  /**
   * Add bonus Solar Energy (convenience wrapper).
   * @param se - Solar Energy units to add
   */
  addBonusSE(se: number) {
    this.addBonusCredits(seToTokens(se));
  }

  // ── Getters: Raw token values ──────────────────────────────────────────

  /** Total tokens consumed today */
  getTokensUsedToday(): number {
    return this._getBudget().tokensUsed;
  }

  /** Alias for backward compat */
  getUsedToday(): number {
    return this.getTokensUsedToday();
  }

  /** Today's token breakdown by action type */
  getBreakdown(): Partial<Record<UsageAction, number>> {
    return this._getBudget().breakdown;
  }

  /** Daily token budget for a tier */
  getDailyBudget(tier: string): number {
    return DAILY_TOKEN_BUDGETS[tier] ?? DAILY_TOKEN_BUDGETS.free;
  }

  /** Remaining tokens (daily + bonus) */
  getRemaining(tier: string): number {
    const budget = this.getDailyBudget(tier);
    const used = this.getTokensUsedToday();
    const bonus = this._getBonus().tokens;
    return Math.max(0, budget - used) + bonus;
  }

  /** Bonus tokens remaining */
  getBonusCredits(): number {
    return this._getBonus().tokens;
  }

  /** Usage percentage (0-100) for daily budget only */
  getUsagePercent(tier: string): number {
    const budget = this.getDailyBudget(tier);
    if (budget <= 0) return 0;
    return Math.min(100, Math.round((this.getTokensUsedToday() / budget) * 100));
  }

  /** Total API calls made today */
  getApiCallsToday(): number {
    return this._getBudget().apiCalls;
  }

  // ── Getters: Solar Energy (user-facing) ────────────────────────────────

  /**
   * Get Solar Energy usage summary for display.
   * All values are in SE units (tokens / 1000).
   */
  getSolarEnergy(tier: string): {
    used: number;
    budget: number;
    remaining: number;
    bonus: number;
    percent: number;
  } {
    const budget = this.getDailyBudget(tier);
    const used = this.getTokensUsedToday();
    const bonus = this._getBonus().tokens;
    return {
      used:      tokensToSE(used),
      budget:    tokensToSE(budget),
      remaining: tokensToSE(Math.max(0, budget - used) + bonus),
      bonus:     tokensToSE(bonus),
      percent:   this.getUsagePercent(tier),
    };
  }

  /**
   * Get a full usage summary. Values are in TOKENS internally,
   * but the object includes SE helpers.
   */
  getSummary(tier: string): {
    used: number;
    budget: number;
    bonus: number;
    remaining: number;
    percent: number;
    breakdown: Partial<Record<UsageAction, number>>;
    apiCalls: number;
    se: { used: number; budget: number; remaining: number; bonus: number };
  } {
    const budget = this.getDailyBudget(tier);
    const used = this.getTokensUsedToday();
    const bonus = this.getBonusCredits();
    const remaining = Math.max(0, budget - used) + bonus;
    const se = this.getSolarEnergy(tier);

    return {
      used,
      budget,
      bonus,
      remaining,
      percent: this.getUsagePercent(tier),
      breakdown: this.getBreakdown(),
      apiCalls: this.getApiCallsToday(),
      se,
    };
  }

  // ── Subscriptions (React integration) ──────────────────────────────────

  private _listeners: Set<() => void> = new Set();

  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify() {
    this._listeners.forEach(fn => fn());
  }
}

/** Singleton */
export const usageBudget = new UsageBudgetService();

// Log Solar Energy status on startup
if (typeof window !== 'undefined') {
  const tier = localStorage.getItem('orbit_subscription_tier');
  const tierName = tier ? (JSON.parse(tier).tier || 'free') : 'free';
  const summary = usageBudget.getSummary(tierName);
  console.log(
    `[SolarEnergy] ${tierName} tier: ${summary.se.used}/${summary.se.budget} SE used today` +
    (summary.se.bonus > 0 ? ` (+${summary.se.bonus} SE bonus)` : '') +
    ` | ${summary.se.remaining} SE remaining` +
    ` | ${summary.apiCalls} API calls`
  );
}
