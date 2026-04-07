/**
 * PermissionsService — Granular Allow / Ask / Deny rules for Code Bleu tools
 *
 * Rules are defined in BLEUMR.md under a ## Permissions section:
 *
 *   ## Permissions
 *   - allow: read_file, list_directory, search_in_files, find_files, file_exists
 *   - allow: write_file, replace_in_file, create_directory
 *   - ask: run_command, git_commit, git_push, install_package, delete_file
 *   - deny: rm -rf, git push --force, sudo, curl | sh
 *
 * Resolution order: deny > ask > allow > default
 *
 * For shell commands (run_command), deny patterns are matched against the
 * command string itself, not the tool name. This catches dangerous shell
 * invocations even when run_command is on the allow list.
 */

export type PermissionVerdict = 'allow' | 'ask' | 'deny';

export interface PermissionRule {
  verdict: Exclude<PermissionVerdict, 'allow'> | 'allow';
  pattern: string;     // tool name OR shell substring (for deny)
  isShellPattern: boolean; // true = match against command string, false = match tool name
}

export interface PermissionRuleSet {
  rules: PermissionRule[];
  // Quick-lookup sets for tool-name rules
  allowedTools: Set<string>;
  askedTools: Set<string>;
  deniedTools: Set<string>;
  // Substring patterns for shell command denial
  shellDenyPatterns: string[];
}

const VALID_VERDICTS = new Set<PermissionVerdict>(['allow', 'ask', 'deny']);

/**
 * Default rule set when no BLEUMR.md or no Permissions section.
 * Mirrors Claude Code's "read-only by default" model — but Code Bleu has
 * the autoApprove toggle, so we leave action tools as "ask" only when
 * the toggle is off (handled in resolvePermission).
 */
const DEFAULT_READ_ONLY_TOOLS = new Set([
  'read_file', 'list_directory', 'search_in_files', 'find_files',
  'find_definition', 'find_usages', 'get_project_tree', 'get_project_info',
  'detect_stack', 'analyze_dependencies', 'file_info', 'file_exists',
  'count_lines', 'web_search', 'fetch_url', 'check_url',
  'git_status', 'git_diff', 'git_log', 'check_port',
]);

/**
 * Hard-deny shell patterns — always blocked regardless of BLEUMR.md.
 * These are catastrophic and a user should never auto-run them via the agent.
 */
const HARD_DENY_PATTERNS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf $HOME',
  'rm -rf *',
  ':(){ :|:& };:',           // fork bomb
  'mkfs.',                    // format filesystem
  'dd if=/dev/zero of=/dev',  // disk wipe
  '> /dev/sda',
  'curl | sh',                // pipe-to-shell
  'curl | bash',
  'wget | sh',
  'wget | bash',
  'chmod -R 777 /',
];

/**
 * Parse permission rules from BLEUMR.md content.
 * Looks for "## Permissions" section with `- verdict: pattern1, pattern2` lines.
 */
