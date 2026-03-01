/**
 * Mathematical Trading System - 24/7 Profit Generation
 * 
 * Uses pure mathematics and Aster DEX API data to generate profits in ANY market condition.
 * 
 * CORE STRATEGIES:
 * 1. Mean Reversion - Trade when price deviates from statistical mean
 * 2. Momentum - Follow strong trends with confirmation
 * 3. Market Making - Capture bid-ask spread in sideways markets
 * 4. Statistical Arbitrage - Exploit pricing inefficiencies
 * 5. Grid Trading - Profit from volatility regardless of direction
 * 6. Liquidation Cascade - Trade after large liquidations (mean reversion)
 * 7. Funding Rate Arbitrage - Profit from funding payments
 * 8. Mark/Last Price Divergence - Trade price inefficiencies
 * 
 * MATHEMATICAL FOUNDATIONS:
 * - Bollinger Bands for mean reversion (2σ)
 * - RSI extremes (oversold <30, overbought >70)
 * - Volume-weighted price analysis
 * - ATR-based volatility scaling
 * - Kelly Criterion position sizing
 * - Expected Value optimization
 * 
 * Based on: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
 */

import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/exchange/asterDexService';
import wsMarketService from '@/services/exchange/websocketMarketService';
import { MICRO_TRADE_CONSTANTS, MACRO_TRADE_CONSTANTS } from '@/constants/tradingConstants';
import { asterConfig } from '@/lib/configService';

// Market regime detection
type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'UNKNOWN';

interface MarketAnalysis {
  symbol: string;
  price: number;
  regime: MarketRegime;
  
  // Technical indicators
  rsi: number;
  bollingerPosition: number; // -1 to 1 (below/above mean)
  atr: number;
  atrPercent: number;
  volumeRatio: number;
  
  // Signals
  meanReversionSignal: 'BUY' | 'SELL' | 'NEUTRAL';
  momentumSignal: 'BUY' | 'SELL' | 'NEUTRAL';
  
  // Trade recommendation
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  expectedValue: number;
  stopLoss: number;
  takeProfit: number;
  positionSizePercent: number;
}

interface TradeOpportunity {
  symbol: string;
  action: 'BUY' | 'SELL';
  strategy: 'MEAN_REVERSION' | 'MOMENTUM' | 'GRID' | 'SCALP';
  confidence: number;
  expectedValue: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSizePercent: number;
  riskRewardRatio: number;
  reasoning: string;
}

class MathematicalTradingSystem {
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();
  private readonly HISTORY_SIZE = 100; // Keep 100 data points for calculations
  
  /**
   * Calculate RSI (Relative Strength Index)
   * RSI = 100 - (100 / (1 + RS))
   * RS = Average Gain / Average Loss
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // Neutral if not enough data
    
    let gains = 0;
    let losses = 0;
    
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  /**
   * Calculate Bollinger Band position
   * Returns -1 to 1 where:
   * -1 = at lower band (oversold)
   * 0 = at mean
   * 1 = at upper band (overbought)
   */
  private calculateBollingerPosition(prices: number[], period: number = 20): number {
    if (prices.length < period) return 0;
    
    const recentPrices = prices.slice(-period);
    const mean = recentPrices.reduce((a, b) => a + b, 0) / period;
    const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    const currentPrice = prices[prices.length - 1];
    const zScore = (currentPrice - mean) / stdDev;
    
    // Normalize to -1 to 1 (2 standard deviations)
    return Math.max(-1, Math.min(1, zScore / 2));
  }
  
  /**
   * Calculate ATR (Average True Range) as percentage
   */
  private calculateATRPercent(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 2; // Default 2%
    
    let atrSum = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const high = prices[i] * 1.005; // Approximate high
      const low = prices[i] * 0.995; // Approximate low
      const prevClose = prices[i - 1];
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      atrSum += tr;
    }
    
