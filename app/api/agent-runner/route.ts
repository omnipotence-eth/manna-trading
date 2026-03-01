/**
 * 24/7 Agent Runner API Routes
 * Controls the continuous trading agent system
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentRunnerService } from '@/services/ai/agentRunnerService';
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
  try {
    // Get status before starting
    const statusBefore = agentRunnerService.getStatus();
    
    if (statusBefore.isRunning) {
      return createSuccessResponse({
        message: 'Agent Runner is already running',
        status: statusBefore,
        timestamp: new Date().toISOString()
      });
    }
    
    // Start the Agent Runner
    await agentRunnerService.start();
    
    // Wait a moment for isRunning flag to be set
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify it actually started
    const statusAfter = agentRunnerService.getStatus();
    
    if (!statusAfter.isRunning) {
      logger.error('Agent Runner start() completed but isRunning=false', {
        context: 'AgentRunnerAPI',
        data: { statusBefore, statusAfter }
      });
      
      return NextResponse.json(
        {
          success: false,
          error: 'Agent Runner start() completed but isRunning=false',
          statusBefore,
          statusAfter,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
    
    logger.info('Agent Runner started successfully via API', {
      context: 'AgentRunnerAPI',
      data: {
        isRunning: statusAfter.isRunning,
        symbols: statusAfter.config.symbols.length,
        activeWorkflows: statusAfter.activeWorkflowCount
      }
    });
    
    return createSuccessResponse({
      message: 'Agent Runner Started Successfully',
      status: statusAfter,
      verified: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to start Agent Runner', error, {
      context: 'AgentRunnerAPI'
    });
    
    // Check if it started despite the error
    const status = agentRunnerService.getStatus();
    if (status.isRunning) {
      return createSuccessResponse({
        message: 'Agent Runner started (with warning)',
        status,
        warning: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
    
    return handleApiError(error, 'AgentRunnerAPI');
  }
}

async function stopRunner() {
  await agentRunnerService.stop();
  
  return createSuccessResponse({
    message: 'Agent Runner Stopped',
    timestamp: new Date().toISOString()
  });
}

async function forceRunCycle() {
  try {
    // Check if Agent Runner is running first
    const status = agentRunnerService.getStatus();
    
    if (!status.isRunning) {
      logger.warn('Force run cycle called but Agent Runner is not running - starting it first', {
        context: 'AgentRunnerAPI'
      });
      
      // Try to start it
      await agentRunnerService.start();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const newStatus = agentRunnerService.getStatus();
      if (!newStatus.isRunning) {
        return NextResponse.json(
          {
            success: false,
            error: 'Agent Runner is not running and could not be started',
            timestamp: new Date().toISOString()
          },
          { status: 500 }
        );
      }
    }
    
    // Force run the cycle
    await agentRunnerService.forceRunCycle();
    
    return createSuccessResponse({
      message: 'Trading Cycle Forced',
      status: agentRunnerService.getStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to force run cycle', error, {
      context: 'AgentRunnerAPI'
    });
    return handleApiError(error, 'AgentRunnerAPI');
  }
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

