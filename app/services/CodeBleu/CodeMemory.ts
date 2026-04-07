/**
 * CodeMemory — Auto-memory for Code Bleu sessions
 *
 * Wraps BrainMemory to extract and recall code-specific knowledge:
 * - Build commands that worked
 * - Error/fix pairs
 * - User coding preferences
 * - Project patterns
 *
 * Design notes:
 * - We are EXTREMELY conservative about what gets saved. The previous
 *   implementation was a regex grab-bag that produced low-quality memories
 *   like "Command that worked: > vite v6.4.1 building..." which provide
 *   negative value when surfaced into a future system prompt.
 * - The rules below intentionally have lots of false NEGATIVES (we miss
 *   real memories) and very few false POSITIVES (we don't save junk).
 *   It's better to learn nothing than to learn garbage.
 */

import { BrainMemory } from '../BrainMemory';

// Anything shorter than this is not a useful memory.
const MIN_USEFUL_LENGTH = 25;
// Anything longer than this is probably noise (a stack trace, a paste, etc.).
const MAX_USEFUL_LENGTH = 280;

// Commands that count as "real build/test commands". Anything outside this
// set is ignored — we don't try to learn from arbitrary shell pipes.
const KNOWN_BUILD_VERBS = /\b(npm|pnpm|yarn|bun|cargo|go|python|pytest|jest|vitest|tsc|vite|next|webpack|esbuild|tsx|node|deno)\b/i;

const KNOWN_BUILD_ACTIONS = /\b(install|build|run|test|start|dev|format|lint|type-check|check|compile|bundle|preview|migrate)\b/i;

/** Did this output unambiguously look like a command running cleanly to the end? */
function looksLikeSuccessOutput(result: string): boolean {
  if (!result || result.length < MIN_USEFUL_LENGTH) return false;
  const lc = result.toLowerCase();
  // Anything that mentions an error or warning at all is not a success.
  if (/\b(error|err!|exception|failed|warning|warn:)\b/.test(lc)) return false;
  // Strong positive signals only.
  return /(✓ built in|✓ \d+ tests? passed|build successful|compiled successfully|0 errors?|all tests passed|installed [\d,]+ packages|done in \d+(\.\d+)?s)/i.test(result);
}

/**
 * Extract a single command from a `> command` line, but ONLY when it looks
 * like a real build verb. Returns null if we're not confident.
 */
function extractRealCommand(result: string): string | null {
  // Look for `> npm run build` style lines (npm output)
  const npmStyle = result.match(/^> .+@.+ (.+)$/m);
  if (npmStyle) {
    const cmd = npmStyle[1].trim();
    if (KNOWN_BUILD_VERBS.test(cmd) && KNOWN_BUILD_ACTIONS.test(cmd)) {
      return cmd.slice(0, MAX_USEFUL_LENGTH);
    }
  }
  // Look for explicit `Running: <cmd>` annotations from the agent's run_command tool.
  const annotated = result.match(/Running:\s+(.+)/i);
  if (annotated) {
    const cmd = annotated[1].trim();
    if (KNOWN_BUILD_VERBS.test(cmd) && KNOWN_BUILD_ACTIONS.test(cmd)) {
      return cmd.slice(0, MAX_USEFUL_LENGTH);
    }
  }
  return null;
}

/**
 * Pull a coding preference from a user message — strict patterns only,
 * no fuzzy "i prefer X" matching that picks up unrelated context.
 */
function extractPreference(userMessage: string): { label: string; content: string } | null {
  const PATTERNS: Array<{ re: RegExp; label: string }> = [
    { re: /\b(?:always |we |i )use\s+(pnpm|yarn|bun|npm)\b(?:\s+for[^.]{0,40})?/i, label: 'package_manager' },
    { re: /\b(?:always |we |i )use\s+(tabs|2 spaces|4 spaces|tabs not spaces|spaces not tabs)\b/i, label: 'indentation' },
    { re: /\b(?:always |we |i )(?:use|prefer)\s+(typescript over javascript|strict typescript|esm over commonjs)\b/i, label: 'language_style' },
    { re: /\btests?\s+(?:live|are|go)\s+in\s+([^\s,.]{2,40})/i, label: 'test_directory' },
    { re: /\b(?:we |i )use\s+(jest|vitest|mocha|pytest|cargo test|playwright|cypress)\b/i, label: 'test_framework' },
    { re: /\b(?:we |i )use\s+(eslint|prettier|biome|deno fmt|rustfmt|black|ruff)\b/i, label: 'formatter' },
  ];
  for (const { re, label } of PATTERNS) {
    const match = userMessage.match(re);
    if (match) {
      const content = match[0].trim();
      if (content.length >= MIN_USEFUL_LENGTH || /\b(pnpm|yarn|bun|tabs|spaces|jest|vitest|mocha|eslint|prettier)\b/i.test(content)) {
        return { label, content: content.slice(0, MAX_USEFUL_LENGTH) };
      }
    }
  }
  return null;
}

/**
 * Extract learnable memories from a completed agent interaction.
 * Called at the end of the agentic loop. Best-effort, never throws.
 */
export function extractCodeMemories(
  userMessage: string,
  _assistantResponse: string,
  toolResults: string[],
): void {
  if (!Array.isArray(toolResults)) return;

  // 1. Successful build/test commands — only when output is unambiguously
  // a clean success and we can identify a real build verb.
  for (const result of toolResults) {
    if (typeof result !== 'string') continue;
    if (!looksLikeSuccessOutput(result)) continue;
    const cmd = extractRealCommand(result);
    if (!cmd) continue;
    BrainMemory.learn({
      category: 'build_command',
      content: `Verified working: ${cmd}`,
      source: 'code_bleu',
      confidence: 0.85,
    });
  }

  // 2. Coding preferences from the user message — strict patterns only.
  if (typeof userMessage === 'string' && userMessage.length > 0) {
    const pref = extractPreference(userMessage);
    if (pref) {
      BrainMemory.learn({
        category: 'preference',
        content: `${pref.label}: ${pref.content}`,
        source: 'code_bleu',
        confidence: 0.9,
      });
    }
  }

  // Note: error/fix extraction was removed. The previous implementation
  // grabbed any output mentioning "error" plus any assistant text mentioning
  // "fix" and stitched them together — which produced junk like
  // "Error: SyntaxError... Fix: changed the file." when the two were
  // entirely unrelated. Re-introducing it requires a real correlation
  // signal (e.g., a write_file that closes the same path the error
  // referenced) which is too fragile to do via regex. Left as a TODO.
}

/**
 * Get relevant code memories for injection into system prompt.
 */
export function getCodeContext(query: string): string {
  return BrainMemory.toPromptContext(query, 'code_bleu');
}
