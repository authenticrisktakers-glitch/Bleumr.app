// ─── Code Bleu 55-Tool System ────────────────────────────────────────────────

import { shellSafe } from './utils';

export function mkTool(name: string, desc: string, params: Record<string, string>, required: string[]) {
  return {
    type: 'function' as const,
    function: {
      name,
      description: desc,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(params).map(([k, d]) => [k, { type: 'string' as const, description: d }])
        ),
        required,
      },
    },
  };
}

export const TOOL_CAT: Record<string, string> = {};

function tagged(cat: string, tool: ReturnType<typeof mkTool>) {
  TOOL_CAT[tool.function.name] = cat;
  return tool;
}

export const ALL_TOOLS = [
  tagged('core', mkTool('read_file', 'Read file contents. Always read before modifying.', { path: 'File path (relative or absolute)' }, ['path'])),
  tagged('core', mkTool('write_file', 'Write/create a file with COMPLETE content. Always write the full file, never partial.', { path: 'File path', content: 'The COMPLETE file content' }, ['path', 'content'])),
  tagged('core', mkTool('list_directory', 'List files and subdirectories. Use "." for project root.', { path: 'Directory path' }, ['path'])),
  tagged('core', mkTool('run_command', 'Run any shell command in the project directory. Returns stdout, stderr, exit code.', { command: 'Shell command to execute' }, ['command'])),
  tagged('core', mkTool('ask_user', 'Ask the user a question with clickable option buttons. Use when you need clarification.', { question: 'The question to ask', options: 'Comma-separated list of clickable answer options' }, ['question', 'options'])),
  tagged('files', mkTool('create_directory', 'Create a directory (including nested parents).', { path: 'Directory path to create' }, ['path'])),
  tagged('files', mkTool('delete_file', 'Delete a file or empty directory.', { path: 'Path to delete' }, ['path'])),
  tagged('files', mkTool('rename_file', 'Rename or move a file.', { old_path: 'Current path', new_path: 'New path' }, ['old_path', 'new_path'])),
  tagged('files', mkTool('copy_file', 'Copy a file to a new location.', { source: 'Source path', destination: 'Destination path' }, ['source', 'destination'])),
  tagged('files', mkTool('move_file', 'Move a file to a different directory.', { source: 'Source path', destination: 'Destination path' }, ['source', 'destination'])),
  tagged('files', mkTool('file_exists', 'Check if a file or directory exists.', { path: 'Path to check' }, ['path'])),
  tagged('files', mkTool('search_in_files', 'Search for text/pattern across project files (like grep).', { pattern: 'Search pattern or regex', file_type: 'Optional file extension filter (e.g. "ts", "py")' }, ['pattern'])),
  tagged('files', mkTool('find_files', 'Find files matching a name pattern (like glob/find).', { pattern: 'Filename pattern (e.g. "*.tsx", "test_*")' }, ['pattern'])),
  tagged('files', mkTool('replace_in_file', 'Find and replace text in a file.', { path: 'File path', find: 'Text to find', replace: 'Replacement text' }, ['path', 'find', 'replace'])),
  tagged('files', mkTool('file_info', 'Get file metadata (size, modified date, type).', { path: 'File path' }, ['path'])),
  tagged('project', mkTool('create_project', "Create a new project folder on the user's Desktop. Returns the absolute path.", { name: 'Project folder name (e.g. "my-app")' }, ['name'])),
  tagged('project', mkTool('get_project_tree', 'Get a visual tree of the project file structure.', { depth: 'Max depth (default 3)', path: 'Subdirectory to tree (default root)' }, [])),
  tagged('project', mkTool('get_project_info', 'Get project metadata: name, stack, dependencies, scripts.', {}, [])),
  tagged('git', mkTool('git_status', 'Show git working tree status.', {}, [])),
  tagged('git', mkTool('git_diff', 'Show unstaged changes or diff for a specific file.', { file: 'Optional specific file to diff' }, [])),
  tagged('git', mkTool('git_log', 'Show recent commit history.', { count: 'Number of commits (default 15)' }, [])),
  tagged('git', mkTool('git_commit', 'Stage all changes and create a commit.', { message: 'Commit message' }, ['message'])),
  tagged('git', mkTool('git_add', 'Stage files for commit.', { files: 'Files to stage (space-separated, or "." for all)' }, ['files'])),
  tagged('git', mkTool('git_push', 'Push commits to remote.', { remote: 'Remote name (default origin)', branch: 'Branch name' }, [])),
  tagged('git', mkTool('git_pull', 'Pull latest changes from remote.', { remote: 'Remote name', branch: 'Branch name' }, [])),
  tagged('git', mkTool('git_branch', 'List branches or create a new branch.', { name: 'New branch name (omit to list branches)' }, [])),
  tagged('git', mkTool('git_checkout', 'Switch to a different branch.', { branch: 'Branch name to switch to' }, ['branch'])),
  tagged('git', mkTool('git_stash', 'Stash or restore uncommitted changes.', { action: 'Action: save, pop, or list (default save)' }, [])),
  tagged('git', mkTool('git_merge', 'Merge a branch into the current branch.', { branch: 'Branch to merge' }, ['branch'])),
  tagged('git', mkTool('git_clone', 'Clone a git repository.', { url: 'Repository URL', directory: 'Target directory name' }, ['url'])),
  tagged('packages', mkTool('install_package', 'Install one or more packages.', { packages: 'Package names (space-separated)', dev: 'Set to "true" for dev dependency' }, ['packages'])),
  tagged('packages', mkTool('uninstall_package', 'Remove installed packages.', { packages: 'Package names (space-separated)' }, ['packages'])),
  tagged('packages', mkTool('list_packages', 'List installed packages and versions.', {}, [])),
  tagged('packages', mkTool('check_outdated', 'Check for outdated packages that can be updated.', {}, [])),
  tagged('packages', mkTool('init_package_json', 'Initialize a new package.json or project config.', { template: 'Optional template (e.g. "vite", "express")' }, [])),
  tagged('build', mkTool('run_tests', 'Run the project test suite.', { command: 'Custom test command (default: npm test)' }, [])),
  tagged('build', mkTool('run_build', 'Build the project for production.', { command: 'Custom build command (default: npm run build)' }, [])),
  tagged('build', mkTool('run_lint', 'Run the linter on the project.', { command: 'Custom lint command' }, [])),
  tagged('build', mkTool('run_format', 'Format code with prettier or similar.', { command: 'Custom format command' }, [])),
  tagged('build', mkTool('start_dev_server', 'Start the development server.', { command: 'Custom dev command (default: npm run dev)' }, [])),
  tagged('build', mkTool('stop_process', 'Kill a running process by name or PID.', { target: 'Process name or PID' }, ['target'])),
  tagged('build', mkTool('check_port', 'Check if a port is in use and what process is using it.', { port: 'Port number' }, ['port'])),
  tagged('web', mkTool('web_search', 'Search the web for documentation, solutions, package info, or any current information.', { query: 'Search query' }, ['query'])),
  tagged('web', mkTool('fetch_url', 'Fetch the content of a URL (HTML, JSON, text).', { url: 'URL to fetch', format: 'Expected format: html, json, or text (default text)' }, ['url'])),
  tagged('web', mkTool('check_url', 'Check if a URL is reachable (HEAD request).', { url: 'URL to check' }, ['url'])),
  tagged('web', mkTool('validate_html', 'Validate HTML code against W3C standards. Returns errors, warnings, and suggestions for spec compliance. Use after writing or modifying HTML files.', { html: 'Complete HTML string to validate' }, ['html'])),
  tagged('web', mkTool('validate_css', 'Validate CSS code against W3C standards. Returns errors, warnings, and compliance issues.', { css: 'CSS code string to validate' }, ['css'])),
  tagged('analysis', mkTool('find_definition', 'Find where a function, class, or variable is defined.', { name: 'Symbol name to find', file_type: 'File extension filter (e.g. "ts")' }, ['name'])),
  tagged('analysis', mkTool('find_usages', 'Find all files that reference/import a symbol.', { name: 'Symbol name to search for' }, ['name'])),
  tagged('analysis', mkTool('count_lines', 'Count lines of code in the project or specific files.', { path: 'Optional path to count (default: whole project)' }, [])),
  tagged('analysis', mkTool('detect_stack', 'Detect the project tech stack, framework, and language.', {}, [])),
  tagged('analysis', mkTool('analyze_dependencies', 'Analyze project dependencies and find issues.', {}, [])),
  tagged('scaffold', mkTool('scaffold_component', 'Generate a component file with boilerplate.', { name: 'Component name', framework: 'Framework: react, vue, svelte (default react)' }, ['name'])),
  tagged('scaffold', mkTool('scaffold_page', 'Generate a page/route file with boilerplate.', { name: 'Page name', framework: 'Framework (default react)' }, ['name'])),
  tagged('scaffold', mkTool('scaffold_api', 'Generate an API route/endpoint file.', { name: 'Endpoint name', method: 'HTTP method (default GET)' }, ['name'])),
  tagged('scaffold', mkTool('scaffold_test', 'Generate a test file for a source file.', { source_file: 'Source file to test', framework: 'Test framework: jest, vitest, pytest' }, ['source_file'])),
  tagged('scaffold', mkTool('init_framework', 'Initialize a project with a specific framework.', { framework: 'Framework: nextjs, vite-react, vite-vue, express, flask, etc.' }, ['framework'])),
  tagged('agents', mkTool('dispatch_agent', 'Dispatch a specialized sub-agent for heavy parallel work.', { agent: 'Agent name: FileScout, LintCheck, Refactor, or TestGen', files: 'Comma-separated file paths', instruction: 'What the agent should do' }, ['agent', 'files'])),
  tagged('files', mkTool('import_image', 'Copy a user-uploaded image file into the project (e.g. as a logo or asset). The user attaches images in chat — use the file path they provided.', { source_path: 'Absolute path to the source image file', dest_path: 'Destination path in the project (e.g. public/logo.png, src/assets/hero.jpg)' }, ['source_path', 'dest_path'])),
  tagged('core', mkTool('rollback_file', 'Undo the last change to a file. Restores it to the version before your most recent write. Use when you broke something or want to try a different approach. Can call multiple times to undo multiple changes.', { path: 'File path to roll back' }, ['path'])),
  tagged('core', mkTool('rollback_file_original', 'Nuclear rollback — restore a file to its ORIGINAL state before you touched it at all. Erases all your changes to this file. Use when you\'ve made a mess and need to start fresh.', { path: 'File path to fully restore' }, ['path'])),
];

