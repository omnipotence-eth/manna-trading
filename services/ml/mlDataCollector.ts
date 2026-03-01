/**
 * ML Data Collector - Continuous Learning Pipeline
 * 
 * Collects and stores high-quality training data for system improvement:
 * - Market context at trade entry/exit
 * - AI decision quality metrics
 * - Feature engineering for pattern recognition
 * - Outcome tracking for supervised learning
 * 
 * GOAL: Make the system better with every trade
 */

import { logger } from '@/lib/logger';

// Dynamic import to prevent Next.js from analyzing pg during build
async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}

// ============================================================================
// DATA INTERFACES - Complete training data schema
// ============================================================================

export interface TradeContext {
  // Identifiers
  tradeId: string;
  symbol: string;
  timestamp: number;
  
  // Trade parameters
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  positionSize: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  
  // Market microstructure at entry
  market: MarketFeatures;
  
  // AI decision data
  aiDecision: AIDecisionFeatures;
  
  // Outcome (filled after trade closes)
  outcome?: TradeOutcome;
}

export interface MarketFeatures {
  // Price features
  price: number;
  priceChange1m: number;
  priceChange5m: number;
  priceChange15m: number;
  priceChange1h: number;
  priceChange24h: number;
  
  // Volatility features
  atrPercent: number;
  volatilityLevel: string;
  
  // Volume features
  volume24h: number;
  volumeRatio: number;
  buyVolume: number;
  sellVolume: number;
  volumeImbalance: number;
  
  // Order book features
  spread: number;
  spreadPercent: number;
  bidLiquidity: number;
  askLiquidity: number;
  liquidityImbalance: number;
  liquidityScore: number;
  
  // Funding & sentiment
  fundingRate: number;
  fundingSentiment: string;
  
  // Liquidation features
  liquidationPressure: string;
  recentLiquidationValue: number;
  
  // Technical indicators
  rsi: number;
  macdSignal: number;
  priceVsMA20: number;
  priceVsMA50: number;
  priceVsMA200: number;
  
  // Market regime
  regime: string;
  regimeStrength: number;
  
  // Time features (cyclical)
  hourOfDay: number;
  dayOfWeek: number;
  isWeekend: boolean;
}

export interface AIDecisionFeatures {
  // Decision quality
  technicalScore: number;
  chiefConfidence: number;
  riskApproved: boolean;
  riskReason: string;
  
  // Signal agreement
  multiTimeframeAgreement: number; // 0-1 how many timeframes agree
  indicatorAgreement: number; // 0-1 how many indicators agree
  
  // Processing metrics
  analysisTime: number; // ms
  retryCount: number;
  
  // Model used
  modelVersion: string;
}

export interface TradeOutcome {
  // Result
  exitPrice: number;
  exitTimestamp: number;
  pnl: number;
  pnlPercent: number;
  
  // Exit details
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TRAILING_STOP' | 'TIMEOUT' | 'MANUAL' | 'SIGNAL_EXIT';
  holdDuration: number; // ms
  
  // Market at exit
  exitVolatility: number;
  priceMovement: number; // Entry to max favorable
  adverseMovement: number; // Entry to max adverse
  
  // Quality metrics
  entryQuality: number; // 0-1 how close to optimal entry
  exitQuality: number; // 0-1 how close to optimal exit
  maxFavorableExcursion: number; // Best price reached
  maxAdverseExcursion: number; // Worst price reached
}

export interface LearningInsight {
  pattern: string;
  winRate: number;
  avgPnl: number;
  sampleSize: number;
  confidence: number;
  recommendation: string;
}

// ============================================================================
// ML DATA COLLECTOR CLASS
// ============================================================================

class MLDataCollector {
  private pendingTrades: Map<string, TradeContext> = new Map();
  private learningInsights: LearningInsight[] = [];
  private initialized = false;

  constructor() {
    logger.info('ML Data Collector initialized', { context: 'MLDataCollector' });
  }

