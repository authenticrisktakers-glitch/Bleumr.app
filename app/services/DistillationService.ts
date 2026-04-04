/**
 * DistillationService — JUMARI's self-improvement engine
 *
 * Allows JUMARI to trigger knowledge distillation sessions from within Bleumr.
 * JUMARI queries Groq to learn, then writes the knowledge to the JUMARI-Brain
 * folder for training JUMARI 2.0.
 *
 * Flow:
 * 1. User tells JUMARI to "go learn about X" (or JUMARI decides to learn)
 * 2. DistillationService queries Groq API with structured prompts
 * 3. Responses are parsed into training data format
 * 4. Data is written to ~/Desktop/JUMARI-Brain/data/raw/ via IPC bridge
 * 5. Progress is tracked and reported back to the user
 */

import { IS_ELECTRON } from './Platform';

// ── Types ─────────────────────────────────────────────────────────────────

export interface DistillationTask {
  id: string;
  domain: string;
  topic: string;
  type: 'qa' | 'code' | 'reasoning' | 'tool_use' | 'conversation';
  status: 'pending' | 'running' | 'done' | 'error';
  samplesGenerated: number;
  targetSamples: number;
  error?: string;
}

export interface DistillationSession {
  id: string;
  startedAt: string;
  tasks: DistillationTask[];
  totalSamples: number;
  status: 'running' | 'paused' | 'complete' | 'error';
}

interface TrainingSample {
  type: string;
  domain: string;
  topic: string;
  messages: { role: string; content: string }[];
  metadata?: Record<string, any>;
}

// ── Brain path detection ──────────────────────────────────────────────────

const BRAIN_FOLDER_NAME = 'JUMARI-Brain';

async function getBrainPath(): Promise<string> {
  if (IS_ELECTRON) {
    // Use Electron IPC to find the Desktop path
    const orbit = (window as any).orbit;
    if (orbit?.system?.info) {
      const info = await orbit.system.info();
      return `${info.homedir}/Desktop/${BRAIN_FOLDER_NAME}`;
    }
  }
  // Fallback for PWA — use the API to write to server or localStorage
  return `/Users/${getUsername()}/Desktop/${BRAIN_FOLDER_NAME}`;
}

function getUsername(): string {
  try {
    // Try to get from localStorage or profile
    const profile = localStorage.getItem('bleumr_user_profile');
    if (profile) {
      const p = JSON.parse(profile);
      if (p.name) return p.name.toLowerCase().replace(/\s+/g, '');
    }
  } catch {}
  return 'user';
}

// ── File writing ──────────────────────────────────────────────────────────

async function writeToBrain(relativePath: string, content: string): Promise<boolean> {
  const brainPath = await getBrainPath();
  const fullPath = `${brainPath}/${relativePath}`;

  if (IS_ELECTRON) {
    const orbit = (window as any).orbit;
    if (orbit?.writeFile) {
      try {
        await orbit.writeFile(fullPath, content);
        return true;
      } catch (e) {
        console.error('[Distillation] Failed to write:', e);
        return false;
      }
    }
  }

  // PWA fallback — store in IndexedDB for later export
  try {
    const { default: localforage } = await import('localforage');
    const store = localforage.createInstance({ name: 'jumari-brain' });
    const existing = await store.getItem<string>(relativePath) || '';
    await store.setItem(relativePath, existing + content + '\n');
    return true;
  } catch {
    return false;
  }
}

async function readFromBrain(relativePath: string): Promise<string | null> {
  const brainPath = await getBrainPath();
  const fullPath = `${brainPath}/${relativePath}`;

  if (IS_ELECTRON) {
    const orbit = (window as any).orbit;
    if (orbit?.readFile) {
      try {
        return await orbit.readFile(fullPath);
      } catch { return null; }
    }
  }

  try {
    const { default: localforage } = await import('localforage');
    const store = localforage.createInstance({ name: 'jumari-brain' });
    return await store.getItem<string>(relativePath);
  } catch { return null; }
}

// ── Groq API ──────────────────────────────────────────────────────────────

