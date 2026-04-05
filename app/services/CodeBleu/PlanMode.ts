/**
 * PlanMode — Read-only mode for Code Bleu
 *
 * When active, the agent can only read/search/analyze.
 * No writes, deletes, or destructive shell commands.
 * Outputs a structured implementation plan instead of making changes.
 */

/** Tool names allowed in plan mode (read-only operations) */
const PLAN_MODE_TOOLS = new Set([
  // Read & search
  'read_file', 'list_directory', 'search_in_files', 'find_files',
  'find_definition', 'find_usages', 'file_exists', 'file_info',
  // Project analysis
  'get_project_tree', 'get_project_info', 'detect_stack',
  'analyze_dependencies', 'count_lines',
  // Web (read-only)
  'web_search', 'fetch_url', 'check_url',
  // Git (read-only)
  'git_status', 'git_diff', 'git_log',
  // Package inspection (read-only)
  'list_packages', 'check_outdated', 'check_port',
  // Validation (read-only — validates but doesn't modify)
  'validate_html', 'validate_css',
  // User interaction (dispatch_agent excluded — sub-agents can write files)
  'ask_user',
]);

/** Write/destructive tools that must be blocked even if they slip through */
const BLOCKED_IN_PLAN = new Set([
  'dispatch_agent',
  'write_file', 'delete_file', 'rename_file', 'copy_file', 'move_file',
  'create_directory', 'replace_in_file', 'run_command',
  'git_commit', 'git_add', 'git_push', 'git_pull', 'git_branch',
  'git_checkout', 'git_stash', 'git_merge', 'git_clone',
  'install_package', 'uninstall_package', 'init_package_json',
  'run_tests', 'run_build', 'run_lint', 'run_format',
  'start_dev_server', 'stop_process', 'init_framework',
  'scaffold_component', 'scaffold_page', 'scaffold_api', 'scaffold_test',
  'create_project', 'import_image',
]);

/**
 * Filter tools to only read-only operations.
 */
export function filterToolsForPlanMode(tools: any[]): any[] {
  return tools.filter(t => PLAN_MODE_TOOLS.has(t.function.name));
}

/**
 * Check if a tool call should be blocked in plan mode.
 * Returns an error message if blocked, null if allowed.
 */
export function checkPlanModeBlock(toolName: string): string | null {
  if (BLOCKED_IN_PLAN.has(toolName)) {
    return `Blocked: Plan mode is active. This tool (${toolName}) modifies files or state. Switch to Execute mode to make changes.`;
  }
  return null;
}

/** System prompt suffix for plan mode */
export const PLAN_MODE_PROMPT = `

IMPORTANT: You are in PLAN MODE. You may ONLY read files, search code, and analyze the project.
Do NOT write, delete, create, or modify any files. Do NOT run shell commands that change state.

Your job is to explore the codebase thoroughly, then output a structured implementation plan:

1. **Summary** — What you found and what needs to change
2. **Files to modify** — List each file with what changes are needed and why
3. **Implementation order** — Suggested sequence of changes
4. **Risks & edge cases** — What could go wrong, what to watch for
5. **Estimated scope** — How many files, rough complexity

Be thorough in your research. Read all relevant files before forming your plan.
`;
