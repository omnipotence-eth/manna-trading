import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Test endpoint to manually trigger cron job
export async function GET(request: NextRequest) {
  try {
    logger.info('🧪 Manual cron test triggered', { context: 'TestCron' });
    
    // Call the actual cron endpoint
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/cron/trading`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    logger.info('✅ Manual cron test completed', { 
      context: 'TestCron',
      data: { status: response.status, success: data.success }
    });
    
    return NextResponse.json({
      success: true,
      message: 'Manual cron test completed',
      cronResponse: data,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('❌ Manual cron test failed', error, { context: 'TestCron' });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
