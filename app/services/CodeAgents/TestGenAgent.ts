import { SubAgentResult, FileAccess } from './types';

/**
 * TestGenAgent — generates test cases for a source file.
 * Returns the test file content for the main agent to write.
 */
export async function runTestGenAgent(
  filePath: string,
  fileAccess: FileAccess,
  apiKey: string,
  groqFetch: (url: string, options: any, retries?: number) => Promise<any>
): Promise<SubAgentResult> {
  const agentName = 'TestGen';

  const content = await fileAccess.readFile(filePath);
  if (!content) {
    return {
      agentName,
      status: 'error',
      summary: `Could not read ${filePath}`,
      errors: ['File not found'],
    };
  }

  // Detect test framework from project files
  const _hasPkgJson = fileAccess.projectFiles.some(f => f.path === 'package.json');

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
            content: 'You are TestGen, a test generation sub-agent. Given a source file, generate comprehensive test cases. Use the appropriate test framework (Jest for JS/TS, pytest for Python, etc.). Return ONLY the complete test file content — no explanations, no markdown fences. Just the raw test file ready to be saved.',
          },
          {
            role: 'user',
            content: `Generate tests for this file: ${filePath}\n\nSource:\n${content.slice(0, 12000)}`,
          },
        ],
        max_tokens: 4096,
        temperature: 0.2,
      }),
    });

    const testContent = data?.choices?.[0]?.message?.content ?? '';
    if (!testContent || testContent.length < 20) {
      return {
        agentName,
        status: 'error',
        summary: 'Test generation produced empty output.',
        errors: ['Empty result'],
      };
    }

    // Generate test file path
    const ext = filePath.split('.').pop() ?? 'ts';
    const baseName = filePath.replace(/\.[^.]+$/, '');
    const testPath = `${baseName}.test.${ext}`;

    return {
      agentName,
      status: 'success',
      summary: `Generated tests for ${filePath} → ${testPath}`,
      filesRead: [{ path: filePath, content: content.slice(0, 3000) }],
      data: { testPath, testContent },
    };
  } catch {
    return {
      agentName,
      status: 'error',
      summary: 'Could not reach AI for test generation.',
      filesRead: [{ path: filePath, content: content.slice(0, 3000) }],
    };
  }
}
