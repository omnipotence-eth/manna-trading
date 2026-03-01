/**
 * Reinforcement Learning Training Data Service
 * 
 * Captures complete state/action/reward tuples for RL model training:
 * - State: Complete market snapshot at decision time
 * - Action: Trading decision (LONG, SHORT, HOLD, CLOSE)
 * - Reward: Actual P&L + risk-adjusted metrics
 * 
 * RL TRAINING PRINCIPLES:
 * 1. Capture COMPLETE state for each decision point
 * 2. Record ALL actions including HOLD/REJECT (important for learning when NOT to trade)
 * 3. Calculate delayed rewards for proper credit assignment
 * 4. Track episode boundaries (trade open -> close)
 * 5. Store experience for replay buffer
 * 
 * ALGORITHMS SUPPORTED:
 * - PPO (Proximal Policy Optimization)
 * - DQN (Deep Q-Network)
 * - A2C (Advantage Actor-Critic)
 * - SAC (Soft Actor-Critic)
 */

import { logger } from '@/lib/logger';

// Dynamic import to prevent Next.js build issues
async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}

// ============================================================================
// RL STATE INTERFACE - Complete market state at decision time
// ============================================================================

export interface RLState {
  // Timestamp
  timestamp: number;
  symbol: string;
  
  // === PRICE FEATURES (normalized) ===
  price: number;
  priceNormalized: number; // Price / 20-day SMA
  priceChange1m: number;
  priceChange5m: number;
  priceChange15m: number;
  priceChange1h: number;
  priceChange4h: number;
  priceChange24h: number;
  
  // === TECHNICAL INDICATORS (normalized -1 to 1) ===
  rsi14Normalized: number; // (RSI - 50) / 50
  rsi7Normalized: number;
  macdNormalized: number;
  macdHistogramNormalized: number;
  adxNormalized: number; // ADX / 100
  atrPercent: number;
  
  // === VOLUME FEATURES ===
  volumeRatio: number; // vs 20-day avg
  volumeImbalance: number; // (buy - sell) / total
  volumeSpike: number; // 0 or 1
  
  // === ORDER BOOK FEATURES ===
  spreadPercent: number;
  bidAskImbalance: number; // (bid depth - ask depth) / total
  liquidityScore: number; // 0 to 1
  
  // === FUNDING & SENTIMENT ===
  fundingRate: number; // Raw funding rate
  longShortRatio: number;
  openInterestChange: number;
  
  // === POSITION STATE (if any) ===
  hasPosition: number; // 0 or 1
  positionSide: number; // -1 (short), 0 (none), 1 (long)
  positionPnlPercent: number; // Unrealized P&L
  positionDuration: number; // Hours held (normalized 0-1 for 24h max)
  
  // === PORTFOLIO STATE ===
  portfolioHeatPercent: number; // Current risk as % of portfolio
  cashRatioPercent: number; // Available margin ratio
  recentWinRate: number; // Win rate over last 20 trades
  recentAvgPnl: number; // Avg P&L over last 20 trades
  
  // === TIME FEATURES (cyclical encoding) ===
  hourSin: number; // sin(2π * hour / 24)
  hourCos: number; // cos(2π * hour / 24)
  daySin: number; // sin(2π * day / 7)
  dayCos: number; // cos(2π * day / 7)
  
  // === MARKET REGIME ===
  regimeEncoded: number; // -1 (bearish), 0 (neutral), 1 (bullish)
  volatilityEncoded: number; // 0 (low), 0.33 (med), 0.66 (high), 1 (extreme)
}

// ============================================================================
// RL ACTION INTERFACE
// ============================================================================

export interface RLAction {
  type: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE';
  
  // Position parameters (if LONG or SHORT)
  positionSizePercent?: number; // % of portfolio (0-1)
  leverage?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  
  // Confidence from AI
  confidence: number;
  
  // Action encoding for neural network
  actionEncoded: number; // 0=HOLD, 1=LONG, 2=SHORT, 3=CLOSE
  continuousParams: number[]; // [size, leverage, sl, tp] for continuous action space
}

