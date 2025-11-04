/**
 * Test API Keys Configuration
 * Verifies that all 30 keys are loaded correctly
 */

import { NextResponse } from 'next/server';
import apiKeyManager from '@/lib/apiKeyManager';
import { logger } from '@/lib/logger';

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    tests: [] as any[],
    summary: {
      passed: 0,
      failed: 0,
      warnings: 0
    }
  };

  // Test 1: Check if ASTER_KEY_POOL exists
  const keyPool = process.env.ASTER_KEY_POOL;
  if (!keyPool) {
    results.tests.push({
      name: 'ASTER_KEY_POOL environment variable',
      status: 'FAIL',
      message: 'ASTER_KEY_POOL not found in environment',
      fix: 'Add ASTER_KEY_POOL to your .env file (copy from env.keys.example)'
    });
    results.summary.failed++;
  } else {
    results.tests.push({
      name: 'ASTER_KEY_POOL environment variable',
      status: 'PASS',
      message: `Found (${keyPool.length} characters)`,
      preview: keyPool.substring(0, 100) + '...'
    });
    results.summary.passed++;
  }

  // Test 2: Parse JSON
  let parsedKeys = null;
  if (keyPool) {
    try {
      parsedKeys = JSON.parse(keyPool);
      results.tests.push({
        name: 'JSON parsing',
        status: 'PASS',
        message: 'JSON parsed successfully'
      });
      results.summary.passed++;
    } catch (error) {
      results.tests.push({
        name: 'JSON parsing',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Invalid JSON',
        fix: 'Ensure ASTER_KEY_POOL is valid JSON on a single line'
      });
      results.summary.failed++;
    }
  }

  // Test 3: Validate structure
  if (parsedKeys) {
    if (parsedKeys.keys && Array.isArray(parsedKeys.keys)) {
      const keyCount = parsedKeys.keys.length;
      results.tests.push({
        name: 'Key structure',
        status: 'PASS',
        message: `Found ${keyCount} keys in array`,
        data: { keyCount }
      });
      results.summary.passed++;

      if (keyCount === 30) {
        results.tests.push({
          name: 'Key count',
          status: 'PASS',
          message: 'Correct number of keys (30)'
        });
        results.summary.passed++;
      } else {
        results.tests.push({
          name: 'Key count',
          status: 'WARN',
          message: `Expected 30 keys, found ${keyCount}`,
          data: { expected: 30, actual: keyCount }
        });
        results.summary.warnings++;
      }
    } else {
      results.tests.push({
        name: 'Key structure',
        status: 'FAIL',
        message: 'Invalid structure - expected { "keys": [...] }'
      });
      results.summary.failed++;
    }
  }

  // Test 4: Validate individual key format
  if (parsedKeys && parsedKeys.keys) {
    let validKeys = 0;
    let invalidKeys = 0;
    const keyIssues: string[] = [];

    parsedKeys.keys.forEach((key: any, index: number) => {
      const errors: string[] = [];
      
      if (!key.id) errors.push('missing id');
      if (!key.api || key.api.length < 60) errors.push('invalid api key');
      if (!key.secret || key.secret.length < 60) errors.push('invalid secret key');

      if (errors.length === 0) {
        validKeys++;
      } else {
        invalidKeys++;
        keyIssues.push(`Key ${index + 1}: ${errors.join(', ')}`);
      }
    });

    if (invalidKeys === 0) {
      results.tests.push({
        name: 'Individual key validation',
        status: 'PASS',
        message: `All ${validKeys} keys are valid`,
        data: { validKeys, invalidKeys }
      });
      results.summary.passed++;
    } else {
      results.tests.push({
        name: 'Individual key validation',
        status: 'WARN',
        message: `${validKeys} valid keys, ${invalidKeys} invalid`,
        issues: keyIssues.slice(0, 5) // Show first 5 issues
      });
      results.summary.warnings++;
    }
  }

  // Test 5: Check API Key Manager loaded the keys
  const keyStats = apiKeyManager.getStats();
  
  results.tests.push({
    name: 'API Key Manager status',
    status: keyStats.totalKeys > 0 ? 'PASS' : 'FAIL',
    message: `Loaded ${keyStats.totalKeys} keys into manager`,
    data: {
      totalKeys: keyStats.totalKeys,
      healthyKeys: keyStats.healthyKeys,
      unhealthyKeys: keyStats.unhealthyKeys,
      totalCapacityRPS: keyStats.totalCapacityRPS,
      strategy: process.env.API_KEY_STRATEGY || 'least-used'
    }
  });

  if (keyStats.totalKeys > 0) {
    results.summary.passed++;
  } else {
    results.summary.failed++;
  }

  if (keyStats.totalKeys === 30) {
    results.tests.push({
      name: 'All keys loaded in manager',
      status: 'PASS',
      message: 'Perfect! All 30 keys are active',
      data: {
        capacity: '600 req/sec',
        improvement: '30x faster than single key'
      }
    });
    results.summary.passed++;
  } else if (keyStats.totalKeys > 1) {
    results.tests.push({
      name: 'Multi-key mode',
      status: 'PASS',
      message: `Multi-key mode active with ${keyStats.totalKeys} keys`,
      data: {
        capacity: `${keyStats.totalCapacityRPS} req/sec`,
        improvement: `${keyStats.totalKeys}x faster`
      }
    });
    results.summary.passed++;
  } else {
    results.tests.push({
      name: 'Multi-key mode',
      status: 'FAIL',
      message: 'Single key mode - multi-key not activated',
      fix: 'Check ASTER_KEY_POOL in .env'
    });
    results.summary.failed++;
  }

  // Test 6: Check fallback configuration
  const hasFallback = !!process.env.ASTER_API_KEY && !!process.env.ASTER_SECRET_KEY;
  results.tests.push({
    name: 'Fallback configuration',
    status: hasFallback ? 'PASS' : 'WARN',
    message: hasFallback 
      ? 'Fallback keys configured for backwards compatibility'
      : 'No fallback keys (will fail if ASTER_KEY_POOL has issues)'
  });

  if (hasFallback) {
    results.summary.passed++;
  } else {
    results.summary.warnings++;
  }

  // Overall status
  const totalTests = results.summary.passed + results.summary.failed;
  const passRate = totalTests > 0 ? (results.summary.passed / totalTests * 100).toFixed(1) : 0;

  results.summary.passRate = passRate + '%';
  results.summary.overall = results.summary.failed === 0 ? 'SUCCESS' : 'FAILED';

  // Log summary
  logger.info('API key configuration test completed', {
    context: 'TestKeys',
    data: results.summary
  });

  return NextResponse.json(results);
}

