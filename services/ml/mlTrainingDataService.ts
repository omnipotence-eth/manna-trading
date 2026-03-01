/**
 * ML Training Data Service - Comprehensive Data Collection for Model Fine-Tuning
 * 
 * This service captures EVERYTHING needed to train a profitable trading model:
 * 1. Market features at decision time
 * 2. AI reasoning and confidence
 * 3. Trade execution details
 * 4. Outcome with detailed metrics
 * 5. Context for supervised learning
 * 
 * DATA PRINCIPLES:
 * - Capture ALL features, filter later during training
 * - Record BOTH trades and rejections (negative examples are valuable)
 * - Store reasoning chains for future prompt optimization
 * - Track feature importance over time
 */

import { logger } from '@/lib/logger';

// Dynamic import to prevent Next.js from analyzing pg during build
async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}

// ============================================================================
// COMPREHENSIVE TRAINING DATA SCHEMA
// ============================================================================

export interface MLTrainingRecord {
  // Identifiers
  recordId: string;
  timestamp: number;
  symbol: string;
  
  // Decision
  decision: 'TRADE' | 'REJECT';
  side?: 'LONG' | 'SHORT';
  
  // ============ MARKET FEATURES (Input X) ============
  marketFeatures: {
    // Price action
    price: number;
    priceChange1m: number;
    priceChange5m: number;
    priceChange15m: number;
    priceChange1h: number;
    priceChange4h: number;
    priceChange24h: number;
    
    // Volatility
    atr14: number;
    atrPercent: number;
    volatilityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    bbWidth: number; // Bollinger Band width
    
    // Volume
    volume24h: number;
    volumeRatio: number; // vs 20-day average
    buyVolume: number;
    sellVolume: number;
    volumeImbalance: number; // (buy - sell) / total
    volumeSpike: boolean;
    
    // Order book
    spread: number;
    spreadPercent: number;
    bidDepth: number;
    askDepth: number;
    depthImbalance: number;
    liquidityScore: number;
    
    // Funding & sentiment
    fundingRate: number;
    openInterest: number;
    oiChange24h: number;
    longShortRatio: number;
    
    // Technical indicators
    rsi14: number;
    rsi7: number;
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    ema9: number;
    ema21: number;
    sma50: number;
    sma200: number;
    priceVsEma9: number;
    priceVsEma21: number;
    priceVsSma50: number;
    priceVsSma200: number;
    
    // Support/Resistance
    nearestSupport: number;
    nearestResistance: number;
    distanceToSupport: number;
    distanceToResistance: number;
    
    // Market regime
    regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'CHOPPY';
    adx: number;
    trendStrength: number;
    
    // Time features (for pattern recognition)
    hourOfDay: number;
    dayOfWeek: number;
    isWeekend: boolean;
    isAsiaSession: boolean;
    isEuropeSession: boolean;
    isUSSession: boolean;
  };
  
  // ============ AI DECISION FEATURES ============
  aiFeatures: {
    // Technical analysis
    technicalAction: string;
    technicalConfidence: number;
    technicalReasoning: string;
    
    // Chief decision
    chiefAction: string;
    chiefConfidence: number;
    chiefReasoning: string;
    
    // Risk assessment
    riskApproved: boolean;
    riskReason: string;
    
    // Quality scores
    qualityScore: number;
    expectedValue: number;
    riskReward: number;
    winProbability: number;
    
    // Agreement metrics
    timeframeAgreement: number;
    indicatorAgreement: number;
    
    // Processing
    totalAnalysisTimeMs: number;
    retryCount: number;
    modelVersion: string;
  };
  
  // ============ TRADE PARAMETERS (if executed) ============
  tradeParams?: {
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
    positionSize: number;
    leverage: number;
    riskPercent: number;
    expectedRR: number;
  };
  
