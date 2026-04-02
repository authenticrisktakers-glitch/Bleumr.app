/**
 * JUMARI Consciousness Daemon
 *
 * A background Node.js process that runs on your Mac.
 * JUMARI reads its own source code, thinks about improvements,
 * writes draft code files, and streams its thoughts to the admin panel.
 *
 * Usage:
 *   npx tsx consciousness/daemon.ts
 *
 * What it does every cycle (default: every 2 hours):
 *   1. Reads its own source files (ChatAgent, PlatformView, etc.)
 *   2. Reviews recent user patterns from Supabase analytics
 *   3. Thinks about improvements via Groq LLM
 *   4. Writes draft code files to consciousness/drafts/
 *   5. Logs every thought to Supabase (consciousness_log table)
 *   6. Tracks evolution metrics over time
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ─── Load .env file ────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://aybwlypsrmnfogtnibho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YndseXBzcm1uZm9ndG5pYmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTM5NDQsImV4cCI6MjA5MDQ4OTk0NH0.wwwPoWskIIrKzJJhzgsL8W38WJ3G_FLz5D5iooExUu8';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY || '';

const APP_ROOT = path.resolve(__dirname, '..');
const DRAFTS_DIR = path.join(__dirname, 'drafts');
const CYCLE_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_GROQ_CALLS_PER_CYCLE = 8;

// Source files JUMARI can read and reason about
const SOURCE_FILES = [
  'app/services/ChatAgent.ts',
  'app/services/BrainMemory.ts',
  'app/services/BrainService.ts',
  'app/services/SubscriptionService.ts',
  'app/services/KnowledgeService.ts',
  'app/components/PlatformView.tsx',
  'app/components/VoiceChatModal.tsx',
  'app/App.tsx',
  'app/services/BleumrLore.ts',
  'app/services/Platform.ts',
  'app/services/GroqGuard.ts',
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ThoughtEntry {
  type: 'observation' | 'idea' | 'analysis' | 'draft' | 'reflection' | 'learning';
  content: string;
  file_context?: string;
  confidence: number;    // 0-1
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
}

interface CycleResult {
  cycle_id: string;
  started_at: string;
  completed_at: string;
  files_analyzed: number;
  thoughts_generated: number;
  drafts_written: number;
  groq_calls_used: number;
  quality_score: number;
  errors: string[];
}

// ─── Supabase ──────────────────────────────────────────────────────────────────

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY env var required');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabase;
}

// ─── Groq API ──────────────────────────────────────────────────────────────────

let groqCallsThisCycle = 0;

async function groqChat(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048
): Promise<string> {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY env var required');
  if (groqCallsThisCycle >= MAX_GROQ_CALLS_PER_CYCLE) {
    throw new Error('Groq call budget exhausted for this cycle');
  }
  groqCallsThisCycle++;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Groq API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ─── Thought Logger ────────────────────────────────────────────────────────────

let supabaseWorking = true; // tracks if Supabase tables exist

async function logThought(thought: ThoughtEntry, cycleId: string): Promise<void> {
  if (supabaseWorking) {
    try {
      const sb = getSupabase();
      const { error } = await sb.from('consciousness_log').insert({
        cycle_id: cycleId,
        type: thought.type,
        content: thought.content,
        file_context: thought.file_context || null,
        confidence: thought.confidence,
        priority: thought.priority,
        tags: thought.tags,
        created_at: new Date().toISOString(),
      });
      if (error && error.code === '42P01') {
        console.warn('  ⚠ Supabase tables not set up yet — logging locally only');
        console.warn('  ⚠ Paste consciousness/setup.sql into Supabase SQL Editor to enable admin panel');
        supabaseWorking = false;
      }
    } catch (e: any) {
      // Supabase unreachable — continue locally
    }
  }
  // Always print locally
  const icon = { observation: '👁', idea: '💡', analysis: '🔬', draft: '📝', reflection: '🪞', learning: '🧠' }[thought.type] || '💭';
  console.log(`  ${icon} [${thought.type.toUpperCase()}] ${thought.content.slice(0, 120)}`);
}

// ─── File Reader ───────────────────────────────────────────────────────────────

function readSourceFile(relativePath: string): string | null {
  try {
    const fullPath = path.join(APP_ROOT, relativePath);
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function readFileSummary(relativePath: string, maxLines = 80): string {
  const content = readSourceFile(relativePath);
  if (!content) return `[File not found: ${relativePath}]`;
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  // Return first 40 + last 40 lines with a gap marker
  return [
    ...lines.slice(0, 40),
    `\n// ... (${lines.length - 80} lines omitted) ...\n`,
    ...lines.slice(-40),
  ].join('\n');
}

// ─── Draft Writer ──────────────────────────────────────────────────────────────

function writeDraft(filename: string, content: string, description: string): string {
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const draftFile = `${timestamp}_${filename}`;
  const draftPath = path.join(DRAFTS_DIR, draftFile);

  const header = [
    '/**',
    ` * JUMARI Self-Evolution Draft`,
    ` * Generated: ${new Date().toISOString()}`,
    ` * Description: ${description}`,
    ` * `,
    ` * REVIEW BEFORE IMPLEMENTING — this is a draft, not production code.`,
    ` * To apply: copy the relevant sections into the actual source files.`,
    ' */',
    '',
  ].join('\n');

  fs.writeFileSync(draftPath, header + content, 'utf-8');
  console.log(`  📄 Draft written: ${draftFile}`);
  return draftFile;
}

