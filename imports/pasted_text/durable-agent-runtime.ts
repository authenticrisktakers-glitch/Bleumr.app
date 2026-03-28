Durableagentruntime · TS
Copy

import { AutomationLogger } from './AutomationLogger';
import { SafetyMiddleware } from './SafetyMiddleware';
import { CheckpointManager } from './CheckpointManager';
import { BackgroundTaskRunner, AutomationTask } from './BackgroundTaskRunner';
 
export type AgentState = 'IDLE' | 'PLANNING' | 'EXECUTING' | 'VERIFYING' | 'WAITING_APPROVAL' | 'ERROR' | 'COMPLETED';
 
export interface AgentEvent {
  type: 'STATE_CHANGE' | 'STEP_START' | 'STEP_COMPLETE' | 'ERROR' | 'ACTION_TAKEN';
  state?: AgentState;
  taskId?: string;
  stepIndex?: number;
  message?: string;
  actionPayload?: any;
}
 
export class DurableAgentRuntime {
  private static listeners: ((event: AgentEvent) => void)[] = [];
  private static currentState: AgentState = 'IDLE';
  private static currentTaskId: string | null = null;
  private static executeJsContext: ((code: string) => Promise<any>) | null = null;
  // FIX: AbortController so cancel() actually stops the in-flight task
  private static abortController: AbortController | null = null;
 
  static onEvent(callback: (event: AgentEvent) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }
 
  static setContext(executeJS: (code: string) => Promise<any>) {
    this.executeJsContext = executeJS;
  }
 
  private static emit(event: AgentEvent) {
    if (event.state) this.currentState = event.state;
    this.listeners.forEach(cb => cb(event));
  }
 
  static getState() {
    return this.currentState;
  }
 
  static async runTaskQueue(taskId: string, queue: any[], contextMessages: any[]) {
    if (this.currentState !== 'IDLE' && this.currentState !== 'COMPLETED' && this.currentState !== 'ERROR') {
      AutomationLogger.log('WARN', 'AGENT_BUSY', { state: this.currentState });
      return;
    }
 
    // FIX: Create a new AbortController for this run
    this.abortController = new AbortController();
    const { signal } = this.abortController;
 
    this.currentTaskId = taskId;
    this.emit({ type: 'STATE_CHANGE', state: 'PLANNING', taskId });
 
    try {
      let stepIndex = 0;
      const MAX_STEPS = queue.length;
 
      this.emit({ type: 'STATE_CHANGE', state: 'EXECUTING', taskId });
 
      while (stepIndex < MAX_STEPS) {
        // FIX: Check cancellation before every step
        if (signal.aborted) {
          AutomationLogger.log('INFO', 'TASK_CANCELLED', { taskId, stepIndex });
          this.emit({ type: 'STATE_CHANGE', state: 'IDLE', taskId });
          return;
        }
 
        const action = queue[stepIndex];
        this.emit({ type: 'STEP_START', taskId, stepIndex, actionPayload: action });
 
        // FIX: Only intercept truly sensitive actions (inject_script and email-like type).
        // NAVIGATE, CLICK, SCROLL were removed from SafetyMiddleware.sensitiveActions —
        // they auto-approve immediately and don't need a state change here.
        if (['click', 'type', 'inject_script', 'submit'].includes(action.type)) {
          const isSensitive = action.type === 'inject_script' || (action.text && action.text.includes('@'));
          if (isSensitive) {
            this.emit({ type: 'STATE_CHANGE', state: 'WAITING_APPROVAL', taskId });
            const result = await SafetyMiddleware.requestApproval({
              actionType: action.type === 'inject_script' ? 'MODIFY_DATA' : 'SEND_EMAIL',
              context: action
            });
            if (!result.approved) {
              throw new Error(`Action blocked by user safety approval. Reason: ${result.reason}`);
            }
            this.emit({ type: 'STATE_CHANGE', state: 'EXECUTING', taskId });
          }
        }
 
        // Check cancellation again after async approval wait
        if (signal.aborted) {
          AutomationLogger.log('INFO', 'TASK_CANCELLED', { taskId, stepIndex });
          this.emit({ type: 'STATE_CHANGE', state: 'IDLE', taskId });
          return;
        }
 
        this.emit({ type: 'ACTION_TAKEN', taskId, actionPayload: action });
 
        if (action.type === 'inject_script' && this.executeJsContext) {
          await this.executeJsContext(action.script || '');
        }
 
        await new Promise(res => setTimeout(res, 800));
 
        this.emit({ type: 'STEP_COMPLETE', taskId, stepIndex });
        stepIndex++;
      }
 
      this.emit({ type: 'STATE_CHANGE', state: 'COMPLETED', taskId });
 
    } catch (error: any) {
      AutomationLogger.log('ERROR', 'RUNTIME_ERROR', { error: error.message });
      this.emit({ type: 'ERROR', state: 'ERROR', taskId, message: error.message });
    } finally {
      this.currentTaskId = null;
      this.abortController = null;
    }
  }
 
  // FIX: cancel() now actually aborts the running task via AbortController
  static cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.emit({ type: 'STATE_CHANGE', state: 'IDLE' });
    this.currentTaskId = null;
  }
}