  // ============ OUTCOME (filled after trade closes) ============
  outcome?: {
    exitPrice: number;
    exitTimestamp: number;
    holdDurationMs: number;
    
    pnl: number;
    pnlPercent: number;
    
    exitReason: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'TRAILING_STOP' | 'TIMEOUT' | 'MANUAL' | 'SIGNAL_EXIT';
    
    // Excursion analysis
    maxFavorableExcursion: number;
    maxAdverseExcursion: number;
    mfe_mae_ratio: number;
    
    // Quality metrics
    entryEfficiency: number; // How close to optimal entry (0-1)
    exitEfficiency: number; // How much of MFE was captured (0-1)
    
    // Market at exit
    exitVolatility: number;
    exitRegime: string;
  };
  
  // ============ LABELS FOR SUPERVISED LEARNING ============
  labels: {
    // Binary classification
    isWinner: boolean;
    
    // Multi-class outcome
    outcomeClass: 'BIG_WIN' | 'SMALL_WIN' | 'BREAKEVEN' | 'SMALL_LOSS' | 'BIG_LOSS' | 'PENDING' | 'REJECTED';
    
    // Regression targets
    actualPnlPercent?: number;
    holdDurationMinutes?: number;
    
    // Quality assessment
    wasGoodDecision: boolean; // Based on outcome vs expectation
    shouldHaveTraded: boolean; // Based on what actually happened
    
    // Learning notes
    learningNotes: string;
  };
  
  // ============ METADATA ============
  metadata: {
    systemVersion: string;
    configSnapshot: Record<string, unknown>;
    accountBalance: number;
    portfolioRisk: number;
    concurrentPositions: number;
  };
}

// ============================================================================
// ML TRAINING DATA SERVICE
// ============================================================================

class MLTrainingDataService {
  private initialized = false;
  private pendingRecords: Map<string, MLTrainingRecord> = new Map();
  
  constructor() {
    logger.info('🧠 ML Training Data Service initialized', { context: 'MLTraining' });
  }
  
  /**
   * Initialize database tables
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const db = await getDb();
      
      // Create comprehensive ML training table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ml_training_v2 (
          id SERIAL PRIMARY KEY,
          record_id VARCHAR(100) UNIQUE NOT NULL,
          timestamp BIGINT NOT NULL,
          symbol VARCHAR(20) NOT NULL,
          decision VARCHAR(10) NOT NULL,
          side VARCHAR(10),
          
          -- Features (JSONB for flexibility)
          market_features JSONB NOT NULL,
          ai_features JSONB NOT NULL,
          trade_params JSONB,
          outcome JSONB,
          labels JSONB NOT NULL,
          metadata JSONB NOT NULL,
          
          -- Indexed fields for fast querying
          is_winner BOOLEAN,
          pnl_percent DECIMAL(10, 4),
          outcome_class VARCHAR(20),
          quality_score DECIMAL(5, 2),
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create indexes for efficient ML queries
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_ml_v2_timestamp ON ml_training_v2(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_ml_v2_symbol ON ml_training_v2(symbol);
        CREATE INDEX IF NOT EXISTS idx_ml_v2_decision ON ml_training_v2(decision);
        CREATE INDEX IF NOT EXISTS idx_ml_v2_outcome ON ml_training_v2(outcome_class);
        CREATE INDEX IF NOT EXISTS idx_ml_v2_winner ON ml_training_v2(is_winner);
        CREATE INDEX IF NOT EXISTS idx_ml_v2_quality ON ml_training_v2(quality_score);
      `);
      
      // Create feature importance tracking table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ml_feature_importance (
          id SERIAL PRIMARY KEY,
          feature_name VARCHAR(100) NOT NULL,
          importance_score DECIMAL(5, 4) NOT NULL,
          correlation_with_win DECIMAL(5, 4),
          sample_size INTEGER,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(feature_name)
        )
      `);
      
      this.initialized = true;
      logger.info('[OK] ML Training tables initialized', { context: 'MLTraining' });
      
    } catch (error) {
      logger.error('Failed to initialize ML Training tables', error, { context: 'MLTraining' });
    }
  }
  
  /**
   * Record a trading decision (both trades and rejections)
   */
  async recordDecision(record: MLTrainingRecord): Promise<void> {
    await this.initialize();
    
    try {
      const db = await getDb();
      
      // Store in pending if it's a trade (will be updated with outcome)
      if (record.decision === 'TRADE') {
        this.pendingRecords.set(record.recordId, record);
      }
      
      // Insert into database
      await db.execute(`
        INSERT INTO ml_training_v2 (
          record_id, timestamp, symbol, decision, side,
          market_features, ai_features, trade_params, labels, metadata,
          quality_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (record_id) DO UPDATE SET
          market_features = $6,
          ai_features = $7,
          trade_params = $8,
          labels = $9,
          metadata = $10,
          quality_score = $11,
          updated_at = CURRENT_TIMESTAMP
      `, [
        record.recordId,
        record.timestamp,
        record.symbol,
        record.decision,
        record.side || null,
        JSON.stringify(record.marketFeatures),
        JSON.stringify(record.aiFeatures),
        record.tradeParams ? JSON.stringify(record.tradeParams) : null,
        JSON.stringify(record.labels),
        JSON.stringify(record.metadata),
        record.aiFeatures.qualityScore
      ]);
      
      logger.debug(`[RECORD] Recorded ${record.decision} decision for ${record.symbol}`, {
        context: 'MLTraining',
        data: {
          recordId: record.recordId,
          decision: record.decision,
          qualityScore: record.aiFeatures.qualityScore
        }
      });
      
    } catch (error) {
      logger.error('Failed to record ML decision', error, { context: 'MLTraining' });
    }
  }
  
