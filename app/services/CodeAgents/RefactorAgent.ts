import { SubAgentResult, FileAccess } from './types';

/**
 * RefactorAgent — rewrites a file to improve code quality, readability,
 * and maintainability. Does NOT write files — returns the improved code
 * for the main agent to review and apply.
 */
export async function runRefactorAgent(
  filePath: string,
  instructions: string,
  fileAccess: FileAccess,
  apiKey: string,
  groqFetch: (url: string, options: any, retries?: number) => Promise<any>
): Promise<SubAgentResult> {
  const agentName = 'Refactor';

  const content = await fileAccess.readFile(filePath);
  if (!content) {
    return {
      agentName,
      status: 'error',
      summary: `Could not read ${filePath}`,
      errors: ['File not found'],
    };
  }

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
            content: 'You are Refactor, a code improvement sub-agent. You receive a file and instructions for how to improve it. Return ONLY the complete improved file content — no explanations, no markdown code fences, no commentary. Just the raw file content ready to be saved.',
          },
          {
            role: 'user',
            content: `File: ${filePath}\nInstructions: ${instructions}\n\nCurrent content:\n${content.slice(0, 15000)}`,
          },
        ],
        max_tokens: 4096,
        temperature: 0.2,
      }),
    });

    const improved = data?.choices?.[0]?.message?.content ?? '';
    if (!improved || improved.length < 10) {
      return {
        agentName,
        status: 'error',
        summary: 'Refactor produced empty output.',
        errors: ['Empty result'],
      };
    }

    return {
      agentName,
      status: 'success',
      summary: `Refactored ${filePath} (${content.length} → ${improved.length} chars)`,
      filesRead: [{ path: filePath, content: content.slice(0, 3000) }],
      data: { filePath, originalLength: content.length, improvedContent: improved },
    };
  } catch {
    return {
      agentName,
      status: 'error',
      summary: 'Could not reach AI service for refactoring.',
      filesRead: [{ path: filePath, content: content.slice(0, 3000) }],
    };
  }
}