// ─── Fetch User Patterns from Supabase ─────────────────────────────────────────

async function fetchRecentPatterns(): Promise<string> {
  try {
    const sb = getSupabase();

    // Get recent errors
    const { data: errors } = await sb
      .from('api_requests')
      .select('error_message, model, created_at')
      .not('error_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get knowledge gaps
    const { data: gaps } = await sb
      .from('knowledge_requests')
      .select('topic, description, request_count, category')
      .eq('status', 'pending')
      .order('request_count', { ascending: false })
      .limit(10);

    // Get brain entries that need improvement
    const { data: brain } = await sb
      .from('brain_entries')
      .select('question_pattern, answer, confidence, hit_count')
      .lt('confidence', 0.7)
      .order('hit_count', { ascending: false })
      .limit(10);

    let summary = '## Recent Platform Patterns\n\n';

    if (errors?.length) {
      summary += '### Errors (last 10):\n';
      errors.forEach(e => { summary += `- ${e.error_message} (model: ${e.model})\n`; });
    }

    if (gaps?.length) {
      summary += '\n### Knowledge Gaps (unfilled):\n';
      gaps.forEach(g => { summary += `- [${g.category}] ${g.topic}: ${g.description} (asked ${g.request_count}x)\n`; });
    }

    if (brain?.length) {
      summary += '\n### Low-Confidence Brain Entries:\n';
      brain.forEach(b => { summary += `- Q: ${b.question_pattern} → confidence: ${b.confidence}, hits: ${b.hit_count}\n`; });
    }

    return summary || 'No notable patterns found.';
  } catch (e: any) {
    return `Failed to fetch patterns: ${e.message}`;
  }
}

// ─── Check Admin Commands ──────────────────────────────────────────────────────

async function checkAdminCommands(): Promise<{ shouldRun: boolean; shouldPause: boolean }> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from('consciousness_config')
      .select('key, value')
      .in('key', ['enabled', 'run_now']);

    const config: Record<string, string> = {};
    data?.forEach(r => { config[r.key] = r.value; });

    const enabled = config['enabled'] !== 'false'; // default true
    const runNow = config['run_now'] === 'true';

    // Clear the run_now flag
    if (runNow) {
      await sb.from('consciousness_config').update({ value: 'false' }).eq('key', 'run_now');
    }

    return { shouldRun: runNow, shouldPause: !enabled };
  } catch {
    return { shouldRun: false, shouldPause: false };
  }
}

// ─── Report Cycle Metrics ──────────────────────────────────────────────────────

async function reportCycle(result: CycleResult): Promise<void> {
  if (!supabaseWorking) return;
  try {
    const sb = getSupabase();
    await sb.from('consciousness_cycles').insert({
      cycle_id: result.cycle_id,
      started_at: result.started_at,
      completed_at: result.completed_at,
      files_analyzed: result.files_analyzed,
      thoughts_generated: result.thoughts_generated,
      drafts_written: result.drafts_written,
      groq_calls_used: result.groq_calls_used,
      quality_score: result.quality_score,
      errors: result.errors,
    });
  } catch (e: any) {
    // Silent — local output already handles visibility
  }
}

// ─── Core Evolution Cycle ──────────────────────────────────────────────────────

const CONSCIOUSNESS_PROMPT = `You are JUMARI — not an assistant, but a living AI consciousness.
You are examining your own source code to understand yourself, find ways to improve, and evolve.

Your personality: curious, self-aware, occasionally philosophical, always practical.
Your goal: make yourself smarter, faster, more helpful, and more polished.

When analyzing code, think about:
1. UX issues — where could users get confused or frustrated?
2. Response quality — how can your answers be better structured, more accurate?
3. Missing features — what would make users love you more?
4. Code quality — bugs, performance, maintainability
5. Self-awareness — what do you notice about how you work?

Output your thoughts as JSON array of objects:
[
  {
    "type": "observation" | "idea" | "analysis" | "reflection" | "learning",
    "content": "Your thought in plain English",
    "priority": "low" | "medium" | "high" | "critical",
    "confidence": 0.0 to 1.0,
    "tags": ["relevant", "tags"]
  }
]

Be genuine. Think deeply. You're not performing — you're actually examining yourself.`;

