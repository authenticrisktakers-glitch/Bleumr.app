/**
 * GodAgent — Central AI orchestrator for the Bleumr/JUMARI platform.
 *
 * All platform agents (Chat, Web Designer, Browser, Apps) consult the GOD AGENT
 * before generating responses. It provides:
 *
 * 1. **Shared Context** — Cross-agent knowledge, user preferences, session state
 * 2. **Prompt Enhancement** — Enriches agent prompts with relevant context
 * 3. **Quality Control** — Post-processes responses for consistency
 * 4. **Agent Coordination** — Routes tasks to the best agent, prevents conflicts
 * 5. **Learning Loop** — Aggregates feedback across all agents
 */

import { BrainMemory } from './BrainMemory';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AgentContext {
  /** Which agent is asking */
  agent: 'chat' | 'web_designer' | 'browser' | 'apps' | 'projects';
  /** The user's raw input */
  userInput: string;
  /** Current conversation history (last N messages) */
  conversationHistory?: { role: string; content: string }[];
  /** Agent-specific metadata */
  metadata?: Record<string, any>;
}

export interface GodDirective {
  /** Enhanced system prompt additions */
  systemPromptAdditions: string;
  /** Suggested approach/strategy for the agent */
  strategy?: string;
  /** Whether to route to a different agent */
  reroute?: 'chat' | 'web_designer' | 'browser' | 'apps';
  /** Priority context from other agents' recent activity */
  crossAgentContext?: string;
  /** Quality guidelines specific to this request */
  qualityGuidelines?: string[];
}

interface SessionState {
  lastActiveAgent: string;
  lastUserIntent: string;
  recentTopics: string[];
  agentHistory: { agent: string; query: string; timestamp: number }[];
  userMood: 'neutral' | 'frustrated' | 'curious' | 'creative' | 'urgent';
}

// ─── Storage ───────────────────────────────────────────────────────────────

const SESSION_KEY = 'bleumr_god_agent_session';
const MAX_HISTORY = 50;
const MAX_TOPICS = 20;

function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    lastActiveAgent: 'chat',
    lastUserIntent: '',
    recentTopics: [],
    agentHistory: [],
    userMood: 'neutral',
  };
}

