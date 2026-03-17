import { AutomationLogger } from './AutomationLogger';
import { LocalLLMEngine } from './LocalLLM';

export interface SSEMessage {
  type: 'token' | 'tool_call' | 'done' | 'error';
  content?: string;
  tool?: any;
}

/**
 * Standard Server-Sent Events (SSE) client for real-time Assistant communication.
 * Connects the UI to the decoupled LLM reasoning backend.
 */
export class AssistantSSE {
  private url: string;
  private listeners: ((msg: SSEMessage) => void)[] = [];
  private abortController: AbortController | null = null;
  private isClosed = false;

  constructor(url: string) {
    this.url = url;
  }

  onMessage(callback: (msg: SSEMessage) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private emit(msg: SSEMessage) {
    if (!this.isClosed) {
      this.listeners.forEach(cb => cb(msg));
    }
  }

  async startStream(prompt: string, mode: 'local' | 'cloud' | 'local_llm_max', systemPrompt: string) {
    AutomationLogger.log('INFO', 'SSE_STREAM_START', { url: this.url, mode });
    this.isClosed = false;
    this.abortController = new AbortController();

    try {
      if (mode === 'local_llm_max') {
        // Fallback to in-browser WebLLM if max mode is directly running in UI thread
        const stream = LocalLLMEngine.streamChat(prompt, systemPrompt);
        for await (const chunk of stream) {
            this.emit({ type: 'token', content: chunk });
        }
        this.emit({ type: 'done' });
      } else {
        // Production: Make a real POST request expecting an SSE stream response
        const response = await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, systemPrompt, mode }),
          signal: this.abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Server returned status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('ReadableStream not supported by response body.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim() === '') continue;
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                 this.emit({ type: 'done' });
                 return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.token) {
                   this.emit({ type: 'token', content: parsed.token });
                } else if (parsed.tool) {
                   this.emit({ type: 'tool_call', tool: parsed.tool });
                }
              } catch (e) {
                // Ignore parse errors on incomplete JSON fragments if any
              }
            }
          }
        }
        this.emit({ type: 'done' });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        this.emit({ type: 'error', content: err.message });
      }
    } finally {
      this.close();
    }
  }

  close() {
    if (!this.isClosed) {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.isClosed = true;
      AutomationLogger.log('INFO', 'SSE_STREAM_CLOSED', { url: this.url });
    }
  }
}
