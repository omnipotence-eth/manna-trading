/**
 * Application Startup API
 * Handles application initialization and shutdown
 */

import { NextRequest, NextResponse } from 'next/server';
import { startupService } from '@/services/monitoring/startupService';
import { logger } from '@/lib/logger';
import { handleApiError, createSuccessResponse } from '@/lib/errorHandler';
import { PerformanceMonitor } from '@/lib/performanceMonitor';
import { realBalanceService } from '@/services/trading/realBalanceService';
import { asterConfig } from '@/lib/configService';
import { agentRunnerService } from '@/services/ai/agentRunnerService';

// Force dynamic rendering to suppress Next.js static generation warnings
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('StartupAPI');
  
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'status':
        return await getStartupStatus();
      case 'initialize':
        return await initializeServices();
      case 'shutdown':
        return await shutdownServices();
      default:
        return createSuccessResponse({
          message: 'Application Startup API',
          endpoints: [
            'GET /api/startup?action=status',
            'GET /api/startup?action=initialize',
            'GET /api/startup?action=shutdown'
          ]
        });
    }
  } catch (error) {
    return handleApiError(error, 'StartupAPI');
  } finally {
    timer.end();
  }
}

export async function POST(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('StartupAPI');
  
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'initialize':
        return await initializeServices();
      case 'shutdown':
        return await shutdownServices();
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    return handleApiError(error, 'StartupAPI');
  } finally {
    timer.end();
  }
}

async function getStartupStatus() {
    const isInitialized = await startupService.isInitialized();
  
  // CRITICAL FIX: Include balance, confidence, and Agent Runner status
  const balanceConfig = realBalanceService.getBalanceConfig();
  const accountBalance = balanceConfig?.availableBalance || 0;
  const confidenceThreshold = asterConfig.trading.confidenceThreshold || 0.35;
  const agentRunnerStatus = agentRunnerService.getStatus();
  
  return createSuccessResponse({
    message: 'Startup Status',
    status: {
      initialized: isInitialized,
      accountBalance: accountBalance,
      confidenceThreshold: confidenceThreshold,
      agentRunnerRunning: agentRunnerStatus.isRunning,
      agentRunnerActiveWorkflows: agentRunnerStatus.activeWorkflowCount,
      timestamp: new Date().toISOString()
    }
  });
}

async function initializeServices() {
  await startupService.initialize();
  
  return createSuccessResponse({
    message: 'Services Initialized',
    timestamp: new Date().toISOString()
  });
}

async function shutdownServices() {
  await startupService.shutdown();
  
  return createSuccessResponse({
    message: 'Services Shutdown',
    timestamp: new Date().toISOString()
  });
}

