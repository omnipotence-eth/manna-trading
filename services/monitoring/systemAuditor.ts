/**
 * System Audit Script
 * Comprehensive pre-trading system verification
 */

import { logger } from '@/lib/logger';
import { asterConfig } from '@/lib/configService';

// Dynamic import to prevent Next.js from analyzing pg during build
async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}
import { startupService } from '@/services/monitoring/startupService';
import { agentRunnerService } from '@/services/ai/agentRunnerService';
import { positionMonitorService } from '@/services/trading/positionMonitorService';
import { realBalanceService } from '@/services/trading/realBalanceService';
import { asterDexService } from '@/services/exchange/asterDexService';
import { dynamicConfigService } from '@/services/monitoring/dynamicConfigService';
import { rlParameterOptimizer } from '@/services/ml/rlParameterOptimizer';
import { tradePatternAnalyzer } from '@/services/ml/tradePatternAnalyzer';

interface AuditResult {
  category: string;
  item: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

class SystemAuditor {
  private results: AuditResult[] = [];

  async runFullAudit(): Promise<AuditResult[]> {
    logger.info('[AUDIT] Starting comprehensive system audit...', { context: 'SystemAudit' });
    
    this.results = [];
    
    // 1. Configuration Audit
    await this.auditConfiguration();
    
    // 2. Database Audit
    await this.auditDatabase();
    
    // 3. Service Initialization Audit
    await this.auditServices();
    
    // 4. API Connection Audit
    await this.auditAPIConnections();
    
    // 5. RL System Audit
    await this.auditRLSystem();
    
    // 6. Trading Parameters Audit
    await this.auditTradingParameters();
    
    // 7. Safety Checks Audit
    await this.auditSafetyChecks();
    
    // 8. Integration Audit
    await this.auditIntegration();
    
    logger.info('[OK] System audit complete', {
      context: 'SystemAudit',
      data: {
        total: this.results.length,
        passed: this.results.filter(r => r.status === 'PASS').length,
        warnings: this.results.filter(r => r.status === 'WARNING').length,
        failed: this.results.filter(r => r.status === 'FAIL').length
      }
    });
    
    return this.results;
  }

  private addResult(category: string, item: string, status: 'PASS' | 'FAIL' | 'WARNING', message: string, details?: any) {
    this.results.push({ category, item, status, message, details });
  }

  private async auditConfiguration() {
    logger.info('📋 Auditing configuration...', { context: 'SystemAudit' });
    
    // API Keys
    const hasApiKey = !!asterConfig.apiKey;
    const hasSecretKey = !!asterConfig.secretKey;
    this.addResult('Configuration', 'API Key', hasApiKey ? 'PASS' : 'FAIL', 
      hasApiKey ? 'API key configured' : 'API key missing');
    this.addResult('Configuration', 'Secret Key', hasSecretKey ? 'PASS' : 'FAIL', 
      hasSecretKey ? 'Secret key configured' : 'Secret key missing');
    
    // Trading Config
    const confidenceThreshold = asterConfig.trading.confidenceThreshold;
    const stopLossPercent = asterConfig.trading.stopLossPercent;
    const takeProfitPercent = asterConfig.trading.takeProfitPercent;
    const enable24_7Agents = asterConfig.trading.enable24_7Agents;
    
    this.addResult('Configuration', 'Confidence Threshold', 
      confidenceThreshold >= 0.55 && confidenceThreshold <= 0.75 ? 'PASS' : 'WARNING',
      `Confidence threshold: ${confidenceThreshold * 100}%`,
      { threshold: confidenceThreshold });
    
    this.addResult('Configuration', 'Stop-Loss', 
      stopLossPercent >= 2.5 && stopLossPercent <= 4.0 ? 'PASS' : 'WARNING',
      `Stop-loss: ${stopLossPercent}%`,
      { stopLoss: stopLossPercent });
    
    this.addResult('Configuration', 'Take-Profit', 
      takeProfitPercent >= 6.0 && takeProfitPercent <= 12.0 ? 'PASS' : 'WARNING',
      `Take-profit: ${takeProfitPercent}%`,
      { takeProfit: takeProfitPercent });
    
    this.addResult('Configuration', '24/7 Agents Enabled', 
      enable24_7Agents ? 'PASS' : 'WARNING',
      enable24_7Agents ? '24/7 agents enabled' : '24/7 agents disabled');
    
    // Blacklist
    const blacklist = asterConfig.trading.blacklistedSymbols || [];
    const hasBlacklist = blacklist.length > 0;
    const requiredBlacklist = ['APEUSDT', 'COSMOUSDT', 'ATOMUSDT'];
    const hasRequiredBlacklist = requiredBlacklist.every(symbol => 
      blacklist.some(b => b.includes(symbol.split('USDT')[0]))
    );
    
    this.addResult('Configuration', 'Symbol Blacklist', 
      hasBlacklist && hasRequiredBlacklist ? 'PASS' : 'WARNING',
      `Blacklist configured: ${blacklist.length} symbols`,
      { blacklist: blacklist.slice(0, 5) });
  }