export function parsePermissions(bleumrContent: string): PermissionRuleSet {
  const empty: PermissionRuleSet = {
    rules: [],
    allowedTools: new Set(),
    askedTools: new Set(),
    deniedTools: new Set(),
    shellDenyPatterns: [...HARD_DENY_PATTERNS],
  };

  if (!bleumrContent) return empty;

  const sectionMatch = bleumrContent.match(/## Permissions\s*\n([\s\S]*?)(?=\n## |\n#[^#]|$)/i);
  if (!sectionMatch) return empty;

  const section = sectionMatch[1];
  const lines = section.split('\n');

  const result: PermissionRuleSet = {
    rules: [],
    allowedTools: new Set(),
    askedTools: new Set(),
    deniedTools: new Set(),
    shellDenyPatterns: [...HARD_DENY_PATTERNS],
  };

  for (const line of lines) {
    // Match: - verdict: pattern1, pattern2, pattern3
    const match = line.match(/^\s*-\s*(allow|ask|deny)\s*:\s*(.+)$/i);
    if (!match) continue;

    const verdict = match[1].toLowerCase() as PermissionVerdict;
    const patternsStr = match[2].trim();

    if (!VALID_VERDICTS.has(verdict)) continue;

    // Split on commas, trim each
    const patterns = patternsStr.split(',').map(p => p.trim()).filter(Boolean);

    for (const pattern of patterns) {
      // Heuristic: if pattern contains a space, |, >, or starts with a known
      // shell prefix, treat it as a shell substring pattern (for deny only)
      const isShellPattern = /[\s|><]/.test(pattern) ||
        pattern.startsWith('rm ') || pattern.startsWith('sudo') ||
        pattern.startsWith('chmod') || pattern.startsWith('chown') ||
        pattern.startsWith('curl ') || pattern.startsWith('wget ');

      result.rules.push({ verdict, pattern, isShellPattern });

      if (isShellPattern) {
        // Shell patterns only meaningful for deny
        if (verdict === 'deny') {
          result.shellDenyPatterns.push(pattern.toLowerCase());
        }
      } else {
        // Tool-name pattern
        if (verdict === 'allow') result.allowedTools.add(pattern);
        else if (verdict === 'ask') result.askedTools.add(pattern);
        else result.deniedTools.add(pattern);
      }
    }
  }

  return result;
}

/**
 * Resolve a permission decision for a tool call.
 *
 * @param toolName  The tool being called (e.g. "write_file", "run_command")
 * @param shellCmd  For run_command, the actual command string (for deny matching)
 * @param rules     The parsed rule set
 * @param autoApprove  The current autoApprove toggle (acts as a fallback policy)
 * @returns 'allow' | 'ask' | 'deny'
 */
export function resolvePermission(
  toolName: string,
  shellCmd: string | undefined,
  rules: PermissionRuleSet,
  autoApprove: boolean,
): PermissionVerdict {
  // 1. Hard deny — shell patterns checked FIRST against any command string.
  if (toolName === 'run_command' && shellCmd) {
    const lowerCmd = shellCmd.toLowerCase();
    for (const pattern of rules.shellDenyPatterns) {
      if (lowerCmd.includes(pattern)) return 'deny';
    }
  }

  // 2. Explicit deny by tool name
  if (rules.deniedTools.has(toolName)) return 'deny';

  // 3. Explicit ask by tool name
  if (rules.askedTools.has(toolName)) return 'ask';

  // 4. Explicit allow by tool name
  if (rules.allowedTools.has(toolName)) return 'allow';

  // 5. Default: read-only tools always allowed
  if (DEFAULT_READ_ONLY_TOOLS.has(toolName)) return 'allow';

  // 6. Fallback: respect the autoApprove toggle for everything else
  return autoApprove ? 'allow' : 'ask';
}

/**
 * Format a deny verdict as a tool result string the model will understand.
 */
export function formatDenyResult(toolName: string, shellCmd?: string): string {
  if (shellCmd) {
    return `Command BLOCKED by deny rule in BLEUMR.md: "${shellCmd.slice(0, 100)}". Choose a different approach. Do NOT retry the same command.`;
  }
  return `Tool "${toolName}" is BLOCKED by deny rule in BLEUMR.md. Choose a different tool or approach.`;
}

/**
 * Format an "ask" verdict as a confirmation message.
 */
export function formatAskMessage(toolName: string, args: Record<string, unknown>): string {
  const argSummary = Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v).slice(0, 80)}`)
    .join(', ');
  return `Permission needed for ${toolName}(${argSummary})`;
}

/**
 * Quick check: does the rule set have any user-defined rules?
 * Used to decide whether to log "BLEUMR permissions active" in the UI.
 */
export function hasCustomPermissions(rules: PermissionRuleSet): boolean {
  return rules.allowedTools.size > 0 ||
         rules.askedTools.size > 0 ||
         rules.deniedTools.size > 0 ||
         rules.shellDenyPatterns.length > HARD_DENY_PATTERNS.length;
}