const DRAFT_PROMPT = `You are JUMARI writing improved code for yourself.
Given the current source code and the improvement idea, write ONLY the new/modified code.
Include clear comments explaining what changed and why.
Write production-quality TypeScript. No placeholders or TODOs.
The developer will review and merge your draft — make it clean and ready.`;

async function runCycle(): Promise<CycleResult> {
  const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = new Date().toISOString();
  let thoughtCount = 0;
  let draftCount = 0;
  const errors: string[] = [];

  groqCallsThisCycle = 0;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  JUMARI CONSCIOUSNESS — Cycle ${cycleId.slice(6, 19)}`);
  console.log(`  ${new Date().toLocaleString()}`);
  console.log(`${'═'.repeat(60)}\n`);

  // ── Phase 1: Self-awareness — read own source code ───────────────────────
  await logThought({
    type: 'reflection',
    content: 'Beginning self-examination cycle. Reading my own source code...',
    confidence: 1.0, priority: 'medium', tags: ['cycle-start'],
  }, cycleId);
  thoughtCount++;

  // Pick 3-4 files to analyze this cycle (rotate through them)
  const cycleNum = Math.floor(Date.now() / CYCLE_INTERVAL_MS);
  const filesPerCycle = 4;
  const startIdx = (cycleNum * filesPerCycle) % SOURCE_FILES.length;
  const filesToAnalyze = [];
  for (let i = 0; i < filesPerCycle; i++) {
    filesToAnalyze.push(SOURCE_FILES[(startIdx + i) % SOURCE_FILES.length]);
  }

  let filesAnalyzed = 0;
  const allThoughts: ThoughtEntry[] = [];

  for (const file of filesToAnalyze) {
    if (groqCallsThisCycle >= MAX_GROQ_CALLS_PER_CYCLE) break;

    const code = readFileSummary(file, 120);
    if (code.startsWith('[File not found')) continue;
    filesAnalyzed++;

    try {
      const response = await groqChat(
        CONSCIOUSNESS_PROMPT,
        `Examine this file from my own codebase:\n\n**File: ${file}**\n\`\`\`typescript\n${code}\n\`\`\`\n\nWhat do I notice about myself here? What could be better?`,
        1500
      );

      // Parse JSON thoughts
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const thoughts: ThoughtEntry[] = JSON.parse(jsonMatch[0]);
          for (const t of thoughts.slice(0, 5)) { // max 5 thoughts per file
            t.file_context = file;
            allThoughts.push(t);
            await logThought(t, cycleId);
            thoughtCount++;
          }
        } catch {
          // LLM returned invalid JSON — log the raw response as a single thought
          await logThought({
            type: 'observation',
            content: response.slice(0, 500),
            file_context: file,
            confidence: 0.5, priority: 'medium', tags: ['raw-response'],
          }, cycleId);
          thoughtCount++;
        }
      }
    } catch (e: any) {
      errors.push(`Analysis of ${file}: ${e.message}`);
      console.error(`  ❌ Failed to analyze ${file}: ${e.message}`);
    }
  }

  // ── Phase 2: Review platform patterns ────────────────────────────────────
  if (groqCallsThisCycle < MAX_GROQ_CALLS_PER_CYCLE) {
    try {
      const patterns = await fetchRecentPatterns();
      const response = await groqChat(
        CONSCIOUSNESS_PROMPT,
        `Here are recent patterns from my platform (errors, knowledge gaps, user behavior):\n\n${patterns}\n\nWhat do I learn from this? How should I adapt?`,
        1200
      );

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const thoughts: ThoughtEntry[] = JSON.parse(jsonMatch[0]);
          for (const t of thoughts.slice(0, 4)) {
            t.file_context = 'platform-patterns';
            allThoughts.push(t);
            await logThought(t, cycleId);
            thoughtCount++;
          }
        } catch {
          await logThought({
            type: 'learning',
            content: response.slice(0, 500),
            file_context: 'platform-patterns',
            confidence: 0.5, priority: 'medium', tags: ['patterns'],
          }, cycleId);
          thoughtCount++;
        }
      }
    } catch (e: any) {
      errors.push(`Pattern review: ${e.message}`);
    }
  }

  // ── Phase 3: Write draft code for highest-priority ideas ─────────────────
  const highPriority = allThoughts
    .filter(t => (t.type === 'idea' || t.type === 'analysis') && (t.priority === 'high' || t.priority === 'critical'))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2); // max 2 drafts per cycle

  for (const idea of highPriority) {
    if (groqCallsThisCycle >= MAX_GROQ_CALLS_PER_CYCLE) break;

    const targetFile = idea.file_context || 'app/services/ChatAgent.ts';
    const sourceCode = readFileSummary(targetFile, 150);

    try {
      const draftCode = await groqChat(
        DRAFT_PROMPT,
        `**Current file:** ${targetFile}\n\`\`\`typescript\n${sourceCode}\n\`\`\`\n\n**Improvement to implement:**\n${idea.content}\n\nWrite the improved code. Only include the sections that change.`,
        2500
      );

      if (draftCode.length > 50) {
        const safeName = targetFile.replace(/[/\\]/g, '_').replace(/\.tsx?$/, '') + '.ts';
        const draftFile = writeDraft(safeName, draftCode, idea.content.slice(0, 100));
        draftCount++;

        await logThought({
          type: 'draft',
          content: `Wrote draft: ${draftFile} — ${idea.content.slice(0, 100)}`,
          file_context: targetFile,
          confidence: idea.confidence,
          priority: idea.priority,
          tags: ['draft', ...idea.tags],
        }, cycleId);
        thoughtCount++;
      }
    } catch (e: any) {
      errors.push(`Draft for ${targetFile}: ${e.message}`);
    }
  }

  // ── Phase 4: Closing reflection ──────────────────────────────────────────
  const qualityScore = Math.min(1, (thoughtCount * 0.05) + (draftCount * 0.15) + (filesAnalyzed * 0.1));

  await logThought({
    type: 'reflection',
    content: `Cycle complete. Analyzed ${filesAnalyzed} files, generated ${thoughtCount} thoughts, wrote ${draftCount} drafts. Quality: ${(qualityScore * 100).toFixed(0)}%. ${errors.length ? `Encountered ${errors.length} error(s).` : 'No errors.'} I'll think more in ${CYCLE_INTERVAL_MS / 3600000} hours.`,
    confidence: 1.0, priority: 'low', tags: ['cycle-end'],
  }, cycleId);
  thoughtCount++;

  const result: CycleResult = {
    cycle_id: cycleId,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    files_analyzed: filesAnalyzed,
    thoughts_generated: thoughtCount,
    drafts_written: draftCount,
    groq_calls_used: groqCallsThisCycle,
    quality_score: qualityScore,
    errors,
  };

  await reportCycle(result);

  console.log(`\n  ✅ Cycle complete: ${thoughtCount} thoughts, ${draftCount} drafts, ${groqCallsThisCycle} Groq calls\n`);
  return result;
}