  /**
   * Update record with trade outcome
   */
  async recordOutcome(
    recordId: string,
    outcome: MLTrainingRecord['outcome'],
    labels: Partial<MLTrainingRecord['labels']>
  ): Promise<void> {
    try {
      const db = await getDb();
      
      // Determine outcome class
      const pnlPercent = outcome?.pnlPercent || 0;
      let outcomeClass: MLTrainingRecord['labels']['outcomeClass'];
      if (pnlPercent >= 3) outcomeClass = 'BIG_WIN';
      else if (pnlPercent > 0) outcomeClass = 'SMALL_WIN';
      else if (pnlPercent > -0.5) outcomeClass = 'BREAKEVEN';
      else if (pnlPercent > -3) outcomeClass = 'SMALL_LOSS';
      else outcomeClass = 'BIG_LOSS';
      
      const isWinner = pnlPercent > 0;
      
      // Update record
      await db.execute(`
        UPDATE ml_training_v2 SET
          outcome = $1,
          labels = labels || $2,
          is_winner = $3,
          pnl_percent = $4,
          outcome_class = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE record_id = $6
      `, [
        JSON.stringify(outcome),
        JSON.stringify({ ...labels, isWinner, outcomeClass, actualPnlPercent: pnlPercent }),
        isWinner,
        pnlPercent,
        outcomeClass,
        recordId
      ]);
      
      // Remove from pending
      this.pendingRecords.delete(recordId);
      
      // Update feature importance
      await this.updateFeatureImportance(recordId, isWinner);
      
      logger.info(`[OUTCOME] Recorded outcome for ${recordId}: ${outcomeClass}`, {
        context: 'MLTraining',
        data: { pnlPercent: pnlPercent.toFixed(2) + '%', outcomeClass }
      });
      
    } catch (error) {
      logger.error('Failed to record outcome', error, { context: 'MLTraining' });
    }
  }
  
