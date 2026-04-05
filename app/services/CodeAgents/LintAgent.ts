import { SubAgentResult, FileAccess } from './types';

/**
 * LintAgent — scans files for common issues: syntax errors, missing imports,
 * unused variables, type mismatches, and potential bugs.
 */
export async function runLintAgent(
  files: string[],
  fileAccess: FileAccess,
  apiKey: string,
  groqFetch: (url: string, options: any, retries?: number) => Promise<any>
): Promise<SubAgentResult> {
  const agentName = 'LintCheck';
  const filesRead: { path: string; content: string }[] = [];

  // Read files (limit to 8 to stay within context)
  for (const path of files.slice(0, 8)) {
    const content = await fileAccess.readFile(path);
    if (content) filesRead.push({ path, content: content.slice(0, 5000) });
  }

  if (filesRead.length === 0) {
    return {
      agentName,
      status: 'error',
      summary: 'No files to check.',
      errors: ['Empty file list'],
    };
  }

  const fileContext = filesRead.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');

  try {
    const data = await groqFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are LintCheck, a code quality sub-agent. Scan the provided files for: syntax errors, missing imports, unused variables, type issues, potential runtime errors, security concerns, and anti-patterns. Be specific — cite file names and line numbers. No markdown. Talk naturally and be concise. If everything looks clean, say so.',
          },
          {
            role: 'user',
            content: `Check these files for issues:\n\n${fileContext.slice(0, 14000)}`,
          },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });

    const summary = data?.choices?.[0]?.message?.content ?? 'Scan complete.';
    const hasIssues =
      summary.toLowerCase().includes('error') ||
      summary.toLowerCase().includes('issue') ||
      summary.toLowerCase().includes('problem') ||
      summary.toLowerCase().includes('missing');

    return {
      agentName,
      status: 'success',
      summary,
      filesRead,
      errors: hasIssues ? ['Issues detected — see summary'] : [],
    };
  } catch {
    return {
      agentName,
      status: 'error',
      summary: 'Could not reach AI service for lint check. Try again when online.',
      filesRead,
    };
  }
}
