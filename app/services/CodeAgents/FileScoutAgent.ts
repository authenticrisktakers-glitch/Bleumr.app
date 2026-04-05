import { SubAgentResult, FileAccess } from './types';

/**
 * FileScoutAgent — reads multiple files in parallel and returns a summary.
 * Used when the main agent needs to understand several files at once
 * without burning through its own tool-call loop one file at a time.
 */
export async function runFileScout(
  files: string[],           // list of file paths to read
  question: string,          // what the main agent wants to know
  fileAccess: FileAccess,
  apiKey: string,
  groqFetch: (url: string, options: any, retries?: number) => Promise<any>
): Promise<SubAgentResult> {
  const agentName = 'FileScout';
  const filesRead: { path: string; content: string }[] = [];

  // Read all files in parallel
  const readPromises = files.map(async (path) => {
    const content = await fileAccess.readFile(path);
    if (content) filesRead.push({ path, content: content.slice(0, 4000) });
  });
  await Promise.all(readPromises);

  if (filesRead.length === 0) {
    return {
      agentName,
      status: 'error',
      summary: 'Could not read any of the requested files.',
      errors: ['All file reads returned empty'],
    };
  }

  // Build context and ask AI to analyze
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
            content: 'You are FileScout, a fast code analysis sub-agent. You read multiple files and answer questions about them concisely. No markdown formatting. Talk naturally.',
          },
          {
            role: 'user',
            content: `I need to understand these files. My question: ${question}\n\nFiles:\n${fileContext.slice(0, 12000)}`,
          },
        ],
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });

    const summary = data?.choices?.[0]?.message?.content ?? 'Analysis complete but no summary generated.';
    return { agentName, status: 'success', summary, filesRead };
  } catch (err: any) {
    return {
      agentName,
      status: 'success',
      summary: `Read ${filesRead.length} files. Couldn't analyze (offline) but contents are available.`,
      filesRead,
    };
  }
}
