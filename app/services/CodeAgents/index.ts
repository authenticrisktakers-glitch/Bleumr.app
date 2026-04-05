export type { SubAgentResult, SubAgentTask, FileAccess } from './types';
export { runFileScout } from './FileScoutAgent';
export { runLintAgent } from './LintAgent';
export { runRefactorAgent } from './RefactorAgent';
export { runTestGenAgent } from './TestGenAgent';

/**
 * Registry of available sub-agents with descriptions.
 * The main Code Bleu agent uses this to decide which sub-agent to call.
 */
export const AGENT_REGISTRY = [
  {
    name: 'FileScout',
    description: 'Reads and analyzes multiple files in parallel. Use when you need to understand several files at once.',
    trigger: /\b(scan|analyze|look at|check|read|understand)\b.*\b(files|codebase|project|multiple|several|all)\b/i,
  },
  {
    name: 'LintCheck',
    description: 'Scans code for syntax errors, missing imports, potential bugs, and anti-patterns.',
    trigger: /\b(lint|check|audit|errors?|bugs?|issues?|problems?|flaws?|syntax)\b/i,
  },
  {
    name: 'Refactor',
    description: 'Improves code quality, readability, and structure for a specific file.',
    trigger: /\b(refactor|clean up|improve|optimize|restructure|simplify)\b/i,
  },
  {
    name: 'TestGen',
    description: 'Generates test cases for a source file.',
    trigger: /\b(test|tests|testing|spec|coverage|unit test)\b/i,
  },
] as const;