  /**
   * Initialize database tables for ML data
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const db = await getDb();
      
      // Create ML training data table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ml_training_data (
          id SERIAL PRIMARY KEY,
          trade_id VARCHAR(100) UNIQUE NOT NULL,
          symbol VARCHAR(20) NOT NULL,
          timestamp BIGINT NOT NULL,
          side VARCHAR(10) NOT NULL,
          entry_price DECIMAL(20, 8) NOT NULL,
          position_size DECIMAL(20, 8) NOT NULL,
          leverage INTEGER NOT NULL,
          stop_loss DECIMAL(20, 8),
          take_profit DECIMAL(20, 8),
          confidence DECIMAL(5, 4),
          
          -- Market features (JSON)
          market_features JSONB,
          
          -- AI decision features (JSON)
          ai_features JSONB,
          
          -- Outcome (JSON, filled after trade closes)
          outcome JSONB,
          
          -- Computed labels for supervised learning
          is_winner BOOLEAN,
          pnl_bucket VARCHAR(20), -- 'big_loss', 'small_loss', 'small_win', 'big_win'
          hold_duration_bucket VARCHAR(20), -- 'scalp', 'short', 'medium', 'long'
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create pattern recognition table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ml_patterns (
          id SERIAL PRIMARY KEY,
          pattern_name VARCHAR(100) NOT NULL,
          pattern_features JSONB NOT NULL,
          win_rate DECIMAL(5, 4),
          avg_pnl DECIMAL(10, 4),
          sample_size INTEGER,
          last_seen BIGINT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create learning insights table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ml_insights (
          id SERIAL PRIMARY KEY,
          insight_type VARCHAR(50) NOT NULL,
          insight_data JSONB NOT NULL,
          confidence DECIMAL(5, 4),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create indexes for efficient querying
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_ml_training_symbol ON ml_training_data(symbol);
        CREATE INDEX IF NOT EXISTS idx_ml_training_timestamp ON ml_training_data(timestamp);
        CREATE INDEX IF NOT EXISTS idx_ml_training_is_winner ON ml_training_data(is_winner);
      `);
      
      this.initialized = true;
      logger.info('ML tables initialized', { context: 'MLDataCollector' });
      
    } catch (error) {
      logger.error('Failed to initialize ML tables', error, { context: 'MLDataCollector' });
    }
  }

  /**
   * Record trade entry with full market context
   */
  async recordTradeEntry(
    tradeId: string,
    symbol: string,
    side: 'LONG' | 'SHORT',
    entryPrice: number,
    positionSize: number,
    leverage: number,
    stopLoss: number,
    takeProfit: number,
    confidence: number,
    marketData: Partial<MarketFeatures>,
    aiData: Partial<AIDecisionFeatures>
  ): Promise<void> {
    await this.initialize();
    
    const now = Date.now();
    const date = new Date(now);
    
    const context: TradeContext = {
      tradeId,
      symbol,
      timestamp: now,
      side,
      entryPrice,
      positionSize,
      leverage,
      stopLoss,
      takeProfit,
      confidence,
      market: {
        price: entryPrice,
        priceChange1m: marketData.priceChange1m || 0,
        priceChange5m: marketData.priceChange5m || 0,
        priceChange15m: marketData.priceChange15m || 0,
        priceChange1h: marketData.priceChange1h || 0,
        priceChange24h: marketData.priceChange24h || 0,
        atrPercent: marketData.atrPercent || 0,
        volatilityLevel: marketData.volatilityLevel || 'MEDIUM',
        volume24h: marketData.volume24h || 0,
        volumeRatio: marketData.volumeRatio || 1,
        buyVolume: marketData.buyVolume || 0,
        sellVolume: marketData.sellVolume || 0,
        volumeImbalance: marketData.volumeImbalance || 0,
        spread: marketData.spread || 0,
        spreadPercent: marketData.spreadPercent || 0,
        bidLiquidity: marketData.bidLiquidity || 0,
        askLiquidity: marketData.askLiquidity || 0,
        liquidityImbalance: marketData.liquidityImbalance || 0,
        liquidityScore: marketData.liquidityScore || 0,
        fundingRate: marketData.fundingRate || 0,
        fundingSentiment: marketData.fundingSentiment || 'NEUTRAL',
        liquidationPressure: marketData.liquidationPressure || 'NEUTRAL',
        recentLiquidationValue: marketData.recentLiquidationValue || 0,
        rsi: marketData.rsi || 50,
        macdSignal: marketData.macdSignal || 0,
        priceVsMA20: marketData.priceVsMA20 || 0,
        priceVsMA50: marketData.priceVsMA50 || 0,
        priceVsMA200: marketData.priceVsMA200 || 0,
        regime: marketData.regime || 'unknown',
        regimeStrength: marketData.regimeStrength || 0.5,
        hourOfDay: date.getUTCHours(),
        dayOfWeek: date.getUTCDay(),
        isWeekend: date.getUTCDay() === 0 || date.getUTCDay() === 6
      },
      aiDecision: {
        technicalScore: aiData.technicalScore || 0,
        chiefConfidence: aiData.chiefConfidence || confidence,
        riskApproved: aiData.riskApproved || true,
        riskReason: aiData.riskReason || '',
        multiTimeframeAgreement: aiData.multiTimeframeAgreement || 0,
        indicatorAgreement: aiData.indicatorAgreement || 0,
        analysisTime: aiData.analysisTime || 0,
        retryCount: aiData.retryCount || 0,
        modelVersion: aiData.modelVersion || '7.1.0'
      }
    };
    
    // Store in pending trades
    this.pendingTrades.set(tradeId, context);
    
    // Save to database
    try {
      const db = await getDb();
      await db.execute(`
        INSERT INTO ml_training_data (
          trade_id, symbol, timestamp, side, entry_price, position_size,
          leverage, stop_loss, take_profit, confidence,
          market_features, ai_features
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (trade_id) DO UPDATE SET
          market_features = $11,
          ai_features = $12,
          updated_at = CURRENT_TIMESTAMP
      `, [
        tradeId, symbol, now, side, entryPrice, positionSize,
        leverage, stopLoss, takeProfit, confidence,
        JSON.stringify(context.market),
        JSON.stringify(context.aiDecision)
      ]);
      
      logger.debug('Trade entry recorded for ML', {
        context: 'MLDataCollector',
        data: { tradeId, symbol, side }
      });
      
    } catch (error) {
      logger.error('Failed to record trade entry', error, { context: 'MLDataCollector' });
    }
  }

