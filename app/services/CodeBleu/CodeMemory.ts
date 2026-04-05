/**
 * CodeMemory — Auto-memory for Code Bleu sessions
 *
 * Wraps BrainMemory to extract and recall code-specific knowledge:
 * - Build commands that worked
 * - Error/fix pairs
 * - User coding preferences
 * - Project patterns
 */

import { BrainMemory } from '../BrainMemory';

/**
 * Extract learnable memories from a completed agent interaction.
 * Called at the end of the agentic loop.
 */
export function extractCodeMemories(
  userMessage: string,
  assistantResponse: string,
  toolResults: string[],
): void {
  const allResults = toolResults.join('\n');

  // Learn successful build/run commands
  for (const result of toolResults) {
    if (!result) continue;

    // Detect successful command outputs (npm/build/test patterns)
    if (result.match(/✓|success|compiled|built in|passed|0 error/i) && result.length > 10) {
      // Find the command that produced this result by looking at context
      const cmdMatch = result.match(/^> (.+)$/m) || result.match(/running[:\s]+(.+)/i);
      if (cmdMatch) {
        BrainMemory.learn({
          category: 'build_command',
          content: `Command that worked: ${cmdMatch[1].slice(0, 200)}`,
          source: 'code_bleu',
          confidence: 0.8,
        });
      }
    }

    // Detect error+fix pairs
    if (result.match(/error|failed|ERR!/i) && assistantResponse.match(/fix|fixed|resolved|changed/i)) {
      const errorSnippet = result.slice(0, 200);
      const fixSnippet = assistantResponse.match(/(?:fix|changed|updated|replaced)[^.]*\./i)?.[0] || '';
      if (fixSnippet) {
        BrainMemory.learn({
          category: 'error_fix',
          content: `Error: ${errorSnippet}\nFix: ${fixSnippet}`,
          source: 'code_bleu',
          confidence: 0.7,
        });
      }
    }
  }

  // Learn user coding preferences from their messages
  const prefPatterns: [RegExp, string][] = [
    [/(?:i |we |always |prefer )use\s+(pnpm|yarn|bun|npm)\b/i, 'Package manager preference'],
    [/(?:i |we |always |prefer )use\s+(tabs|spaces|2 spaces|4 spaces)\b/i, 'Indentation preference'],
    [/(?:i |we )(?:use|prefer|like)\s+(typescript|javascript|python|rust|go)\b/i, 'Language preference'],
    [/(?:our |my )?tests?\s+(?:are |go )in\s+([^\s,]+)/i, 'Test directory location'],
    [/(?:use|prefer)\s+(jest|vitest|mocha|pytest|cargo test)\b/i, 'Test framework preference'],
    [/(?:use|prefer)\s+(eslint|prettier|biome|deno fmt)\b/i, 'Linter/formatter preference'],
  ];

  for (const [pattern, label] of prefPatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      BrainMemory.learn({
        category: 'preference',
        content: `${label}: ${match[0].trim()}`,
        source: 'code_bleu',
        confidence: 0.9,
      });
    }
  }
}

/**
 * Get relevant code memories for injection into system prompt.
 */
export function getCodeContext(query: string): string {
  return BrainMemory.toPromptContext(query, 'code_bleu');
}
