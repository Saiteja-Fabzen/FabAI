import { Task, TaskPriority, TaskStatus } from '../types';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

export class TaskQueue extends EventEmitter {
  private queue: Task[] = [];
  private processing: Map<string, Task> = new Map();
  private maxConcurrent: number;
  private resourceLocks: Map<string, string> = new Map(); // resource -> taskId

  constructor(maxConcurrent: number = 3) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  addTask(task: Task): void {
    // Check for resource conflicts
    const conflicts = this.checkResourceConflicts(task);
    if (conflicts.length > 0) {
      logger.warn('Task has resource conflicts', {
        taskId: task.id,
        conflicts,
      });
      task.dependencies.push(...conflicts);
    }

    this.queue.push(task);
    this.sortQueue();
    logger.info('Task added to queue', {
      taskId: task.id,
      priority: task.priority,
      queueLength: this.queue.length,
    });

    this.emit('task_added', task);
    this.processNext();
  }

  private sortQueue(): void {
    const priorityWeight = {
      urgent: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    this.queue.sort((a, b) => {
      // First sort by priority
      const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by creation time (older first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private checkResourceConflicts(task: Task): string[] {
    const conflicts: string[] = [];

    for (const resource of task.resources) {
      const lockingTaskId = this.resourceLocks.get(resource);
      if (lockingTaskId && lockingTaskId !== task.id) {
        conflicts.push(lockingTaskId);
      }
    }

    return [...new Set(conflicts)]; // Remove duplicates
  }

  private canProcessTask(task: Task): boolean {
    // Check if all dependencies are completed
    const incompleteDeps = task.dependencies.filter((depId) => {
      const dep = this.processing.get(depId) || this.queue.find((t) => t.id === depId);
      return dep && dep.status !== 'completed';
    });

    if (incompleteDeps.length > 0) {
      logger.debug('Task has incomplete dependencies', {
        taskId: task.id,
        dependencies: incompleteDeps,
      });
      return false;
    }

    // Check if resources are available
    for (const resource of task.resources) {
      const lockingTaskId = this.resourceLocks.get(resource);
      if (lockingTaskId && lockingTaskId !== task.id) {
        logger.debug('Task resource is locked', {
          taskId: task.id,
          resource,
          lockedBy: lockingTaskId,
        });
        return false;
      }
    }

    return true;
  }

  private lockResources(task: Task): void {
    for (const resource of task.resources) {
      this.resourceLocks.set(resource, task.id);
    }
  }

  private unlockResources(task: Task): void {
    for (const resource of task.resources) {
      if (this.resourceLocks.get(resource) === task.id) {
        this.resourceLocks.delete(resource);
      }
    }
  }

  async processNext(): Promise<void> {
    if (this.processing.size >= this.maxConcurrent) {
      logger.debug('Max concurrent tasks reached', {
        processing: this.processing.size,
        max: this.maxConcurrent,
      });
      return;
    }

    const nextTask = this.queue.find((task) => this.canProcessTask(task));

    if (!nextTask) {
      logger.debug('No processable tasks in queue', {
        queueLength: this.queue.length,
      });
      return;
    }

    // Remove from queue
    this.queue = this.queue.filter((t) => t.id !== nextTask.id);

    // Lock resources
    this.lockResources(nextTask);

    // Start processing
    nextTask.status = 'processing';
    nextTask.startedAt = new Date();
    this.processing.set(nextTask.id, nextTask);

    logger.info('Task processing started', {
      taskId: nextTask.id,
      type: nextTask.type,
    });

    this.emit('task_started', nextTask);
  }

  completeTask(taskId: string, status: TaskStatus = 'completed'): void {
    const task = this.processing.get(taskId);

    if (!task) {
      logger.warn('Attempted to complete non-processing task', { taskId });
      return;
    }

    task.status = status;
    task.completedAt = new Date();

    // Unlock resources
    this.unlockResources(task);

    // Remove from processing
    this.processing.delete(taskId);

    logger.info('Task completed', {
      taskId,
      status,
      duration: task.completedAt.getTime() - (task.startedAt?.getTime() || 0),
    });

    this.emit('task_completed', task);

    // Try to process next tasks
    this.processNext();
  }

  failTask(taskId: string, error: Error): void {
    const task = this.processing.get(taskId);

    if (!task) {
      logger.warn('Attempted to fail non-processing task', { taskId });
      return;
    }

    task.status = 'failed';
    task.completedAt = new Date();

    // Unlock resources
    this.unlockResources(task);

    // Remove from processing
    this.processing.delete(taskId);

    logger.error('Task failed', {
      taskId,
      error: error.message,
      duration: task.completedAt.getTime() - (task.startedAt?.getTime() || 0),
    });

    this.emit('task_failed', task, error);

    // Try to process next tasks
    this.processNext();
  }

  getQueueStatus() {
    return {
      queued: this.queue.length,
      processing: this.processing.size,
      queue: this.queue.map((t) => ({
        id: t.id,
        type: t.type,
        priority: t.priority,
        status: t.status,
      })),
      processingTasks: Array.from(this.processing.values()).map((t) => ({
        id: t.id,
        type: t.type,
        priority: t.priority,
        status: t.status,
        startedAt: t.startedAt,
      })),
    };
  }

  getTaskPosition(taskId: string): number {
    const index = this.queue.findIndex((t) => t.id === taskId);
    return index === -1 ? -1 : index + 1;
  }

  getEstimatedWaitTime(taskId: string): number {
    const position = this.getTaskPosition(taskId);
    if (position === -1) return 0;

    // Simple estimation: average task time * position
    const avgTaskTime = 15 * 60 * 1000; // 15 minutes in ms
    return position * avgTaskTime;
  }
}