// ============================================================================
// RL REWARD INTERFACE - Comprehensive reward signal
// ============================================================================

export interface RLReward {
  // Immediate rewards
  stepReward: number; // Immediate P&L this step
  
  // Delayed rewards (filled at episode end)
  episodeReward?: number; // Total P&L for the episode
  riskAdjustedReward?: number; // Sharpe-adjusted reward
  
  // Reward components (for analysis)
  pnlComponent: number;
  riskPenalty: number; // Penalty for excessive risk
  holdingCost: number; // Cost of holding (funding, opportunity)
  executionCost: number; // Slippage + fees
  
  // Shaping rewards
  trendAlignmentBonus: number; // Reward for trading with trend
  timingBonus: number; // Reward for good entry/exit timing
}

// ============================================================================
// RL EXPERIENCE TUPLE
// ============================================================================

export interface RLExperience {
  id: string;
  episodeId: string;
  stepNumber: number;
  
  state: RLState;
  action: RLAction;
  reward: RLReward;
  nextState: RLState;
  
  done: boolean; // Episode ended (position closed)
  truncated: boolean; // Episode cut short (timeout, etc)
  
  // Metadata
  timestamp: number;
  symbol: string;
  modelVersion: string;
  
  // For prioritized experience replay
  priority: number;
  tdError?: number; // Temporal difference error (for priority)
}

// ============================================================================
// RL EPISODE TRACKING
// ============================================================================

export interface RLEpisode {
  id: string;
  symbol: string;
  startTime: number;
  endTime?: number;
  
  initialState: RLState;
  finalState?: RLState;
  
  // Episode statistics
  totalSteps: number;
  totalReward: number;
  finalPnl: number;
  maxDrawdown: number;
  
  // Outcome
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'ONGOING';
  exitReason?: string;
}

// ============================================================================
// RL TRAINING DATA SERVICE CLASS
// ============================================================================

class RLTrainingService {
  private initialized = false;
  private currentEpisodes: Map<string, RLEpisode> = new Map();
  private experienceBuffer: RLExperience[] = [];
  private readonly bufferMaxSize = 100000;
  private episodeCounter = 0;
  
  constructor() {
    logger.info('[INIT] RL Training Service initialized', { context: 'RLTraining' });
  }
  
  /**
   * Initialize database tables for RL data
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const db = await getDb();
      
      // Create RL experience table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rl_experiences (
          id VARCHAR(100) PRIMARY KEY,
          episode_id VARCHAR(100) NOT NULL,
          step_number INTEGER NOT NULL,
          
          state JSONB NOT NULL,
          action JSONB NOT NULL,
          reward JSONB NOT NULL,
          next_state JSONB NOT NULL,
          
          done BOOLEAN NOT NULL,
          truncated BOOLEAN NOT NULL,
          
          timestamp BIGINT NOT NULL,
          symbol VARCHAR(20) NOT NULL,
          model_version VARCHAR(50),
          priority DECIMAL(10, 6) DEFAULT 1.0,
          td_error DECIMAL(10, 6),
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create RL episodes table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rl_episodes (
          id VARCHAR(100) PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL,
          start_time BIGINT NOT NULL,
          end_time BIGINT,
          
          initial_state JSONB NOT NULL,
          final_state JSONB,
          
          total_steps INTEGER DEFAULT 0,
          total_reward DECIMAL(20, 8) DEFAULT 0,
          final_pnl DECIMAL(20, 8),
          max_drawdown DECIMAL(10, 4),
          
          outcome VARCHAR(20) DEFAULT 'ONGOING',
          exit_reason VARCHAR(100),
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create indexes
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_rl_exp_episode ON rl_experiences(episode_id);
        CREATE INDEX IF NOT EXISTS idx_rl_exp_timestamp ON rl_experiences(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_rl_exp_priority ON rl_experiences(priority DESC);
        CREATE INDEX IF NOT EXISTS idx_rl_episodes_symbol ON rl_episodes(symbol);
        CREATE INDEX IF NOT EXISTS idx_rl_episodes_outcome ON rl_episodes(outcome);
      `);
      
      this.initialized = true;
      logger.info('[OK] RL Training tables initialized', { context: 'RLTraining' });
      
    } catch (error) {
      logger.error('Failed to initialize RL tables', error, { context: 'RLTraining' });
    }
  }
  
  /**
   * Start a new RL episode (when opening a position or starting observation)
   */
  async startEpisode(symbol: string, initialState: RLState): Promise<string> {
    await this.initialize();
    
    const episodeId = `ep_${Date.now()}_${++this.episodeCounter}`;
    
    const episode: RLEpisode = {
      id: episodeId,
      symbol,
      startTime: Date.now(),
      initialState,
      totalSteps: 0,
      totalReward: 0,
      finalPnl: 0,
      maxDrawdown: 0,
      outcome: 'ONGOING'
    };
    
    this.currentEpisodes.set(episodeId, episode);
    
    try {
      const db = await getDb();
      await db.execute(`
        INSERT INTO rl_episodes (id, symbol, start_time, initial_state)
        VALUES ($1, $2, $3, $4)
      `, [episodeId, symbol, episode.startTime, JSON.stringify(initialState)]);
      
    } catch (error) {
      logger.error('Failed to save episode start', error, { context: 'RLTraining' });
    }
    
    logger.debug(`🎬 Started RL episode ${episodeId} for ${symbol}`, { context: 'RLTraining' });
    
    return episodeId;
  }
  
