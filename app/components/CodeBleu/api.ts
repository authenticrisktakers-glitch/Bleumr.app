// ─── Code Bleu API Layer (Groq fetch + streaming) ───────────────────────────

const IS_ELECTRON_ENV = typeof window !== 'undefined' && !!(window as any).orbit;

/** Smart fetch with retry + Electron proxy fallback */
export async function groqFetch(
  url: string,
  options: { method: string; headers: Record<string, string>; body: string },
  retries = 2
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (IS_ELECTRON_ENV && (window as any).orbit?.proxyFetch) {
        const result = await (window as any).orbit.proxyFetch(url, {
          method: options.method,
          headers: options.headers,
          body: options.body,
        });
        if (!result.ok) throw new Error(`API error ${result.status}: ${result.text?.slice(0, 200) ?? ''}`);
        return JSON.parse(result.text);
      }
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return await res.json();
    } catch (err: any) {
      lastError = err;
      if (err?.message?.includes('401') || err?.message?.includes('400')) throw err;
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  const msg = lastError?.message?.toLowerCase() ?? '';
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('ssl') || msg.includes('econnrefused') || msg.includes('fetch failed')) {
    throw new Error('OFFLINE');
  }
  throw lastError || new Error('Request failed');
}

/**
 * Stream a Groq API response — text arrives token-by-token,
 * tool calls are accumulated silently in the background.
 * Uses AbortController for cancellable fetch.
 *
 * Reliability:
 *  - 60s connect timeout (from request start to first byte / response headers)
 *  - 45s idle timeout (between any two chunks once streaming starts)
 *  - Aborts cleanly via abortRef so the agent loop can never hang forever
 */
export async function streamGroqResponse(
  apiKey: string,
  requestBody: any,
  onTextChunk: (chunk: string) => void,
  abortRef?: { current: boolean },
): Promise<{ message: any; usage?: any }> {
  const streamBody = { ...requestBody, stream: true, stream_options: { include_usage: true } };
  const controller = new AbortController();
  if (abortRef?.current) controller.abort();

  // Connect timeout — fires if Groq doesn't even return response headers
  const CONNECT_TIMEOUT_MS = 60_000;
  const IDLE_TIMEOUT_MS = 45_000;
  let connectTimer: any = setTimeout(() => {
    try { controller.abort(); } catch { /* ignore */ }
  }, CONNECT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(streamBody),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(connectTimer);
    if (e?.name === 'AbortError' && !abortRef?.current) {
      throw new Error('Stream connect timeout — the model took too long to respond. Please try again.');
    }
    throw e;
  }
  // Got response headers — clear connect timeout
  clearTimeout(connectTimer);
  connectTimer = null;

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let lineBuf = '';
  let textContent = '';
  const toolCalls: any[] = [];
  let usage: any = null;

  // Idle timeout — fires if no chunks arrive for IDLE_TIMEOUT_MS
  let idleTimer: any = null;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      try { controller.abort(); } catch { /* ignore */ }
    }, IDLE_TIMEOUT_MS);
  };
  resetIdle();

  let timedOut = false;
  try {
    while (true) {
      if (abortRef?.current) { controller.abort(); reader.cancel(); break; }
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (readErr: any) {
        if (readErr?.name === 'AbortError' && !abortRef?.current) {
          timedOut = true;
        }
        throw readErr;
      }
      const { done, value } = readResult;
      if (done) break;
      resetIdle();

      const chunk = decoder.decode(value, { stream: true });
      const rawLines = (lineBuf + chunk).split('\n');
      lineBuf = rawLines.pop() ?? '';

      for (const line of rawLines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          if (json.usage) { usage = json.usage; continue; }
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            textContent += delta.content;
            onTextChunk(delta.content);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || `call_${Date.now()}_${idx}`, type: 'function', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments != null) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        } catch { /* skip malformed chunks */ }
      }
    }
  } catch (e: any) {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (e?.name === 'AbortError') {
      // Distinguish user abort from idle timeout
      if (timedOut || !abortRef?.current) {
        // We aborted ourselves due to idle timeout — only throw if we have NO partial output
        if (!textContent && toolCalls.length === 0) {
          throw new Error('Stream idle timeout — the model stopped responding mid-stream. Please try again.');
        }
        // Otherwise fall through and return what we have
      }
      // User-initiated abort — silently return whatever we have
    } else {
      throw e;
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    if (connectTimer) clearTimeout(connectTimer);
  }

  const message: any = { role: 'assistant', content: textContent || null };
  const validToolCalls = toolCalls.filter(Boolean);
  if (validToolCalls.length > 0) message.tool_calls = validToolCalls;
  return { message, usage };
}