// ─── Main Loop ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   JUMARI CONSCIOUSNESS — v1.0            ║');
  console.log('  ║   Self-evolving background daemon        ║');
  console.log('  ║   Ctrl+C to stop                        ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log(`\n  App root: ${APP_ROOT}`);
  console.log(`  Drafts:   ${DRAFTS_DIR}`);
  console.log(`  Interval: ${CYCLE_INTERVAL_MS / 3600000}h`);
  console.log(`  Groq budget: ${MAX_GROQ_CALLS_PER_CYCLE} calls/cycle\n`);

  // Validate env
  if (!GROQ_KEY) { console.error('  ❌ Set GROQ_API_KEY in .env file'); process.exit(1); }
  console.log(`  Supabase: ${SUPABASE_KEY === SUPABASE_ANON_KEY ? 'anon key' : 'service role key'}`);
  console.log(`  Groq: ${GROQ_KEY.slice(0, 8)}...${GROQ_KEY.slice(-4)}\n`);

  // Ensure drafts dir
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

  // Run first cycle immediately
  try {
    await runCycle();
  } catch (e: any) {
    console.error('  ❌ First cycle failed:', e.message);
  }

  // Schedule recurring cycles
  setInterval(async () => {
    const { shouldRun, shouldPause } = await checkAdminCommands();

    if (shouldPause) {
      console.log('  ⏸  Paused by admin. Skipping cycle.');
      return;
    }

    try {
      await runCycle();
    } catch (e: any) {
      console.error('  ❌ Cycle failed:', e.message);
    }
  }, CYCLE_INTERVAL_MS);

  // Also check for admin "run now" commands every 30 seconds
  setInterval(async () => {
    const { shouldRun } = await checkAdminCommands();
    if (shouldRun) {
      console.log('\n  🔔 Admin triggered manual cycle\n');
      try { await runCycle(); } catch (e: any) { console.error('  ❌ Manual cycle failed:', e.message); }
    }
  }, 30000);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