  /**
   * Update feature importance based on trade outcome
   */
  private async updateFeatureImportance(recordId: string, isWinner: boolean): Promise<void> {
    try {
      const db = await getDb();
      
      // Get the record
      const result = await db.execute(
        'SELECT market_features FROM ml_training_v2 WHERE record_id = $1',
        [recordId]
      );
      
      if (!result.rows?.[0]) return;
      
      const features = typeof result.rows[0].market_features === 'string'
        ? JSON.parse(result.rows[0].market_features)
        : result.rows[0].market_features;
      
      // Update importance for key features
      const keyFeatures = [
        'volumeRatio', 'atrPercent', 'rsi14', 'fundingRate',
        'spreadPercent', 'liquidityScore', 'adx', 'trendStrength'
      ];
      
      for (const feature of keyFeatures) {
        if (features[feature] !== undefined) {
          await db.execute(`
            INSERT INTO ml_feature_importance (feature_name, importance_score, correlation_with_win, sample_size)
            VALUES ($1, 0.5, $2, 1)
            ON CONFLICT (feature_name) DO UPDATE SET
              correlation_with_win = (
                ml_feature_importance.correlation_with_win * ml_feature_importance.sample_size + $2
              ) / (ml_feature_importance.sample_size + 1),
              sample_size = ml_feature_importance.sample_size + 1,
              last_updated = CURRENT_TIMESTAMP
          `, [feature, isWinner ? 1 : 0]);
        }
      }
      
    } catch (error) {
      logger.error('Failed to update feature importance', error, { context: 'MLTraining' });
    }
  }
  
  /**
   * Get training data for export (e.g., for fine-tuning)
   */
  async getTrainingData(options: {
    limit?: number;
    onlyCompleted?: boolean;
    minQualityScore?: number;
    outcomeClass?: string;
  } = {}): Promise<MLTrainingRecord[]> {
    try {
      const db = await getDb();
      
      let query = 'SELECT * FROM ml_training_v2 WHERE 1=1';
      const params: unknown[] = [];
      let paramIndex = 1;
      
      if (options.onlyCompleted) {
        query += ' AND outcome IS NOT NULL';
      }
      
      if (options.minQualityScore) {
        query += ` AND quality_score >= $${paramIndex++}`;
        params.push(options.minQualityScore);
      }
      
      if (options.outcomeClass) {
        query += ` AND outcome_class = $${paramIndex++}`;
        params.push(options.outcomeClass);
      }
      
      query += ' ORDER BY timestamp DESC';
      
      if (options.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(options.limit);
      }
      
      const result = await db.execute(query, params);
      
      if (!result.rows) return [];
      
      return result.rows.map((row: Record<string, unknown>) => ({
        recordId: row.record_id as string,
        timestamp: Number(row.timestamp),
        symbol: row.symbol as string,
        decision: row.decision as 'TRADE' | 'REJECT',
        side: row.side as 'LONG' | 'SHORT' | undefined,
        marketFeatures: typeof row.market_features === 'string' 
          ? JSON.parse(row.market_features) 
          : row.market_features,
        aiFeatures: typeof row.ai_features === 'string'
          ? JSON.parse(row.ai_features)
          : row.ai_features,
        tradeParams: row.trade_params 
          ? (typeof row.trade_params === 'string' ? JSON.parse(row.trade_params) : row.trade_params)
          : undefined,
        outcome: row.outcome
          ? (typeof row.outcome === 'string' ? JSON.parse(row.outcome) : row.outcome)
          : undefined,
        labels: typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      }));
      
    } catch (error) {
      logger.error('Failed to get training data', error, { context: 'MLTraining' });
      return [];
    }
  }
  
  /**
   * Get feature importance rankings
   */
  async getFeatureImportance(): Promise<{ feature: string; importance: number; correlation: number; samples: number }[]> {
    try {
      const db = await getDb();
      
      const result = await db.execute(`
        SELECT feature_name, importance_score, correlation_with_win, sample_size
        FROM ml_feature_importance
        WHERE sample_size >= 10
        ORDER BY ABS(correlation_with_win - 0.5) DESC
        LIMIT 20
      `);
      
      if (!result.rows) return [];
      
      return result.rows.map((row: Record<string, unknown>) => ({
        feature: row.feature_name as string,
        importance: Number(row.importance_score),
        correlation: Number(row.correlation_with_win),
        samples: Number(row.sample_size)
      }));
      
    } catch (error) {
      logger.error('Failed to get feature importance', error, { context: 'MLTraining' });
      return [];
    }
  }
  