  /**
   * Record trade exit with outcome
   */
  async recordTradeExit(
    tradeId: string,
    exitPrice: number,
    pnl: number,
    pnlPercent: number,
    exitReason: TradeOutcome['exitReason'],
    maxFavorable: number,
    maxAdverse: number
  ): Promise<void> {
    const context = this.pendingTrades.get(tradeId);
    if (!context) {
      logger.warn('Trade context not found for exit', { context: 'MLDataCollector', tradeId });
      return;
    }
    
    const now = Date.now();
    const holdDuration = now - context.timestamp;
    
    // Calculate quality metrics
    const expectedMove = context.side === 'LONG' 
      ? context.takeProfit - context.entryPrice
      : context.entryPrice - context.takeProfit;
    
    const actualMove = context.side === 'LONG'
      ? exitPrice - context.entryPrice
      : context.entryPrice - exitPrice;
    
    const entryQuality = maxFavorable > 0 
      ? Math.min(1, actualMove / maxFavorable)
      : 0;
    
    const exitQuality = pnl > 0 
      ? Math.min(1, actualMove / expectedMove)
      : 0;
    
    const outcome: TradeOutcome = {
      exitPrice,
      exitTimestamp: now,
      pnl,
      pnlPercent,
      exitReason,
      holdDuration,
      exitVolatility: 0, // Would need current market data
      priceMovement: maxFavorable,
      adverseMovement: maxAdverse,
      entryQuality,
      exitQuality,
      maxFavorableExcursion: maxFavorable,
      maxAdverseExcursion: maxAdverse
    };
    
    context.outcome = outcome;
    
    // Determine labels for supervised learning
    const isWinner = pnl > 0;
    
    let pnlBucket: string;
    if (pnlPercent < -5) pnlBucket = 'big_loss';
    else if (pnlPercent < 0) pnlBucket = 'small_loss';
    else if (pnlPercent < 5) pnlBucket = 'small_win';
    else pnlBucket = 'big_win';
    
    let durationBucket: string;
    if (holdDuration < 5 * 60 * 1000) durationBucket = 'scalp'; // <5 min
    else if (holdDuration < 30 * 60 * 1000) durationBucket = 'short'; // <30 min
    else if (holdDuration < 4 * 60 * 60 * 1000) durationBucket = 'medium'; // <4 hours
    else durationBucket = 'long';
    
    // Update database
    try {
      const db = await getDb();
      await db.execute(`
        UPDATE ml_training_data SET
          outcome = $1,
          is_winner = $2,
          pnl_bucket = $3,
          hold_duration_bucket = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE trade_id = $5
      `, [
        JSON.stringify(outcome),
        isWinner,
        pnlBucket,
        durationBucket,
        tradeId
      ]);
      
      // Remove from pending
      this.pendingTrades.delete(tradeId);
      
      logger.info('Trade exit recorded for ML', {
        context: 'MLDataCollector',
        data: { 
          tradeId, 
          pnl: pnl.toFixed(2),
          pnlBucket,
          entryQuality: (entryQuality * 100).toFixed(1) + '%',
          exitQuality: (exitQuality * 100).toFixed(1) + '%'
        }
      });
      
      // Trigger pattern analysis
      await this.analyzePatterns(context);
      
    } catch (error) {
      logger.error('Failed to record trade exit', error, { context: 'MLDataCollector' });
    }
  }

