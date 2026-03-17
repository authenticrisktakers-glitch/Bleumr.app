/**
 * Handles simulated WebSocket / SSE connections for agent message streaming.
 * Provides a real event-driven architecture that mimics network streams 
 * but operates purely locally within Electron IPC or WebLLM workers.
 */

import { AutomationLogger } from './AutomationLogger';

export type AgentMessage = {
  type: 'token' | 'tool_call' | 'tool_result' | 'error' | 'done';
  content?: string;
  toolData?: any;
};

export class LocalAgentStream {
  private listeners: ((msg: AgentMessage) => void)[] = [];
  private isClosed = false;

  onMessage(callback: (msg: AgentMessage) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  emit(message: AgentMessage) {
    if (this.isClosed) return;
    this.listeners.forEach(cb => cb(message));
  }

  close() {
    this.isClosed = true;
    this.emit({ type: 'done' });
    this.listeners = [];
  }

  // Mimic Server-Sent Events behavior for local providers
  static createLocalSSEStream(generator: AsyncGenerator<string, void, unknown>): LocalAgentStream {
    const stream = new LocalAgentStream();
    
    (async () => {
      try {
        for await (const chunk of generator) {
          stream.emit({ type: 'token', content: chunk });
        }
        stream.emit({ type: 'done' });
      } catch (err: any) {
        AutomationLogger.log('ERROR', 'SSE_STREAM_ERROR', { error: err.message });
        stream.emit({ type: 'error', content: err.message });
      } finally {
        stream.close();
      }
    })();
    
    return stream;
  }
}
