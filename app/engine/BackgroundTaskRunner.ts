import { CheckpointManager, TaskState } from './CheckpointManager';
import { AutomationLogger } from './AutomationLogger';
import { TaskRegistry } from './TaskRegistry';

export interface AutomationTask {
  id: string;
  name: string;
  steps: AutomationStep[];
}

export interface AutomationStep {
  name: string;
  execute: (context: any) => Promise<boolean>;
}

export class BackgroundTaskRunner {
  private static activeTasks = new Map<string, Promise<void>>();
  
  static async submitTask(task: AutomationTask, startFromStep: number = 0) {
    if (this.activeTasks.has(task.id)) {
      AutomationLogger.log('WARN', 'TASK_ALREADY_RUNNING', { taskId: task.id });
      return;
    }

    // Ensure the task is registered for recovery later
    if (!TaskRegistry.get(task.id)) {
      TaskRegistry.register(task);
    }

    const taskPromise = this.runLoop(task, startFromStep);
    this.activeTasks.set(task.id, taskPromise);
    
    taskPromise.finally(() => {
      this.activeTasks.delete(task.id);
    });
    
    return taskPromise;
  }

  private static async runLoop(task: AutomationTask, startFromStep: number) {
    AutomationLogger.log('INFO', 'TASK_STARTED', { taskId: task.id, startFromStep });
    const checkpoint = await CheckpointManager.loadCheckpoint(task.id);
    let contextData = checkpoint?.data || {};

    for (let i = startFromStep; i < task.steps.length; i++) {
      const step = task.steps[i];
      try {
        AutomationLogger.log('DEBUG', 'STEP_EXECUTE', { taskId: task.id, step: step.name });
        
        // Execute step logic
        const success = await step.execute(contextData);
        
        if (!success) {
          throw new Error(`Step failed: ${step.name}`);
        }

        // Save progress after successful step
        await CheckpointManager.saveCheckpoint(task.id, i + 1, contextData);
        
      } catch (error) {
        AutomationLogger.log('ERROR', 'TASK_FAILED', { taskId: task.id, stepIndex: i, error: String(error) });
        // Keep checkpoint so it can be resumed
        await CheckpointManager.saveCheckpoint(task.id, i, contextData);
        throw error;
      }
    }

    AutomationLogger.log('INFO', 'TASK_COMPLETED', { taskId: task.id });
    await CheckpointManager.clearCheckpoint(task.id);
  }

  static async resumeRecoverableTasks() {
    const tasks = await CheckpointManager.getRecoverableTasks();
    tasks.forEach(t => {
      AutomationLogger.log('INFO', 'FOUND_RECOVERABLE_TASK', { taskId: t.taskId, step: t.currentStepIndex });
      
      const taskDef = TaskRegistry.get(t.taskId);
      if (taskDef) {
        this.submitTask(taskDef, t.currentStepIndex);
      } else {
        AutomationLogger.log('WARN', 'UNABLE_TO_RESUME_UNREGISTERED_TASK', { taskId: t.taskId });
      }
    });
  }
}