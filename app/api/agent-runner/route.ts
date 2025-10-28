/**
 * 24/7 Agent Runner API Routes
 * Controls the continuous trading agent system
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentRunnerService } from '@/services/agentRunnerService';
import { logger } from '@/lib/logger';
import { handleApiError, createSuccessResponse } from '@/lib/errorHandler';
import { PerformanceMonitor } from '@/lib/performanceMonitor';

export async function GET(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('AgentRunnerAPI');
  
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'status':
        return await getRunnerStatus();
      case 'force-run':
        return await forceRunCycle();
      case 'update-symbols':
        return await updateSymbols();
      case 'config':
        return await getConfig();
      default:
        return createSuccessResponse({
          message: '24/7 Agent Runner API',
          endpoints: [
            'GET /api/agent-runner?action=status',
            'GET /api/agent-runner?action=force-run',
            'POST /api/agent-runner/start',
            'POST /api/agent-runner/stop',
            'POST /api/agent-runner/config',
            'POST /api/agent-runner/symbols'
          ]
        });
    }
  } catch (error) {
    return handleApiError(error, 'AgentRunnerAPI');
  } finally {
    timer.end();
  }
}

export async function POST(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('AgentRunnerAPI');
  
  try {
    const body = await request.json();
    const { action, config, symbol, symbols } = body;

    switch (action) {
      case 'start':
        return await startRunner();
      case 'stop':
        return await stopRunner();
      case 'config':
        return await updateConfig(config);
      case 'add-symbol':
        return await addSymbol(symbol);
      case 'remove-symbol':
        return await removeSymbol(symbol);
      case 'set-symbols':
        return await setSymbols(symbols);
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    return handleApiError(error, 'AgentRunnerAPI');
  } finally {
    timer.end();
  }
}

async function getRunnerStatus() {
  const status = agentRunnerService.getStatus();
  
  return createSuccessResponse({
    message: 'Agent Runner Status',
    status: {
      isRunning: status.isRunning,
      config: status.config,
      activeWorkflows: status.activeWorkflows,
      activeWorkflowCount: status.activeWorkflowCount,
      timestamp: new Date().toISOString()
    }
  });
}

async function startRunner() {
  await agentRunnerService.start();
  
  return createSuccessResponse({
    message: 'Agent Runner Started',
    timestamp: new Date().toISOString()
  });
}

async function stopRunner() {
  await agentRunnerService.stop();
  
  return createSuccessResponse({
    message: 'Agent Runner Stopped',
    timestamp: new Date().toISOString()
  });
}

async function forceRunCycle() {
  await agentRunnerService.forceRunCycle();
  
  return createSuccessResponse({
    message: 'Trading Cycle Forced',
    timestamp: new Date().toISOString()
  });
}

async function updateConfig(config: any) {
  if (!config) {
    return NextResponse.json(
      { error: 'Config is required' },
      { status: 400 }
    );
  }

  agentRunnerService.updateConfig(config);
  
  return createSuccessResponse({
    message: 'Config Updated',
    config,
    timestamp: new Date().toISOString()
  });
}

async function addSymbol(symbol: string) {
  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol is required' },
      { status: 400 }
    );
  }

  agentRunnerService.addSymbol(symbol);
  
  return createSuccessResponse({
    message: 'Symbol Added',
    symbol,
    timestamp: new Date().toISOString()
  });
}

async function removeSymbol(symbol: string) {
  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol is required' },
      { status: 400 }
    );
  }

  agentRunnerService.removeSymbol(symbol);
  
  return createSuccessResponse({
    message: 'Symbol Removed',
    symbol,
    timestamp: new Date().toISOString()
  });
}

async function setSymbols(symbols: string[]) {
  if (!Array.isArray(symbols)) {
    return NextResponse.json(
      { error: 'Symbols must be an array' },
      { status: 400 }
    );
  }

  // Update config with new symbols list
  agentRunnerService.updateConfig({ symbols });
  
  return createSuccessResponse({
    message: 'Symbols Updated',
    symbols,
    timestamp: new Date().toISOString()
  });
}

async function updateSymbols() {
  try {
    await agentRunnerService.forceUpdateSymbols();
    
    return createSuccessResponse({
      message: 'Symbols updated from Aster DEX',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to update symbols', error, { context: 'AgentRunnerAPI' });
    return NextResponse.json(
      { error: 'Failed to update symbols' },
      { status: 500 }
    );
  }
}

async function getConfig() {
  const config = agentRunnerService.getConfig();
  
  return createSuccessResponse({
    message: 'Agent Runner Configuration',
    config,
    timestamp: new Date().toISOString()
  });
}
