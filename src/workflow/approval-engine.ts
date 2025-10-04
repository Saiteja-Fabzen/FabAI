import { ApprovalWorkflow, ApprovalStage, User, UserRole } from '../types';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

export class ApprovalEngine extends EventEmitter {
  private workflows: Map<string, ApprovalWorkflow> = new Map();
  private users: Map<string, User> = new Map();

  constructor(users: User[]) {
    super();
    users.forEach((user) => this.users.set(user.userId, user));
  }

  createWorkflow(taskId: string, requesterId: string): ApprovalWorkflow {
    const requester = this.users.get(requesterId);
    if (!requester) {
      throw new Error(`User ${requesterId} not found`);
    }

    const stages = this.buildApprovalStages(requester.role);

    const workflow: ApprovalWorkflow = {
      taskId,
      stages,
      currentStage: 0,
      requiredApprovals: stages.filter((s) => s.required).length,
      status: 'pending',
    };

    this.workflows.set(taskId, workflow);
    logger.info('Approval workflow created', { taskId, stages: stages.length });

    return workflow;
  }

  private buildApprovalStages(requesterRole: UserRole): ApprovalStage[] {
    const stages: ApprovalStage[] = [];

    // Stage 1: Requester review (always required except for emergency)
    if (requesterRole === 'developer') {
      stages.push({
        level: 1,
        role: 'developer',
        required: true,
        timeout: 30 * 60 * 1000, // 30 minutes
      });
    }

    // Stage 2: Admin approval (required for all)
    stages.push({
      level: 2,
      role: 'admin',
      required: true,
      timeout: 60 * 60 * 1000, // 1 hour
    });

    // Stage 3: Super admin final approval (required for high-impact changes)
    stages.push({
      level: 3,
      role: 'superadmin',
      required: false,
      timeout: 2 * 60 * 60 * 1000, // 2 hours
    });

    return stages;
  }

  async approve(taskId: string, userId: string): Promise<boolean> {
    const workflow = this.workflows.get(taskId);
    if (!workflow) {
      throw new Error(`Workflow for task ${taskId} not found`);
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User ${userId} is not authorized to approve workflows. Only admin and superadmin users can approve.`);
    }

    const currentStage = workflow.stages[workflow.currentStage];
    if (!currentStage) {
      throw new Error('No current stage in workflow');
    }

    // Check if user has permission to approve at this stage
    if (!this.canApprove(user, currentStage)) {
      throw new Error(
        `User ${userId} (${user.role}) cannot approve at stage ${currentStage.level} (requires ${currentStage.role})`
      );
    }

    // Record approval
    currentStage.approvedBy = userId;
    currentStage.approvedAt = new Date();

    logger.info('Approval recorded', {
      taskId,
      userId,
      stage: currentStage.level,
    });

    this.emit('stage_approved', workflow, currentStage, user);

    // Move to next stage or complete
    return await this.advanceWorkflow(workflow);
  }

  async reject(taskId: string, userId: string, reason: string): Promise<void> {
    const workflow = this.workflows.get(taskId);
    if (!workflow) {
      throw new Error(`Workflow for task ${taskId} not found`);
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    workflow.status = 'rejected';

    logger.info('Approval rejected', { taskId, userId, reason });

    this.emit('workflow_rejected', workflow, user, reason);
  }

  private async advanceWorkflow(workflow: ApprovalWorkflow): Promise<boolean> {
    const nextStageIndex = workflow.currentStage + 1;

    if (nextStageIndex >= workflow.stages.length) {
      // All stages complete
      workflow.status = 'approved';
      logger.info('Workflow approved', { taskId: workflow.taskId });
      this.emit('workflow_approved', workflow);
      return true;
    }

    const nextStage = workflow.stages[nextStageIndex];

    // Skip non-required stages
    if (!nextStage.required) {
      workflow.currentStage = nextStageIndex;
      return await this.advanceWorkflow(workflow);
    }

    // Move to next required stage
    workflow.currentStage = nextStageIndex;
    logger.info('Workflow advanced to next stage', {
      taskId: workflow.taskId,
      stage: nextStage.level,
    });

    this.emit('stage_changed', workflow, nextStage);
    return false;
  }

  private canApprove(user: User, stage: ApprovalStage): boolean {
    // Superadmin can approve any stage
    if (user.role === 'superadmin') return true;

    // Admin can approve admin and developer stages
    if (user.role === 'admin' && (stage.role === 'admin' || stage.role === 'developer')) {
      return true;
    }

    // Developer can only approve developer stages
    if (user.role === 'developer' && stage.role === 'developer') {
      return true;
    }

    return false;
  }

  getWorkflow(taskId: string): ApprovalWorkflow | undefined {
    return this.workflows.get(taskId);
  }

  getCurrentStage(taskId: string): ApprovalStage | undefined {
    const workflow = this.workflows.get(taskId);
    if (!workflow) return undefined;

    return workflow.stages[workflow.currentStage];
  }

  getNextApprovers(taskId: string): User[] {
    const stage = this.getCurrentStage(taskId);
    if (!stage) return [];

    const approvers: User[] = [];
    for (const user of this.users.values()) {
      if (this.canApprove(user, stage)) {
        approvers.push(user);
      }
    }

    return approvers;
  }

  // Emergency bypass for critical fixes
  emergencyApprove(taskId: string, userId: string): boolean {
    const workflow = this.workflows.get(taskId);
    if (!workflow) {
      throw new Error(`Workflow for task ${taskId} not found`);
    }

    const user = this.users.get(userId);
    if (!user || user.role !== 'superadmin') {
      throw new Error('Only superadmin can use emergency approval');
    }

    workflow.status = 'approved';
    logger.warn('Emergency approval used', { taskId, userId });

    this.emit('emergency_approval', workflow, user);
    return true;
  }

  addUser(user: User): void {
    this.users.set(user.userId, user);
    logger.info('User added to approval engine', { userId: user.userId, role: user.role });
  }

  removeUser(userId: string): void {
    this.users.delete(userId);
    logger.info('User removed from approval engine', { userId });
  }

  cleanup(taskId: string): void {
    this.workflows.delete(taskId);
    logger.info('Workflow cleaned up', { taskId });
  }
}
