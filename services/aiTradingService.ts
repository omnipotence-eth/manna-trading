import { TradingSignal, MarketData } from '@/types/trading';
import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';
import { GodspeedModel } from './aiTradingModels';
import { AITradingModel } from '@/types/trading';
import { useStore } from '@/store/useStore';

// Global entry data map for trade journal
const globalEntryDataMap = new Map<string, any>();

/**
 * Trading service to manage all AI models
 */
class AITradingService {
  private model: GodspeedModel;
  private isRunning: boolean = false
  private intervalId: NodeJS.Timeout | null = null
  private positionMonitorInterval: NodeJS.Timeout | null = null
  private entryDataMap: Map<string, any> = globalEntryDataMap; // Use global map for trade journal
  private lastTradeTime: number = 0; // Track last trade time for cooling-off period

  constructor() {
    // Initialize Godspeed - our optimized trading strategy
    this.model = new GodspeedModel();
    logger.info('✅ Godspeed AI trading model initialized', { context: 'AITrading' });
  }

  private addModelMessage(message: string, type: 'analysis' | 'trade' | 'alert' = 'analysis') {
    const modelMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      model: 'Godspeed',
      message,
      timestamp: Date.now(),
      type
    };
    
    // Add to store
    useStore.getState().addModelMessage(modelMessage);
  }

  async start() {
    if (this.isRunning) {
      logger.warn('AI trading service already running', { context: 'AITrading' });
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting GODSPEED trading service', { context: 'AITrading' });

    // CONSERVATIVE: Longer trading frequency to prevent overtrading
    // 2 minutes = enough time for market movements to be meaningful
    // Prevents rapid-fire trading and reduces transaction costs
    this.intervalId = setInterval(() => {
      this.runTradingCycle();
    }, 120000); // Every 2 minutes for conservative frequency

    // 🔥 CRITICAL: Start high-frequency position monitoring
    this.startPositionMonitoring();

    logger.info('✅ CONSERVATIVE MODE ACTIVE [Cycle: 2min, Min Confidence: 65% (CONSERVATIVE), Leverage: MAX (20x-50x per coin), Margin: 25%, Risk/Reward: 1:2, Cooling-off: 5min] 🛡️', { context: 'AITrading' });
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.positionMonitorInterval) {
      clearInterval(this.positionMonitorInterval);
      this.positionMonitorInterval = null;
    }

    this.isRunning = false;
    logger.info('🛑 AI trading service stopped', { context: 'AITrading' });
  }

  /**
   * 🔥 HIGH-FREQUENCY POSITION MONITORING
   * Monitors positions every 10 seconds for stop-loss/take-profit execution
   * This ensures positions are closed quickly when they hit risk levels
   */
  private startPositionMonitoring(): void {
    // Monitor positions every 10 seconds (much faster than trading cycle)
    this.positionMonitorInterval = setInterval(async () => {
      try {
        await this.monitorPositions();
      } catch (error) {
        logger.error('Position monitoring error', error, { context: 'AITrading' });
      }
    }, 10000); // Every 10 seconds (optimized for speed)

    logger.info('🔥 High-frequency position monitoring started (10s intervals)', { 
      context: 'AITrading' 
    });
  }

  async analyze(symbol: string, marketData: MarketData): Promise<TradingSignal> {
    // Use Godspeed model for analysis
    return await this.model.analyze(symbol, marketData);
  }

  async runSingleCycle(): Promise<{ signals: TradingSignal[], bestSignal: TradingSignal | null }> {
    return await this.runTradingCycle();
  }

  private async runTradingCycle(): Promise<{ signals: TradingSignal[], bestSignal: TradingSignal | null }> {
    const signals: TradingSignal[] = [];
    
    try {
      // ⚡ SPEED OPTIMIZATION: Skip position monitoring if no positions exist
      const existingPositions = await asterDexService.getPositions(true); // Bust cache for fresh data
      if (existingPositions.length > 0) {
        await this.monitorPositions();
      } else {
        logger.debug(`⚡ No positions to monitor, skipping position monitoring for speed`, { context: 'AITrading' });
      }

      // Get all available trading pairs from Aster DEX
      const allSymbols = await asterDexService.getAllTradingPairs();
      
      // ⚡ ULTRA-FAST OPTIMIZATION: Analyze top 20 by 24h volume for sub-30s execution
      // This ensures we scan the most liquid/active markets in minimal time
      const symbols = allSymbols.slice(0, 20);
      
      logger.info(`📊 GODSPEED FAST SCAN: Analyzing top ${symbols.length} of ${allSymbols.length} pairs by volume`, { 
        context: 'AITrading',
        data: { 
          totalAvailable: allSymbols.length,
          analyzing: symbols.length,
          sample: symbols.slice(0, 10)
        }
      });

      // GODSPEED: Analyze top coins to find the single best opportunity
      let analyzedCount = 0;
      let skippedCount = 0;
      
      // Track execution time to avoid serverless timeout
      const startTime = Date.now();
      const MAX_EXECUTION_TIME = 25 * 1000; // 25 seconds (ultra-fast for Vercel)
      
      // ⚡ PARALLEL PROCESSING: Analyze symbols in batches for maximum speed
      const BATCH_SIZE = 5; // Process 5 symbols at once
      const allSignals: TradingSignal[] = [];
      
      // Process symbols in parallel batches
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        // Check if we're approaching timeout
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
          logger.warn(`⚠️ Approaching timeout, stopping analysis at ${analyzedCount} coins`, { context: 'AITrading' });
          break;
        }
        
        const batch = symbols.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (symbol) => {
          try {
            // ⚡ SPEED: Fetch ticker data only (includes current price)
            const tickerData = await asterDexService.getTicker(symbol);
            
            if (!tickerData || !tickerData.price || tickerData.price === 0) {
              return { symbol, skipped: true, reason: 'no ticker/price data' };
            }
            
            const currentPrice = tickerData.price;
            
            // ⚡ SPEED OPTIMIZATION: Use 24h data only to avoid slow klines API
            const recentPriceChange = tickerData.priceChangePercent;
            
            const marketData: MarketData = {
              currentPrice: currentPrice,
              previousPrice: tickerData?.previousPrice || currentPrice,
              movingAverage: tickerData?.movingAverage || currentPrice,
              volume: tickerData?.volume || 0,
              averageVolume: tickerData?.averageVolume || 0,
              priceChange: recentPriceChange,
              priceChange24h: tickerData.priceChangePercent,
              highPrice: tickerData?.highPrice || currentPrice,
              lowPrice: tickerData?.lowPrice || currentPrice,
              openPrice: tickerData?.openPrice || currentPrice,
              trades: tickerData?.trades || 0,
              quoteVolume: tickerData?.quoteVolume || 0,
            };

            // Analyze this symbol with Godspeed
            const signal = await this.model.analyze(symbol, marketData);
            
            return { symbol, signal, marketData };
          } catch (error) {
            return { symbol, skipped: true, reason: error instanceof Error ? error.message : String(error) };
          }
        });
        
        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Process results
        for (const result of batchResults) {
          if (result.skipped) {
            skippedCount++;
            logger.debug(`⏭️ Skipping ${result.symbol} - ${result.reason}`, { context: 'AITrading' });
          } else {
            analyzedCount++;
            
            // Only consider actionable signals (not HOLD)
            if (result.signal && result.signal.action !== 'HOLD') {
              allSignals.push(result.signal);
              
              logger.info(`🔍 Godspeed found opportunity [${result.symbol}]: ${result.signal.action} @ ${(result.signal.confidence * 100).toFixed(1)}% confidence`, {
                context: 'AITrading',
                data: { 
                  symbol: result.symbol,
                  action: result.signal.action, 
                  confidence: result.signal.confidence,
                  priceChange: result.marketData.priceChange,
                  volume: result.marketData.volume,
                  reasoning: result.signal.reasoning.substring(0, 100) + '...'
                },
              });
            }
          }
        }
      }
      
      logger.info(`📊 GODSPEED Analysis Complete: Analyzed ${analyzedCount} coins, Skipped ${skippedCount}, Found ${allSignals.length} opportunities`, {
        context: 'AITrading',
        data: {
          totalSymbols: symbols.length,
          analyzed: analyzedCount,
          skipped: skippedCount,
          opportunities: allSignals.length
        }
      });
      
      // 🧠 SEND SCANNING STATUS TO CHAT (so user can see Godspeed is working)
      try {
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const scanMessage = allSignals.length > 0
          ? `🔍 SCAN COMPLETE\n📊 Analyzed ${analyzedCount} coins\n💡 Found ${allSignals.length} opportunities\n\n🎯 Best Signal: ${allSignals.sort((a, b) => b.confidence - a.confidence)[0].symbol} @ ${(allSignals.sort((a, b) => b.confidence - a.confidence)[0].confidence * 100).toFixed(1)}%`
          : `🔍 SCAN COMPLETE\n📊 Analyzed ${analyzedCount} coins\n⚠️ No high-probability opportunities found\n💤 Market conditions not favorable`;
        
        await fetch(`${baseUrl}/api/model-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'Godspeed',
            type: 'analysis',
            message: scanMessage
          }),
        });
      } catch (error) {
        logger.error(`Failed to send scan status`, error, { context: 'AITrading' });
      }
      
      // 📊 DETAILED LOGGING: Show ALL opportunities found with confidence levels
      if (allSignals.length > 0) {
        const sortedByConfidence = [...allSignals].sort((a, b) => b.confidence - a.confidence);
        logger.info(`🔍 TOP 10 OPPORTUNITIES FOUND (sorted by confidence):`, {
          context: 'AITrading',
          data: {
            opportunities: sortedByConfidence.slice(0, 10).map(s => ({
              symbol: s.symbol,
              action: s.action,
              confidence: `${(s.confidence * 100).toFixed(1)}%`,
              tradeable: s.confidence >= 0.48 ? '✅ YES' : '❌ NO (too low)',
              reasoning: s.reasoning.substring(0, 120)
            }))
          }
        });
      } else {
        logger.info(`⚠️ NO OPPORTUNITIES FOUND - Market conditions not favorable`, { context: 'AITrading' });
      }

      // ⚡ ONE POSITION AT A TIME STRATEGY ⚡
      // Get current open positions - if we have any position open, DON'T open new ones
      // This maximizes margin usage: 100% margin on ONE high-conviction trade
      const openPositions = await asterDexService.getPositions();
      
      if (openPositions.length > 0) {
        logger.info(`🔒 POSITION MANAGEMENT: Already holding ${openPositions.length} position(s). Monitoring for exit...`, {
          context: 'AITrading',
          data: {
            openPositions: openPositions.map(p => ({
              symbol: p.symbol,
              side: p.side,
              pnl: p.unrealizedPnl.toFixed(2),
              roe: ((p.unrealizedPnl / ((p.entryPrice * p.size) / (p.leverage || 20))) * 100).toFixed(2) + '%'
            }))
          }
        });
        
        // Don't open new positions - let monitorPositions() handle exits
        return { signals: allSignals, bestSignal: null };
      }
      
      logger.info(`✅ NO OPEN POSITIONS - Scanning for best entry opportunity...`, {
        context: 'AITrading',
        data: {
          totalOpportunities: allSignals.length,
          strategy: 'ONE POSITION AT A TIME (100% MARGIN EACH)'
        }
      });
      
      // CONSERVATIVE: Check cooling-off period before selecting trades
      const COOLING_OFF_PERIOD = 5 * 60 * 1000; // 5 minutes between trades
      const timeSinceLastTrade = Date.now() - this.lastTradeTime;
      
      if (timeSinceLastTrade < COOLING_OFF_PERIOD) {
        logger.info(`⏰ COOLING-OFF PERIOD: ${Math.round((COOLING_OFF_PERIOD - timeSinceLastTrade) / 1000)}s remaining before next trade`, {
          context: 'AITrading',
          data: {
            timeSinceLastTrade: Math.round(timeSinceLastTrade / 1000),
            coolingOffPeriod: Math.round(COOLING_OFF_PERIOD / 1000),
            remaining: Math.round((COOLING_OFF_PERIOD - timeSinceLastTrade) / 1000)
          }
        });
        return { signals: allSignals, bestSignal: null };
      }
      
      // CONSERVATIVE: Select the BEST trade (we have no positions open)
      const bestSignal = this.selectMostProfitableSignal(allSignals);
      
      if (bestSignal) {
        // Update last trade time
        this.lastTradeTime = Date.now();
        logger.trade(`🚀 CONSERVATIVE BEST TRADE SELECTED: ${bestSignal.action} ${bestSignal.symbol} @ ${(bestSignal.confidence * 100).toFixed(1)}% confidence`, {
          context: 'AITrading',
          data: {
            symbol: bestSignal.symbol,
            action: bestSignal.action,
            size: bestSignal.size,
            confidence: bestSignal.confidence,
            reasoning: bestSignal.reasoning,
            totalAnalyzed: allSignals.length,
            totalCoins: symbols.length,
            currentPositions: 0,
            marginUtilization: '25% (CONSERVATIVE STRATEGY)'
          }
        });

        // Add trade execution message
        this.addModelMessage(`🚀 Executing trade: ${bestSignal.action} ${bestSignal.symbol} @ ${(bestSignal.confidence * 100).toFixed(1)}% confidence`, 'trade');
        
        // Execute the best available trade
        await this.executeTrade(bestSignal);
      } else {
        logger.info(`😴 CONSERVATIVE: No new profitable opportunities found among ${symbols.length} coins`, { context: 'AITrading' });
      }

      return { signals: allSignals, bestSignal };
    } catch (error) {
      logger.error('CONSERVATIVE trading cycle failed', error, { context: 'AITrading' });
      return { signals: [], bestSignal: null };
    }
  }

  /**
   * 🚀 MOMENTUM RUN DETECTION
   * Detects if a position is in a strong momentum run that should be allowed to continue
   * Uses multiple timeframes: 1m, 5m, 15m for rapid momentum detection
   */
  private async detectMomentumRun(position: any, currentPrice: number, currentROE: number): Promise<{
    isMomentum: boolean;
    strength: number;
    peakROE?: number;
  }> {
    try {
      // Get multi-timeframe data for momentum analysis
      const symbol = position.symbol;
      const [ticker, klines1m, klines5m, klines15m] = await Promise.all([
        asterDexService.getTicker(symbol),
        this.getKlines(symbol, '1m', 10), // Last 10 minutes
        this.getKlines(symbol, '5m', 6),  // Last 30 minutes
        this.getKlines(symbol, '15m', 4)  // Last hour
      ]);

      if (!ticker) {
        return { isMomentum: false, strength: 0 };
      }

      // Calculate momentum indicators across timeframes
      const momentumData = {
        // 1-minute momentum (ultra-short term)
        momentum1m: this.calculateMomentum(klines1m, 1),
        // 5-minute momentum (short term)
        momentum5m: this.calculateMomentum(klines5m, 5),
        // 15-minute momentum (medium term)
        momentum15m: this.calculateMomentum(klines15m, 15),
        // Current ticker data
        current: {
          priceChange24h: ticker.priceChangePercent || 0,
          volume24h: ticker.volume || 0,
          avgVolume: ticker.averageVolume || ticker.volume || 0,
          volumeRatio: ticker.averageVolume ? ticker.volume / ticker.averageVolume : 1
        }
      };

      // Enhanced momentum criteria with multi-timeframe analysis
      const criteria = {
        // ROE criteria
        highROE: currentROE >= 12.0, // Lowered threshold for earlier detection
        veryHighROE: currentROE >= 20.0, // Strong momentum indicator
        
        // Multi-timeframe trend alignment
        trendAlignment: this.checkTrendAlignment(momentumData),
        
        // Volume surge detection (multiple timeframes)
        volumeSurge1m: momentumData.momentum1m.volumeRatio >= 2.0, // 2x+ volume in 1m
        volumeSurge5m: momentumData.momentum5m.volumeRatio >= 1.8, // 1.8x+ volume in 5m
        volumeSurge15m: momentumData.momentum15m.volumeRatio >= 1.5, // 1.5x+ volume in 15m
        
        // Price momentum (rate of change)
        priceMomentum1m: momentumData.momentum1m.priceChange >= 1.0, // 1%+ in 1 minute
        priceMomentum5m: momentumData.momentum5m.priceChange >= 2.0, // 2%+ in 5 minutes
        priceMomentum15m: momentumData.momentum15m.priceChange >= 3.0, // 3%+ in 15 minutes
        
        // Sustained momentum
        sustainedMomentum: this.checkSustainedMomentum(momentumData),
        
        // Overall volume strength
        strongVolume: momentumData.current.volumeRatio >= 1.5
      };

      // Calculate momentum strength (0-100) with weighted scoring
      const strength = (
        (criteria.highROE ? 15 : 0) +           // Base ROE requirement
        (criteria.veryHighROE ? 10 : 0) +      // Bonus for very high ROE
        (criteria.trendAlignment ? 15 : 0) +    // Multi-timeframe alignment
        (criteria.volumeSurge1m ? 10 : 0) +     // 1m volume surge
        (criteria.volumeSurge5m ? 8 : 0) +      // 5m volume surge
        (criteria.volumeSurge15m ? 7 : 0) +     // 15m volume surge
        (criteria.priceMomentum1m ? 10 : 0) +   // 1m price momentum
        (criteria.priceMomentum5m ? 8 : 0) +    // 5m price momentum
        (criteria.priceMomentum15m ? 7 : 0) +   // 15m price momentum
        (criteria.sustainedMomentum ? 10 : 0) + // Sustained momentum bonus
        (criteria.strongVolume ? 5 : 0)         // Overall volume strength
      );

      const isMomentum = strength >= 60; // Lowered threshold for faster detection

      // Track peak ROE for trailing stops
      const peakROE = isMomentum ? Math.max(currentROE, this.getPeakROE(position.symbol)) : undefined;
      if (isMomentum && peakROE) {
        this.setPeakROE(position.symbol, peakROE);
      }

      logger.info(`🔍 Enhanced Momentum Analysis: ${position.symbol}`, {
        context: 'AITrading',
        data: {
          currentROE,
          strength,
          isMomentum,
          peakROE,
          criteria,
          momentumData: {
            '1m': momentumData.momentum1m,
            '5m': momentumData.momentum5m,
            '15m': momentumData.momentum15m
          }
        }
      });

      return { isMomentum, strength, peakROE };
    } catch (error) {
      logger.error('Failed to detect momentum run', error, { context: 'AITrading' });
      return { isMomentum: false, strength: 0 };
    }
  }

  /**
   * Get klines (candlestick data) for momentum analysis
   */
  private async getKlines(symbol: string, interval: string, limit: number): Promise<any[]> {
    try {
      // Use Aster DEX klines endpoint
      const response = await fetch(`https://fapi.asterdex.com/fapi/v1/klines?symbol=${symbol.replace('/', '')}&interval=${interval}&limit=${limit}`);
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data || [];
    } catch (error) {
      logger.error(`Failed to get ${interval} klines for ${symbol}`, error, { context: 'AITrading' });
      return [];
    }
  }

  /**
   * Calculate momentum metrics for a timeframe
   */
  private calculateMomentum(klines: any[], timeframeMinutes: number): {
    priceChange: number;
    volumeRatio: number;
    avgVolume: number;
    currentVolume: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  } {
    if (klines.length < 2) {
      return {
        priceChange: 0,
        volumeRatio: 1,
        avgVolume: 0,
        currentVolume: 0,
        trend: 'neutral'
      };
    }

    const first = klines[0];
    const last = klines[klines.length - 1];
    
    const openPrice = parseFloat(first[1]);
    const closePrice = parseFloat(last[4]);
    const priceChange = ((closePrice - openPrice) / openPrice) * 100;

    // Calculate volume metrics
    const volumes = klines.map(k => parseFloat(k[5]));
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // Determine trend
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (priceChange > 0.5) trend = 'bullish';
    else if (priceChange < -0.5) trend = 'bearish';

    return {
      priceChange,
      volumeRatio,
      avgVolume,
      currentVolume,
      trend
    };
  }

  /**
   * Check if all timeframes are aligned in the same direction
   */
  private checkTrendAlignment(momentumData: any): boolean {
    const trends = [
      momentumData.momentum1m.trend,
      momentumData.momentum5m.trend,
      momentumData.momentum15m.trend
    ];
    
    // Count bullish vs bearish trends
    const bullishCount = trends.filter(t => t === 'bullish').length;
    const bearishCount = trends.filter(t => t === 'bearish').length;
    
    // Require at least 2/3 timeframes aligned
    return bullishCount >= 2 || bearishCount >= 2;
  }

  /**
   * Check for sustained momentum across timeframes
   */
  private checkSustainedMomentum(momentumData: any): boolean {
    const momentum1m = momentumData.momentum1m.priceChange;
    const momentum5m = momentumData.momentum5m.priceChange;
    const momentum15m = momentumData.momentum15m.priceChange;

    // All timeframes showing positive momentum
    return momentum1m > 0 && momentum5m > 0 && momentum15m > 0;
  }

  // Simple in-memory storage for peak ROE tracking
  private peakROECache = new Map<string, number>();

  private getPeakROE(symbol: string): number {
    return this.peakROECache.get(symbol) || 0;
  }

  private setPeakROE(symbol: string, roe: number): void {
    this.peakROECache.set(symbol, roe);
  }

  private async monitorPositions(): Promise<void> {
    try {
      const positions = await asterDexService.getPositions(true); // Bust cache for fresh data
      
      if (positions.length === 0) {
        logger.debug('📊 No positions to monitor', { context: 'AITrading' });
        return;
      }

      logger.info(`📊 Monitoring ${positions.length} positions for stop-loss/take-profit`, { 
        context: 'AITrading',
        data: { positions: positions.map(p => ({ symbol: p.symbol, side: p.side, pnl: p.unrealizedPnl })) }
      });

      for (const position of positions) {
        const currentPrice = await asterDexService.getPrice(position.symbol);
        const entryPrice = position.entryPrice;
        const leverage = position.leverage || 5;
        
        // Calculate ROE (Return on Equity) - accounts for leverage
        const positionValue = position.size * entryPrice;
        const marginUsed = positionValue / leverage;
        const roePnlPercent = (position.unrealizedPnl / marginUsed) * 100;
        
        // Calculate price-based P&L
        let pricePnlPercent = 0;
        if (position.side === 'LONG') {
          pricePnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        } else {
          pricePnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
        }
        
        logger.info(`🔍 Position Analysis: ${position.symbol} ${position.side}`, {
          context: 'AITrading',
          data: {
            entryPrice,
            currentPrice,
            leverage,
            roePnlPercent,
            pricePnlPercent,
            unrealizedPnl: position.unrealizedPnl
          }
        });
        
          let shouldClose = false;
          let reason = '';
          
          // MARGIN-BASED RISK MANAGEMENT: 1% stop-loss/take-profit of margin (CONSERVATIVE)
          // Calculate P&L as percentage of margin used
          const marginPnlPercent = (position.unrealizedPnl / marginUsed) * 100;
          
          // CONSERVATIVE RISK MANAGEMENT: Wider stop-loss/take-profit to prevent rapid losses
          // Stop-loss at -3% of margin (more room for normal volatility)
          if (marginPnlPercent <= -3.0) {
            shouldClose = true;
            reason = `🛑 STOP-LOSS: Margin down ${marginPnlPercent.toFixed(2)}% (threshold: -3.0%)`;
          }
          // 🚀 MOMENTUM RUN CONDITION: Enhanced profit-taking for strong trends
          else if (marginPnlPercent >= 6.0) {
            // Check if this is a momentum run (strong trend + high volume + high ROE)
            const isMomentumRun = await this.detectMomentumRun(position, currentPrice, marginPnlPercent);
            
            if (isMomentumRun.isMomentum) {
              // Dynamic trailing stop based on momentum strength
              const peakROE = isMomentumRun.peakROE || marginPnlPercent;
              const momentumStrength = isMomentumRun.strength;
              
              // More aggressive trailing for stronger momentum
              let trailingDistance = 5.0; // Default 5% trailing
              if (momentumStrength >= 80) {
                trailingDistance = 3.0; // Tighter trailing for very strong momentum
              } else if (momentumStrength >= 70) {
                trailingDistance = 4.0; // Medium trailing
              }
              
              const trailingStopLevel = Math.max(12.0, peakROE - trailingDistance);
              
              // Check if we should close due to trailing stop
              if (marginPnlPercent <= trailingStopLevel) {
                shouldClose = true;
                reason = `🚀 MOMENTUM TRAILING STOP: ${marginPnlPercent.toFixed(2)}% (peak: ${peakROE.toFixed(2)}%, trailing: ${trailingStopLevel.toFixed(2)}%, strength: ${momentumStrength})`;
              } else {
                logger.info(`🚀 MOMENTUM RUN DETECTED: ${position.symbol} ${position.side} - Letting run continue`, {
                  context: 'AITrading',
                  data: {
                    currentROE: marginPnlPercent,
                    peakROE: peakROE,
                    momentumStrength: momentumStrength,
                    trailingStop: trailingStopLevel,
                    trailingDistance: trailingDistance,
                    timeframes: '1m/5m/15m analysis'
                  }
                });
                return; // Skip closing, let momentum continue
              }
            } else {
              // Normal take-profit at +6%
              shouldClose = true;
              reason = `💰 TAKE-PROFIT: Margin up ${marginPnlPercent.toFixed(2)}% (threshold: +6.0%)`;
            }
          }
        
        if (shouldClose) {
          logger.trade(`🚨 CLOSING POSITION: ${position.symbol} ${position.side} - ${reason}`, {
            context: 'AITrading',
            data: {
              symbol: position.symbol,
              side: position.side,
              roePnlPercent,
              reason
            }
          });
          
          // Close the position
          try {
            // 🔍 TIER 3: Double-check position still exists on exchange before closing
            const freshPositions = await asterDexService.getPositions(true); // Bust cache for freshest data
            const positionStillExists = freshPositions.some(p => p.symbol === position.symbol && p.side === position.side);
            
            if (!positionStillExists) {
              logger.warn(`⚠️ Position ${position.symbol} ${position.side} already closed on exchange. Skipping close order.`, {
                context: 'AITrading',
                data: { symbol: position.symbol, side: position.side }
              });
              return; // Exit early - position already closed
            }
            
            const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
            
            // 🎯 FIX: Round close quantity to correct precision to avoid ReduceOnly rejection
            let closeQuantity = Math.abs(position.size); // Ensure positive
            const precisionInfo = await asterDexService.getSymbolPrecision(position.symbol);
            if (precisionInfo) {
              closeQuantity = asterDexService.roundQuantity(closeQuantity, precisionInfo.quantityPrecision);
              logger.info(`🎯 Close quantity adjusted: ${position.size} → ${closeQuantity} (precision: ${precisionInfo.quantityPrecision})`, {
                context: 'AITrading',
                data: { 
                  original: position.size, 
                  rounded: closeQuantity, 
                  precision: precisionInfo.quantityPrecision 
                }
              });
            }
            
            const closeOrder = await asterDexService.placeMarketOrder(
              position.symbol,
              closeSide,
              closeQuantity,
              leverage,
              true // reduceOnly
            );
            
            logger.trade(`✅ Position closed: ${position.symbol} ${position.side}`, {
              context: 'AITrading',
              data: { symbol: position.symbol, side: position.side, reason }
            });

            // 💾 SAVE COMPLETED TRADE TO DATABASE
            if (closeOrder) {
              // Get fresh account data to get the REAL P&L from exchange
              const accountInfo = await asterDexService.getAccountInfo();
              const currentPrice = await asterDexService.getPrice(position.symbol);
              
              // Calculate ACTUAL P&L from entry/exit prices
              // For SHORT: profit when price goes DOWN (entry - exit)
              // For LONG: profit when price goes UP (exit - entry)
              const priceDiff = position.side === 'SHORT' 
                ? (position.entryPrice - currentPrice) // SHORT profits when price drops
                : (currentPrice - position.entryPrice); // LONG profits when price rises
              
              const actualPnl = priceDiff * position.size;
              const margin = (position.entryPrice * position.size) / (position.leverage || leverage);
              const actualRoePnlPercent = margin > 0 ? (actualPnl / margin) * 100 : 0;
              
              logger.info(`💰 CALCULATED P&L: Price ${position.side === 'SHORT' ? 'dropped' : 'rose'} by $${Math.abs(priceDiff).toFixed(4)} × ${position.size.toFixed(2)} = $${actualPnl.toFixed(2)} (${actualRoePnlPercent.toFixed(2)}% ROE)`, {
                context: 'AITrading',
                data: { 
                  symbol: position.symbol,
                  side: position.side,
                  entryPrice: position.entryPrice,
                  exitPrice: currentPrice,
                  priceDiff,
                  size: position.size,
                  actualPnl,
                  positionUnrealizedPnl: position.unrealizedPnl
                }
              });
              
              const completedTrade = {
                id: `trade-close-${closeOrder.orderId}-${Date.now()}`,
                symbol: position.symbol,
                side: position.side === 'LONG' ? 'BUY' : 'SELL', // Original side
                entryPrice: position.entryPrice,
                exitPrice: currentPrice,
                size: position.size,
                timestamp: new Date().toISOString(),
                leverage: position.leverage || leverage,
                pnl: actualPnl, // Use calculated P&L instead of position.unrealizedPnl
                status: 'completed' as const,
                orderId: closeOrder.orderId,
                model: 'Godspeed',
                exitReason: reason,
              };

              try {
                const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
                const response = await fetch(`${baseUrl}/api/trades`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(completedTrade),
                });
                
                if (response.ok) {
                  logger.info(`💾 Completed trade saved to database: ${position.symbol} | P&L: $${actualPnl.toFixed(2)}`, { context: 'AITrading' });
                } else {
                  const errorText = await response.text();
                  logger.error(`Failed to save trade: ${errorText}`, null, { context: 'AITrading' });
                }
              } catch (error) {
                logger.error(`Failed to save completed trade`, error, { context: 'AITrading' });
              }

              // 🧠 SEND CLOSE MESSAGE TO TRADES TAB (not chat - this is trade data)
              try {
                const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
                const pnlColor = actualPnl >= 0 ? '💚' : '❤️';
                const messagePayload = {
                  model: 'Godspeed',
                  type: 'trade',
                  message: `${pnlColor} CLOSED ${position.symbol} ${position.side}\n💰 P&L: ${actualPnl >= 0 ? '+' : ''}$${actualPnl.toFixed(2)} (${actualRoePnlPercent >= 0 ? '+' : ''}${actualRoePnlPercent.toFixed(2)}% ROE)\n\n🚨 REASON:\n${reason}\n\n📊 Entry: $${position.entryPrice.toFixed(2)} → Exit: $${currentPrice.toFixed(2)}`,
                };

                await fetch(`${baseUrl}/api/model-message`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(messagePayload),
                });
              } catch (error) {
                logger.error(`Failed to send close message`, error, { context: 'AITrading' });
              }
            }
          } catch (error: any) {
            // 🛡️ TIER 1: Handle "ReduceOnly rejected" gracefully (position already closed)
            const errorMessage = error?.message || String(error);
            if (errorMessage.includes('ReduceOnly Order is rejected') || errorMessage.includes('-2022')) {
              logger.warn(`⚠️ ReduceOnly rejected for ${position.symbol} ${position.side} - position likely already closed. Clearing from monitoring.`, {
                context: 'AITrading',
                data: { symbol: position.symbol, side: position.side, error: errorMessage }
              });
              
              // Position is already closed on exchange, no action needed
              // The next monitoring cycle will fetch fresh positions and won't see this one
              return;
            }
            
            // For other errors, log and continue
            logger.error(`Failed to close position ${position.symbol}`, error, { context: 'AITrading' });
          } finally {
            // 🔄 TIER 2: Force refresh position cache after any close attempt
            // This ensures next cycle has fresh data from exchange
            try {
              // Clear the cached positions by fetching fresh ones (with cache bust)
              await asterDexService.getPositions(true);
              logger.info(`✅ Position cache refreshed after close attempt for ${position.symbol}`, {
                context: 'AITrading',
                data: { symbol: position.symbol }
              });
            } catch (refreshError) {
              logger.error(`Failed to refresh position cache`, refreshError, { context: 'AITrading' });
            }
          }
        } else {
          logger.debug(`📊 Position ${position.symbol} ${position.side} within limits (ROE: ${roePnlPercent.toFixed(2)}%)`, {
            context: 'AITrading'
          });
        }
      }
    } catch (error) {
      logger.error('Position monitoring failed', error, { context: 'AITrading' });
    }
  }

  private selectMostProfitableSignal(signals: TradingSignal[]): TradingSignal | null {
    if (signals.length === 0) {
      logger.info(`❌ No trading opportunities found - all coins returned HOLD signals`, { context: 'AITrading' });
      return null;
    }

    // GODSPEED MAXIMUM POWER: Select best trade with 100% margin utilization
    // Sort by confidence (highest first) to get the absolute best opportunity
    const sortedSignals = signals.sort((a, b) => b.confidence - a.confidence);
    const bestSignal = sortedSignals[0];
    
    // Analyze confidence distribution to understand why only certain coins trade
    const confidenceRanges = {
      high: sortedSignals.filter(s => s.confidence >= 0.55).length,
      medium: sortedSignals.filter(s => s.confidence >= 0.4 && s.confidence < 0.55).length,
      low: sortedSignals.filter(s => s.confidence < 0.4).length
    };
    
    logger.info(`📊 Confidence Distribution Analysis:`, {
      context: 'AITrading',
      data: {
        total: sortedSignals.length,
        highConfidence: `${confidenceRanges.high} (55%+) ✅ TRADEABLE`,
        mediumConfidence: `${confidenceRanges.medium} (40-55%) ⚠️ TOO RISKY`,
        lowConfidence: `${confidenceRanges.low} (<40%) ❌ REJECTED`,
        bestConfidence: (bestSignal.confidence * 100).toFixed(1) + '%'
      }
    });
    
    // Log top 10 opportunities for analysis
    const top10 = sortedSignals.slice(0, 10);
    logger.info(`🏆 Top 10 Trading Opportunities (by confidence):`, {
      context: 'AITrading',
      data: {
        opportunities: top10.map((s, i) => ({
          rank: i + 1,
          symbol: s.symbol,
          action: s.action,
          confidence: (s.confidence * 100).toFixed(1) + '%',
          tradeable: s.confidence >= 0.55 ? '✅ YES' : '❌ NO',
          reasoning: s.reasoning.substring(0, 80) + '...'
        }))
      }
    });
    
      // 🎯 CONSERVATIVE TRADING: Only take HIGH-CONFIDENCE trades with 65%+ confidence
      // This reduces the number of losing trades and focuses on quality opportunities
      if (bestSignal.confidence >= 0.65) {
        bestSignal.size = 0.25; // 25% of available margin - CONSERVATIVE MODE
        logger.info(`✅ TRADE APPROVED: ${bestSignal.symbol} @ ${(bestSignal.confidence * 100).toFixed(1)}% confidence [CONSERVATIVE]`, {
          context: 'AITrading',
          data: {
            symbol: bestSignal.symbol,
            action: bestSignal.action,
            confidence: (bestSignal.confidence * 100).toFixed(1) + '%',
            reasoning: bestSignal.reasoning,
            mode: 'CONSERVATIVE (65%+ threshold, 25% margin)'
          }
        });
        
        logger.info(`🎯 CONSERVATIVE SELECTED #1: ${bestSignal.symbol} ${bestSignal.action} @ ${(bestSignal.confidence * 100).toFixed(1)}% [CONSERVATIVE: 25%]`, {
          context: 'AITrading',
          data: {
            winner: {
              symbol: bestSignal.symbol,
              action: bestSignal.action,
              confidence: (bestSignal.confidence * 100).toFixed(1) + '%',
              reasoning: bestSignal.reasoning
            },
            totalOpportunities: signals.length,
            positionSize: '25% (CONSERVATIVE)',
            leverage: 'MAX (20x-50x per coin)',
            runnerUps: sortedSignals.slice(1, 4).map(s => ({ 
              symbol: s.symbol, 
              action: s.action, 
              confidence: (s.confidence * 100).toFixed(1) + '%',
              reason: 'Lower confidence than winner'
            }))
          }
        });
        
        return bestSignal; // 🔥 CRITICAL FIX: Return the approved signal!
      } else {
        // Reject very low confidence trades
        logger.info(`⏭️ SKIPPING - Need 65%+ confidence (got ${(bestSignal.confidence * 100).toFixed(1)}%): ${bestSignal.symbol} ${bestSignal.action}`, {
          context: 'AITrading',
          data: {
            symbol: bestSignal.symbol,
            confidence: (bestSignal.confidence * 100).toFixed(1) + '%',
            threshold: '65%',
            reasoning: bestSignal.reasoning
          }
        });
        return null;
      }
  }

  private async executeTrade(signal: TradingSignal): Promise<void> {
    try {
      // GODSPEED DYNAMIC MAXIMUM LEVERAGE: Get the actual max leverage for this specific coin
      const maxLeverage = await asterDexService.getMaxLeverage(signal.symbol);
      
      // Get available balance to calculate actual position size
      const accountInfo = await asterDexService.getAccountInfo();
      const availableBalance = accountInfo?.availableBalance || 0;
      
      if (availableBalance <= 0) {
        logger.warn(`⚠️ No available balance to trade`, { context: 'AITrading' });
        return;
      }
      
      // Additional validation for negative wallet balance scenarios
      if (availableBalance < 5) { // Minimum 5 USDT required for trading
        logger.warn(`⚠️ Insufficient available balance for trading: ${availableBalance} USDT (minimum: 5 USDT)`, { 
          context: 'AITrading',
          data: { availableBalance, minimum: 5 }
        });
        return;
      }
      
      // Get current price for the symbol
      const currentPrice = await asterDexService.getPrice(signal.symbol);
      if (currentPrice <= 0) {
        logger.warn(`⚠️ Invalid price for ${signal.symbol}`, { context: 'AITrading' });
        return;
      }
      
      // CONSERVATIVE POSITION SIZING: Use only 25% of available margin to limit risk
      // This prevents catastrophic losses from single trades
      const allocationPercent = 0.25; // 25% - CONSERVATIVE POSITION SIZING
      
      // FUTURES TRADING CALCULATION:
      // availableBalance = margin available for new positions
      // positionValue = margin × leverage = total position size in USDT
      // quantity = positionValue / currentPrice = amount of base asset to buy
      
      // 🛡️ CONSERVATIVE SAFETY BUFFER: Use 95% of allocated margin to account for:
      // - Trading fees (~0.04% maker/taker)
      // - Price slippage during execution
      // - Exchange liquidation buffer requirements
      const SAFETY_MARGIN_PERCENT = 0.95; // 95% of allocated margin for safety
      const marginToUse = availableBalance * allocationPercent * SAFETY_MARGIN_PERCENT; // 90% of available margin
      const positionValue = marginToUse * maxLeverage; // Position size = margin × leverage
      let quantity = positionValue / currentPrice; // Convert USDT position to base asset quantity
      
      // 🎯 PRECISION FIX: Round quantity and cap at maximum to match exchange requirements
      const precisionInfo = await asterDexService.getSymbolPrecision(signal.symbol);
      if (precisionInfo) {
        const originalQuantity = quantity;
        const maxQty = precisionInfo.maxQty;
        
        // Round to precision first
        quantity = asterDexService.roundQuantity(quantity, precisionInfo.quantityPrecision);
        
        // 🚨 MINIMUM ORDER SIZE CHECK: Ensure notional value is at least $5
        const notionalValue = quantity * currentPrice;
        if (notionalValue < 5.0) {
          logger.warn(`⚠️ Order notional ${notionalValue.toFixed(2)} below $5 minimum for ${signal.symbol}, adjusting quantity`, {
            context: 'AITrading',
            data: {
              notionalValue: notionalValue.toFixed(2),
              minimum: 5.0,
              symbol: signal.symbol
            }
          });
          // Calculate minimum quantity needed for $5 notional
          const minQuantity = 5.0 / currentPrice;
          quantity = asterDexService.roundQuantity(minQuantity, precisionInfo.quantityPrecision);
          
          // Recalculate position value with adjusted quantity
          const adjustedNotional = quantity * currentPrice;
          logger.info(`📊 Adjusted order: ${quantity.toFixed(8)} qty × $${currentPrice.toFixed(2)} = $${adjustedNotional.toFixed(2)} notional`, {
            context: 'AITrading',
            data: {
              adjustedQty: quantity,
              price: currentPrice,
              adjustedNotional: adjustedNotional
            }
          });
        }
        
        // Cap at maximum allowed quantity for this symbol
        if (quantity > maxQty) {
          logger.warn(`⚠️ Quantity ${quantity.toFixed(8)} exceeds max ${maxQty} for ${signal.symbol}, capping to maximum`, {
            context: 'AITrading',
            data: {
              requestedQty: quantity,
              maxQty,
              symbol: signal.symbol
            }
          });
          quantity = asterDexService.roundQuantity(maxQty, precisionInfo.quantityPrecision); // Cap and re-round
        }
        
        // Additional safety check: Ensure quantity doesn't exceed 100 for any symbol
        if (quantity > 100) {
          logger.warn(`⚠️ Quantity ${quantity.toFixed(8)} exceeds 100 limit for ${signal.symbol}, capping to 100`, {
            context: 'AITrading',
            data: {
              requestedQty: quantity,
              maxAllowed: 100,
              symbol: signal.symbol
            }
          });
          quantity = asterDexService.roundQuantity(100, precisionInfo.quantityPrecision); // Cap to 100 and re-round
        }
        
        logger.info(`🎯 Quantity adjusted for ${signal.symbol}: ${originalQuantity.toFixed(8)} → ${quantity.toFixed(8)} (precision: ${precisionInfo.quantityPrecision} decimals, max: ${maxQty}, capped: ${quantity === maxQty})`, {
          context: 'AITrading',
          data: { 
            original: originalQuantity, 
            rounded: quantity, 
            precision: precisionInfo.quantityPrecision,
            maxQty,
            wasCapped: quantity === maxQty
          }
        });
      }
      
      logger.debug(`📊 Position Calculation:`, {
        context: 'AITrading',
        data: {
          availableBalance: availableBalance.toFixed(2),
          marginToUse: marginToUse.toFixed(2),
          maxLeverage: maxLeverage,
          positionValue: positionValue.toFixed(2),
          currentPrice: currentPrice.toFixed(6),
          quantity: quantity
        }
      });
      
      // Calculate margin efficiency
      const marginEfficiency = (positionValue / availableBalance) * 100;
      
      logger.trade(`🛡️ CONSERVATIVE EXECUTING: ${signal.action} ${signal.symbol}
💯 MARGIN: $${marginToUse.toFixed(2)} (25% of $${availableBalance.toFixed(2)} available - conservative sizing)
⚡ LEVERAGE: ${maxLeverage}x (MAXIMUM for ${signal.symbol})
💰 POSITION VALUE: $${positionValue.toFixed(2)} (${marginEfficiency.toFixed(0)}x leverage multiplier)
🎯 CONFIDENCE: ${(signal.confidence * 100).toFixed(0)}%
📦 QUANTITY: ${quantity} @ $${currentPrice.toFixed(2)}
📊 CALCULATION: ${marginToUse.toFixed(2)} margin × ${maxLeverage}x leverage ÷ ${currentPrice.toFixed(2)} price = ${quantity} quantity
🛡️ CONSERVATIVE: 25% margin usage, 5min cooling-off`, {
        context: 'AITrading',
        data: {
          symbol: signal.symbol,
          action: signal.action,
          availableBalance: availableBalance.toFixed(2),
          marginUsed: marginToUse.toFixed(2),
          allocationPercent: '100%',
          confidence: (signal.confidence * 100).toFixed(0) + '%',
          leverage: maxLeverage,
          currentPrice: currentPrice.toFixed(6),
          positionValue: positionValue.toFixed(2),
          quantity: quantity.toFixed(8),
          reasoning: signal.reasoning,
          mode: '100% MARGIN + MAX LEVERAGE'
        }
      });

      // Place the trade using Aster DEX with MAXIMUM LEVERAGE + 100% MARGIN
      // Formula: Position Value = (Balance × 100%) × MAX_LEVERAGE / Price
      // Example: $100 × 50x = $5,000 position (100% margin, 50x leverage)
      
      // Type guard: ensure signal.action is BUY or SELL (never HOLD at this point)
      if (signal.action === 'HOLD') {
        logger.error(`❌ Unexpected HOLD signal in executeTrade: ${signal.symbol}`, { context: 'AITrading' });
        return;
      }
      
      const order = await asterDexService.placeMarketOrder(
        signal.symbol,
        signal.action as 'BUY' | 'SELL',
        quantity, // Quantity = (balancePerTrade × maxLeverage) / currentPrice
        maxLeverage, // ✅ MAXIMUM leverage per coin from exchange (dynamic 20x-100x)
        false // Not reduce-only (opening new position)
      );

      if (order) {
          logger.trade(`✅ GODSPEED TRADE EXECUTED: ${signal.action} ${signal.symbol}
🎯 ${maxLeverage}x LEVERAGE | $${marginToUse.toFixed(2)} MARGIN → $${positionValue.toFixed(2)} POSITION
📦 ${quantity.toFixed(8)} QTY @ $${currentPrice.toFixed(2)} = $${positionValue.toFixed(2)} NOTIONAL
💯 100% MARGIN DEPLOYED 🚀`, {
            context: 'AITrading',
            data: { 
              orderId: order.orderId, 
              symbol: signal.symbol, 
              side: signal.action, 
              leverage: maxLeverage, 
              availableBalance: availableBalance.toFixed(2),
              marginUsed: marginToUse.toFixed(2),
              allocationPercent: '100%',
              confidence: (signal.confidence * 100).toFixed(0) + '%',
              positionValue: positionValue.toFixed(2),
              quantity: quantity.toFixed(8),
              currentPrice: currentPrice.toFixed(6),
              mode: '100% MARGIN + MAX LEVERAGE'
            }
          });

          // 🎯 SAVE TRADE ENTRY TO DATABASE (for trade journal and tracking)
          const tradeRecord = {
            id: `trade-${order.orderId}-${Date.now()}`,
            symbol: signal.symbol,
            side: signal.action,
            entryPrice: currentPrice,
            size: quantity,
            timestamp: new Date().toISOString(),
            leverage: maxLeverage,
            pnl: 0, // Will be updated when position closes
            status: 'open' as const,
            orderId: order.orderId,
            model: 'Godspeed',
            confidence: signal.confidence,
            reasoning: signal.reasoning,
          };

          // Save to database via API
          try {
            const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
            const response = await fetch(`${baseUrl}/api/trades`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(tradeRecord),
            });
            
            if (response.ok) {
              logger.info(`💾 Trade entry saved to database: ${signal.symbol}`, { context: 'AITrading' });
            } else {
              logger.warn(`⚠️ Failed to save trade entry to database`, { context: 'AITrading' });
            }
          } catch (error) {
            logger.error(`Failed to save trade entry`, error, { context: 'AITrading' });
          }

          // 🧠 SEND TRADE DECISION TO FRONTEND (Model Chat)
          try {
            const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
            const messagePayload = {
              model: 'Godspeed',
              type: 'trade',
              message: `🚀 ${signal.action} ${signal.symbol}\n💰 ${maxLeverage}x Leverage | $${positionValue.toFixed(2)} Position\n🎯 Confidence: ${(signal.confidence * 100).toFixed(0)}%\n\n📊 REASONING:\n${signal.reasoning}\n\n📈 Entry: $${currentPrice.toFixed(2)} | Qty: ${quantity.toFixed(4)}\n💼 Margin Used: $${marginToUse.toFixed(2)} (100%)`,
            };

            await fetch(`${baseUrl}/api/model-message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(messagePayload),
            });
          } catch (error) {
            logger.error(`Failed to send model message`, error, { context: 'AITrading' });
          }
      } else {
        logger.error(`❌ Failed to execute trade: ${signal.action} ${signal.symbol}`, { context: 'AITrading' });
      }
    } catch (error) {
      logger.error(`Failed to execute trade: ${signal.action} ${signal.symbol}`, error, { context: 'AITrading' });
    }
  }

  /**
   * Get trading service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      model: 'Godspeed',
      version: '2.0.0'
    };
  }

  /**
   * Get performance metrics (for backwards compatibility with API)
   */
  getPerformanceMetrics() {
    return {
      model: 'Godspeed',
      version: '2.0.0',
      isRunning: this.isRunning,
      message: 'Use /api/trades endpoint for detailed metrics'
    };
  }

  /**
   * Update configuration (for backwards compatibility with API)
   */
  updateConfig(config: any) {
    logger.info('Config update requested but ignored - v2.0 uses hardcoded optimal config', { 
      context: 'AITrading',
      data: config 
    });
    // Configuration is hardcoded for optimal performance in v2.0
    // This method exists for API compatibility only
  }
}

// Export the service instance
export const aiTradingService = new AITradingService();