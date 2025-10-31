import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { agentRunnerService } from '@/services/agentRunnerService';

/**
 * GET /api/test-cron - Manual trigger for agent runner (for testing 24/7 trading)
 * This simulates the Vercel cron job locally
 */
export async function GET() {
  try {
    logger.info('🔄 Manual cron trigger - forcing agent runner cycle', { context: 'TestCron' });
    
    // Force run the agent runner cycle
    await agentRunnerService.forceRunCycle();
    
    logger.info('✅ Agent runner cycle completed', { 
      context: 'TestCron'
    });
    
    return NextResponse.json({
      success: true,
      message: 'Agent runner cycle forced successfully',
      cronResponse: {
        status: 'completed',
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to run agent cycle', error as Error, { context: 'TestCron' });
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run agent cycle',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Dynamic route - always run on server
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