  /**
   * Analyze patterns from completed trade
   */
  private async analyzePatterns(context: TradeContext): Promise<void> {
    if (!context.outcome) return;
    
    try {
      // Identify patterns based on features
      const patterns: string[] = [];
      
      // Volume pattern
      if (context.market.volumeRatio > 2) {
        patterns.push('high_volume_entry');
      } else if (context.market.volumeRatio < 0.5) {
        patterns.push('low_volume_entry');
      }
      
      // Volatility pattern
      patterns.push(`volatility_${context.market.volatilityLevel.toLowerCase()}`);
      
      // Momentum pattern
      const momentum = context.market.priceChange1h;
      if (momentum > 3) patterns.push('strong_bullish_momentum');
      else if (momentum < -3) patterns.push('strong_bearish_momentum');
      
      // Funding rate pattern
      if (context.market.fundingRate > 0.001) patterns.push('high_positive_funding');
      else if (context.market.fundingRate < -0.001) patterns.push('high_negative_funding');
      
      // Regime pattern
      patterns.push(`regime_${context.market.regime}`);
      
      // Time pattern
      if (context.market.isWeekend) patterns.push('weekend_trade');
      patterns.push(`hour_${context.market.hourOfDay}`);
      
      // Update pattern statistics
      for (const pattern of patterns) {
        await this.updatePatternStats(pattern, context.outcome.pnlPercent, context.outcome.pnl > 0);
      }
      
    } catch (error) {
      logger.error('Pattern analysis failed', error, { context: 'MLDataCollector' });
    }
  }