export const SHELL_CMD: Record<string, (a: any) => string> = {
  git_status: () => 'git status',
  git_diff: (a) => a.file ? `git diff -- "${shellSafe(a.file)}"` : 'git diff',
  git_log: (a) => { const n = parseInt(a.count, 10); return `git log --oneline -${(n > 0 && n < 200) ? n : 15}`; },
  git_commit: (a) => `git add -A && git commit -m "${shellSafe(a.message || 'update')}"`,
  git_add: (a) => `git add "${shellSafe(a.files || '.')}"`,
  git_push: (a) => `git push "${shellSafe(a.remote || 'origin')}" "${shellSafe(a.branch || '')}"`.trim(),
  git_pull: (a) => `git pull "${shellSafe(a.remote || '')}" "${shellSafe(a.branch || '')}"`.trim(),
  git_branch: (a) => a.name ? `git checkout -b "${shellSafe(a.name)}"` : 'git branch -a',
  git_checkout: (a) => `git checkout "${shellSafe(a.branch)}"`,
  git_stash: (a) => a.action === 'pop' ? 'git stash pop' : a.action === 'list' ? 'git stash list' : 'git stash',
  git_merge: (a) => `git merge "${shellSafe(a.branch)}"`,
  git_clone: (a) => `git clone "${shellSafe(a.url)}" "${shellSafe(a.directory || '')}"`.trim(),
  install_package: (a) => `npm install "${shellSafe(a.packages)}"${a.dev === 'true' ? ' --save-dev' : ''}`,
  uninstall_package: (a) => `npm uninstall "${shellSafe(a.packages)}"`,
  list_packages: () => 'npm list --depth=0 2>/dev/null || pip list 2>/dev/null || echo "No package manager detected"',
  check_outdated: () => 'npm outdated 2>/dev/null || pip list --outdated 2>/dev/null || echo "No package manager detected"',
  init_package_json: (a) => a.template ? `npm create "${shellSafe(a.template)}"@latest . -- --yes 2>/dev/null || npm init -y` : 'npm init -y',
  run_tests: (a) => a.command || 'npm test 2>&1',
  run_build: (a) => a.command || 'npm run build 2>&1',
  run_lint: (a) => a.command || 'npx eslint . 2>&1 || echo "No linter configured"',
  run_format: (a) => a.command || 'npx prettier --write . 2>&1 || echo "No formatter configured"',
  start_dev_server: (a) => a.command || 'npm run dev &',
  stop_process: (a) => /^\d+$/.test(a.target) ? `kill ${a.target}` : `pkill -f '${shellSafe(a.target)}' || echo "Process not found"`,
  check_port: (a) => { const p = parseInt(a.port, 10); return (p > 0 && p < 65536) ? `lsof -i :${p} 2>/dev/null || echo "Port ${p} is free"` : 'echo "Invalid port"'; },
  delete_file: (a) => `rm -f "${shellSafe(a.path)}"`,
  rename_file: (a) => `mv "${shellSafe(a.old_path)}" "${shellSafe(a.new_path)}"`,
  copy_file: (a) => `cp "${shellSafe(a.source)}" "${shellSafe(a.destination)}"`,
  move_file: (a) => `mv "${shellSafe(a.source)}" "${shellSafe(a.destination)}"`,
  file_info: (a) => `ls -la "${shellSafe(a.path)}" && file "${shellSafe(a.path)}"`,
  find_definition: (a) => `grep -rn "\\b(function|class|const|let|var|interface|type|def|struct|enum)\\s\\+${shellSafe(a.name)}\\b" . --include='*.${shellSafe(a.file_type || '*')}' 2>/dev/null | head -20`,
  find_usages: (a) => `grep -rn '${shellSafe(a.name)}' . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" 2>/dev/null | head -30`,
  count_lines: (a) => a.path ? `wc -l "${shellSafe(a.path)}"` : 'find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.rs" | grep -v node_modules | head -80 | xargs wc -l 2>/dev/null',
  detect_stack: () => 'echo "=== Config files ===" && ls package.json Cargo.toml go.mod requirements.txt pyproject.toml Gemfile composer.json Makefile Dockerfile 2>/dev/null; echo "=== Package manager ===" && (cat package.json 2>/dev/null | head -5 || echo "No package.json")',
  analyze_dependencies: () => 'npm ls --depth=0 2>/dev/null && echo "=== Peer deps ===" && npm ls --depth=0 2>&1 | grep "peer dep" || true',
  init_framework: (a) => {
    const fw = shellSafe((a.framework || '').toLowerCase());
    if (fw.includes('next')) return 'npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --yes';
    if (fw.includes('vite') && fw.includes('vue')) return 'npm create vite@latest . -- --template vue-ts';
    if (fw.includes('vite') || fw.includes('react')) return 'npm create vite@latest . -- --template react-ts';
    if (fw.includes('svelte')) return 'npm create vite@latest . -- --template svelte-ts';
    if (fw.includes('express')) return 'npm init -y && npm install express typescript @types/express @types/node tsx';
    if (fw.includes('flask') || fw.includes('python')) return 'python3 -m venv venv && source venv/bin/activate && pip install flask';
    if (fw.includes('electron')) return 'npm init -y && npm install electron --save-dev';
    return `echo "Unknown framework: ${fw}. Use run_command directly."`;
  },
};

