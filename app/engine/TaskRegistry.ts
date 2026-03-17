import { AutomationLogger } from './AutomationLogger';
import { AutomationTask } from './BackgroundTaskRunner';

export class TaskRegistry {
  private static tasks = new Map<string, AutomationTask>();

  static register(task: AutomationTask) {
    this.tasks.set(task.id, task);
    AutomationLogger.log('INFO', 'TASK_REGISTERED', { taskId: task.id, name: task.name });
  }

  static get(taskId: string): AutomationTask | undefined {
    return this.tasks.get(taskId);
  }

  static getAll(): AutomationTask[] {
    return Array.from(this.tasks.values());
  }
}