  /**
   * Record an experience tuple (state, action, reward, next_state)
   */
  async recordExperience(
    episodeId: string,
    state: RLState,
    action: RLAction,
    reward: RLReward,
    nextState: RLState,
    done: boolean = false,
    truncated: boolean = false
  ): Promise<void> {
    const episode = this.currentEpisodes.get(episodeId);
    if (!episode) {
      logger.warn(`Episode ${episodeId} not found`, { context: 'RLTraining' });
      return;
    }
    
    episode.totalSteps++;
    episode.totalReward += reward.stepReward;
    
    // Track max drawdown
    if (reward.pnlComponent < 0) {
      episode.maxDrawdown = Math.max(episode.maxDrawdown, Math.abs(reward.pnlComponent));
    }
    
    const experience: RLExperience = {
      id: `exp_${Date.now()}_${episode.totalSteps}`,
      episodeId,
      stepNumber: episode.totalSteps,
      state,
      action,
      reward,
      nextState,
      done,
      truncated,
      timestamp: Date.now(),
      symbol: episode.symbol,
      modelVersion: '1.0.0',
      priority: 1.0 // Will be updated based on TD error
    };
    
    // Add to buffer
    this.experienceBuffer.push(experience);
    
    // Trim buffer if too large
    if (this.experienceBuffer.length > this.bufferMaxSize) {
      this.experienceBuffer = this.experienceBuffer.slice(-this.bufferMaxSize);
    }
    
    // Save to database
    try {
      const db = await getDb();
      await db.execute(`
        INSERT INTO rl_experiences (
          id, episode_id, step_number, state, action, reward, next_state,
          done, truncated, timestamp, symbol, model_version, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        experience.id,
        episodeId,
        experience.stepNumber,
        JSON.stringify(state),
        JSON.stringify(action),
        JSON.stringify(reward),
        JSON.stringify(nextState),
        done,
        truncated,
        experience.timestamp,
        experience.symbol,
        experience.modelVersion,
        experience.priority
      ]);
      
    } catch (error) {
      logger.error('Failed to save experience', error, { context: 'RLTraining' });
    }
    
    // End episode if done
    if (done || truncated) {
      await this.endEpisode(episodeId, nextState, reward.episodeReward || episode.totalReward);
    }
  }
  
  /**
   * End an RL episode
   */
  async endEpisode(
    episodeId: string,
    finalState: RLState,
    finalPnl: number,
    exitReason?: string
  ): Promise<void> {
    const episode = this.currentEpisodes.get(episodeId);
    if (!episode) return;
    
    episode.endTime = Date.now();
    episode.finalState = finalState;
    episode.finalPnl = finalPnl;
    episode.exitReason = exitReason;
    
    // Determine outcome
    if (finalPnl > 0.5) episode.outcome = 'WIN';
    else if (finalPnl < -0.5) episode.outcome = 'LOSS';
    else episode.outcome = 'BREAKEVEN';
    
    try {
      const db = await getDb();
      await db.execute(`
        UPDATE rl_episodes SET
          end_time = $1,
          final_state = $2,
          total_steps = $3,
          total_reward = $4,
          final_pnl = $5,
          max_drawdown = $6,
          outcome = $7,
          exit_reason = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
      `, [
        episode.endTime,
        JSON.stringify(finalState),
        episode.totalSteps,
        episode.totalReward,
        finalPnl,
        episode.maxDrawdown,
        episode.outcome,
        exitReason,
        episodeId
      ]);
      
    } catch (error) {
      logger.error('Failed to end episode', error, { context: 'RLTraining' });
    }
    
    // Remove from current episodes
    this.currentEpisodes.delete(episodeId);
    
    logger.info(`🏁 Ended RL episode ${episodeId}: ${episode.outcome} (PnL: ${finalPnl.toFixed(2)}%)`, {
      context: 'RLTraining',
      data: { steps: episode.totalSteps, reward: episode.totalReward }
    });
  }
  
  /**
   * Build RL state from market data
   */
  buildState(
    marketData: {
      symbol: string;
      price: number;
      priceChanges: Record<string, number>;
      indicators: Record<string, number>;
      volume: Record<string, number>;
      orderBook: Record<string, number>;
      funding: Record<string, number>;
    },
    positionData?: {
      side: 'LONG' | 'SHORT' | null;
      pnlPercent: number;
      durationHours: number;
    },
    portfolioData?: {
      heatPercent: number;
      cashRatio: number;
      recentWinRate: number;
      recentAvgPnl: number;
    }
  ): RLState {
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();
    
    return {
      timestamp: Date.now(),
      symbol: marketData.symbol,
      
      // Price features
      price: marketData.price,
      priceNormalized: marketData.priceChanges.priceVsSma20 || 1,
      priceChange1m: marketData.priceChanges['1m'] || 0,
      priceChange5m: marketData.priceChanges['5m'] || 0,
      priceChange15m: marketData.priceChanges['15m'] || 0,
      priceChange1h: marketData.priceChanges['1h'] || 0,
      priceChange4h: marketData.priceChanges['4h'] || 0,
      priceChange24h: marketData.priceChanges['24h'] || 0,
      
      // Technical indicators (normalized)
      rsi14Normalized: ((marketData.indicators.rsi14 || 50) - 50) / 50,
      rsi7Normalized: ((marketData.indicators.rsi7 || 50) - 50) / 50,
      macdNormalized: Math.tanh((marketData.indicators.macd || 0) / 100),
      macdHistogramNormalized: Math.tanh((marketData.indicators.macdHistogram || 0) / 50),
      adxNormalized: (marketData.indicators.adx || 25) / 100,
      atrPercent: marketData.indicators.atrPercent || 2,
      
      // Volume features
      volumeRatio: marketData.volume.ratio || 1,
      volumeImbalance: marketData.volume.imbalance || 0,
      volumeSpike: (marketData.volume.ratio || 1) > 2 ? 1 : 0,
      
      // Order book
      spreadPercent: marketData.orderBook.spreadPercent || 0.1,
      bidAskImbalance: marketData.orderBook.imbalance || 0,
      liquidityScore: marketData.orderBook.liquidityScore || 0.5,
      
      // Funding & sentiment
      fundingRate: marketData.funding.rate || 0,
      longShortRatio: marketData.funding.longShortRatio || 1,
      openInterestChange: marketData.funding.oiChange || 0,
      
      // Position state
      hasPosition: positionData?.side ? 1 : 0,
      positionSide: positionData?.side === 'LONG' ? 1 : positionData?.side === 'SHORT' ? -1 : 0,
      positionPnlPercent: positionData?.pnlPercent || 0,
      positionDuration: Math.min((positionData?.durationHours || 0) / 24, 1),
      
      // Portfolio state
      portfolioHeatPercent: portfolioData?.heatPercent || 0,
      cashRatioPercent: portfolioData?.cashRatio || 1,
      recentWinRate: portfolioData?.recentWinRate || 0.5,
      recentAvgPnl: portfolioData?.recentAvgPnl || 0,
      
      // Time features (cyclical)
      hourSin: Math.sin(2 * Math.PI * hour / 24),
      hourCos: Math.cos(2 * Math.PI * hour / 24),
      daySin: Math.sin(2 * Math.PI * day / 7),
      dayCos: Math.cos(2 * Math.PI * day / 7),
      
      // Market regime
      regimeEncoded: this.encodeRegime(marketData.indicators),
      volatilityEncoded: this.encodeVolatility(marketData.indicators.atrPercent || 2)
    };
  }
  
  /**
   * Encode market regime
   */
  private encodeRegime(indicators: Record<string, number>): number {
    const adx = indicators.adx || 25;
    const macd = indicators.macd || 0;
    const priceChange = indicators.priceChange1h || 0;
    
    if (adx < 20) return 0; // Ranging
    if (macd > 0 && priceChange > 0) return 1; // Bullish trending
    if (macd < 0 && priceChange < 0) return -1; // Bearish trending
    return 0;
  }
  
  /**
   * Encode volatility level
   */
  private encodeVolatility(atrPercent: number): number {
    if (atrPercent < 2) return 0; // Low
    if (atrPercent < 5) return 0.33; // Medium
    if (atrPercent < 10) return 0.66; // High
    return 1; // Extreme
  }
  
  /**
   * Calculate reward for an action
   */
  calculateReward(
    pnlPercent: number,
    riskTaken: number,
    holdingHours: number,
    trendAlignment: boolean,
    optimalEntry: boolean
  ): RLReward {
    // Base P&L reward (main signal)
    const pnlComponent = pnlPercent;
    
    // Risk penalty (discourage excessive risk)
    const riskPenalty = riskTaken > 5 ? -0.1 * (riskTaken - 5) : 0;
    
    // Holding cost (funding + opportunity cost)
    const holdingCost = -0.01 * holdingHours;
    
    // Execution cost (estimated slippage + fees)
    const executionCost = -0.1; // ~0.1% for round trip
    
    // Shaping rewards
    const trendAlignmentBonus = trendAlignment ? 0.2 : -0.1;
    const timingBonus = optimalEntry ? 0.1 : 0;
    
    const stepReward = pnlComponent + riskPenalty + holdingCost + executionCost + 
                       trendAlignmentBonus + timingBonus;
    
    return {
      stepReward,
      pnlComponent,
      riskPenalty,
      holdingCost,
      executionCost,
      trendAlignmentBonus,
      timingBonus
    };
  }
  
  /**
   * Sample experiences for training (prioritized replay)
   */
  async sampleExperiences(batchSize: number = 64): Promise<RLExperience[]> {
    if (this.experienceBuffer.length < batchSize) {
      return this.experienceBuffer;
    }
    
    // Prioritized sampling based on priority scores
    const sorted = [...this.experienceBuffer].sort((a, b) => b.priority - a.priority);
    
    // Mix of high priority (70%) and random (30%)
    const highPriorityCount = Math.floor(batchSize * 0.7);
    const randomCount = batchSize - highPriorityCount;
    
    const samples: RLExperience[] = [];
    
    // Add high priority samples
    samples.push(...sorted.slice(0, highPriorityCount));
    
    // Add random samples
    const remaining = sorted.slice(highPriorityCount);
    for (let i = 0; i < randomCount && remaining.length > 0; i++) {
      const idx = Math.floor(Math.random() * remaining.length);
      samples.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
    
    return samples;
  }
  
  /**
   * Update experience priorities based on TD error
   */
  async updatePriorities(updates: { id: string; tdError: number }[]): Promise<void> {
    try {
      const db = await getDb();
      
      for (const update of updates) {
        // Priority = |TD error| + small constant (for exploration)
        const priority = Math.abs(update.tdError) + 0.001;
        
        await db.execute(
          'UPDATE rl_experiences SET priority = $1, td_error = $2 WHERE id = $3',
          [priority, update.tdError, update.id]
        );
        
        // Also update in-memory buffer
        const exp = this.experienceBuffer.find(e => e.id === update.id);
        if (exp) {
          exp.priority = priority;
          exp.tdError = update.tdError;
        }
      }
      
    } catch (error) {
      logger.error('Failed to update priorities', error, { context: 'RLTraining' });
    }
  }
  
  /**
   * Export experiences for offline training
   */
  async exportForTraining(format: 'json' | 'numpy' = 'json'): Promise<string> {
    try {
      const db = await getDb();
      
      const result = await db.execute(`
        SELECT * FROM rl_experiences 
        ORDER BY timestamp DESC 
        LIMIT 100000
      `);
      
      if (!result.rows) return '[]';
      
      if (format === 'json') {
        return JSON.stringify(result.rows, null, 2);
      } else {
        // NumPy-compatible format (states as arrays)
        const data = result.rows.map((row: Record<string, unknown>) => ({
          state: Object.values(typeof row.state === 'string' ? JSON.parse(row.state) : row.state),
          action: typeof row.action === 'string' ? JSON.parse(row.action) : row.action,
          reward: typeof row.reward === 'string' ? JSON.parse(row.reward) : row.reward,
          next_state: Object.values(typeof row.next_state === 'string' ? JSON.parse(row.next_state) : row.next_state),
          done: row.done
        }));
        return JSON.stringify(data);
      }
      
    } catch (error) {
      logger.error('Failed to export training data', error, { context: 'RLTraining' });
      return '[]';
    }
  }
  
  /**
   * Get training statistics
   */
  async getStats(): Promise<{
    totalExperiences: number;
    totalEpisodes: number;
    avgEpisodeLength: number;
    winRate: number;
    avgReward: number;
    bufferSize: number;
  }> {
    try {
      const db = await getDb();
      
      const expResult = await db.execute('SELECT COUNT(*) as count FROM rl_experiences');
      const epResult = await db.execute(`
        SELECT 
          COUNT(*) as count,
          AVG(total_steps) as avg_steps,
          AVG(CASE WHEN outcome = 'WIN' THEN 1.0 ELSE 0.0 END) as win_rate,
          AVG(total_reward) as avg_reward
        FROM rl_episodes
        WHERE outcome != 'ONGOING'
      `);
      
      return {
        totalExperiences: parseInt(expResult.rows?.[0]?.count) || 0,
        totalEpisodes: parseInt(epResult.rows?.[0]?.count) || 0,
        avgEpisodeLength: parseFloat(epResult.rows?.[0]?.avg_steps) || 0,
        winRate: parseFloat(epResult.rows?.[0]?.win_rate) || 0,
        avgReward: parseFloat(epResult.rows?.[0]?.avg_reward) || 0,
        bufferSize: this.experienceBuffer.length
      };
      
    } catch (error) {
      logger.error('Failed to get RL stats', error, { context: 'RLTraining' });
      return {
        totalExperiences: 0,
        totalEpisodes: 0,
        avgEpisodeLength: 0,
        winRate: 0,
        avgReward: 0,
        bufferSize: this.experienceBuffer.length
      };
    }
  }
}

// Export singleton
const globalForRL = globalThis as typeof globalThis & {
  __rlTrainingService?: RLTrainingService;
};

if (!globalForRL.__rlTrainingService) {
  globalForRL.__rlTrainingService = new RLTrainingService();
}

export const rlTrainingService = globalForRL.__rlTrainingService;
export default rlTrainingService;