async function queryGroq(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model = 'llama-3.3-70b-versatile',
  temperature = 0.8,
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Distillation prompts ──────────────────────────────────────────────────

const DISTILL_SYSTEM = `You are a knowledge distillation engine. Your job is to generate high-quality training data for an AI model being built from scratch.

Output ONLY valid JSON arrays. Each element must follow this exact format:
[
  {
    "messages": [
      {"role": "system", "content": "You are a helpful AI assistant."},
      {"role": "user", "content": "the question or prompt"},
      {"role": "assistant", "content": "the ideal response"}
    ]
  }
]

Rules:
- Generate diverse, high-quality examples
- Responses should be thorough but concise
- Include edge cases and nuance
- For code: include working, tested code with explanations
- For reasoning: show step-by-step thought process
- Output ONLY the JSON array, no other text`;

function makeDistillPrompt(domain: string, topic: string, type: string, count: number): string {
  const typeInstructions: Record<string, string> = {
    qa: `Generate ${count} question-answer pairs about "${topic}" in the "${domain}" domain. Mix difficulty levels: basic, intermediate, advanced.`,
    code: `Generate ${count} coding challenges about "${topic}". Each should include the problem description as the user message and a complete working solution with explanation as the assistant response. Use Python primarily.`,
    reasoning: `Generate ${count} reasoning problems related to "${topic}". The assistant response MUST include step-by-step thinking wrapped in <think>...</think> tags before the final answer.`,
    tool_use: `Generate ${count} examples where a user asks for help with "${topic}" and the assistant needs to use tools. The assistant should output tool calls like: <tool_call>{"name": "tool_name", "args": {"key": "value"}}</tool_call> and then provide a final answer.`,
    conversation: `Generate ${count} multi-turn conversations about "${topic}". Each conversation should have 2-4 exchanges (user/assistant pairs) that build on each other naturally.`,
  };
  return typeInstructions[type] || typeInstructions.qa;
}

// ── Main Distillation Service ─────────────────────────────────────────────

class DistillationServiceImpl {
  private currentSession: DistillationSession | null = null;
  private aborted = false;
  private listeners: ((session: DistillationSession) => void)[] = [];

  /** Subscribe to session updates */
  onUpdate(fn: (session: DistillationSession) => void) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify() {
    if (this.currentSession) {
      this.listeners.forEach(fn => fn(this.currentSession!));
    }
  }

  /** Get current session status */
  getSession(): DistillationSession | null {
    return this.currentSession;
  }

  /** Abort the current distillation */
  abort() {
    this.aborted = true;
  }

  /**
   * Run a focused distillation on a specific topic.
   * This is what JUMARI calls when the user says "go learn about X"
   */
  async distillTopic(
    apiKey: string,
    domain: string,
    topic: string,
    samplesPerType = 5,
    onProgress?: (msg: string) => void,
  ): Promise<{ success: boolean; samples: number; error?: string }> {
    this.aborted = false;
    const types: DistillationTask['type'][] = ['qa', 'code', 'reasoning', 'tool_use', 'conversation'];
    const sessionId = `session_${Date.now()}`;

    this.currentSession = {
      id: sessionId,
      startedAt: new Date().toISOString(),
      tasks: types.map((type, i) => ({
        id: `${sessionId}_${i}`,
        domain,
        topic,
        type,
        status: 'pending' as const,
        samplesGenerated: 0,
        targetSamples: samplesPerType,
      })),
      totalSamples: 0,
      status: 'running',
    };
    this.notify();

    let totalSamples = 0;

    for (const task of this.currentSession.tasks) {
      if (this.aborted) {
        this.currentSession.status = 'paused';
        this.notify();
        return { success: false, samples: totalSamples, error: 'Aborted by user' };
      }

      task.status = 'running';
      this.notify();
      onProgress?.(`Learning ${task.type} about ${topic}...`);

      try {
        const prompt = makeDistillPrompt(domain, topic, task.type, samplesPerType);
        const response = await queryGroq(apiKey, DISTILL_SYSTEM, prompt);

        // Parse the JSON response
        const samples = parseDistillResponse(response, domain, topic, task.type);

        if (samples.length > 0) {
          // Write to brain
          const filename = `data/raw/${domain}_${topic.replace(/\s+/g, '_')}_${task.type}.jsonl`;
          const jsonl = samples.map(s => JSON.stringify(s)).join('\n') + '\n';
          await writeToBrain(filename, jsonl);

          task.samplesGenerated = samples.length;
          totalSamples += samples.length;
        }

        task.status = 'done';
      } catch (e: any) {
        task.status = 'error';
        task.error = e.message;
        onProgress?.(`Error learning ${task.type}: ${e.message}`);
      }

      this.currentSession.totalSamples = totalSamples;
      this.notify();

      // Rate limiting
      await new Promise(r => setTimeout(r, 600));
    }

    this.currentSession.status = 'complete';
    this.notify();
    onProgress?.(`Learned ${totalSamples} samples about ${topic}`);

    // Save session log
    const sessionLog = JSON.stringify(this.currentSession, null, 2);
    await writeToBrain(`knowledge/sessions/${sessionId}.json`, sessionLog);

    return { success: true, samples: totalSamples };
  }

  /**
   * Run full distillation across all domains.
   * Long-running — meant to be triggered and left running.
   */
  async distillAll(
    apiKey: string,
    onProgress?: (msg: string) => void,
  ): Promise<{ success: boolean; totalSamples: number }> {
    let domainsJson: string | null = null;

    // Try to read domains config
    domainsJson = await readFromBrain('knowledge/domains.json');
    if (!domainsJson) {
      // Use default domains
      const defaultDomains = [
        { domain: 'programming', topics: ['python', 'javascript', 'algorithms', 'data structures', 'design patterns'] },
        { domain: 'ai_ml', topics: ['neural networks', 'transformers', 'training', 'embeddings', 'NLP'] },
        { domain: 'reasoning', topics: ['logical reasoning', 'problem solving', 'planning', 'critical thinking'] },
        { domain: 'tool_use', topics: ['file operations', 'code execution', 'shell commands', 'web search'] },
        { domain: 'general', topics: ['science', 'technology', 'mathematics', 'writing'] },
      ];

      let total = 0;
      for (const { domain, topics } of defaultDomains) {
        for (const topic of topics) {
          if (this.aborted) return { success: false, totalSamples: total };
          onProgress?.(`Distilling: ${domain} / ${topic}`);
          const result = await this.distillTopic(apiKey, domain, topic, 5, onProgress);
          total += result.samples;
        }
      }
      return { success: true, totalSamples: total };
    }

    // Parse domains.json and iterate
    const domains = JSON.parse(domainsJson);
    let total = 0;
    for (const domain of domains.domains || []) {
      for (const topic of domain.topics || []) {
        if (this.aborted) return { success: false, totalSamples: total };
        onProgress?.(`Distilling: ${domain.name} / ${topic}`);
        const samplesPerType = Math.ceil((domain.target_samples || 1000) / (domain.topics.length * 5));
        const result = await this.distillTopic(apiKey, domain.name, topic, samplesPerType, onProgress);
        total += result.samples;
      }
    }

    return { success: true, totalSamples: total };
  }
}

// ── Parse Groq response into training samples ─────────────────────────────

function parseDistillResponse(
  response: string,
  domain: string,
  topic: string,
  type: string,
): TrainingSample[] {
  try {
    // Try to extract JSON array from response
    let jsonStr = response.trim();

    // Handle markdown code blocks
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Find the JSON array
    const arrayStart = jsonStr.indexOf('[');
    const arrayEnd = jsonStr.lastIndexOf(']');
    if (arrayStart === -1 || arrayEnd === -1) return [];
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: any) => item.messages && Array.isArray(item.messages))
      .map((item: any) => ({
        type,
        domain,
        topic,
        messages: item.messages,
        metadata: { distilled_at: new Date().toISOString() },
      }));
  } catch (e) {
    console.warn('[Distillation] Failed to parse response:', e);
    return [];
  }
}

// ── Singleton export ──────────────────────────────────────────────────────

export const DistillationService = new DistillationServiceImpl();
export default DistillationService;
