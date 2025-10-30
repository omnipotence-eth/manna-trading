/**
 * Multi-Agent Trading System API Routes
 * Provides endpoints to control and monitor the multi-agent system
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentCoordinator } from '@/services/agentCoordinator';
import { deepseekService } from '@/services/deepseekService';
import { handleApiError, createSuccessResponse } from '@/lib/errorHandler';
import { PerformanceMonitor } from '@/lib/performanceMonitor';
import { circuitBreakers } from '@/lib/circuitBreaker';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('MultiAgentAPI');
  
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const symbol = url.searchParams.get('symbol') || 'BTC/USDT';

    switch (action) {
      case 'status':
        return await getSystemStatus();
      case 'test-deepseek':
        return await testDeepSeekConnection();
      case 'models':
        return await getAvailableModels();
      case 'start':
        return await startTradingWorkflow(symbol);
      case 'agents':
        return await getAgentsStatus();
      case 'workflows':
        return await getWorkflowsStatus();
      case 'metrics':
        return await getPerformanceMetrics();
      default:
        return createSuccessResponse({
          message: 'Multi-Agent Trading System API',
          endpoints: [
            'GET /api/multi-agent?action=status',
            'GET /api/multi-agent?action=test-deepseek',
            'GET /api/multi-agent?action=models',
            'GET /api/multi-agent?action=start&symbol=BTC/USDT',
            'GET /api/multi-agent?action=agents',
            'GET /api/multi-agent?action=workflows',
            'GET /api/multi-agent?action=metrics',
            'POST /api/multi-agent (with action in body)'
          ]
        });
    }
  } catch (error) {
    return handleApiError(error, 'MultiAgentAPI');
  } finally {
    timer.end();
  }
}

export async function POST(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('MultiAgentAPI');
  
  try {
    const body = await request.json();
    const { action, workflowId, symbol } = body;

    switch (action) {
      case 'start':
        return await startTradingWorkflow(symbol || 'BTC/USDT');
      case 'status':
        return await getWorkflowStatus(workflowId);
      case 'cancel':
        return await cancelWorkflow(workflowId);
      case 'test-analysis':
        return await testAnalysis(request);
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    return handleApiError(error, 'MultiAgentAPI');
  } finally {
    timer.end();
  }
}

async function getSystemStatus() {
  const agents = agentCoordinator.getAllAgentsStatus();
  const workflows = agentCoordinator.getAllWorkflowsStatus();
  
  return createSuccessResponse({
    message: 'Multi-Agent System Status',
    status: {
      agentsCount: agents.length,
      activeAgents: agents.filter(a => a.status === 'working').length,
      totalWorkflows: workflows.length,
      runningWorkflows: workflows.filter(w => w.status === 'running').length,
      timestamp: new Date().toISOString()
    }
  });
}

async function startTradingWorkflow(symbol: string) {
  logger.info(`Starting trading workflow for ${symbol}`);
  
  const workflowId = await agentCoordinator.startTradingWorkflow(symbol);
  
  return createSuccessResponse({
    message: 'Trading workflow started',
    workflowId,
    symbol,
    status: 'running',
    timestamp: new Date().toISOString()
  });
}

async function getWorkflowStatus(workflowId: string) {
  if (!workflowId) {
    return NextResponse.json(
      { error: 'Workflow ID is required' },
      { status: 400 }
    );
  }

  const workflow = agentCoordinator.getWorkflowStatus(workflowId);
  if (!workflow) {
    return NextResponse.json(
      { error: 'Workflow not found' },
      { status: 404 }
    );
  }

  return createSuccessResponse({
    message: 'Workflow status retrieved',
    workflow: {
      id: workflow.id,
      symbol: workflow.symbol,
      status: workflow.status,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
      currentStep: workflow.currentStep,
      steps: workflow.steps.map(step => ({
        id: step.id,
        name: step.name,
        agent: step.agent,
        status: step.status,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        error: step.error
      })),
      result: workflow.result
    },
    timestamp: new Date().toISOString()
  });
}

async function cancelWorkflow(workflowId: string) {
  if (!workflowId) {
    return NextResponse.json(
      { error: 'Workflow ID is required' },
      { status: 400 }
    );
  }

  const cancelled = agentCoordinator.cancelWorkflow(workflowId);
  if (!cancelled) {
    return NextResponse.json(
      { error: 'Workflow not found' },
      { status: 404 }
    );
  }

  return createSuccessResponse({
    message: 'Workflow cancelled',
    workflowId,
    status: 'cancelled',
    timestamp: new Date().toISOString()
  });
}

async function getAgentsStatus() {
  const agents = agentCoordinator.getAllAgentsStatus();
  
  return createSuccessResponse({
    message: 'Agent status retrieved',
    agents: agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      lastActivity: agent.lastActivity,
      currentTask: agent.currentTask,
      performance: agent.performance
    })),
    timestamp: new Date().toISOString()
  });
}

async function getWorkflowsStatus() {
  const workflows = agentCoordinator.getAllWorkflowsStatus();
  
  return createSuccessResponse({
    message: 'All workflows status retrieved',
    workflows: workflows.map(workflow => ({
      id: workflow.id,
      symbol: workflow.symbol,
      status: workflow.status,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
      currentStep: workflow.currentStep,
      steps: workflow.steps, // Include full steps array
      stepsCount: workflow.steps.length,
      completedStepsCount: workflow.steps.filter(s => s.status === 'completed').length,
      result: workflow.result
    })),
    timestamp: new Date().toISOString()
  });
}

async function getPerformanceMetrics() {
  const metrics = agentCoordinator.getPerformanceMetrics();
  
  return createSuccessResponse({
    message: 'Performance metrics retrieved',
    metrics,
    timestamp: new Date().toISOString()
  });
}

async function testDeepSeekConnection() {
  const isConnected = await circuitBreakers.externalApi.execute(async () => {
    return await deepseekService.testConnection();
  });

  return createSuccessResponse({
    message: 'DeepSeek R1 Connection Test',
    connected: isConnected,
    timestamp: new Date().toISOString()
  });
}

async function getAvailableModels() {
  const models = await circuitBreakers.externalApi.execute(async () => {
    return await deepseekService.getAvailableModels();
  });

  return createSuccessResponse({
    message: 'Available DeepSeek R1 Models',
    models,
    timestamp: new Date().toISOString()
  });
}

async function testAnalysis(request: NextRequest) {
  const body = await request.json();
  const { prompt, model = 'deepseek-r1:32b' } = body;

  if (!prompt) {
    return NextResponse.json(
      { error: 'Prompt is required' },
      { status: 400 }
    );
  }

  const analysis = await circuitBreakers.externalApi.execute(async () => {
    return await deepseekService.generateTradingAnalysis(prompt, model);
  });

  return createSuccessResponse({
    message: 'DeepSeek R1 Analysis Test Completed',
    analysis,
    model,
    timestamp: new Date().toISOString()
  });
}
