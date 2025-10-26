import { TradingSignal, MarketData } from '@/types/trading';
import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';
import { GodspeedModel } from './aiTradingModels';
import { AITradingModel } from '@/types/trading';

// Global entry data map for trade journal
const globalEntryDataMap = new Map<string, any>();

/**
 * Trading service to manage all AI models
 */
class AITradingService {
  private model: GodspeedModel;
  private isRunning: boolean = false
  private intervalId: NodeJS.Timeout | null = null
  private entryDataMap: Map<string, any> = globalEntryDataMap; // Use global map for trade journal

  constructor() {
    // Initialize Godspeed - our optimized trading strategy
    this.model = new GodspeedModel();
    logger.info('✅ Godspeed AI trading model initialized', { context: 'AITrading' });
  }

  async start() {
    if (this.isRunning) {
      logger.warn('AI trading service already running', { context: 'AITrading' });
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting GODSPEED trading service', { context: 'AITrading' });

    // GODSPEED: Strategic trading frequency - balance between opportunity and quality
    // 30 seconds = enough time for market movements to be meaningful
    // Prevents overtrading and gives signals time to develop
    this.intervalId = setInterval(() => {
      this.runTradingCycle();
    }, 30000); // Every 30 seconds for balanced frequency

    logger.info('✅ GODSPEED ACTIVE [Cycle: 30s, Min Confidence: 50% (AGGRESSIVE), Leverage: MAX (20x-50x per coin), Margin: 100%, Risk/Reward: 1:3, Strong Momentum Boost: ON] 🚀', { context: 'AITrading' });
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('🛑 AI trading service stopped', { context: 'AITrading' });
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
      // First, monitor existing positions for stop-loss/take-profit
      await this.monitorPositions();

      // Get all available trading pairs from Aster DEX
      const allSymbols = await asterDexService.getAllTradingPairs();
      
      // ⚡ PERFORMANCE OPTIMIZATION: Analyze top 50 by 24h volume to avoid serverless timeout
      // This ensures we scan the most liquid/active markets first
      const symbols = allSymbols.slice(0, 50);
      
      logger.info(`📊 GODSPEED FAST SCAN: Analyzing top ${symbols.length} of ${allSymbols.length} pairs by volume`, { 
        context: 'AITrading',
        data: { 
          totalAvailable: allSymbols.length,
          analyzing: symbols.length,
          sample: symbols.slice(0, 10)
        }
      });

      // GODSPEED: Analyze top coins to find the single best opportunity
      const allSignals: TradingSignal[] = [];
      let analyzedCount = 0;
      let skippedCount = 0;
      
      // Track execution time to avoid serverless timeout
      const startTime = Date.now();
      const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes (leave 30s buffer)
      
      // Analyze each symbol to find the absolute best trade
      for (const symbol of symbols) {
        // Check if we're approaching timeout
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
          logger.warn(`⚠️ Approaching timeout, stopping analysis at ${analyzedCount} coins`, { context: 'AITrading' });
          break;
        }
        try {
          // ⚡ SPEED: Fetch ticker data only (includes current price)
          const tickerData = await asterDexService.getTicker(symbol);
          
          if (!tickerData || !tickerData.price || tickerData.price === 0) {
            skippedCount++;
            logger.debug(`⏭️ Skipping ${symbol} - no ticker/price data`, { context: 'AITrading' });
            continue;
          }
          
          const currentPrice = tickerData.price;
          
          // ⚡ SPEED OPTIMIZATION: Use 24h data only to avoid slow klines API
          // The rapid movement boost logic in the model will still work with 24h data
          const recentPriceChange = tickerData.priceChangePercent;
          
          const marketData: MarketData = {
            currentPrice: currentPrice,
            previousPrice: tickerData?.previousPrice || currentPrice,
            movingAverage: tickerData?.movingAverage || currentPrice,
            volume: tickerData?.volume || 0,
            averageVolume: tickerData?.averageVolume || 0,
            priceChange: recentPriceChange, // ✅ SHORT-TERM MOMENTUM (5min)
            priceChange24h: tickerData.priceChangePercent, // 24h change for comparison
            highPrice: tickerData?.highPrice || currentPrice,
            lowPrice: tickerData?.lowPrice || currentPrice,
            openPrice: tickerData?.openPrice || currentPrice,
            trades: tickerData?.trades || 0,
            quoteVolume: tickerData?.quoteVolume || 0,
          };

          analyzedCount++;

          // Analyze this symbol with Godspeed
          const signal = await this.model.analyze(symbol, marketData);
          
          // Only consider actionable signals (not HOLD)
          if (signal.action !== 'HOLD') {
            allSignals.push(signal);
            
            logger.info(`🔍 Godspeed found opportunity [${symbol}]: ${signal.action} @ ${(signal.confidence * 100).toFixed(1)}% confidence`, {
              context: 'AITrading',
              data: { 
                symbol,
                action: signal.action, 
                confidence: signal.confidence,
                priceChange: marketData.priceChange,
                volume: marketData.volume,
                reasoning: signal.reasoning.substring(0, 100) + '...'
              },
            });
          }
        } catch (error) {
          skippedCount++;
          logger.warn(`Failed to analyze ${symbol}: ${error}`, { context: 'AITrading' });
          continue;
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
              tradeable: s.confidence >= 0.50 ? '✅ YES' : '❌ NO (too low)',
              reasoning: s.reasoning.substring(0, 120)
            }))
          }
        });
      } else {
        logger.info(`⚠️ NO OPPORTUNITIES FOUND - Market conditions not favorable`, { context: 'AITrading' });
      }

      // Get current open positions to check which coins we're already trading
      const currentPositions = await asterDexService.getPositions();
      const openSymbols = new Set(currentPositions.map(p => p.symbol));
      
      // Filter out signals for coins we're already trading
      const availableSignals = allSignals.filter(s => !openSymbols.has(s.symbol));
      
      logger.info(`🎯 Available opportunities (excluding ${openSymbols.size} open positions):`, {
        context: 'AITrading',
        data: {
          totalOpportunities: allSignals.length,
          alreadyTrading: openSymbols.size,
          availableNow: availableSignals.length
        }
      });
      
      // HYPER-AGGRESSIVE: Select the BEST available trade (not already trading)
      const bestSignal = this.selectMostProfitableSignal(availableSignals);
      
      if (bestSignal) {
        logger.trade(`🚀 HYPER-AGGRESSIVE BEST TRADE SELECTED: ${bestSignal.action} ${bestSignal.symbol} @ ${(bestSignal.confidence * 100).toFixed(1)}% confidence`, {
          context: 'AITrading',
          data: {
            symbol: bestSignal.symbol,
            action: bestSignal.action,
            size: bestSignal.size,
            confidence: bestSignal.confidence,
            reasoning: bestSignal.reasoning,
            totalAnalyzed: availableSignals.length,
            totalCoins: symbols.length,
            currentPositions: openSymbols.size
          }
        });
        
        // Execute the best available trade
        await this.executeTrade(bestSignal);
      } else {
        logger.info(`😴 HYPER-AGGRESSIVE: No new profitable opportunities found among ${symbols.length} coins (${openSymbols.size} already trading)`, { context: 'AITrading' });
      }

      return { signals: allSignals, bestSignal };
    } catch (error) {
      logger.error('HYPER-AGGRESSIVE trading cycle failed', error, { context: 'AITrading' });
      return { signals: [], bestSignal: null };
    }
  }

  private async monitorPositions(): Promise<void> {
    try {
      const positions = await asterDexService.getPositions();
      
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
          
          // OPTIMIZED RISK MANAGEMENT: Better risk/reward ratio (1:3)
          // Stop-loss at -2% ROE (cut losses quickly)
          if (roePnlPercent <= -2.0) {
            shouldClose = true;
            reason = `🛑 STOP-LOSS: ROE down ${roePnlPercent.toFixed(2)}% (threshold: -2.0%)`;
          }
          // Take-profit at +6% ROE (3x risk/reward ratio)
          else if (roePnlPercent >= 6.0) {
            shouldClose = true;
            reason = `💰 TAKE-PROFIT: ROE up ${roePnlPercent.toFixed(2)}% (threshold: +6.0%)`;
          }
          // Trailing stop for strong winners: If ROE > 8%, use tighter stop at +4%
          else if (roePnlPercent >= 4.0 && position.unrealizedPnl > (marginUsed * 0.08)) {
            shouldClose = true;
            reason = `📈 TRAILING STOP: Securing profits at ROE ${roePnlPercent.toFixed(2)}% (was above +8%, trailing at +4%)`;
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
            const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
            await asterDexService.placeMarketOrder(
              position.symbol,
              closeSide,
              position.size,
              leverage,
              true // reduceOnly
            );
            
            logger.trade(`✅ Position closed: ${position.symbol} ${position.side}`, {
              context: 'AITrading',
              data: { symbol: position.symbol, side: position.side, reason }
            });
          } catch (error) {
            logger.error(`Failed to close position ${position.symbol}`, error, { context: 'AITrading' });
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
    
      // 🎯 AGGRESSIVE TRADING: Take MEDIUM+ confidence trades (50%+)
      // Lowered from 55% to 50% to capture more opportunities
      // With 100% margin deployment and strong risk management, we can be more aggressive
      if (bestSignal.confidence >= 0.50) {
        bestSignal.size = 1.0; // 100% of available margin - MEDIUM+ CONFIDENCE
        logger.info(`✅ TRADE APPROVED: ${bestSignal.symbol} @ ${(bestSignal.confidence * 100).toFixed(1)}% confidence`, {
          context: 'AITrading',
          data: {
            symbol: bestSignal.symbol,
            action: bestSignal.action,
            confidence: (bestSignal.confidence * 100).toFixed(1) + '%',
            reasoning: bestSignal.reasoning
          }
        });
      } else {
        // Reject low confidence trades - wait for better opportunities
        logger.info(`⏭️ SKIPPING - Need 50%+ confidence (got ${(bestSignal.confidence * 100).toFixed(1)}%): ${bestSignal.symbol} ${bestSignal.action}`, {
          context: 'AITrading',
          data: {
            symbol: bestSignal.symbol,
            confidence: (bestSignal.confidence * 100).toFixed(1) + '%',
            threshold: '50%',
            reasoning: bestSignal.reasoning
          }
        });
        return null;
      }
    
    logger.info(`🎯 GODSPEED SELECTED #1: ${bestSignal.symbol} ${bestSignal.action} @ ${(bestSignal.confidence * 100).toFixed(1)}% [FULL MARGIN: 100%]`, {
      context: 'AITrading',
      data: {
        winner: {
          symbol: bestSignal.symbol,
          action: bestSignal.action,
          confidence: (bestSignal.confidence * 100).toFixed(1) + '%',
          reasoning: bestSignal.reasoning
        },
        totalOpportunities: signals.length,
        positionSize: '100% (MAXIMUM)',
        leverage: 'MAX (20x-50x per coin)',
        runnerUps: sortedSignals.slice(1, 4).map(s => ({ 
          symbol: s.symbol, 
          action: s.action, 
          confidence: (s.confidence * 100).toFixed(1) + '%',
          reason: 'Lower confidence than winner'
        }))
      }
    });
    
    return bestSignal;
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
      
      // Get current price for the symbol
      const currentPrice = await asterDexService.getPrice(signal.symbol);
      if (currentPrice <= 0) {
        logger.warn(`⚠️ Invalid price for ${signal.symbol}`, { context: 'AITrading' });
        return;
      }
      
      // 🚀 GODSPEED MAXIMUM POWER: USE 100% OF AVAILABLE MARGIN EVERY TRADE
      // No partial allocations - go ALL IN with max leverage on every opportunity
      const allocationPercent = 1.0; // 100% - ALWAYS USE ALL AVAILABLE MARGIN
      
      // FUTURES TRADING CALCULATION:
      // availableBalance = margin available for new positions
      // positionValue = margin × leverage = total position size in USDT
      // quantity = positionValue / currentPrice = amount of base asset to buy
      const marginToUse = availableBalance * allocationPercent; // 100% of available margin
      const positionValue = marginToUse * maxLeverage; // Position size = margin × leverage
      const quantity = positionValue / currentPrice; // Convert USDT position to base asset quantity
      
      logger.debug(`📊 Position Calculation:`, {
        context: 'AITrading',
        data: {
          availableBalance: availableBalance.toFixed(2),
          marginToUse: marginToUse.toFixed(2),
          maxLeverage: maxLeverage,
          positionValue: positionValue.toFixed(2),
          currentPrice: currentPrice.toFixed(6),
          quantity: quantity.toFixed(8)
        }
      });
      
      // Calculate margin efficiency
      const marginEfficiency = (positionValue / availableBalance) * 100;
      
      logger.trade(`🚀 GODSPEED EXECUTING: ${signal.action} ${signal.symbol}
💯 MARGIN: $${marginToUse.toFixed(2)} (100% of $${availableBalance.toFixed(2)} available)
⚡ LEVERAGE: ${maxLeverage}x (MAXIMUM for ${signal.symbol})
💰 POSITION VALUE: $${positionValue.toFixed(2)} (${marginEfficiency.toFixed(0)}x leverage multiplier)
🎯 CONFIDENCE: ${(signal.confidence * 100).toFixed(0)}%
📦 QUANTITY: ${quantity.toFixed(8)} @ $${currentPrice.toFixed(2)}
📊 CALCULATION: ${marginToUse.toFixed(2)} margin × ${maxLeverage}x leverage ÷ ${currentPrice.toFixed(2)} price = ${quantity.toFixed(8)} quantity`, {
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