  /**
   * Update pattern statistics
   */
  private async updatePatternStats(patternName: string, pnlPercent: number, isWinner: boolean): Promise<void> {
    try {
      const db = await getDb();
      
      // Try to update existing pattern
      const result = await db.execute(`
        UPDATE ml_patterns SET
          sample_size = sample_size + 1,
          win_rate = (win_rate * sample_size + $1::int) / (sample_size + 1),
          avg_pnl = (avg_pnl * sample_size + $2) / (sample_size + 1),
          last_seen = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE pattern_name = $4
        RETURNING id
      `, [
        isWinner ? 1 : 0,
        pnlPercent,
        Date.now(),
        patternName
      ]);
      
      // If pattern doesn't exist, create it
      if (!result.rows || result.rows.length === 0) {
        await db.execute(`
          INSERT INTO ml_patterns (
            pattern_name, pattern_features, win_rate, avg_pnl, sample_size, last_seen
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          patternName,
          JSON.stringify({ name: patternName }),
          isWinner ? 1 : 0,
          pnlPercent,
          1,
          Date.now()
        ]);
      }
      
    } catch (error) {
      logger.error('Failed to update pattern stats', error, { context: 'MLDataCollector' });
    }
  }

  /**
   * Get learning insights from collected data
   */
  async getLearningInsights(): Promise<LearningInsight[]> {
    try {
      const db = await getDb();
      
      const result = await db.execute(`
        SELECT 
          pattern_name,
          win_rate,
          avg_pnl,
          sample_size
        FROM ml_patterns
        WHERE sample_size >= 5 AND is_active = true
        ORDER BY win_rate * avg_pnl DESC
        LIMIT 20
      `);
      
      if (!result.rows) return [];
      
      return result.rows.map((row: any) => {
        const winRate = parseFloat(row.win_rate);
        const avgPnl = parseFloat(row.avg_pnl);
        const sampleSize = parseInt(row.sample_size);
        
        // Calculate confidence based on sample size
        const confidence = Math.min(1, sampleSize / 30);
        
        // Generate recommendation
        let recommendation: string;
        if (winRate > 0.6 && avgPnl > 1) {
          recommendation = `FAVORABLE - Trade aggressively when ${row.pattern_name} is detected`;
        } else if (winRate < 0.4 || avgPnl < -1) {
          recommendation = `AVOID - Do not trade when ${row.pattern_name} is detected`;
        } else {
          recommendation = `NEUTRAL - Use standard parameters for ${row.pattern_name}`;
        }
        
        return {
          pattern: row.pattern_name,
          winRate,
          avgPnl,
          sampleSize,
          confidence,
          recommendation
        };
      });
      
    } catch (error) {
      logger.error('Failed to get learning insights', error, { context: 'MLDataCollector' });
      return [];
    }
  }

  /**
   * Get feature importance analysis
   */
  async getFeatureImportance(): Promise<{ feature: string; importance: number; correlation: number }[]> {
    try {
      const db = await getDb();
      
      // Get winning and losing trades
      const result = await db.execute(`
        SELECT 
          market_features,
          is_winner,
          outcome
        FROM ml_training_data
        WHERE outcome IS NOT NULL
        LIMIT 1000
      `);
      
      if (!result.rows || result.rows.length < 20) {
        return [];
      }
      
      // Simple feature correlation analysis
      const features = [
        'volumeRatio', 'atrPercent', 'liquidityImbalance',
        'fundingRate', 'rsi', 'priceChange1h'
      ];
      
      const importance: { feature: string; importance: number; correlation: number }[] = [];
      
      for (const feature of features) {
        const values = result.rows.map((row: any) => {
          const market = typeof row.market_features === 'string' 
            ? JSON.parse(row.market_features) 
            : row.market_features;
          return {
            value: market[feature] || 0,
            isWinner: row.is_winner
          };
        });
        
        // Calculate correlation with win/loss
        const winValues = values.filter((v: { value: number; isWinner: boolean }) => v.isWinner).map((v: { value: number; isWinner: boolean }) => v.value);
        const loseValues = values.filter((v: { value: number; isWinner: boolean }) => !v.isWinner).map((v: { value: number; isWinner: boolean }) => v.value);
        
        const winAvg = winValues.length > 0 
          ? winValues.reduce((a: number, b: number) => a + b, 0) / winValues.length 
          : 0;
        const loseAvg = loseValues.length > 0 
          ? loseValues.reduce((a: number, b: number) => a + b, 0) / loseValues.length 
          : 0;
        
        const diff = Math.abs(winAvg - loseAvg);
        const allAvg = values.length > 0 
          ? values.reduce((a: number, b: { value: number; isWinner: boolean }) => a + b.value, 0) / values.length 
          : 1;
        
        const correlation = allAvg > 0 ? diff / allAvg : 0;
        
        importance.push({
          feature,
          importance: Math.min(1, correlation * 2),
          correlation: winAvg > loseAvg ? correlation : -correlation
        });
      }
      
      return importance.sort((a, b) => b.importance - a.importance);
      
    } catch (error) {
      logger.error('Failed to get feature importance', error, { context: 'MLDataCollector' });
      return [];
    }
  }

  /**
   * Generate trading recommendations based on learned patterns
   */
  async getRecommendations(currentMarket: Partial<MarketFeatures>): Promise<{
    shouldTrade: boolean;
    confidence: number;
    reasons: string[];
    adjustments: { parameter: string; suggestion: string }[];
  }> {
    const insights = await this.getLearningInsights();
    const reasons: string[] = [];
    const adjustments: { parameter: string; suggestion: string }[] = [];
    let score = 0;
    let totalWeight = 0;
    
    for (const insight of insights) {
      // Check if current market matches pattern
      let matches = false;
      
      if (insight.pattern === 'high_volume_entry' && (currentMarket.volumeRatio || 1) > 2) {
        matches = true;
      } else if (insight.pattern === `volatility_${(currentMarket.volatilityLevel || 'MEDIUM').toLowerCase()}`) {
        matches = true;
      } else if (insight.pattern === 'high_positive_funding' && (currentMarket.fundingRate || 0) > 0.001) {
        matches = true;
      }
      
      if (matches) {
        const weight = insight.sampleSize / 30; // Weight by sample size
        totalWeight += weight;
        score += insight.winRate * insight.avgPnl * weight;
        
        if (insight.winRate > 0.6) {
          reasons.push(`${insight.pattern}: ${(insight.winRate * 100).toFixed(0)}% win rate`);
        } else if (insight.winRate < 0.4) {
          reasons.push(`WARNING: ${insight.pattern}: only ${(insight.winRate * 100).toFixed(0)}% win rate`);
          adjustments.push({
            parameter: 'positionSize',
            suggestion: 'Reduce position size by 50%'
          });
        }
      }
    }
    
    const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;
    const shouldTrade = normalizedScore > 0 && reasons.filter(r => !r.includes('WARNING')).length > 0;
    
    return {
      shouldTrade,
      confidence: Math.min(1, Math.abs(normalizedScore) / 2),
      reasons,
      adjustments
    };
  }
}

// Export singleton
const globalForMLCollector = globalThis as typeof globalThis & {
  __mlDataCollector?: MLDataCollector;
};

if (!globalForMLCollector.__mlDataCollector) {
  globalForMLCollector.__mlDataCollector = new MLDataCollector();
}

export const mlDataCollector = globalForMLCollector.__mlDataCollector;
export default mlDataCollector;

