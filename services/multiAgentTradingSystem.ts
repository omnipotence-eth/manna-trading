/**
 * Multi-Agent Trading System
 * Coordinates 6 specialized AI agents for sophisticated trading decisions
 */

import { deepseekService } from '@/services/deepseekService';
import { AGENT_PROMPTS, MarketData, SentimentData, OnChainData, AnalystReports, FinalDecision, Portfolio, RiskApprovedTrade } from '@/lib/agentPrompts';
import { DEEPSEEK_OPTIMIZED_PROMPTS } from '@/lib/agentPromptsOptimized';
import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/asterDexService';
import { dataIngestionService } from '@/services/dataIngestionService';

export interface AgentAnalysis {
  agent: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  timestamp: number;
  data: any;
}

export interface MultiAgentDecision {
  symbol: string;
  finalAction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  conviction: 'low' | 'medium' | 'high';
  agentAnalyses: AgentAnalysis[];
  chiefAnalystDecision: FinalDecision;
  riskAssessment?: any;
  executionPlan?: any;
  timestamp: number;
}

export class MultiAgentTradingSystem {
  private isRunning: boolean = false;
  private currentCycle: number = 0;
  private cycleIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    logger.info('Multi-Agent Trading System initialized', {
      context: 'MultiAgentSystem',
      agents: ['Technical', 'Sentiment', 'OnChain', 'Chief', 'Risk', 'Execution']
    });
  }

  /**
   * Start the multi-agent trading system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Multi-Agent system already running', { context: 'MultiAgentSystem' });
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting Multi-Agent Trading System', { context: 'MultiAgentSystem' });

    // Test DeepSeek R1 connection
    const deepseekConnected = await deepseekService.testConnection();
    if (!deepseekConnected) {
      throw new Error('DeepSeek R1 service not available. Please ensure Ollama is running with deepseek-r1 model.');
    }

    // Start trading cycle
    this.runTradingCycle();
  }

  /**
   * Stop the multi-agent trading system
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    // CRITICAL FIX: Clear interval to prevent memory leak
    if (this.cycleIntervalId) {
      clearTimeout(this.cycleIntervalId);
      this.cycleIntervalId = null;
    }
    logger.info('🛑 Multi-Agent Trading System stopped', { context: 'MultiAgentSystem' });
  }

  /**
   * Main trading cycle - runs every 5 minutes
   */
  private async runTradingCycle(): Promise<void> {
    if (!this.isRunning) return;

    this.currentCycle++;
    const cycleStart = Date.now();

    logger.info(`🔄 Starting trading cycle #${this.currentCycle}`, {
      context: 'MultiAgentSystem',
      cycle: this.currentCycle
    });

    try {
      // Step 1: Gather market data
      const marketData = await this.gatherMarketData();
      
      // Step 2: Run analyst agents in parallel
      const analystReports = await this.runAnalystAgents(marketData);
      
      // Step 3: Chief Analyst synthesis
      const chiefDecision = await this.runChiefAnalyst(analystReports);
      
      // Step 4: Risk Management
      const riskAssessment = await this.runRiskManager(chiefDecision);
      
      // Step 5: Execution (if approved)
      if (riskAssessment.approved) {
        await this.runExecutionSpecialist(riskAssessment);
      }

      const cycleDuration = Date.now() - cycleStart;
      logger.info(`✅ Trading cycle #${this.currentCycle} completed`, {
        context: 'MultiAgentSystem',
        cycle: this.currentCycle,
        duration: `${cycleDuration}ms`,
        decision: chiefDecision.action,
        confidence: chiefDecision.confidence,
        approved: riskAssessment.approved
      });

    } catch (error) {
      logger.error(`❌ Trading cycle #${this.currentCycle} failed`, error, {
        context: 'MultiAgentSystem',
        cycle: this.currentCycle
      });
    }

    // Schedule next cycle
    if (this.isRunning) {
      // CRITICAL FIX: Store interval ID and clear previous one if exists
      if (this.cycleIntervalId) {
        clearTimeout(this.cycleIntervalId);
      }
      this.cycleIntervalId = setTimeout(() => this.runTradingCycle(), 5 * 60 * 1000); // 5 minutes
    }
  }

  /**
   * Gather market data from various sources
   */
  private async gatherMarketData(): Promise<{
    market: MarketData;
    sentiment: SentimentData;
    onchain: OnChainData;
  }> {
    logger.debug('📊 Gathering market data', { context: 'MultiAgentSystem' });

    try {
      // Use the data ingestion service to get comprehensive data
      const data = await dataIngestionService.getAllData('BTC/USDT');
      
      logger.debug('📊 Market data gathered', {
        context: 'MultiAgentSystem',
        marketData: {
          symbol: data.market.symbol,
          price: data.market.price,
          rsi: data.market.rsi
        },
        sentimentData: {
          overallSentiment: data.sentiment.sentimentScores.overallSentiment,
          newsCount: data.sentiment.news.length
        },
        onchainData: {
          netWhaleFlow: data.onchain.whaleActivity.netWhaleFlow,
          eventsCount: data.onchain.smartContractEvents.length
        }
      });

      return data;
    } catch (error) {
      logger.error('📊 Failed to gather market data, using fallback', error, {
        context: 'MultiAgentSystem'
      });
      
      // Fallback to mock data if real data fails
      return this.getFallbackData();
    }
  }

  /**
   * Get fallback data when real data sources fail
   */
  private getFallbackData(): {
    market: MarketData;
    sentiment: SentimentData;
    onchain: OnChainData;
  } {
    return {
      market: {
        symbol: 'BTC/USDT',
        price: 50000,
        priceChange24h: 2.5,
        high24h: 52000,
        low24h: 49000,
        rsi: 65,
        ma20: 49500,
        ma50: 48000,
        ma200: 45000,
        volume: 1000000,
        avgVolume: 800000,
        volatility: 15.2,
        change1h: 0.5,
        change4h: 1.2,
        priceVsMA20: 1.01
      },
      sentiment: {
        symbol: 'BTC/USDT',
        news: [
          { source: 'CoinDesk', headline: 'Bitcoin reaches new monthly high', sentiment: 'positive', timestamp: Date.now() },
          { source: 'CryptoNews', headline: 'Institutional adoption continues', sentiment: 'positive', timestamp: Date.now() - 3600000 }
        ],
        socialMetrics: {
          redditMentions: 1250,
          redditChange: 15
        },
        fearGreedIndex: 65,
        trendingRank: 1,
        sentimentScores: {
          newsSentiment: 0.7,
          redditSentiment: 0.6,
          overallSentiment: 0.65
        }
      },
      onchain: {
        symbol: 'BTC/USDT',
        whaleActivity: {
          whaleBuys: 15,
          whaleBuyVolume: 5000000,
          whaleSells: 8,
          whaleSellVolume: 2000000,
          netWhaleFlow: 3000000,
          whaleThreshold: 100000
        },
        liquidity: {
          totalLiquidity: 50000000,
          liquidityChange: 2.1,
          depthAnalysis: 1000000,
          slippageEstimate: 0.1
        },
        exchangeFlows: {
          inflows: 15000000,
          inflowChange: 5.2,
          outflows: 12000000,
          outflowChange: -2.1,
          netFlow: 3000000
        },
        smartContractEvents: [
          { type: 'Large Transfer', description: '1000 BTC moved to cold storage', timestamp: Date.now() },
          { type: 'Exchange Deposit', description: '500 BTC deposited to Binance', timestamp: Date.now() - 1800000 }
        ]
      }
    };
  }

  /**
   * Run the three analyst agents in parallel
   */
  private async runAnalystAgents(data: {
    market: MarketData;
    sentiment: SentimentData;
    onchain: OnChainData;
  }): Promise<AnalystReports> {
    logger.debug('🤖 Running analyst agents', { context: 'MultiAgentSystem' });

    const startTime = Date.now();

    // Run all three agents in parallel
    const [technicalAnalysis, sentimentAnalysis, onchainAnalysis] = await Promise.all([
      this.runTechnicalAnalyst(data.market),
      this.runSentimentAnalyst(data.sentiment),
      this.runOnchainAnalyst(data.onchain)
    ]);

    const duration = Date.now() - startTime;

    const reports: AnalystReports = {
      symbol: data.market.symbol,
      currentPrice: data.market.price,
      technical: technicalAnalysis,
      sentiment: sentimentAnalysis,
      onchain: onchainAnalysis,
      consensus: this.checkConsensus([technicalAnalysis, sentimentAnalysis, onchainAnalysis])
    };

    logger.info('🤖 Analyst agents completed', {
      context: 'MultiAgentSystem',
      duration: `${duration}ms`,
      consensus: reports.consensus,
      actions: {
        technical: technicalAnalysis.action,
        sentiment: sentimentAnalysis.action,
        onchain: onchainAnalysis.action
      }
    });

    return reports;
  }

  /**
   * Run Technical Analyst agent - USING DEEPSEEK R1 OPTIMIZED PROMPTS
   */
  private async runTechnicalAnalyst(data: MarketData): Promise<any> {
    const systemPrompt = DEEPSEEK_OPTIMIZED_PROMPTS.TECHNICAL_ANALYST.systemPrompt;
    const prompt = DEEPSEEK_OPTIMIZED_PROMPTS.TECHNICAL_ANALYST.analysisTemplate(data);
    
    try {
      const result = await deepseekService.chatWithSystem(
        systemPrompt,
        prompt,
        undefined, // Use default DeepSeek R1 32B model
        { 
          format: 'json', 
          temperature: 0.6,
          thinking: true, // Enable Chain-of-Thought reasoning
          max_tokens: 3000
        }
      );

      const analysis = typeof result === 'string' ? JSON.parse(result) : result;

      logger.debug('📊 Technical analysis completed (DeepSeek R1)', {
        context: 'TechnicalAnalyst',
        action: analysis.action,
        confidence: analysis.confidence
      });

      return analysis;
    } catch (error) {
      logger.error('📊 Technical analysis failed', error, { context: 'TechnicalAnalyst' });
      return {
        action: 'HOLD',
        confidence: 0.0,
        reasoning: 'Analysis failed due to technical error',
        indicators: { primary: 'Error', confirming: [], contradicting: [] },
        risks: ['System error']
      };
    }
  }

  /**
   * Run Sentiment Analyst agent - USING DEEPSEEK R1 OPTIMIZED PROMPTS
   */
  private async runSentimentAnalyst(data: SentimentData): Promise<any> {
    // NOTE: Using old prompts for Sentiment Analyst as optimized version focuses on Technical + Chief + Risk
    const prompt = AGENT_PROMPTS.SENTIMENT_ANALYST.analysisTemplate(data);
    
    try {
      const analysis = await deepseekService.chatWithSystem(
        AGENT_PROMPTS.SENTIMENT_ANALYST.systemPrompt,
        prompt,
        undefined, // Use default DeepSeek R1 32B model
        { 
          format: 'json', 
          temperature: 0.7,
          thinking: false, // Sentiment analysis doesn't need heavy reasoning
          max_tokens: 1500
        }
      );

      logger.debug('💬 Sentiment analysis completed', {
        context: 'SentimentAnalyst',
        action: analysis.action,
        confidence: analysis.confidence
      });

      return analysis;
    } catch (error) {
      logger.error('💬 Sentiment analysis failed', error, { context: 'SentimentAnalyst' });
      return {
        action: 'HOLD',
        confidence: 0.0,
        reasoning: 'Analysis failed due to technical error',
        sentimentScore: 0,
        narrative: 'Unable to analyze sentiment',
        warnings: ['System error']
      };
    }
  }

  /**
   * Run On-Chain Analyst agent - USING DEEPSEEK R1
   */
  private async runOnchainAnalyst(data: OnChainData): Promise<any> {
    // NOTE: Using old prompts for OnChain Analyst as optimized version focuses on Technical + Chief + Risk
    const prompt = AGENT_PROMPTS.ONCHAIN_ANALYST.analysisTemplate(data);
    
    try {
      const analysis = await deepseekService.chatWithSystem(
        AGENT_PROMPTS.ONCHAIN_ANALYST.systemPrompt,
        prompt,
        undefined, // Use default DeepSeek R1 32B model
        { 
          format: 'json', 
          temperature: 0.7,
          thinking: false,
          max_tokens: 1500
        }
      );

      logger.debug('⛓️ On-chain analysis completed', {
        context: 'OnchainAnalyst',
        action: analysis.action,
        confidence: analysis.confidence
      });

      return analysis;
    } catch (error) {
      logger.error('⛓️ On-chain analysis failed', error, { context: 'OnchainAnalyst' });
      return {
        action: 'HOLD',
        confidence: 0.0,
        reasoning: 'Analysis failed due to technical error',
        whaleSignal: 'neutral',
        liquidityHealth: 'unknown',
        smartMoneyFlow: 'neutral'
      };
    }
  }

  /**
   * Run Chief Analyst for final decision
   */
  private async runChiefAnalyst(reports: AnalystReports): Promise<FinalDecision> {
    logger.debug('👑 Running Chief Analyst', { context: 'MultiAgentSystem' });

    // Use OPTIMIZED Chief Analyst prompt for DeepSeek R1's advanced reasoning
    const systemPrompt = DEEPSEEK_OPTIMIZED_PROMPTS.CHIEF_ANALYST.systemPrompt;
    const prompt = DEEPSEEK_OPTIMIZED_PROMPTS.CHIEF_ANALYST.debateTemplate(reports);
    
    try {
      const decision = await deepseekService.chatWithSystem(
        systemPrompt,
        prompt,
        undefined, // Using DeepSeek R1 32B for superior reasoning
        { format: 'json', temperature: 0.6, thinking: true, max_tokens: 3500 }
      );

      logger.info('👑 Chief Analyst decision made', {
        context: 'ChiefAnalyst',
        action: decision.action,
        confidence: decision.confidence,
        conviction: decision.conviction,
        consensus: decision.debate?.consensus
      });

      return decision;
    } catch (error) {
      logger.error('👑 Chief Analyst failed', error, { context: 'ChiefAnalyst' });
      return {
        symbol: reports.symbol,
        action: 'HOLD',
        confidence: 0.0,
        reasoning: 'Chief Analyst failed due to technical error',
        conviction: 'low',
        recommendedHolding: 'hours',
        debate: {
          consensus: false,
          dominantSignal: 'technical',
          conflictResolution: 'System error',
          marketRegime: 'volatile',
          keyRisk: 'Technical failure'
        }
      };
    }
  }

  /**
   * Run Risk Manager - USING DEEPSEEK R1 OPTIMIZED PROMPTS
   */
  private async runRiskManager(decision: FinalDecision): Promise<any> {
    logger.debug('🛡️ Running Risk Manager (DeepSeek R1)', { context: 'MultiAgentSystem' });

    // NOTE: This is a simplified version for multiAgentTradingSystem
    // The main agentCoordinator.ts uses the full RISK_MANAGER optimized prompts
    // For consistency, using old prompts here but with DeepSeek R1 enhancements
    
    // Mock portfolio data - in production, get from actual portfolio
    const portfolio: Portfolio = {
      balance: 10000,
      availableMargin: 50000,
      openPositions: [],
      totalExposure: 0,
      currentDrawdown: 0,
      marketVolatility: 15.2
    };

    const prompt = AGENT_PROMPTS.RISK_MANAGER.assessmentTemplate(decision, portfolio);
    
    try {
      const assessment = await deepseekService.chatWithSystem(
        AGENT_PROMPTS.RISK_MANAGER.systemPrompt,
        prompt,
        undefined, // Use default DeepSeek R1 32B model
        { 
          format: 'json', 
          temperature: 0.4, // Conservative for risk decisions
          thinking: true, // Enable Chain-of-Thought reasoning
          max_tokens: 2000
        }
      );

      logger.info('🛡️ Risk assessment completed (DeepSeek R1)', {
        context: 'RiskManager',
        approved: assessment.approved,
        positionSize: assessment.positionSize,
        leverage: assessment.leverage,
        riskPercent: assessment.riskPercent
      });

      return assessment;
    } catch (error) {
      logger.error('🛡️ Risk assessment failed', error, { context: 'RiskManager' });
      return {
        approved: false,
        reasoning: 'Risk assessment failed due to technical error',
        positionSize: 0,
        leverage: 1,
        warnings: ['System error']
      };
    }
  }

  /**
   * Run Execution Specialist
   */
  private async runExecutionSpecialist(riskAssessment: any): Promise<any> {
    logger.debug('⚡ Running Execution Specialist', { context: 'MultiAgentSystem' });

    // Mock trade data - in production, use actual market data
    const trade: RiskApprovedTrade = {
      symbol: 'BTC/USDT',
      action: 'BUY',
      positionSize: riskAssessment.positionSize,
      leverage: riskAssessment.leverage,
      currentPrice: 50000,
      bid: 49995,
      ask: 50005,
      spread: 0.02,
      liquidity: 1000000
    };

    const prompt = AGENT_PROMPTS.EXECUTION_SPECIALIST.executionTemplate(trade);
    
    try {
      const execution = await deepseekService.chatWithSystem(
        AGENT_PROMPTS.EXECUTION_SPECIALIST.systemPrompt,
        prompt,
        undefined, // Use default DeepSeek R1 32B model
        { 
          format: 'json', 
          temperature: 0.3,
          thinking: false, // Execution is operational, less reasoning needed
          max_tokens: 1500
        }
      );

      logger.info('⚡ Execution plan created', {
        context: 'ExecutionSpecialist',
        orderType: execution.orderType,
        readyToExecute: execution.readyToExecute,
        expectedSlippage: execution.expectedSlippage
      });

      // In production, actually execute the trade here
      if (execution.readyToExecute) {
        logger.info('🚀 Trade ready for execution', {
          context: 'ExecutionSpecialist',
          symbol: trade.symbol,
          action: trade.action,
          size: trade.positionSize
        });
      }

      return execution;
    } catch (error) {
      logger.error('⚡ Execution planning failed', error, { context: 'ExecutionSpecialist' });
      return {
        orderType: 'market',
        readyToExecute: false,
        warnings: ['System error']
      };
    }
  }

  /**
   * Check if analysts are in consensus
   */
  private checkConsensus(analyses: any[]): boolean {
    const actions = analyses.map(a => a.action);
    const uniqueActions = new Set(actions);
    return uniqueActions.size === 1;
  }

  /**
   * Get current system status
   */
  getStatus(): {
    isRunning: boolean;
    currentCycle: number;
    qwenConnected: boolean;
  } {
    return {
      isRunning: this.isRunning,
      currentCycle: this.currentCycle,
      qwenConnected: true // In production, check actual connection
    };
  }
}

// Export singleton instance
export const multiAgentSystem = new MultiAgentTradingSystem();
export default multiAgentSystem;
