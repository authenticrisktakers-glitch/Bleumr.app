// ─── Code Bleu Constants ─────────────────────────────────────────────────────

export const IMPORTANT_FILES = [
  'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js',
  'next.config.js', 'next.config.ts', 'next.config.mjs',
  'README.md', 'readme.md', '.env.example',
  'Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml',
  'Gemfile', 'composer.json', 'Makefile', 'Dockerfile',
  'app.json', 'expo.json', 'angular.json',
];

export const SOURCE_DIRS = ['src', 'app', 'lib', 'pages', 'components', 'api', 'server', 'routes', 'models', 'utils', 'hooks', 'services'];

export const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'vendor', 'target', '.cache', 'coverage', '.turbo'];

export const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java', rb: 'ruby',
  php: 'php', swift: 'swift', kt: 'kotlin', cs: 'csharp',
  cpp: 'cpp', c: 'c', h: 'c', html: 'html', css: 'css',
  scss: 'scss', json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', sh: 'bash', sql: 'sql', toml: 'toml',
  vue: 'vue', svelte: 'svelte', dockerfile: 'dockerfile',
};

// ─── Multi-Model Routing ────────────────────────────────────────────────────
export const GROQ_MODELS = {
  FAST: 'llama-3.1-8b-instant',
  MAIN: 'llama-3.3-70b-versatile',
  REASON: 'deepseek-r1-distill-llama-70b',
} as const;