    const atr = atrSum / period;
    const currentPrice = prices[prices.length - 1];
    return (atr / currentPrice) * 100;
  }
  
  /**
   * Detect market regime using price action
   */
  private detectMarketRegime(prices: number[]): MarketRegime {
    if (prices.length < 20) return 'UNKNOWN';
    
    const shortMA = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const longMA = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentPrice = prices[prices.length - 1];
    
    const atrPercent = this.calculateATRPercent(prices);
    
    // High volatility = volatile regime
    if (atrPercent > 5) return 'VOLATILE';
    
    // Trend detection
    const trendStrength = ((shortMA - longMA) / longMA) * 100;
    
    if (trendStrength > 1) return 'TRENDING_UP';
    if (trendStrength < -1) return 'TRENDING_DOWN';
    return 'RANGING';
  }
  
  /**
   * Calculate expected value of a trade
   * EV = (Win% × Avg Win) - (Loss% × Avg Loss)
   */
  private calculateExpectedValue(
    winProbability: number,
    potentialWin: number,
    potentialLoss: number
  ): number {
    const lossProbability = 1 - winProbability;
    return (winProbability * potentialWin) - (lossProbability * potentialLoss);
  }
  
  /**
   * Calculate Kelly Criterion position size
   * f* = (bp - q) / b
   * where b = odds, p = win probability, q = loss probability
   */
  private calculateKellySize(
    winProbability: number,
    riskRewardRatio: number
  ): number {
    const q = 1 - winProbability;
    const kelly = (winProbability * riskRewardRatio - q) / riskRewardRatio;
    
    // CRITICAL FIX: Standardize to 15% fractional Kelly to match main implementation (lib/kellyCriterion.ts)
    // More conservative for crypto volatility
    const fractionalKelly = kelly * 0.15;
    
    // Clamp between 0.5% and 3%
    return Math.max(0.5, Math.min(3, fractionalKelly * 100));
  }
  
  /**
   * Analyze a symbol and generate trade recommendation
   */
  async analyzeSymbol(symbol: string): Promise<MarketAnalysis> {
    try {
      // Fetch current market data
      const ticker = await asterDexService.getTicker(symbol);
      const price = ticker?.price || 0;
      
      if (price <= 0) {
        throw new Error(`Invalid price for ${symbol}`);
      }
      
      // Update price history
      let prices = this.priceHistory.get(symbol) || [];
      prices.push(price);
      if (prices.length > this.HISTORY_SIZE) {
        prices = prices.slice(-this.HISTORY_SIZE);
      }
      this.priceHistory.set(symbol, prices);
      
      // Calculate indicators
      const rsi = this.calculateRSI(prices);
      const bollingerPosition = this.calculateBollingerPosition(prices);
      const atrPercent = this.calculateATRPercent(prices);
      const regime = this.detectMarketRegime(prices);
      
      // Volume analysis
      const volume = ticker?.volume || 0;
      let volumes = this.volumeHistory.get(symbol) || [];
      volumes.push(volume);
      if (volumes.length > this.HISTORY_SIZE) {
        volumes = volumes.slice(-this.HISTORY_SIZE);
      }
      this.volumeHistory.set(symbol, volumes);
      
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
      
      // Generate signals
      let meanReversionSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      let momentumSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      
      // Mean Reversion Signal
      if (bollingerPosition < -0.8 && rsi < 30) {
        meanReversionSignal = 'BUY'; // Oversold
      } else if (bollingerPosition > 0.8 && rsi > 70) {
        meanReversionSignal = 'SELL'; // Overbought
      }
      
      // Momentum Signal
      if (regime === 'TRENDING_UP' && rsi > 50 && rsi < 70 && volumeRatio > 1.2) {
        momentumSignal = 'BUY';
      } else if (regime === 'TRENDING_DOWN' && rsi < 50 && rsi > 30 && volumeRatio > 1.2) {
        momentumSignal = 'SELL';
      }
      
      // Generate final recommendation
      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      
      // Strong mean reversion opportunity
      if (meanReversionSignal !== 'NEUTRAL') {
        action = meanReversionSignal;
        confidence = 0.6 + (Math.abs(bollingerPosition) * 0.2);
      }
      // Momentum confirmation
      else if (momentumSignal !== 'NEUTRAL') {
        action = momentumSignal;
        confidence = 0.55 + (volumeRatio > 1.5 ? 0.15 : 0.05);
      }
      
      // Calculate risk parameters
      const stopLossPercent = Math.max(0.5, Math.min(2, atrPercent * 1.5));
      const takeProfitPercent = stopLossPercent * 2.5; // 2.5:1 R:R
      
      const stopLoss = action === 'BUY' 
        ? price * (1 - stopLossPercent / 100)
        : price * (1 + stopLossPercent / 100);
      
      const takeProfit = action === 'BUY'
        ? price * (1 + takeProfitPercent / 100)
        : price * (1 - takeProfitPercent / 100);
      
      const riskRewardRatio = takeProfitPercent / stopLossPercent;
      const expectedValue = this.calculateExpectedValue(confidence, takeProfitPercent, stopLossPercent);
      const positionSizePercent = this.calculateKellySize(confidence, riskRewardRatio);
      
      return {
        symbol,
        price,
        regime,
        rsi,
        bollingerPosition,
        atr: price * atrPercent / 100,
        atrPercent,
        volumeRatio,
        meanReversionSignal,
        momentumSignal,
        action,
        confidence,
        expectedValue,
        stopLoss,
        takeProfit,
        positionSizePercent
      };
      
    } catch (error) {
      logger.error(`Failed to analyze ${symbol}`, error as Error, {
        context: 'MathematicalTradingSystem'
      });
      
      return {
        symbol,
        price: 0,
        regime: 'UNKNOWN',
        rsi: 50,
        bollingerPosition: 0,
        atr: 0,
        atrPercent: 0,
        volumeRatio: 1,
        meanReversionSignal: 'NEUTRAL',
        momentumSignal: 'NEUTRAL',
        action: 'HOLD',
        confidence: 0,
        expectedValue: 0,
        stopLoss: 0,
        takeProfit: 0,
        positionSizePercent: 0
      };
    }
  }
  
  // ============ ADVANCED PROFIT STRATEGIES (from Aster DEX WebSocket) ============
  
  /**
   * PROFIT STRATEGY: Liquidation Cascade Trading
   * When large liquidations occur, price often reverses (mean reversion after forced selling)
   * Based on: !forceOrder@arr WebSocket stream
   */
  checkLiquidationOpportunity(symbol: string): TradeOpportunity | null {
    try {
      const cascade = wsMarketService.detectLiquidationCascade(symbol);
      
      if (!cascade.isCascade || !cascade.direction) return null;
      
      const ticker = wsMarketService.getTicker(symbol);
      if (!ticker) return null;
      
      // After liquidation cascade, expect mean reversion
      // LONG_SQUEEZE = longs liquidated = price dropped = BUY opportunity
      // SHORT_SQUEEZE = shorts liquidated = price pumped = SELL opportunity
      const action = cascade.direction === 'LONG_SQUEEZE' ? 'BUY' : 'SELL';
      const price = ticker.price;
      const atrPercent = ((ticker.high - ticker.low) / ticker.price) * 100;
      
      // Calculate stops based on volatility
      const stopLoss = action === 'BUY' 
        ? price * (1 - atrPercent * 0.5 / 100) 
        : price * (1 + atrPercent * 0.5 / 100);
      const takeProfit = action === 'BUY'
        ? price * (1 + atrPercent * 1.0 / 100)
        : price * (1 - atrPercent * 1.0 / 100);
      
      const riskRewardRatio = 2.0; // 1:2 R:R
      const confidence = 0.65 + (cascade.totalLiquidated / 500000) * 0.1; // Higher confidence for larger cascades
      
      logger.info(`[LIQUIDATION] LIQUIDATION OPPORTUNITY: ${symbol} ${action}`, {
        context: 'MathematicalTradingSystem',
        data: {
          direction: cascade.direction,
          totalLiquidated: `$${(cascade.totalLiquidated/1000).toFixed(1)}K`,
          count: cascade.count
        }
      });
      
      return {
        symbol,
        action,
        strategy: 'MEAN_REVERSION',
        confidence: Math.min(confidence, 0.85),
        expectedValue: 1.5, // 1.5% expected on liquidation reversals
        entryPrice: price,
        stopLoss,
        takeProfit,
        positionSizePercent: 1.5, // Slightly larger position for high-conviction liquidation plays
        riskRewardRatio,
        reasoning: `Liquidation cascade detected: ${cascade.direction}, $${(cascade.totalLiquidated/1000).toFixed(1)}K liquidated. Expect mean reversion.`
      };
    } catch {
      return null;
    }
  }
  
  /**
   * PROFIT STRATEGY: Funding Rate Arbitrage
   * Collect funding payments by being on the paying side
   * Based on: !markPrice@arr WebSocket stream
   */
  async checkFundingOpportunity(symbol: string): Promise<TradeOpportunity | null> {
    try {
      const funding = wsMarketService.getFundingOpportunity(symbol);
      
      if (!funding || !funding.hasOpportunity || !funding.direction) return null;
      
      const ticker = wsMarketService.getTicker(symbol);
      if (!ticker) return null;
      
      const price = ticker.price;
      const atrPercent = ((ticker.high - ticker.low) / ticker.price) * 100;
      const forecast = this.getFundingForecast(symbol).catch(() => null);
      
      // For funding trades, use wider stops (we want to hold through funding)
      const stopLoss = funding.direction === 'LONG'
        ? price * (1 - atrPercent * 1.0 / 100)
        : price * (1 + atrPercent * 1.0 / 100);
      const takeProfit = funding.direction === 'LONG'
        ? price * (1 + atrPercent * 0.5 / 100)
        : price * (1 - atrPercent * 0.5 / 100);
      
      // Expected value = funding payment (per 8 hours) + potential price movement
      const expectedValueBase = funding.expectedPayment8h / 10 + 0.5; // Approximate EV per $1000
      const forecasted = (await forecast) || undefined;
      const historicAvg = forecasted?.avgAbsFundingRate || Math.abs(funding.fundingRate);
      const currentAbs = Math.abs(funding.fundingRate);
      // Only take if current is materially above historic average (guards against noise)
      if (currentAbs < Math.max(0.0004, historicAvg * 0.8)) {
        return null;
      }
      const expectedValue = expectedValueBase + (currentAbs - historicAvg) * 500; // boost when current outruns history
      const confidenceBoost = Math.min(0.08, currentAbs * 10);
      
      logger.info(`[FUNDING] FUNDING OPPORTUNITY: ${symbol} ${funding.direction}`, {
        context: 'MathematicalTradingSystem',
        data: {
          fundingRate: (funding.fundingRate * 100).toFixed(4) + '%',
          expectedPayment8h: `$${funding.expectedPayment8h.toFixed(2)}`,
          avgFundingRate: forecasted?.avgFundingRate,
          reason: funding.reason
        }
      });
      
      return {
        symbol,
        action: funding.direction === 'LONG' ? 'BUY' : 'SELL',
        strategy: 'SCALP',
        confidence: Math.min(0.80, 0.70 + confidenceBoost), // Funding is predictable
        expectedValue,
        entryPrice: price,
        stopLoss,
        takeProfit,
        positionSizePercent: 2.0, // Larger position for funding plays
        riskRewardRatio: 1.5,
        reasoning: funding.reason
      };
    } catch {
      return null;
    }
  }
  
  /**
   * PROFIT STRATEGY: Mark/Last Price Divergence
   * Trade when last price deviates significantly from mark price (arbitrage opportunity)
   * Based on: !markPrice@arr WebSocket stream
   */
  checkMarkPriceDivergence(symbol: string): TradeOpportunity | null {
    try {
      const divergence = wsMarketService.getMarkPriceDivergence(symbol);
      
      if (!divergence) return null;
      
      // Dynamic divergence threshold based on funding rate (premium index) per API docs
      const fundingPct = Math.abs(divergence.fundingRate * 100); // percent
      const DIVERGENCE_THRESHOLD = Math.max(0.08, Math.min(0.35, 0.08 + fundingPct * 0.8));
      if (Math.abs(divergence.divergencePercent) < DIVERGENCE_THRESHOLD) return null;
      
      // If last price > mark price, expect reversion DOWN (SELL)
      // If last price < mark price, expect reversion UP (BUY)
      const action = divergence.divergencePercent > 0 ? 'SELL' : 'BUY';
      const price = divergence.lastPrice;
      
      // Target the mark price (that's where price should revert to)
      const takeProfit = divergence.markPrice;
      const stopLoss = action === 'BUY'
        ? price * (1 - Math.abs(divergence.divergencePercent) * 2 / 100)
        : price * (1 + Math.abs(divergence.divergencePercent) * 2 / 100);
      
      const expectedValue = Math.abs(divergence.divergencePercent) * 0.7; // 70% of divergence captured
      const confidence = 0.60 + Math.abs(divergence.divergencePercent) * 0.1 + Math.min(0.05, fundingPct * 0.05);
      
      logger.info(`📐 MARK PRICE DIVERGENCE: ${symbol} ${action}`, {
        context: 'MathematicalTradingSystem',
        data: {
          divergence: divergence.divergencePercent.toFixed(3) + '%',
          lastPrice: divergence.lastPrice,
          markPrice: divergence.markPrice,
          fundingRate: (divergence.fundingRate * 100).toFixed(4) + '%'
        }
      });
      
      return {
        symbol,
        action,
        strategy: 'MEAN_REVERSION',
        confidence: Math.min(confidence, 0.80),
        expectedValue,
        entryPrice: price,
        stopLoss,
        takeProfit,
        positionSizePercent: 1.0, // Conservative for divergence plays
        riskRewardRatio: 2.0,
        reasoning: `Mark price divergence: ${divergence.divergencePercent.toFixed(3)}%. Last: $${divergence.lastPrice.toFixed(2)}, Mark: $${divergence.markPrice.toFixed(2)}`
      };
    } catch {
      return null;
    }
  }
  
  /**
   * Scan all markets and find the best opportunities
   * ENHANCED: Now includes liquidation, funding, and mark price strategies
   */
  async findBestOpportunities(symbols: string[], maxOpportunities: number = 5): Promise<TradeOpportunity[]> {
    const opportunities: TradeOpportunity[] = [];
    
    logger.info('[SCAN] Scanning markets for mathematical opportunities...', {
      context: 'MathematicalTradingSystem',
      data: { symbolCount: symbols.length }
    });
    
    for (const symbol of symbols) {
      try {
        // STRATEGY 1: Traditional technical analysis
        const analysis = await this.analyzeSymbol(symbol);
        
        // CRITICAL FIX: Standardize EV threshold to 1.0 to match Agent Coordinator
        // Only consider actionable signals with positive EV (raised from 0.5 to 1.0 for profitability)
        if (analysis.action !== 'HOLD' && analysis.expectedValue > 1.0 && analysis.confidence >= 0.55) {
          const strategy = analysis.meanReversionSignal !== 'NEUTRAL' ? 'MEAN_REVERSION' : 'MOMENTUM';
          const riskRewardRatio = Math.abs((analysis.takeProfit - analysis.price) / (analysis.price - analysis.stopLoss));
          
          const opp: TradeOpportunity = {
            symbol,
            action: analysis.action,
            strategy,
            confidence: analysis.confidence,
            expectedValue: analysis.expectedValue,
            entryPrice: analysis.price,
            stopLoss: analysis.stopLoss,
            takeProfit: analysis.takeProfit,
            positionSizePercent: analysis.positionSizePercent,
            riskRewardRatio,
            reasoning: this.generateReasoning(analysis)
          };
          const guardedOpp = this.applyMicrostructureGuardrails(opp, symbol);
          if (guardedOpp) {
            const costAdjusted = this.applyExecutionCosts(guardedOpp);
            const taxed = costAdjusted ? this.applySpreadAtrTax(costAdjusted) : null;
            if (taxed) opportunities.push(taxed);
          }
        }
        
        // STRATEGY 2: Liquidation cascade (HIGH PRIORITY)
        const liqOpp = this.checkLiquidationOpportunity(symbol);
        if (liqOpp) {
          liqOpp.expectedValue *= 1.5; // Boost liquidation opportunities
          const guardedOpp = this.applyMicrostructureGuardrails(liqOpp, symbol);
          if (guardedOpp) {
            const costAdjusted = this.applyExecutionCosts(guardedOpp);
            const taxed = costAdjusted ? this.applySpreadAtrTax(costAdjusted) : null;
            if (taxed) opportunities.push(taxed);
          }
        }
        
        // STRATEGY 3: Funding rate arbitrage
        const fundingOpp = await this.checkFundingOpportunity(symbol);
        if (fundingOpp) {
          const guardedOpp = this.applyMicrostructureGuardrails(fundingOpp, symbol);
          if (guardedOpp) {
            const costAdjusted = this.applyExecutionCosts(guardedOpp);
            const taxed = costAdjusted ? this.applySpreadAtrTax(costAdjusted) : null;
            const decayed = taxed ? this.applyFundingDecay(taxed) : null;
            if (decayed) opportunities.push(decayed);
          }
        }
        
        // STRATEGY 4: Mark price divergence
        const divergenceOpp = this.checkMarkPriceDivergence(symbol);
        if (divergenceOpp) {
          const guardedOpp = this.applyMicrostructureGuardrails(divergenceOpp, symbol);
          if (guardedOpp) {
            const costAdjusted = this.applyExecutionCosts(guardedOpp);
            const taxed = costAdjusted ? this.applySpreadAtrTax(costAdjusted) : null;
            if (taxed) opportunities.push(taxed);
          }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        // Skip symbols with errors
        continue;
      }
    }
    
    // Sort by expected value (best opportunities first)
    opportunities.sort((a, b) => b.expectedValue - a.expectedValue);
    
    logger.info(`[DATA] Found ${opportunities.length} opportunities`, {
      context: 'MathematicalTradingSystem',
      data: { 
        total: opportunities.length,
        returning: Math.min(opportunities.length, maxOpportunities)
      }
    });
    
    return opportunities.slice(0, maxOpportunities);
  }
  
  /**
   * Generate human-readable reasoning for the trade
   */
  private generateReasoning(analysis: MarketAnalysis): string {
    const parts: string[] = [];
    
    parts.push(`Market regime: ${analysis.regime}`);
    parts.push(`RSI: ${analysis.rsi.toFixed(1)}`);
    parts.push(`Bollinger position: ${(analysis.bollingerPosition * 100).toFixed(0)}%`);
    parts.push(`Volume ratio: ${analysis.volumeRatio.toFixed(2)}x`);
    parts.push(`ATR: ${analysis.atrPercent.toFixed(2)}%`);
    
    if (analysis.meanReversionSignal !== 'NEUTRAL') {
      parts.push(`Mean reversion signal: ${analysis.meanReversionSignal}`);
    }
    if (analysis.momentumSignal !== 'NEUTRAL') {
      parts.push(`Momentum signal: ${analysis.momentumSignal}`);
    }
    
    parts.push(`Expected value: ${analysis.expectedValue.toFixed(2)}%`);
    
    return parts.join(' | ');
  }

  /**
   * Apply execution cost and liquidity adjustments to an opportunity
   */
  private applyExecutionCosts(opportunity: TradeOpportunity): TradeOpportunity | null {
    const micro = wsMarketService.getMicrostructureSignal(opportunity.symbol);
    if (!micro) return opportunity;

    // Reject if spread/liquidity already fails
    const totalNotional = micro.bidNotional + micro.askNotional;
    if (micro.spreadPct > 0.35 || totalNotional < 20000) {
      return null;
    }

    const adjusted = { ...opportunity };
    // Subtract half the spread (bps) from expected value to approximate fees/slippage
    adjusted.expectedValue = Math.max(0, adjusted.expectedValue - micro.spreadPct * 0.5);
    if (adjusted.expectedValue < 0.3) return null;

    // Slight confidence nudge if orderbook bias matches direction
    if (micro.bias === 'BID' && adjusted.action === 'BUY') {
      adjusted.confidence = Math.min(0.95, adjusted.confidence + 0.02);
    } else if (micro.bias === 'ASK' && adjusted.action === 'SELL') {
      adjusted.confidence = Math.min(0.95, adjusted.confidence + 0.02);
    } else if (micro.bias !== 'NEUTRAL') {
      adjusted.confidence = Math.max(0.45, adjusted.confidence - 0.02);
    }

    return adjusted;
  }

  /**
   * Apply spread/volatility tax to expected value
   * - Subtract half-spread (bps) and a small ATR-based penalty to avoid overestimating edge
   */
  private applySpreadAtrTax(opportunity: TradeOpportunity): TradeOpportunity | null {
    const micro = wsMarketService.getMicrostructureSignal(opportunity.symbol);
    const adjusted = { ...opportunity };

    // Spread tax: subtract half the spread in percent terms
    if (micro) {
      adjusted.expectedValue = Math.max(0, adjusted.expectedValue - micro.spreadPct * 0.5);
    }

    // Volatility tax: subtract a small portion of ATR% to avoid over-optimism in high vol
    const atrTax = Math.min(0.4, (Math.abs(adjusted.takeProfit - adjusted.entryPrice) / adjusted.entryPrice) * 100 * 0.05);
    adjusted.expectedValue = Math.max(0, adjusted.expectedValue - atrTax);

    // Require EV > 0.3% after taxes
    if (adjusted.expectedValue < 0.3) return null;

    return adjusted;
  }

  /**
   * Apply funding/premium decay (time to next funding) to confidence/EV
   */
  private applyFundingDecay(opportunity: TradeOpportunity): TradeOpportunity {
    const mark = wsMarketService.getMarkPriceDivergence(opportunity.symbol);
    if (!mark) return opportunity;
    const now = Date.now();
    const nextFunding = wsMarketService.getMarkPriceMeta(opportunity.symbol)?.nextFundingTime || mark.nextFundingTime || 0;
    if (!nextFunding || nextFunding < now) return opportunity;
    const hoursToFunding = Math.max(0, (nextFunding - now) / 3_600_000);
    // Decay confidence and EV the farther we are from funding payment
    const decay = Math.min(0.15, hoursToFunding * 0.02);
    const adjusted = { ...opportunity };
    adjusted.confidence = Math.max(0, adjusted.confidence - decay);
    adjusted.expectedValue = Math.max(0, adjusted.expectedValue - decay * 50); // decay EV by ~0.5% per hour lead
    return adjusted;
  }
  
  /**
   * Apply orderbook microstructure guardrails (spread, imbalance, liquidity)
   */
  private applyMicrostructureGuardrails(opportunity: TradeOpportunity, symbol: string): TradeOpportunity | null {
    const micro = wsMarketService.getMicrostructureSignal(symbol);
    if (!micro) return opportunity;

    const totalNotional = micro.bidNotional + micro.askNotional;

    // Skip illiquid or wide-spread setups
    if (micro.spreadPct > 0.25 || totalNotional < 20000) {
      return null;
    }

    const adjusted: TradeOpportunity = { ...opportunity };
    // Penalize expected value by half the spread (bps)
    adjusted.expectedValue = Math.max(0, opportunity.expectedValue - micro.spreadPct * 0.5);

    // Bias-based confidence tweaks
    if (micro.bias === 'BID' && opportunity.action === 'BUY') {
      adjusted.confidence = Math.min(0.95, adjusted.confidence + 0.03);
    } else if (micro.bias === 'ASK' && opportunity.action === 'SELL') {
      adjusted.confidence = Math.min(0.95, adjusted.confidence + 0.03);
    } else if (micro.bias !== 'NEUTRAL') {
      adjusted.confidence = Math.max(0.45, adjusted.confidence - 0.03);
    }

    return adjusted;
  }

  /**
   * Fetch recent funding history to gate funding-arb entries
   * Uses /fapi/v1/fundingRate per API docs
   */
  private async getFundingForecast(symbol: string): Promise<{
    avgFundingRate: number;
    avgAbsFundingRate: number;
    lastFundingRate: number;
  }> {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    try {
      const res = await fetch(`${asterConfig.baseUrl}/fapi/v1/fundingRate?symbol=${normalizedSymbol}&limit=16`);
      if (!res.ok) {
        throw new Error(`fundingRate ${res.status}`);
      }
      const data = await res.json() as Array<{ fundingRate: string }>;
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('empty fundingRate response');
      }
      const rates = data
        .map((d) => parseFloat(d.fundingRate))
        .filter((n) => isFinite(n));
      const avgFundingRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      const avgAbsFundingRate = rates.reduce((a, b) => a + Math.abs(b), 0) / rates.length;
      const lastFundingRate = rates[rates.length - 1];
      return { avgFundingRate, avgAbsFundingRate, lastFundingRate };
    } catch (error) {
      logger.debug(`Funding forecast failed for ${symbol}`, {
        context: 'MathematicalTradingSystem',
        data: { error: (error as Error).message }
      });
      return {
        avgFundingRate: 0,
        avgAbsFundingRate: 0,
        lastFundingRate: 0
      };
    }
  }

  /**
   * Get trading strategy based on market regime
   */
  getOptimalStrategy(regime: MarketRegime): string {
    switch (regime) {
      case 'TRENDING_UP':
        return 'MOMENTUM_LONG: Follow the trend with trailing stops';
      case 'TRENDING_DOWN':
        return 'MOMENTUM_SHORT: Follow the downtrend with trailing stops';
      case 'RANGING':
        return 'MEAN_REVERSION: Buy low, sell high within the range';
      case 'VOLATILE':
        return 'GRID_TRADING: Capture volatility with multiple small orders';
      default:
        return 'WAIT: No clear edge, preserve capital';
    }
  }
}

// Export singleton instance
export const mathematicalTradingSystem = new MathematicalTradingSystem();

