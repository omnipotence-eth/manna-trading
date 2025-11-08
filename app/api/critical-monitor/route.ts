/**
 * Critical Service Monitor API
 * Endpoint to check and manage the critical service monitor
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { criticalServiceMonitor } from '@/services/criticalServiceMonitor';

export const dynamic = 'force-dynamic';

/**
 * GET /api/critical-monitor - Get critical monitor status
 */
export async function GET() {
  try {
    const status = criticalServiceMonitor.getStatus();
    
    return NextResponse.json({
      success: true,
      data: {
        status,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get critical monitor status', error as Error, {
      context: 'CriticalMonitorAPI'
    });
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/critical-monitor - Update critical monitor settings
 * Body: { "mode": "crash" | "log" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode } = body;
    
    if (!mode || (mode !== 'crash' && mode !== 'log')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid mode. Must be "crash" or "log"'
        },
        { status: 400 }
      );
    }
    
    criticalServiceMonitor.setFailureMode(mode);
    
    logger.info(`Critical Service Monitor mode changed to: ${mode}`, {
      context: 'CriticalMonitorAPI',
      mode
    });
    
    const status = criticalServiceMonitor.getStatus();
    
    return NextResponse.json({
      success: true,
      data: {
        message: `Critical monitor mode changed to: ${mode}`,
        status,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to update critical monitor mode', error as Error, {
      context: 'CriticalMonitorAPI'
    });
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