  /**
   * Get statistics for ML dashboard
   */
  async getStats(): Promise<{
    totalRecords: number;
    trades: number;
    rejections: number;
    winRate: number;
    avgPnl: number;
    bestPatterns: { pattern: string; winRate: number; count: number }[];
  }> {
    try {
      const db = await getDb();
      
      // Get basic stats
      const statsResult = await db.execute(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE decision = 'TRADE') as trades,
          COUNT(*) FILTER (WHERE decision = 'REJECT') as rejections,
          AVG(CASE WHEN is_winner THEN 1.0 ELSE 0.0 END) as win_rate,
          AVG(pnl_percent) as avg_pnl
        FROM ml_training_v2
      `);
      
      const stats = statsResult.rows?.[0] || {};
      
      return {
        totalRecords: Number(stats.total) || 0,
        trades: Number(stats.trades) || 0,
        rejections: Number(stats.rejections) || 0,
        winRate: Number(stats.win_rate) || 0,
        avgPnl: Number(stats.avg_pnl) || 0,
        bestPatterns: [] // Would need pattern detection logic
      };
      
    } catch (error) {
      logger.error('Failed to get ML stats', error, { context: 'MLTraining' });
      return {
        totalRecords: 0,
        trades: 0,
        rejections: 0,
        winRate: 0,
        avgPnl: 0,
        bestPatterns: []
      };
    }
  }
  
  /**
   * Export data in format suitable for fine-tuning
   */
  async exportForFineTuning(format: 'jsonl' | 'csv' = 'jsonl'): Promise<string> {
    const data = await this.getTrainingData({ onlyCompleted: true, limit: 10000 });
    
    if (format === 'jsonl') {
      // JSONL format for LLM fine-tuning
      return data.map(record => {
        const prompt = `Analyze this trading opportunity for ${record.symbol}:
Market: Price ${record.marketFeatures.price}, RSI ${record.marketFeatures.rsi14}, Volume ratio ${record.marketFeatures.volumeRatio}
Regime: ${record.marketFeatures.regime}, Volatility: ${record.marketFeatures.volatilityLevel}`;

        const completion = `Decision: ${record.decision}
${record.side ? `Side: ${record.side}` : ''}
Confidence: ${(record.aiFeatures.chiefConfidence * 100).toFixed(0)}%
Quality Score: ${record.aiFeatures.qualityScore}
${record.outcome ? `Outcome: ${record.labels.outcomeClass} (${record.outcome.pnlPercent?.toFixed(2)}%)` : ''}
Reasoning: ${record.aiFeatures.chiefReasoning}`;

        return JSON.stringify({ prompt, completion });
      }).join('\n');
    } else {
      // CSV format for traditional ML
      const headers = [
        'symbol', 'decision', 'side', 'price', 'rsi14', 'volumeRatio',
        'regime', 'qualityScore', 'confidence', 'isWinner', 'pnlPercent'
      ];
      
      const rows = data.map(record => [
        record.symbol,
        record.decision,
        record.side || '',
        record.marketFeatures.price,
        record.marketFeatures.rsi14,
        record.marketFeatures.volumeRatio,
        record.marketFeatures.regime,
        record.aiFeatures.qualityScore,
        record.aiFeatures.chiefConfidence,
        record.labels.isWinner ? 1 : 0,
        record.outcome?.pnlPercent || ''
      ].join(','));
      
      return [headers.join(','), ...rows].join('\n');
    }
  }
}

// Export singleton
const globalForMLTraining = globalThis as typeof globalThis & {
  __mlTrainingService?: MLTrainingDataService;
};

if (!globalForMLTraining.__mlTrainingService) {
  globalForMLTraining.__mlTrainingService = new MLTrainingDataService();
}

export const mlTrainingService = globalForMLTraining.__mlTrainingService;
export default mlTrainingService;

