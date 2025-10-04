// Core types for the Slack AI Chatbot

export type TaskType = 'website_update' | 'file_analysis' | 'code_review' | 'asset_process';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'queued' | 'processing' | 'waiting_approval' | 'completed' | 'failed';
export type UserRole = 'superadmin' | 'admin' | 'developer';

export interface Task {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  requesterId: string;
  websiteTarget?: string;
  dependencies: string[];
  resources: string[];
  status: TaskStatus;
  estimatedTime: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  description: string;
  context?: any;
}

export interface WebsiteConfig {
  name: string;
  path: string;
  buildCommand: string;
  devCommand: string;
  testCommand?: string;
  port: number;
  dependencies: string[];
}

export interface MonorepoConfig {
  repoUrl: string;
  submodulePath: string;
  websites: WebsiteConfig[];
  buildCommands: Record<string, string>;
  deploymentBranches: Record<string, string>;
}

export interface User {
  userId: string;
  name: string;
  role: UserRole;
  permissions: string[];
}

export interface ApprovalStage {
  level: number;
  role: UserRole;
  required: boolean;
  timeout: number;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface ApprovalWorkflow {
  taskId: string;
  stages: ApprovalStage[];
  currentStage: number;
  requiredApprovals: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  content?: string;
  diff?: string;
}

export interface PRContext {
  changes: FileChange[];
  impactAnalysis?: string;
  testResults?: any[];
  performanceMetrics?: any;
  securityScan?: any;
}

export interface PreviewSession {
  id: string;
  taskId: string;
  websiteName: string;
  url: string;
  port: number;
  createdAt: Date;
  expiresAt: Date;
}
