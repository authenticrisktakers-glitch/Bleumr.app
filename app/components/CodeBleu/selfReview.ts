// ─── Code Bleu Self-Review ───────────────────────────────────────────────────
// After every file edit the agent makes (write_file / replace_in_file), it runs
// a fast 5-point checklist on the new content so it studies what it just did and
// can self-correct on the next turn. Hard-capped at 20s so it never stalls the
// agent loop; on timeout/error it degrades to a non-blocking note.

import { groqFetch } from './api';
import { GROQ_MODELS } from './constants';

/** Hard ceiling for a single edit's self-review. Edit is NOT blocked if exceeded. */
export const SELF_REVIEW_TIMEOUT_MS = 20 * 1000;

// Keep latency inside the 20s budget — large files are reviewed on a head/tail
// slice (where syntax/import/scope problems almost always surface).
const MAX_REVIEW_CHARS = 9000;

// Only code/markup edits are worth a model round-trip. Skipping configs, data,
// assets, and trivially small writes keeps Groq call volume (and timeouts) down.
const REVIEWABLE_EXT = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|py|rb|go|rs|java|kt|swift|php|c|h|cpp|cs|css|scss|less|html?|sql|sh)$/i;

function shouldSkipReview(path: string, content: string): string | null {
  if (content.trim().length < 400) return 'tiny edit';
  if (!REVIEWABLE_EXT.test(path)) return 'non-code file';
  return null;
}

function clipForReview(content: string): string {
  if (content.length <= MAX_REVIEW_CHARS) return content;
  const head = content.slice(0, MAX_REVIEW_CHARS - 2000);
  const tail = content.slice(-2000);
  return `${head}\n\n/* …[${content.length - MAX_REVIEW_CHARS} chars elided for review]… */\n\n${tail}`;
}

const CHECKLIST = [
  '1. Syntax: parses cleanly — balanced brackets/quotes/tags, no obvious parse error.',
  '2. Imports/refs: every symbol used is imported or defined; no missing or dangling references.',
  '3. Types/contracts: signatures, props, and types are consistent with how they are used.',
  '4. Logic: the change is internally coherent and does something sensible — no inverted conditions or no-ops.',
  '5. Scope/safety: no truncation, leftover TODO/placeholder, debug logging, or hardcoded secret; nothing needed was deleted.',
].join('\n');

/**
 * Run the 5-point checklist against an edit. Always resolves to a short string
 * that gets appended to the edit tool's result so the model sees the verdict
 * on its next turn. Never throws.
 */
export async function reviewEdit(
  apiKey: string,
  edit: { path: string; content: string },
): Promise<string> {
  // Skip trivial/non-code edits entirely — no Groq call, no added latency.
  if (shouldSkipReview(edit.path, edit.content)) return '';

  const reviewCall = (async (): Promise<string> => {
    const data = await groqFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODELS.FAST,
        temperature: 0,
        max_tokens: 320,
        messages: [
          {
            role: 'system',
            content:
              'You are a strict code reviewer. You are given the FULL new content the agent just wrote to a file. ' +
              'Evaluate ONLY this content against the 5-point checklist. For each point output one line: ' +
              '"<n>. PASS" or "<n>. FAIL — <≤12-word reason>". Then a final line: ' +
              '"VERDICT: PASS" if all five pass, otherwise "VERDICT: FAIL — fix points <list>". ' +
              'Be terse. Do not output anything else. Do not rewrite the code.\n\nCHECKLIST:\n' +
              CHECKLIST,
          },
          {
            role: 'user',
            content: `FILE: ${edit.path}\n\n----- BEGIN CONTENT -----\n${clipForReview(edit.content)}\n----- END CONTENT -----`,
          },
        ],
      }),
    });
    const verdict = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!verdict) return '[Self-review: no verdict returned]';
    return verdict;
  })();

  const timeout = new Promise<string>((resolve) =>
    setTimeout(
      () => resolve(`[Self-review skipped: exceeded ${SELF_REVIEW_TIMEOUT_MS / 1000}s limit — edit kept; verify manually]`),
      SELF_REVIEW_TIMEOUT_MS,
    ),
  );

  let body: string;
  try {
    body = await Promise.race([reviewCall, timeout]);
  } catch (err: any) {
    body = `[Self-review skipped: ${err?.message ?? 'error'} — edit kept]`;
  }

  return `\n\n--- Self-review (5-point check) for ${edit.path} ---\n${body}\nIf any point is FAIL, fix it now before continuing.`;
}
