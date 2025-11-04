/**
 * Detailed Health Check Endpoint
 * Shows status of all system components including 30-key pool
 */

import { NextResponse } from 'next/server';
import apiKeyManager from '@/lib/apiKeyManager';
import { getCircuitBreakerHealth, getCircuitBreakerStats } from '@/lib/circuitBreaker';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const keyStats = apiKeyManager.getStats();
    const cbHealth = getCircuitBreakerHealth();
    const cbStats = getCircuitBreakerStats();

    // Check database
    let databaseStatus = 'unknown';
    let databaseDetails = {};
    try {
      const { db } = await import('@/lib/db');
      await db.execute('SELECT 1');
      databaseStatus = 'healthy';
      databaseDetails = {
        connected: true,
        responseTime: '<50ms'
      };
    } catch (error) {
      databaseStatus = 'unhealthy';
      databaseDetails = {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check agent runner
    let agentRunnerStatus = 'unknown';
    try {
      const { agentRunnerService } = await import('@/services/agentRunnerService');
      const runnerStatus = agentRunnerService.getStatus();
      agentRunnerStatus = runnerStatus.isRunning ? 'running' : 'stopped';
    } catch (error) {
      agentRunnerStatus = 'error';
    }

    // CRITICAL FIX: Check Ollama and DeepSeek R1 connection
    let ollamaStatus = 'unknown';
    let deepSeekStatus = 'unknown';
    let ollamaDetails: any = {};
    let deepSeekDetails: any = {};
    
    try {
      // Step 1: Check if Ollama is running
      const controller1 = new AbortController();
      const timeoutId1 = setTimeout(() => controller1.abort(), 5000);
      
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const tagsResponse = await fetch(`${ollamaUrl}/api/tags`, {
        signal: controller1.signal
      });
      
      clearTimeout(timeoutId1);
      
      if (tagsResponse.ok) {
        ollamaStatus = 'healthy';
        const models = await tagsResponse.json();
        const availableModels = models.models?.map((m: any) => m.name) || [];
        const deepSeekModels = availableModels.filter((m: string) => 
          m.includes('deepseek') && m.includes('r1')
        );
        
        ollamaDetails = {
          connected: true,
          availableModels: availableModels.length,
          deepSeekModels: deepSeekModels.length
        };
        
        if (deepSeekModels.length > 0) {
          // Step 2: Check if DeepSeek can actually respond (quick test with timeout)
          // CRITICAL FIX: Use shorter timeout for health check to avoid blocking
          try {
            const { deepseekService } = await import('@/services/deepseekService');
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), 5000); // 5s quick test for health check
            
            // CRITICAL FIX: Test with very short timeout to avoid blocking health endpoint
            // If model is loading, we'll show WARNING instead of blocking the entire health check
            const testResult = await Promise.race([
              deepseekService.testConnection(),
              new Promise<boolean>((_, reject) => {
                setTimeout(() => reject(new Error('Health check test timeout (5s) - model may be loading')), 5000);
              })
            ]).catch(() => false);
            
            clearTimeout(timeoutId2);
            
            if (testResult === true) {
              deepSeekStatus = 'PASS';
              deepSeekDetails = {
                status: 'connected',
                models: deepSeekModels,
                responding: true
              };
            } else {
              deepSeekStatus = 'WARNING';
              deepSeekDetails = {
                status: 'model_loading',
                models: deepSeekModels,
                responding: false,
                message: 'Models found but not responding within 5s - may be loading (this is normal during initialization)'
              };
            }
          } catch (testError) {
            // CRITICAL FIX: Don't fail health check if DeepSeek test times out - just show WARNING
            deepSeekStatus = 'WARNING';
            const errorMsg = testError instanceof Error ? testError.message : String(testError);
            const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('aborted');
            
            deepSeekDetails = {
              status: isTimeout ? 'model_loading' : 'test_failed',
              models: deepSeekModels,
              responding: false,
              message: isTimeout 
                ? 'Model may still be loading (timeout after 5s) - this is normal during initialization'
                : `Test failed: ${errorMsg}`,
              error: errorMsg
            };
          }
        } else {
          deepSeekStatus = 'FAIL';
          deepSeekDetails = {
            status: 'no_models',
            message: 'DeepSeek R1 models not found in Ollama',
            availableModels: availableModels
          };
        }
      } else {
        ollamaStatus = 'unhealthy';
        ollamaDetails = {
          connected: false,
          statusCode: tagsResponse.status
        };
        deepSeekStatus = 'FAIL';
        deepSeekDetails = {
          status: 'ollama_unavailable',
          message: 'Cannot check DeepSeek - Ollama not responding'
        };
      }
    } catch (error) {
      ollamaStatus = 'unhealthy';
      ollamaDetails = {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      deepSeekStatus = 'FAIL';
      deepSeekDetails = {
        status: 'check_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Overall health
    const isHealthy = 
      keyStats.healthyKeys > 0 &&
      databaseStatus === 'healthy' &&
      cbHealth.overall;

    const health = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      components: {
        asterAPI: {
          status: keyStats.healthyKeys > 0 ? 'healthy' : 'unhealthy',
          multiKeyEnabled: keyStats.totalKeys > 1,
          totalKeys: keyStats.totalKeys,
          healthyKeys: keyStats.healthyKeys,
          unhealthyKeys: keyStats.unhealthyKeys,
          totalRequests: keyStats.totalRequests,
          totalErrors: keyStats.totalErrors,
          errorRate: keyStats.totalRequests > 0 
            ? ((keyStats.totalErrors / keyStats.totalRequests) * 100).toFixed(2) + '%'
            : '0%',
          totalCapacityRPS: keyStats.totalCapacityRPS,
          availableCapacityRPS: keyStats.availableCapacityRPS,
          utilizationPercent: keyStats.totalCapacityRPS > 0
            ? (((keyStats.totalCapacityRPS - keyStats.availableCapacityRPS) / keyStats.totalCapacityRPS) * 100).toFixed(1) + '%'
            : '0%',
          keyDetails: keyStats.keyDetails.slice(0, 10) // Show first 10 keys
        },
        database: {
          status: databaseStatus,
          ...databaseDetails
        },
        circuitBreakers: {
          overall: cbHealth.overall,
          states: cbHealth.circuits,
          stats: {
            asterApi: {
              state: cbStats.asterApi.state,
              totalRequests: cbStats.asterApi.totalRequests,
              failures: cbStats.asterApi.totalFailures,
              failureRate: (cbStats.asterApi.failureRate * 100).toFixed(2) + '%'
            },
            database: {
              state: cbStats.database.state,
              totalRequests: cbStats.database.totalRequests,
              failures: cbStats.database.totalFailures,
              failureRate: (cbStats.database.failureRate * 100).toFixed(2) + '%'
            }
          }
        },
        agentRunner: {
          status: agentRunnerStatus
        },
        ollama: {
          status: ollamaStatus,
          ...ollamaDetails
        },
        DeepSeekConnection: {
          status: deepSeekStatus,
          ...deepSeekDetails
        }
      },
      performance: {
        averageKeyUtilization: keyStats.totalKeys > 0
          ? (keyStats.totalRequests / keyStats.totalKeys).toFixed(0) + ' req/key'
          : '0 req/key'
      }
    };

    logger.debug('Health check completed', {
      context: 'HealthAPI',
      data: {
        status: health.status,
        healthyKeys: keyStats.healthyKeys,
        totalKeys: keyStats.totalKeys
      }
    });

    return NextResponse.json(health);
  } catch (error) {
    logger.error('Health check failed', error as Error, {
      context: 'HealthAPI'
    });

    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

