/**
 * Chat Tab Diagnostic Endpoint
 * Tests all dependencies for the chat tab
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET() {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  // Test 1: Server responding
  diagnostics.tests.push({
    name: 'Server Running',
    status: 'PASS',
    message: 'Server is responding'
  });

  // Test 2: Database connection
  try {
    const { db } = await import('@/lib/db');
    await db.execute('SELECT 1');
    diagnostics.tests.push({
      name: 'Database Connection',
      status: 'PASS',
      message: 'Database is accessible'
    });
  } catch (error) {
    diagnostics.tests.push({
      name: 'Database Connection',
      status: 'FAIL',
      message: error instanceof Error ? error.message : 'Unknown error',
      fix: 'Run: curl http://localhost:3000/api/setup/database'
    });
  }

  // Test 3: Check if model_messages table exists
  try {
    const { db } = await import('@/lib/db');
    await db.execute('SELECT COUNT(*) FROM model_messages');
    diagnostics.tests.push({
      name: 'Messages Table',
      status: 'PASS',
      message: 'model_messages table exists'
    });
  } catch (error) {
    diagnostics.tests.push({
      name: 'Messages Table',
      status: 'FAIL',
      message: 'Table may not exist',
      fix: 'Initialize database first'
    });
  }

  // Test 4: Aster API credentials
  try {
    const { asterConfig } = await import('@/lib/configService');
    const hasKey = !!asterConfig.apiKey && asterConfig.apiKey.length > 10;
    const hasSecret = !!asterConfig.secretKey && asterConfig.secretKey.length > 10;
    
    if (hasKey && hasSecret) {
      diagnostics.tests.push({
        name: 'Aster API Credentials',
        status: 'PASS',
        message: 'API credentials configured'
      });
    } else {
      diagnostics.tests.push({
        name: 'Aster API Credentials',
        status: 'WARN',
        message: 'Credentials may be missing or invalid',
        fix: 'Check .env file for ASTER_API_KEY and ASTER_SECRET_KEY'
      });
    }
  } catch (error) {
    diagnostics.tests.push({
      name: 'Aster API Credentials',
      status: 'FAIL',
      message: 'Failed to load config'
    });
  }

  // Test 5: Agent Insights API
  try {
    const response = await fetch('http://localhost:3000/api/agent-insights', {
      headers: { 'User-Agent': 'diagnostic-test' }
    });
    
    if (response.ok) {
      const data = await response.json();
      diagnostics.tests.push({
        name: 'Agent Insights API',
        status: 'PASS',
        message: `Returned ${data.data?.insights?.length || 0} insights`,
        data: {
          totalSymbols: data.data?.scanResult?.totalSymbols,
          opportunities: data.data?.scanResult?.opportunitiesCount
        }
      });
    } else {
      diagnostics.tests.push({
        name: 'Agent Insights API',
        status: 'FAIL',
        message: `HTTP ${response.status}`,
        fix: 'Check server logs for errors'
      });
    }
  } catch (error) {
    diagnostics.tests.push({
      name: 'Agent Insights API',
      status: 'FAIL',
      message: error instanceof Error ? error.message : 'Connection failed',
      fix: 'Ensure npm run dev is running'
    });
  }

  // Summary
  const passed = diagnostics.tests.filter((t: any) => t.status === 'PASS').length;
  const failed = diagnostics.tests.filter((t: any) => t.status === 'FAIL').length;
  const warned = diagnostics.tests.filter((t: any) => t.status === 'WARN').length;

  diagnostics.summary = {
    total: diagnostics.tests.length,
    passed,
    failed,
    warned,
    overall: failed === 0 ? 'HEALTHY' : failed <= 2 ? 'DEGRADED' : 'CRITICAL'
  };

  logger.info('Chat diagnostic completed', {
    context: 'ChatDiagnostic',
    data: diagnostics.summary
  });

  return NextResponse.json(diagnostics);
}

