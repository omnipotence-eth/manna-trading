/**
 * Trading Status API
 * Diagnostic endpoint to check why trades aren't executing
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentRunnerService } from '@/services/ai/agentRunnerService';
import { marketScannerService } from '@/services/trading/marketScannerService';
import { agentCoordinator } from '@/services/ai/agentCoordinator';
import { asterDexService } from '@/services/exchange/asterDexService';
import { asterConfig } from '@/lib/configService';
import { logger } from '@/lib/logger';

interface DiagnosticIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  solution: string;
}

interface Diagnostics {
  timestamp: string;
  agentRunner: {
    isRunning?: boolean;
    enabled?: boolean;
    symbolsCount?: number;
    activeWorkflows?: number;
    maxConcurrentWorkflows?: number;
    intervalMinutes?: number;
    symbols?: string[];
  };
  marketScanner: {
    opportunitiesFound?: number;
    topOpportunities?: Array<{
      symbol: string;
      score: number;
      confidence: string;
      recommendation: string;
      volume24h: number;
    }>;
    lastScanTime?: number;
    scanDuration?: number;
    error?: string;
  };
  configuration: {
    confidenceThreshold: number;
    maxConcurrentWorkflows: number;
    maxConcurrentPositions: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    blacklistedSymbols: number;
    agentRunnerInterval: number;
  };
  account: {
    balance?: number;
    openPositions?: number;
    maxPositions?: number;
    positionsAtLimit?: boolean;
    error?: string;
  };
  workflows: {
    active: number;
    total: number;
    completed: number;
    failed: number;
    successRate: string;
    maxConcurrent: number;
    workflows: Array<{
      symbol: string;
      status: string;
      currentStep: string;
      startedAt: string;
    }>;
  };
  issues: DiagnosticIssue[];
  recommendations: string[];
}

export async function GET(request: NextRequest) {
  try {
    const diagnostics: Diagnostics = {
      timestamp: new Date().toISOString(),
      agentRunner: {},
      marketScanner: {},
      configuration: {
        confidenceThreshold: 0,
        maxConcurrentWorkflows: 0,
        maxConcurrentPositions: 0,
        stopLossPercent: 0,
        takeProfitPercent: 0,
        blacklistedSymbols: 0,
        agentRunnerInterval: 0,
      },
      account: {},
      workflows: {
        active: 0,
        total: 0,
        completed: 0,
        failed: 0,
        successRate: '0',
        maxConcurrent: 0,
        workflows: [],
      },
      issues: [],
      recommendations: [],
    };

    // 1. Agent Runner Status
    const runnerStatus = agentRunnerService.getStatus();
    diagnostics.agentRunner = {
      isRunning: runnerStatus.isRunning,
      enabled: runnerStatus.config.enabled,
      symbolsCount: runnerStatus.config.symbols.length,
      activeWorkflows: runnerStatus.activeWorkflowCount,
      maxConcurrentWorkflows: runnerStatus.config.maxConcurrentWorkflows,
      intervalMinutes: runnerStatus.config.intervalMinutes,
      symbols: runnerStatus.config.symbols.slice(0, 10) // First 10
    };

    if (!runnerStatus.isRunning) {
      diagnostics.issues.push({
        severity: 'CRITICAL',
        issue: 'Agent Runner is NOT running',
        solution: 'Call /api/agent-runner/start to start the Agent Runner'
      });
    }

    if (!runnerStatus.config.enabled) {
      diagnostics.issues.push({
        severity: 'CRITICAL',
        issue: 'Agent Runner is DISABLED',
        solution: 'Set ENABLE_24_7_AGENTS=true in .env.local'
      });
    }

    if (runnerStatus.config.symbols.length === 0) {
      diagnostics.issues.push({
        severity: 'HIGH',
        issue: 'No symbols available for trading',
        solution: 'Check API connection to Aster DEX - symbols should be fetched automatically'
      });
    }

    // 2. Market Scanner Status
    try {
      const scanResult = await marketScannerService.scanMarkets();
      diagnostics.marketScanner = {
        opportunitiesFound: scanResult.opportunities.length,
        topOpportunities: scanResult.opportunities.slice(0, 5).map(opp => ({
          symbol: opp.symbol,
          score: opp.score,
          confidence: (opp.confidence * 100).toFixed(1) + '%',
          recommendation: opp.recommendation,
          volume24h: opp.marketData?.quoteVolume24h || 0
        })),
        lastScanTime: scanResult.timestamp,
        scanDuration: scanResult.scanDuration
      };

      if (scanResult.opportunities.length === 0) {
        diagnostics.issues.push({
          severity: 'MEDIUM',
          issue: 'No trading opportunities found',
          solution: 'Market conditions may not be favorable, or filters may be too strict'
        });
      }

      // Check if opportunities meet thresholds
      const opportunitiesAboveThreshold = scanResult.opportunities.filter(opp => {
        return opp.score >= 35 && opp.confidence >= 0.35;
      });

      if (scanResult.opportunities.length > 0 && opportunitiesAboveThreshold.length === 0) {
        diagnostics.issues.push({
          severity: 'MEDIUM',
          issue: `Found ${scanResult.opportunities.length} opportunities but none meet thresholds (score >= 35, confidence >= 35%)`,
          solution: 'Consider lowering thresholds in config or wait for better market conditions'
        });
      }
    } catch (error) {
      diagnostics.marketScanner = {
        error: error instanceof Error ? error.message : String(error)
      };
      diagnostics.issues.push({
        severity: 'HIGH',
        issue: 'Market scanner failed',
        solution: 'Check server logs for details'
      });
    }

    // 3. Configuration
    diagnostics.configuration = {
      confidenceThreshold: asterConfig.trading.confidenceThreshold || 0.35,
      maxConcurrentWorkflows: asterConfig.trading.maxConcurrentWorkflows || 3,
      maxConcurrentPositions: asterConfig.trading.maxConcurrentPositions || 2,
      stopLossPercent: asterConfig.trading.stopLossPercent || 3,
      takeProfitPercent: asterConfig.trading.takeProfitPercent || 6,
      blacklistedSymbols: asterConfig.trading.blacklistedSymbols?.length || 0,
      agentRunnerInterval: asterConfig.trading.agentRunnerInterval || 2
    };

    // 4. Account Status
    try {
      const balance = await asterDexService.getBalance();
      const positions = await asterDexService.getPositions();
      
      diagnostics.account = {
        balance: balance,
        openPositions: positions.length,
        maxPositions: asterConfig.trading.maxConcurrentPositions || 2,
        positionsAtLimit: positions.length >= (asterConfig.trading.maxConcurrentPositions || 2)
      };

      if (balance < 5) {
        diagnostics.issues.push({
          severity: 'CRITICAL',
          issue: `Balance too low: $${balance.toFixed(2)} (minimum $5 required)`,
          solution: 'Deposit more funds to enable trading'
        });
      }

      if (positions.length >= (asterConfig.trading.maxConcurrentPositions || 2)) {
        diagnostics.issues.push({
          severity: 'MEDIUM',
          issue: `Max positions reached: ${positions.length}/${asterConfig.trading.maxConcurrentPositions || 2}`,
          solution: 'Wait for existing positions to close or increase MAX_CONCURRENT_POSITIONS'
        });
      }
    } catch (error) {
      diagnostics.account = {
        error: error instanceof Error ? error.message : String(error)
      };
      diagnostics.issues.push({
        severity: 'HIGH',
        issue: 'Failed to get account status',
        solution: 'Check API connection to Aster DEX'
      });
    }

    // 5. Active Workflows
    const allWorkflows = agentCoordinator.getAllWorkflowsStatus();
    const activeWorkflows = allWorkflows.filter(wf => wf.status === 'running');
    const metrics = agentCoordinator.getPerformanceMetrics();
    
    diagnostics.workflows = {
      active: activeWorkflows.length,
      total: allWorkflows.length,
      completed: allWorkflows.filter(wf => wf.status === 'completed').length,
      failed: allWorkflows.filter(wf => wf.status === 'failed').length,
      successRate: metrics.completedWorkflows > 0 
        ? ((metrics.completedWorkflows / (metrics.completedWorkflows + metrics.failedWorkflows)) * 100).toFixed(1)
        : '0',
      maxConcurrent: asterConfig.trading.maxConcurrentWorkflows || 3,
      workflows: activeWorkflows.map(wf => ({
        symbol: wf.symbol,
        status: wf.status,
        currentStep: wf.currentStep || 'unknown',
        startedAt: new Date(wf.startedAt).toISOString()
      }))
    };

    if (activeWorkflows.length >= (asterConfig.trading.maxConcurrentWorkflows || 3)) {
      diagnostics.issues.push({
        severity: 'MEDIUM',
        issue: `Max concurrent workflows reached: ${activeWorkflows.length}/${asterConfig.trading.maxConcurrentWorkflows || 3}`,
        solution: 'Wait for workflows to complete or increase MAX_CONCURRENT_WORKFLOWS'
      });
    }

    // 6. Generate Recommendations
    if (diagnostics.issues.length === 0) {
      diagnostics.recommendations.push('[OK] System appears healthy - if no trades, market conditions may not be favorable');
      diagnostics.recommendations.push('Check server logs for workflow execution details');
      diagnostics.recommendations.push('Monitor /api/agent-insights for agent thoughts');
    } else {
      const criticalIssues = diagnostics.issues.filter((i) => i.severity === 'CRITICAL');
      if (criticalIssues.length > 0) {
        diagnostics.recommendations.push('🚨 CRITICAL issues found - these must be fixed before trading can start');
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        diagnostics,
        config: {
          stopLoss: asterConfig.trading.stopLossPercent || 3,
          takeProfit: asterConfig.trading.takeProfitPercent || 6,
          scanInterval: asterConfig.trading.agentRunnerInterval || 60,
        },
        simulationMode: asterConfig.trading.simulationMode || false
      }
    }, { status: 200 });

  } catch (error) {
    logger.error('Failed to get trading status', error, {
      context: 'TradingStatusAPI'
    });
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}


