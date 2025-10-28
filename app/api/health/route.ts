/**
 * Health Check API Endpoint
 * Provides comprehensive system health monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getCircuitBreakerHealth, getCircuitBreakerStats } from '@/lib/circuitBreaker';
import { getCacheStats } from '@/lib/requestCache';
import { PerformanceMonitor } from '@/lib/performanceMonitor';
import { asterConfig } from '@/lib/configService';
import { createSuccessResponse, handleApiError } from '@/lib/errorHandler';

/**
 * GET /api/health
 * Comprehensive health check endpoint
 */
export async function GET(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('api:health:check');
  
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      
      // System health
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform,
      },
      
      // Configuration health
      config: {
        hasApiKey: !!asterConfig.apiKey,
        hasSecretKey: !!asterConfig.secretKey,
        baseUrl: asterConfig.baseUrl,
        tradingConfig: {
          maxSymbols: asterConfig.trading.maxSymbolsPerCycle,
          batchSize: asterConfig.trading.batchSize,
          confidenceThreshold: asterConfig.trading.confidenceThreshold,
          stopLoss: asterConfig.trading.stopLossPercent,
          takeProfit: asterConfig.trading.takeProfitPercent,
        },
        monitoringConfig: {
          positionInterval: asterConfig.monitoring.positionCheckInterval,
          tradingInterval: asterConfig.monitoring.tradingCycleInterval,
          logLevel: asterConfig.monitoring.logLevel,
        }
      },
      
      // Circuit breaker health
      circuitBreakers: getCircuitBreakerHealth(),
      
      // Cache health
      cache: getCacheStats(),
      
      // Performance metrics
      performance: PerformanceMonitor.getSummary(),
      
      // API endpoints health
      endpoints: {
        trading: '/api/trading',
        account: '/api/aster/account',
        positions: '/api/aster/positions',
        orders: '/api/aster/order',
        trades: '/api/trades',
        messages: '/api/model-message',
        prices: '/api/prices',
        optimizedData: '/api/optimized-data'
      }
    };

    // Determine overall health status
    if (!health.config.hasApiKey || !health.config.hasSecretKey) {
      health.status = 'degraded';
    }
    
    if (!health.circuitBreakers.overall) {
      health.status = 'unhealthy';
    }
    
    if (health.performance.systemHealth === 'critical') {
      health.status = 'critical';
    }

    const duration = timer.end();
    PerformanceMonitor.recordCounter('api:health:success');
    PerformanceMonitor.recordGauge('api:health:response_time', duration);

    logger.info('Health check completed', {
      context: 'HealthCheck',
      data: {
        status: health.status,
        circuitBreakers: health.circuitBreakers.overall,
        systemHealth: health.performance.systemHealth,
        duration
      }
    });

    return createSuccessResponse(health);
  } catch (error: any) {
    timer.end();
    PerformanceMonitor.recordCounter('api:health:error');
    return handleApiError(error, 'HealthCheck');
  }
}

/**
 * GET /api/health/metrics
 * Detailed performance metrics endpoint
 */
export async function POST(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('api:health:metrics');
  
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      
      // Performance metrics
      performance: PerformanceMonitor.getAllMetrics(),
      
      // Circuit breaker statistics
      circuitBreakers: getCircuitBreakerStats(),
      
      // Cache statistics
      cache: getCacheStats(),
      
      // System metrics
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
        loadAverage: process.platform === 'linux' ? require('os').loadavg() : null,
      }
    };

    const duration = timer.end();
    PerformanceMonitor.recordCounter('api:health:metrics:success');
    PerformanceMonitor.recordGauge('api:health:metrics:response_time', duration);

    logger.debug('Metrics collected', {
      context: 'HealthCheck',
      data: {
        metricCount: Object.keys(metrics.performance).length,
        duration
      }
    });

    return createSuccessResponse(metrics);
  } catch (error: any) {
    timer.end();
    PerformanceMonitor.recordCounter('api:health:metrics:error');
    return handleApiError(error, 'HealthCheck');
  }
}
