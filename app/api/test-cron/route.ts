/**
 * Test Cron Endpoint
 * Manually triggers one trading cycle (same behavior as cron - works when runner is not "running").
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentRunnerService } from '@/services/ai/agentRunnerService';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Run one cycle the same way cron does (works in serverless / when no long-lived process)
    await agentRunnerService.runOneCycleForCron();
    
    return NextResponse.json({
      success: true,
      message: 'Trading cycle triggered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to trigger trading cycle', error instanceof Error ? error : new Error(String(error)), {
      context: 'TestCronAPI'
    });
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