/** Dynamic tool selection — picks the right ~12-15 tools based on context */
export function pickTools(userMsg: string, hasProject: boolean): any[] {
  if (!hasProject) {
    return ALL_TOOLS.filter(t => [
      'create_project', 'write_file', 'read_file', 'create_directory',
      'list_directory', 'run_command', 'web_search',
      'install_package', 'init_framework', 'start_dev_server',
      'file_exists',
    ].includes(t.function.name));
  }

  const selected = new Set<string>(['read_file', 'write_file', 'replace_in_file', 'run_command', 'list_directory', 'rollback_file', 'rollback_file_original']);
  selected.add('web_search');
  selected.add('dispatch_agent');

  const msg = userMsg.toLowerCase();

  if (msg.match(/git|commit|branch|push|pull|merge|stash|checkout|clone|version control/))
    ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_add', 'git_push', 'git_pull', 'git_branch', 'git_checkout', 'git_stash', 'git_merge', 'git_clone'].forEach(t => selected.add(t));
  if (msg.match(/install|package|npm|pip|cargo|yarn|pnpm|dependency|dependencies|node_modules/))
    ['install_package', 'uninstall_package', 'list_packages', 'check_outdated', 'init_package_json'].forEach(t => selected.add(t));
  if (msg.match(/test|build|lint|format|deploy|dev server|start|compile|bundle|stop|kill|process/))
    ['run_tests', 'run_build', 'run_lint', 'run_format', 'start_dev_server', 'stop_process', 'check_port'].forEach(t => selected.add(t));
  if (msg.match(/search|find|grep|where|locate|look for/))
    ['search_in_files', 'find_files', 'find_definition', 'find_usages'].forEach(t => selected.add(t));
  if (msg.match(/scaffold|generate|create component|new component|boilerplate|template|setup|initialize/))
    ['scaffold_component', 'scaffold_page', 'scaffold_api', 'scaffold_test', 'init_framework', 'create_directory'].forEach(t => selected.add(t));
  if (msg.match(/delete|remove|rename|move|copy|reorganize|clean/))
    ['delete_file', 'rename_file', 'copy_file', 'move_file', 'create_directory', 'file_info'].forEach(t => selected.add(t));
  if (msg.match(/replace|refactor|update all|rename variable|find and replace|change|modify|edit|tweak|adjust|add.*to|update|color|style|fix|improve/))
    ['replace_in_file', 'search_in_files', 'find_usages'].forEach(t => selected.add(t));
  if (msg.match(/api|fetch|url|endpoint|request|http|check.*url|reachable/))
    ['fetch_url', 'check_url', 'scaffold_api'].forEach(t => selected.add(t));
  if (msg.match(/valid|w3c|html|css|standards|compliance|accessibility|a11y|spec|semantic/))
    ['validate_html', 'validate_css', 'fetch_url'].forEach(t => selected.add(t));
  if (msg.match(/info|structure|tree|overview|analyze|understand|what is|dependencies|dep/))
    ['get_project_tree', 'get_project_info', 'detect_stack', 'count_lines', 'analyze_dependencies', 'file_info'].forEach(t => selected.add(t));
  if (msg.match(/new project|start fresh|from scratch|create.*app|create.*project/))
    ['create_project', 'init_framework', 'create_directory', 'init_package_json'].forEach(t => selected.add(t));
  if (msg.match(/image|logo|icon|asset|photo|picture|import.*image/))
    selected.add('import_image');

  if (selected.size < 10)
    ['create_directory', 'search_in_files', 'find_files', 'file_exists', 'replace_in_file', 'get_project_tree', 'file_info', 'stop_process'].forEach(t => selected.add(t));

  const selectedNames = [...selected].slice(0, 17);
  return ALL_TOOLS.filter(t => selectedNames.includes(t.function.name));
}