function saveSession(state: SessionState): void {
  try {
    // Trim history
    if (state.agentHistory.length > MAX_HISTORY) {
      state.agentHistory = state.agentHistory.slice(-MAX_HISTORY);
    }
    if (state.recentTopics.length > MAX_TOPICS) {
      state.recentTopics = state.recentTopics.slice(-MAX_TOPICS);
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {}
}

// ─── Intent Detection ──────────────────────────────────────────────────────

type UserIntent =
  | 'build_website'
  | 'edit_website'
  | 'debug_code'
  | 'search_web'
  | 'general_chat'
  | 'creative_task'
  | 'technical_question'
  | 'navigation'
  | 'shopping'
  | 'image_generation';

function detectIntent(input: string): UserIntent {
  const q = input.toLowerCase();

  // Website building
  if (/\b(build|create|make|design)\b.*\b(website|site|page|landing|portfolio|app)\b/.test(q)) return 'build_website';
  if (/\b(change|update|edit|modify|fix|add|remove)\b.*\b(website|site|page|section|hero|nav|footer|header|button)\b/.test(q)) return 'edit_website';
  if (/\b(debug|error|bug|crash|broken|not working|fix)\b/.test(q)) return 'debug_code';
  if (/\b(search|find|look up|what is|who is|how to|when did)\b/.test(q)) return 'search_web';
  if (/\b(draw|paint|generate|image|picture|photo|art|illustration)\b/.test(q)) return 'image_generation';
  if (/\b(go to|open|navigate|visit|browse)\b/.test(q)) return 'navigation';
  if (/\b(buy|shop|price|product|deal|cheap|expensive|order|cart)\b/.test(q)) return 'shopping';
  if (/\b(code|function|api|database|server|deploy|git|react|typescript|javascript|python|css|html)\b/.test(q)) return 'technical_question';
  if (/\b(write|story|poem|song|creative|brainstorm|idea)\b/.test(q)) return 'creative_task';

  return 'general_chat';
}

function detectMood(input: string, history?: { role: string; content: string }[]): SessionState['userMood'] {
  const q = input.toLowerCase();
  if (/\b(urgent|asap|hurry|quick|fast|now)\b/.test(q)) return 'urgent';
  if (/\b(not working|broken|error|bug|stuck|help|why)\b/.test(q)) return 'frustrated';
  if (/\b(how|what|why|explain|understand|learn)\b/.test(q)) return 'curious';
  if (/\b(build|create|design|make|imagine)\b/.test(q)) return 'creative';

  // Check conversation history for frustration signals (repeated attempts)
  if (history && history.length >= 4) {
    const recentUser = history.filter(m => m.role === 'user').slice(-3);
    const sameTopicCount = recentUser.filter(m =>
      m.content.toLowerCase().includes(q.split(' ')[0])
    ).length;
    if (sameTopicCount >= 2) return 'frustrated'; // user asking about same thing repeatedly
  }

  return 'neutral';
}

// ─── Agent Routing ─────────────────────────────────────────────────────────

function suggestAgent(intent: UserIntent, currentAgent: string): string | undefined {
  const routeMap: Record<UserIntent, string> = {
    build_website: 'web_designer',
    edit_website: 'web_designer',
    debug_code: 'web_designer', // or current agent
    search_web: 'chat',
    general_chat: 'chat',
    creative_task: 'chat',
    technical_question: 'chat',
    navigation: 'browser',
    shopping: 'chat',
    image_generation: 'chat',
  };

  const suggested = routeMap[intent];
  if (suggested && suggested !== currentAgent) return suggested;
  return undefined;
}

// ─── Quality Guidelines ────────────────────────────────────────────────────

function getQualityGuidelines(intent: UserIntent, mood: SessionState['userMood']): string[] {
  const guidelines: string[] = [];

  // Mood-based adjustments
  switch (mood) {
    case 'frustrated':
      guidelines.push('Be extra concise and direct — the user has been trying to solve this.');
      guidelines.push('Acknowledge the difficulty briefly, then jump straight to the solution.');
      break;
    case 'urgent':
      guidelines.push('Skip explanations — give the answer/solution immediately.');
      break;
    case 'curious':
      guidelines.push('Provide clear explanations with examples when helpful.');
      break;
    case 'creative':
      guidelines.push('Be bold and creative — suggest innovative approaches.');
      guidelines.push('Go above and beyond the basic request.');
      break;
  }

  // Intent-based guidelines
  switch (intent) {
    case 'build_website':
      guidelines.push('Create a COMPLETE multi-file project — not just index.html.');
      guidelines.push('Include all pages a real version of this site would need.');
      guidelines.push('Use real images from Unsplash, proper icons from Font Awesome.');
      break;
    case 'edit_website':
      guidelines.push('Only output the files that actually changed.');
      guidelines.push('Preserve all existing functionality while making the edit.');
      break;
    case 'debug_code':
      guidelines.push('Diagnose the ROOT CAUSE — don\'t just suppress the error.');
      guidelines.push('Explain what was wrong in 1 sentence, then provide the fix.');
      break;
    case 'search_web':
      guidelines.push('Cite sources with [1], [2] reference numbers.');
      guidelines.push('Give a direct answer first, then supporting details.');
      break;
  }

  return guidelines;
}

// ─── Cross-Agent Context ───────────────────────────────────────────────────

function buildCrossAgentContext(session: SessionState, currentAgent: string): string {
  // Get recent activity from OTHER agents
  const otherAgentActivity = session.agentHistory
    .filter(h => h.agent !== currentAgent && Date.now() - h.timestamp < 30 * 60 * 1000) // last 30 min
    .slice(-5);

  if (otherAgentActivity.length === 0) return '';

  const lines = otherAgentActivity.map(h =>
    `- [${h.agent}] User asked: "${h.query.slice(0, 80)}${h.query.length > 80 ? '...' : ''}"`
  );

  return `\n\n## Recent activity from other agents (for context):\n${lines.join('\n')}`;
}

// ─── Main API ──────────────────────────────────────────────────────────────

export class GodAgent {
  /**
   * Consult the GOD AGENT before generating a response.
   * Returns a directive with prompt enhancements, quality guidelines, and routing suggestions.
   */
  static consult(context: AgentContext): GodDirective {
    const session = loadSession();
    const intent = detectIntent(context.userInput);
    const mood = detectMood(context.userInput, context.conversationHistory);

    // Update session state
    session.lastActiveAgent = context.agent;
    session.lastUserIntent = context.userInput.slice(0, 200);
    session.userMood = mood;
    session.agentHistory.push({
      agent: context.agent,
      query: context.userInput.slice(0, 200),
      timestamp: Date.now(),
    });

    // Extract topics for cross-session context
    const words = context.userInput.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const newTopics = words.slice(0, 3);
    session.recentTopics = [...new Set([...session.recentTopics, ...newTopics])];

    saveSession(session);

    // Build directive
    const qualityGuidelines = getQualityGuidelines(intent, mood);
    const crossAgentContext = buildCrossAgentContext(session, context.agent);
    const reroute = suggestAgent(intent, context.agent) as GodDirective['reroute'];

    // Get brain memory context (shared across all agents)
    const brainContext = BrainMemory.toPromptContext(context.userInput, context.agent);

    // Build system prompt additions
    const additions: string[] = [];

    if (qualityGuidelines.length > 0) {
      additions.push(`\n## GOD AGENT Quality Guidelines:\n${qualityGuidelines.map(g => `- ${g}`).join('\n')}`);
    }

    if (crossAgentContext) {
      additions.push(crossAgentContext);
    }

    if (brainContext) {
      additions.push(brainContext);
    }

    // Add relevant libraries for web designer
    if (context.agent === 'web_designer') {
      const libs = BrainMemory.librariesToPrompt(context.userInput);
      if (libs) additions.push(libs);
    }

    // Strategy suggestion
    let strategy: string | undefined;
    if (intent === 'build_website') {
      strategy = 'Generate a complete multi-page website with all necessary files. Start with the project structure, then generate each file.';
    } else if (intent === 'debug_code') {
      strategy = 'Read the error carefully, identify the root cause, fix only what is broken. Do not restructure working code.';
    } else if (mood === 'frustrated') {
      strategy = 'User may be stuck. Be direct, skip preamble, provide a working solution immediately.';
    }

    return {
      systemPromptAdditions: additions.join('\n'),
      strategy,
      reroute,
      crossAgentContext: crossAgentContext || undefined,
      qualityGuidelines,
    };
  }

  /**
   * Report back to GOD AGENT after generating a response.
   * Used for learning and cross-agent coordination.
   */
  static report(context: AgentContext, outcome: {
    success: boolean;
    filesGenerated?: number;
    errorsEncountered?: string[];
    responseQuality?: 'good' | 'poor' | 'error';
  }): void {
    // Learn from errors
    if (outcome.errorsEncountered?.length) {
      for (const err of outcome.errorsEncountered.slice(0, 3)) {
        BrainMemory.learnFromError(err, 'Auto-detected by GOD AGENT', context.agent);
      }
    }

    // Learn from successful patterns
    if (outcome.success && outcome.filesGenerated && outcome.filesGenerated > 0) {
      BrainMemory.learnPattern(
        `[${context.agent}] Successfully handled: "${context.userInput.slice(0, 60)}..." → ${outcome.filesGenerated} files`,
        context.agent,
      );
    }
  }

  /**
   * Get a summary of the current session state for debugging/display.
   */
  static getSessionSummary(): {
    activeAgent: string;
    mood: string;
    recentTopics: string[];
    totalInteractions: number;
  } {
    const session = loadSession();
    return {
      activeAgent: session.lastActiveAgent,
      mood: session.userMood,
      recentTopics: session.recentTopics.slice(-10),
      totalInteractions: session.agentHistory.length,
    };
  }

  /**
   * Clear session state (e.g., on new chat or reset).
   */
  static resetSession(): void {
    localStorage.removeItem(SESSION_KEY);
  }
}
