/**
 * Workflow Helper Utilities
 * Extracted from agentCoordinator for better code organization
 */

import { logger } from './logger';

/**
 * Workflow step timeout configuration
 */
export const WORKFLOW_TIMEOUTS = {
  DATA_GATHERING: 30000, // 30 seconds
  TECHNICAL_ANALYSIS: 45000, // 45 seconds
  CHIEF_DECISION: 60000, // 60 seconds
  RISK_ASSESSMENT: 45000, // 45 seconds
  EXECUTION_PLANNING: 45000, // 45 seconds
  TRADE_EXECUTION: 30000, // 30 seconds
  DEFAULT: 120000, // 2 minutes default
} as const;

/**
 * Create a timeout promise for workflow steps
 */
export function createStepTimeout(
  stepId: string,
  timeoutMs: number = WORKFLOW_TIMEOUTS.DEFAULT
): Promise<never> {
  return new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Step timeout: ${stepId} exceeded ${timeoutMs / 1000}s limit`));
    }, timeoutMs);
  });
}

/**
 * Validate workflow step dependencies
 */
export function canExecuteStep<T extends { id: string; dependencies: string[] }>(
  step: T,
  completedStepIds: Set<string>
): boolean {
  return step.dependencies.every(depId => completedStepIds.has(depId));
}

/**
 * Calculate workflow duration
 */
export function calculateWorkflowDuration(
  startedAt: number,
  completedAt?: number
): number {
  if (!completedAt) {
    return Date.now() - startedAt;
  }
  return completedAt - startedAt;
}

/**
 * Format workflow error message
 */
export function formatWorkflowError(
  failedSteps: Array<{ name: string; error?: string }>
): string {
  const errorMessages = failedSteps
    .map(s => `${s.name}: ${s.error || 'Unknown error'}`)
    .join('; ');
  return `Workflow failed: ${errorMessages}`;
}

/**
 * Track workflow performance metrics
 */
export interface WorkflowMetrics {
  totalExecutions: number;
  averageDuration: number;
  successRate: number;
  averageStepsCompleted: number;
}

export function updateWorkflowMetrics(
  current: WorkflowMetrics | undefined,
  duration: number,
  success: boolean,
  stepsCompleted: number,
  totalSteps: number
): WorkflowMetrics {
  const total = (current?.totalExecutions || 0) + 1;
  const successful = (current?.successRate || 0) * (total - 1) + (success ? 1 : 0);
  
  return {
    totalExecutions: total,
    averageDuration: current
      ? (current.averageDuration * (total - 1) + duration) / total
      : duration,
    successRate: successful / total,
    averageStepsCompleted: current
      ? (current.averageStepsCompleted * (total - 1) + stepsCompleted) / total
      : stepsCompleted / totalSteps,
  };
}

/**
 * Create workflow step with default configuration
 */
export interface StepConfig {
  id: string;
  name: string;
  agent: string;
  dependencies: string[];
  timeout: number;
  maxRetries: number;
}

export function createWorkflowStep(config: StepConfig) {
  return {
    id: config.id,
    name: config.name,
    agent: config.agent,
    dependencies: config.dependencies,
    timeout: config.timeout,
    retryCount: 0,
    maxRetries: config.maxRetries,
    status: 'pending' as const,
  };
}

/**
 * Log workflow step execution
 */
export function logStepExecution(
  stepId: string,
  workflowId: string,
  agent: string,
  success: boolean,
  duration: number,
  error?: string
): void {
  const level = success ? 'info' : 'error';
  const message = success
    ? `[OK] Step ${stepId} completed`
    : `[ERROR] Step ${stepId} failed`;

  logger[level](message, {
    context: 'AgentCoordinator',
    workflowId,
    stepId,
    agent,
    duration: `${duration}ms`,
    ...(error && { error }),
  });
}