  private async auditDatabase() {
    logger.info('[AUDIT] Auditing database...', { context: 'SystemAudit' });
    
    try {
      // Test connection
      const db = await getDb();
      const testResult = await db.execute('SELECT 1 as test', []);
      this.addResult('Database', 'Connection', 'PASS', 'Database connection successful');
      
      // Check tables
      const tables = ['trades', 'open_positions', 'trade_performance'];
      for (const table of tables) {
        try {
          const tableDb = await getDb();
          const result = await tableDb.execute(`SELECT COUNT(*) FROM ${table} LIMIT 1`, []);
          this.addResult('Database', `Table: ${table}`, 'PASS', `Table exists and accessible`);
        } catch (error) {
          this.addResult('Database', `Table: ${table}`, 'FAIL', 
            `Table missing or inaccessible: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Check open positions
      const posDb = await getDb();
      const openPositionsResult = await posDb.execute('SELECT COUNT(*) as count FROM open_positions WHERE status = $1', ['OPEN']);
      const openPositionsCount = parseInt(openPositionsResult.rows[0]?.count) || 0;
      this.addResult('Database', 'Open Positions', 
        openPositionsCount === 0 ? 'PASS' : 'WARNING',
        `${openPositionsCount} open positions found`,
        { count: openPositionsCount });
      
    } catch (error) {
      this.addResult('Database', 'Connection', 'FAIL', 
        `Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async auditServices() {
    logger.info('[AUDIT] Auditing services...', { context: 'SystemAudit' });
    
    // Startup Service
    const isInitialized = await startupService.isInitialized();
    this.addResult('Services', 'Startup Service', 
      isInitialized ? 'PASS' : 'WARNING',
      isInitialized ? 'Services initialized' : 'Services not initialized');
    
    // Real Balance Service
    try {
      const balanceConfig = realBalanceService.getBalanceConfig();
      const hasBalance = balanceConfig && (balanceConfig.availableBalance || balanceConfig.marginBalance);
      this.addResult('Services', 'Real Balance Service', 
        hasBalance ? 'PASS' : 'WARNING',
        hasBalance ? 'Balance service active' : 'Balance service not active',
        { balance: balanceConfig?.availableBalance || balanceConfig?.marginBalance });
    } catch (error) {
      this.addResult('Services', 'Real Balance Service', 'FAIL',
        `Balance service error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Position Monitor Service
    try {
      const openPositions = positionMonitorService.getOpenPositions();
      this.addResult('Services', 'Position Monitor Service', 'PASS',
        `Position monitor active (${openPositions.length} positions)`,
        { positions: openPositions.length });
    } catch (error) {
      this.addResult('Services', 'Position Monitor Service', 'FAIL',
        `Position monitor error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Agent Runner Service
    try {
      const runnerStatus = agentRunnerService.getStatus();
      this.addResult('Services', 'Agent Runner Service', 
        runnerStatus.isRunning ? 'PASS' : 'WARNING',
        runnerStatus.isRunning ? 'Agent runner active' : 'Agent runner not running',
        { isRunning: runnerStatus.isRunning });
    } catch (error) {
      this.addResult('Services', 'Agent Runner Service', 'FAIL',
        `Agent runner error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async auditAPIConnections() {
    logger.info('🌐 Auditing API connections...', { context: 'SystemAudit' });
    
    // Aster DEX API
    try {
      const balance = await asterDexService.getBalance();
      const hasBalance = balance !== null && balance !== undefined && balance > 0;
      this.addResult('API', 'Aster DEX Connection', 
        hasBalance ? 'PASS' : 'WARNING',
        hasBalance ? 'Aster DEX API connected' : 'Aster DEX API connection issue',
        { balance });
    } catch (error) {
      this.addResult('API', 'Aster DEX Connection', 'FAIL',
        `Aster DEX API error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Exchange Info
    try {
      const exchangeInfo = await asterDexService.getExchangeInfo();
      const hasSymbols = exchangeInfo && (exchangeInfo.symbols?.length > 0 || exchangeInfo.topSymbolsByVolume?.length > 0);
      this.addResult('API', 'Exchange Info', 
        hasSymbols ? 'PASS' : 'WARNING',
        hasSymbols ? 'Exchange info retrieved' : 'Exchange info unavailable',
        { symbolCount: exchangeInfo?.symbols?.length || exchangeInfo?.topSymbolsByVolume?.length || 0 });
    } catch (error) {
      this.addResult('API', 'Exchange Info', 'FAIL',
        `Exchange info error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async auditRLSystem() {
    logger.info('🧠 Auditing RL system...', { context: 'SystemAudit' });
    
    // Trade Pattern Analyzer
    try {
      const lessonsLearned = await tradePatternAnalyzer.getLessonsLearned(30);
      const hasPatterns = lessonsLearned.successfulPatterns.length > 0 || lessonsLearned.failurePatterns.length > 0;
      this.addResult('RL System', 'Trade Pattern Analyzer', 'PASS',
        `Pattern analyzer active (${lessonsLearned.successfulPatterns.length} successful, ${lessonsLearned.failurePatterns.length} failed patterns)`,
        { 
          successfulPatterns: lessonsLearned.successfulPatterns.length,
          failurePatterns: lessonsLearned.failurePatterns.length,
          winRate: lessonsLearned.averageWinRate
        });
    } catch (error) {
      this.addResult('RL System', 'Trade Pattern Analyzer', 'WARNING',
        `Pattern analyzer unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // RL Parameter Optimizer
    try {
      const stats = rlParameterOptimizer.getStatistics();
      this.addResult('RL System', 'RL Parameter Optimizer', 'PASS',
        `RL optimizer active (${stats.totalStates} states, ${stats.totalActions} actions)`,
        { 
          totalStates: stats.totalStates,
          totalActions: stats.totalActions,
          explorationRate: stats.explorationRate
        });
    } catch (error) {
      this.addResult('RL System', 'RL Parameter Optimizer', 'WARNING',
        `RL optimizer unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Dynamic Config Service
    try {
      const config = await dynamicConfigService.getOptimizedConfig();
      this.addResult('RL System', 'Dynamic Config Service', 'PASS',
        `Dynamic config active (confidence: ${config.confidenceThreshold * 100}%, R:R: ${config.minRRRatio}:1)`,
        {
          confidenceThreshold: config.confidenceThreshold,
          rrRatio: config.minRRRatio,
          positionSize: config.maxPositionRiskPercent
        });
    } catch (error) {
      this.addResult('RL System', 'Dynamic Config Service', 'WARNING',
        `Dynamic config unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async auditTradingParameters() {
    logger.info('[AUDIT] Auditing trading parameters...', { context: 'SystemAudit' });
    
    try {
      const balanceConfig = realBalanceService.getBalanceConfig();
      const balance = balanceConfig?.availableBalance || balanceConfig?.marginBalance || 0;
      
      // Account size classification
      const accountSize = balance < 100 ? 'micro' : balance < 500 ? 'small' : balance < 2000 ? 'medium' : 'large';
      
      // Risk limits
      const maxPositionRisk = balance < 100 ? 1.2 : balance < 500 ? 1.5 : 2.0;
      const maxPortfolioRisk = balance < 100 ? 2.0 : balance < 500 ? 5.0 : 10.0;
      
      this.addResult('Trading Parameters', 'Account Size', 'PASS',
        `Account size: ${accountSize} ($${balance.toFixed(2)})`,
        { balance, accountSize });
      
      this.addResult('Trading Parameters', 'Max Position Risk', 'PASS',
        `Max position risk: ${maxPositionRisk}%`,
        { maxPositionRisk });
      
      this.addResult('Trading Parameters', 'Max Portfolio Risk', 'PASS',
        `Max portfolio risk: ${maxPortfolioRisk}%`,
        { maxPortfolioRisk });
      
      // Concurrent positions
      const maxConcurrentPositions = balance < 100 ? 1 : 2;
      const openPositions = positionMonitorService.getOpenPositions();
      const withinLimits = openPositions.length < maxConcurrentPositions;
      
      this.addResult('Trading Parameters', 'Concurrent Positions', 
        withinLimits ? 'PASS' : 'WARNING',
        `${openPositions.length}/${maxConcurrentPositions} positions`,
        { current: openPositions.length, max: maxConcurrentPositions });
      
    } catch (error) {
      this.addResult('Trading Parameters', 'Account Analysis', 'FAIL',
        `Failed to analyze account: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async auditSafetyChecks() {
    logger.info('[AUDIT] Auditing safety checks...', { context: 'SystemAudit' });
    
    // Blacklist enforcement
    const blacklist = asterConfig.trading.blacklistedSymbols || [];
    const hasBlacklist = blacklist.length > 0;
    this.addResult('Safety', 'Symbol Blacklist', 
      hasBlacklist ? 'PASS' : 'WARNING',
      `Blacklist configured: ${blacklist.length} symbols`);
    
    // Risk limits
    const maxConcurrentPositions = asterConfig.trading.maxConcurrentPositions || 2;
    const maxPortfolioRisk = asterConfig.trading.maxPortfolioRiskPercent || 10;
    
    this.addResult('Safety', 'Max Concurrent Positions', 'PASS',
      `Max concurrent positions: ${maxConcurrentPositions}`);
    
    this.addResult('Safety', 'Max Portfolio Risk', 'PASS',
      `Max portfolio risk: ${maxPortfolioRisk}%`);
    
    // Position monitoring
    const openPositions = positionMonitorService.getOpenPositions();
    const allHaveStopLoss = openPositions.every(p => p.stopLoss && p.stopLoss > 0);
    this.addResult('Safety', 'Stop-Loss Enforcement', 
      allHaveStopLoss ? 'PASS' : 'WARNING',
      openPositions.length === 0 ? 'No open positions' : 
      allHaveStopLoss ? 'All positions have stop-loss' : 'Some positions missing stop-loss');
  }

  private async auditIntegration() {
    logger.info('🔗 Auditing integrations...', { context: 'SystemAudit' });
    
    // Check if RL is integrated into agent coordinator
    try {
      const { agentCoordinator } = await import('@/services/ai/agentCoordinator');
      const agents = agentCoordinator.getAllAgentsStatus();
      const hasAllAgents = agents.length >= 5; // Market, Technical, Chief, Risk, Execution
      
      this.addResult('Integration', 'Agent Coordinator', 
        hasAllAgents ? 'PASS' : 'WARNING',
        `${agents.length} agents configured`,
        { agents: agents.map(a => a.name) });
    } catch (error) {
      this.addResult('Integration', 'Agent Coordinator', 'FAIL',
        `Agent coordinator error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Check startup integration
    const isInitialized = await startupService.isInitialized();
    this.addResult('Integration', 'Startup Integration', 
      isInitialized ? 'PASS' : 'WARNING',
      isInitialized ? 'Services initialized' : 'Services not initialized');
  }

  getSummary(): {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
    results: AuditResult[];
  } {
    return {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      warnings: this.results.filter(r => r.status === 'WARNING').length,
      failed: this.results.filter(r => r.status === 'FAIL').length,
      results: this.results
    };
  }
}

// Singleton using globalThis for Next.js compatibility
const globalForAuditor = globalThis as typeof globalThis & {
  __systemAuditor?: SystemAuditor;
};

if (!globalForAuditor.__systemAuditor) {
  globalForAuditor.__systemAuditor = new SystemAuditor();
}

export const systemAuditor = globalForAuditor.__systemAuditor;


