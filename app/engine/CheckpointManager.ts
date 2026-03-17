import localforage from 'localforage';
import { AutomationLogger } from './AutomationLogger';
 
export interface TaskState {
  taskId: string;
  currentStepIndex: number;
  data: Record<string, any>;
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'FAILED' | 'COMPLETED';
  lastUpdated: string;
}
 
// FIX: Checkpoints older than 24 hours are considered stale and ignored on load.
const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;
 
export class CheckpointManager {
  // FIX: All methods are now async, using localforage (IndexedDB) instead of localStorage.
  // No 5MB cap, no synchronous I/O blocking the main thread, not readable by XSS.
 
  static async saveCheckpoint(taskId: string, stepIndex: number, data: Record<string, any>) {
    const state: TaskState = {
      taskId,
      currentStepIndex: stepIndex,
      data,
      status: 'PAUSED',
      lastUpdated: new Date().toISOString()
    };
    try {
      await localforage.setItem(`jumari_checkpoint_${taskId}`, state);
      AutomationLogger.log('INFO', 'CHECKPOINT_SAVED', { taskId, stepIndex });
    } catch (e) {
      AutomationLogger.log('ERROR', 'CHECKPOINT_SAVE_FAILED', { taskId, error: String(e) });
    }
  }
 
  static async loadCheckpoint(taskId: string): Promise<TaskState | null> {
    try {
      const saved = await localforage.getItem<TaskState>(`jumari_checkpoint_${taskId}`);
      if (!saved) return null;
 
      // FIX: Expire stale checkpoints so abandoned tasks don't pile up forever
      const age = Date.now() - new Date(saved.lastUpdated).getTime();
      if (age > CHECKPOINT_TTL_MS) {
        AutomationLogger.log('INFO', 'CHECKPOINT_EXPIRED', { taskId, ageMs: age });
        await this.clearCheckpoint(taskId);
        return null;
      }
 
      AutomationLogger.log('INFO', 'CHECKPOINT_LOADED', { taskId });
      return saved;
    } catch (e) {
      AutomationLogger.log('ERROR', 'CHECKPOINT_LOAD_FAILED', { taskId, error: String(e) });
      return null;
    }
  }
 
  static async getRecoverableTasks(): Promise<TaskState[]> {
    const tasks: TaskState[] = [];
    try {
      const keys = await localforage.keys();
      for (const key of keys) {
        if (key.startsWith('jumari_checkpoint_')) {
          const item = await localforage.getItem<TaskState>(key);
          if (item) {
            const age = Date.now() - new Date(item.lastUpdated).getTime();
            if (age <= CHECKPOINT_TTL_MS) {
              tasks.push(item);
            } else {
              // Clean up expired checkpoint while we're here
              await localforage.removeItem(key);
            }
          }
        }
      }
    } catch (e) {
      // ignore — return whatever we collected
    }
    return tasks;
  }
 
  static async clearCheckpoint(taskId: string) {
    try {
      await localforage.removeItem(`jumari_checkpoint_${taskId}`);
    } catch (e) {}
  }
}
