/**
 * HooksService — Pre/post edit automation for Code Bleu
 *
 * Hooks are defined in BLEUMR.md under a ## Hooks section:
 *
 *   ## Hooks
 *   - after_write: npx prettier --write {file}
 *   - after_write(*.test.*): npx jest {file} --no-coverage
 *   - on_error: echo "Error occurred" >> .bleumr/errors.log
 *
 * {file} is replaced with the actual file path at runtime.
 *
 * SECURITY: Hook commands are restricted to an allowlist of safe prefixes
 * (formatters, linters, test runners). Arbitrary shell commands are blocked.
 * Placeholder values are shell-escaped to prevent injection.
 */

export type HookTrigger =
  | 'before_write'
  | 'after_write'
  | 'before_command'
  | 'after_command'
  | 'on_error'
  | 'session_start'    // fires once when a Code Bleu session starts
  | 'session_end'      // fires when the session is closed/switched
  | 'pre_tool_use'     // fires before ANY tool call (context.tool = name)
  | 'post_tool_use'    // fires after ANY tool call (context.tool, context.success)
  | 'on_compact'       // fires when conversation is compacted to save tokens
  | 'task_complete';   // fires when the agentic loop finishes naturally

export interface Hook {
  trigger: HookTrigger;
  command: string;
  pattern?: string;  // optional glob pattern to match file paths or tool names
}

const VALID_TRIGGERS = new Set<HookTrigger>([
  'before_write', 'after_write', 'before_command', 'after_command', 'on_error',
  'session_start', 'session_end', 'pre_tool_use', 'post_tool_use',
  'on_compact', 'task_complete',
]);

/**
 * Allowlist of safe command prefixes for hooks.
 * Only commands starting with these prefixes are allowed to execute.
 * This prevents arbitrary code execution from BLEUMR.md files (e.g., cloned repos).
 */
const SAFE_HOOK_PREFIXES = [
  // Formatters
  'npx prettier', 'prettier', 'npx biome format', 'biome format',
  'npx dprint', 'dprint',
  // Linters
  'npx eslint', 'eslint', 'npx biome lint', 'biome lint',
  'npx stylelint', 'stylelint', 'npx tsc', 'tsc',
  // Test runners
  'npx jest', 'jest', 'npx vitest', 'vitest',
  'npx mocha', 'mocha', 'npm test', 'npm run test',
  'pnpm test', 'pnpm run test', 'yarn test', 'yarn run test',
  // Build tools (read-only checks)
  'npx tsc --noEmit', 'tsc --noEmit',
  // Echo (for logging)
  'echo ',
];

/**
 * Check if a command is on the safe allowlist.
 */
function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim().toLowerCase();
  return SAFE_HOOK_PREFIXES.some(prefix => trimmed.startsWith(prefix.toLowerCase()));
}

/**
 * Shell-escape a string for safe interpolation into a shell command.
 * Wraps in single quotes and escapes any embedded single quotes.
 */
function shellEscape(value: string): string {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Parse hooks from BLEUMR.md content.
 * Looks for a "## Hooks" section with `- trigger: command` lines.
 * Only hooks with allowlisted commands are accepted.
 */
export function parseHooks(bleumrContent: string): Hook[] {
  const hooks: Hook[] = [];

  // Find the ## Hooks section
  const hooksMatch = bleumrContent.match(/## Hooks\s*\n([\s\S]*?)(?=\n## |\n#[^#]|$)/i);
  if (!hooksMatch) return hooks;

  const section = hooksMatch[1];
  const lines = section.split('\n');

  for (const line of lines) {
    // Match: - trigger: command  OR  - trigger(pattern): command
    const match = line.match(/^\s*-\s*([\w_]+)(?:\(([^)]+)\))?:\s*(.+)$/);
    if (!match) continue;

    const [, triggerStr, pattern, command] = match;
    const trigger = triggerStr as HookTrigger;

    if (VALID_TRIGGERS.has(trigger) && command.trim()) {
      // Only accept commands on the allowlist
      if (isCommandAllowed(command.trim())) {
        hooks.push({
          trigger,
          command: command.trim(),
          pattern: pattern?.trim(),
        });
      }
      // Silently skip non-allowlisted commands (don't expose what was blocked)
    }
  }

  return hooks;
}

/**
 * Check if a file path matches a hook's glob pattern.
 * Simple glob: * matches any chars, ** matches path separators too.
 */
function matchesPattern(filePath: string, pattern?: string): boolean {
  if (!pattern) return true;  // no pattern = match all
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*');
  return new RegExp(regex).test(filePath);
}

/**
 * Find and run matching hooks for a trigger.
 * Placeholder values ({file}, {tool}, {error}) are shell-escaped before substitution.
 *
 * For file-scoped triggers (before/after_write), the hook's `pattern` is matched
 * against context.file. For tool-scoped triggers (pre/post_tool_use), `pattern` is
 * matched against context.tool. Lifecycle triggers (session_start, task_complete,
 * on_compact) ignore patterns.
 *
 * @returns combined output from all matching hooks, or null if none ran
 */
export async function runHooks(
  trigger: HookTrigger,
  context: { file?: string; tool?: string; error?: string; success?: boolean },
  hooks: Hook[],
  shellExec: (cmd: string, cwd: string) => Promise<{ stdout: string; stderr: string; success: boolean }>,
  cwd: string,
): Promise<string | null> {
  // Pick the right field for pattern matching based on trigger type
  const matchTarget =
    trigger === 'pre_tool_use' || trigger === 'post_tool_use'
      ? context.tool || ''
      : context.file || '';

  // Lifecycle triggers don't pattern-match
  const isLifecycle =
    trigger === 'session_start' || trigger === 'session_end' ||
    trigger === 'task_complete' || trigger === 'on_compact';

  const matching = hooks.filter(h => {
    if (h.trigger !== trigger) return false;
    if (isLifecycle) return true;
    return matchesPattern(matchTarget, h.pattern);
  });

  if (matching.length === 0) return null;

  const outputs: string[] = [];

  for (const hook of matching) {
    let cmd = hook.command;
    // Shell-escape placeholder values to prevent injection
    if (context.file) cmd = cmd.replace(/\{file\}/g, shellEscape(context.file));
    if (context.tool) cmd = cmd.replace(/\{tool\}/g, shellEscape(context.tool));
    if (context.error) cmd = cmd.replace(/\{error\}/g, shellEscape(context.error.slice(0, 200)));
    if (context.success !== undefined) {
      cmd = cmd.replace(/\{success\}/g, context.success ? 'true' : 'false');
    }

    try {
      const res = await shellExec(cmd, cwd);
      const output = (res.stdout || res.stderr || '').trim();
      if (output) outputs.push(`[${hook.trigger}] ${output.slice(0, 500)}`);
    } catch {
      outputs.push(`[${hook.trigger}] Hook failed: ${cmd}`);
    }
  }

  return outputs.length > 0 ? outputs.join('\n') : null;
}
