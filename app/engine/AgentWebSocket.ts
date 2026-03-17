import { AutomationLogger } from './AutomationLogger';
import { AgentEvent } from './DurableAgentRuntime';

/**
 * Standard WebSocket channel between the UI and the separated Agent Background Process.
 * Now runs entirely in-process - no external WebSocket server required.
 */
export class AgentWebSocket {
  private listeners: ((event: AgentEvent) => void)[] = [];
  private isConnected = false;

  constructor() {
    // No external WebSocket needed - all communication is in-process
  }

  connect() {
    AutomationLogger.log('INFO', 'WS_CONNECTING', { mode: 'in-process' });
    // Simulate immediate connection since we're in-process
    this.isConnected = true;
    AutomationLogger.log('INFO', 'WS_CONNECTED', { mode: 'in-process' });
  }

  onMessage(callback: (event: AgentEvent) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private emit(event: AgentEvent) {
    this.listeners.forEach(cb => cb(event));
  }

  send(command: any) {
    if (!this.isConnected) {
       AutomationLogger.log('ERROR', 'WS_NOT_CONNECTED', { command });
       return;
    }
    
    // In-process event handling
    AutomationLogger.log('INFO', 'WS_SEND', { command });
  }

  disconnect() {
    this.isConnected = false;
  }
}