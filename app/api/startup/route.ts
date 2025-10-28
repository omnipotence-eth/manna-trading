/**
 * Application Startup API
 * Handles application initialization and shutdown
 */

import { NextRequest, NextResponse } from 'next/server';
import { startupService } from '@/services/startupService';
import { logger } from '@/lib/logger';
import { handleApiError, createSuccessResponse } from '@/lib/errorHandler';
import { PerformanceMonitor } from '@/lib/performanceMonitor';

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
  const isInitialized = startupService.isInitialized();
  
  return createSuccessResponse({
    message: 'Startup Status',
    status: {
      initialized: isInitialized,
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
