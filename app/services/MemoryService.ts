/**
 * MemoryService — persistent cross-conversation memory for JUMARI
 * Extracts key facts from conversations and injects them into future context
 */

interface Memory {
  id: string;
  fact: string;
  category: 'preference' | 'fact' | 'goal' | 'context' | 'skill';
  timestamp: number;
  source: string; // short excerpt of what triggered this memory
}

const MEMORY_KEY = 'bleumr_memories_v2';
const MAX_MEMORIES = 120;

class MemoryService {
  private _load(): Memory[] {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Memory[];
    } catch {
      return [];
    }
  }

  private _save(memories: Memory[]) {
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(memories.slice(0, MAX_MEMORIES)));
    } catch {}
  }

  getAll(): Memory[] {
    return this._load();
  }

  add(fact: string, category: Memory['category'] = 'fact', source = '') {
    const memories = this._load();
    // Deduplicate: skip if very similar fact already exists
    const normalized = fact.toLowerCase().trim();
    const exists = memories.some(m => {
      const sim = m.fact.toLowerCase().trim();
      return sim === normalized || (sim.includes(normalized.slice(0, 30)) && normalized.length > 20);
    });
    if (exists) return;

    const entry: Memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fact: fact.trim(),
      category,
      timestamp: Date.now(),
      source: source.slice(0, 120),
    };
    memories.unshift(entry);
    this._save(memories);
  }

  delete(id: string) {
    const memories = this._load().filter(m => m.id !== id);
    this._save(memories);
  }

  clear() {
    localStorage.removeItem(MEMORY_KEY);
  }

  /**
   * Returns the most relevant memories for a given query.
   * Simple keyword matching — no embeddings needed.
   */
  getRelevant(query: string, limit = 8): Memory[] {
    const all = this._load();
    if (all.length === 0) return [];

    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return all.slice(0, limit);

    const scored = all.map(m => {
      const text = m.fact.toLowerCase();
      const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
      return { memory: m, score };
    });

    return scored
      .sort((a, b) => b.score - a.score || b.memory.timestamp - a.memory.timestamp)
      .slice(0, limit)
      .map(s => s.memory);
  }

  /**
   * Format memories as a context block for the system prompt
   */
  formatForPrompt(query: string): string {
    const relevant = this.getRelevant(query, 8);
    if (relevant.length === 0) return '';
    const lines = relevant.map(m => `- ${m.fact}`).join('\n');
    return `\n\n## What I remember about you\n${lines}\n\nUse this context naturally — don't announce that you remember it, just use it.`;
  }

  /**
   * Extract memories from a conversation turn using simple heuristics.
   * Call this client-side without an API call for speed.
   */
  extractFromTurn(userMessage: string, assistantResponse: string) {
    const u = userMessage.toLowerCase();

    // Preference patterns
    const prefPatterns: [RegExp, string][] = [
      [/i (love|hate|prefer|like|dislike|enjoy|can't stand) (.+)/i, 'preference'],
      [/my favorite (.+) is (.+)/i, 'preference'],
      [/i('m| am) (a |an )?(.+) (developer|engineer|designer|student|writer|founder)/i, 'fact'],
      [/i work (at|for|with) (.+)/i, 'fact'],
      [/i('m| am) working on (.+)/i, 'goal'],
      [/i want to (.+)/i, 'goal'],
      [/i('m| am) trying to (.+)/i, 'goal'],
      [/my (name|email|phone|address|company|role|job|title) is (.+)/i, 'fact'],
      [/i use (.+) (for|to) (.+)/i, 'preference'],
      [/i know (how to|)?(.+)/i, 'skill'],
    ];

    for (const [pattern, category] of prefPatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        const fact = userMessage.slice(0, 140).replace(/\n/g, ' ').trim();
        if (fact.length > 10) {
          this.add(fact, category as Memory['category'], userMessage.slice(0, 60));
        }
      }
    }

    // Also capture short explicit statements of identity
    if (u.startsWith("i'm ") || u.startsWith("i am ") || u.startsWith("my name is")) {
      const fact = userMessage.slice(0, 100).replace(/\n/g, ' ').trim();
      if (fact.length > 8) this.add(fact, 'fact', userMessage.slice(0, 60));
    }
  }
}

export const memoryService = new MemoryService();
export type { Memory };
