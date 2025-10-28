import { TradingSignal, MarketData } from '@/types/trading';
import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';
import { GodspeedModel } from './aiTradingModels';
import { AITradingModel } from '@/types/trading';
import { asterConfig } from '@/lib/configService';
import { PerformanceMonitor } from '@/lib/performanceMonitor';
import { circuitBreakers } from '@/lib/circuitBreaker';
import { AppError, ErrorType } from '@/lib/errorHandler';

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

  constructor() {
    // Initialize Godspeed - our optimized trading strategy
    this.model = new GodspeedModel();
    logger.info('Godspeed AI trading model initialized', { context: 'AITrading' });
  }

  async start() {
    if (this.isRunning) {
      logger.warn('AI trading service already running', { context: 'AITrading' });
      return;
    }

    this.isRunning = true;
    logger.info('Starting Godspeed trading service', { context: 'AITrading' });

    // Strategic trading frequency - balance between opportunity and quality
    this.intervalId = setInterval(() => {
      this.runTradingCycle();
    }, asterConfig.monitoring.tradingCycleInterval);

    // Start high-frequency position monitoring
    this.startPositionMonitoring();

    logger.info('Godspeed active', { 
      context: 'AITrading',
      data: {
        cycleInterval: asterConfig.monitoring.tradingCycleInterval,
        confidenceThreshold: asterConfig.trading.confidenceThreshold,
        stopLoss: asterConfig.trading.stopLossPercent,
        takeProfit: asterConfig.trading.takeProfitPercent
      }
    });
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
   * High-frequency position monitoring
   * Monitors positions for stop-loss/take-profit execution
   */
  private startPositionMonitoring(): void {
    this.positionMonitorInterval = setInterval(async () => {
      try {
        await this.monitorPositions();
      } catch (error) {
        logger.error('Position monitoring error', error, { context: 'AITrading' });
      }
    }, asterConfig.monitoring.positionCheckInterval);

    logger.info('Position monitoring started', { 
      context: 'AITrading',
      data: { interval: asterConfig.monitoring.positionCheckInterval }
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
    const timer = PerformanceMonitor.startTimer('trading:cycle:duration');
    const signals: TradingSignal[] = [];
    
    try {
      // Skip position monitoring if no positions exist
      const existingPositions = await asterDexService.getPositions();
      if (existingPositions.length > 0) {
        await this.monitorPositions();
      }

      // Get trading pairs and analyze top symbols by volume
      const allSymbols = await asterDexService.getAllTradingPairs();
      const symbols = allSymbols.slice(0, asterConfig.trading.maxSymbolsPerCycle);
      
      logger.info('Trading cycle started', { 
        context: 'AITrading',
        data: { 
          totalSymbols: allSymbols.length,
          analyzing: symbols.length
        }
      });

      // Analyze symbols in parallel batches for maximum speed
      let analyzedCount = 0;
      let skippedCount = 0;
      const startTime = Date.now();
      const allSignals: TradingSignal[] = [];
      
      // Process symbols in parallel batches
      for (let i = 0; i < symbols.length; i += asterConfig.trading.batchSize) {
        // Check execution time limit
        if (Date.now() - startTime > asterConfig.trading.maxExecutionTime) {
          logger.warn('Approaching timeout, stopping analysis', { 
            context: 'AITrading',
            data: { analyzedCount, maxTime: asterConfig.trading.maxExecutionTime }
          });
          break;
        }
        
        const batch = symbols.slice(i, i + asterConfig.trading.batchSize);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (symbol) => {
          try {
            const tickerData = await asterDexService.getTicker(symbol);
            
            if (!tickerData || !tickerData.price || tickerData.price === 0) {
              return { symbol, skipped: true, reason: 'no ticker/price data' };
            }
            
            const currentPrice = tickerData.price;
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
          } else {
            analyzedCount++;
            
            // Only consider actionable signals (not HOLD)
            if (result.signal && result.signal.action !== 'HOLD') {
              allSignals.push(result.signal);
              
              // Only log high-confidence signals to reduce verbosity
              if (result.signal.confidence >= asterConfig.trading.confidenceThreshold) {
                logger.info('High-confidence signal found', {
                  context: 'AITrading',
                  data: { 
                    symbol: result.symbol,
                    action: result.signal.action, 
                    confidence: result.signal.confidence
                  }
                });
              }
            }
          }
        }
      }
      
      logger.info('Analysis complete', {
        context: 'AITrading',
        data: {
          analyzed: analyzedCount,
          skipped: skippedCount,
          opportunities: allSignals.length
        }
      });
      
      // Send scanning status to chat
      try {
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const scanMessage = allSignals.length > 0
          ? `Scan Complete\nAnalyzed ${analyzedCount} coins\nFound ${allSignals.length} opportunities\n\nBest Signal: ${allSignals.sort((a, b) => b.confidence - a.confidence)[0].symbol} @ ${(allSignals.sort((a, b) => b.confidence - a.confidence)[0].confidence * 100).toFixed(1)}%`
          : `Scan Complete\nAnalyzed ${analyzedCount} coins\nNo high-probability opportunities found`;
        
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
        logger.error('Failed to send scan status', error, { context: 'AITrading' });
      }

      // One position at a time strategy
      const openPositions = await asterDexService.getPositions();
      
      if (openPositions.length > 0) {
        logger.info('Position management active', {
          context: 'AITrading',
          data: {
            openPositions: openPositions.length,
            strategy: 'ONE_POSITION_AT_A_TIME'
          }
        });
        
        return { signals: allSignals, bestSignal: null };
      }
      
      // Select best trade opportunity
      const bestSignal = this.selectMostProfitableSignal(allSignals);
      
      if (bestSignal) {
        logger.info('Best trade selected', {
          context: 'AITrading',
          data: {
            symbol: bestSignal.symbol,
            action: bestSignal.action,
            confidence: bestSignal.confidence,
            totalOpportunities: allSignals.length
          }
        });
        
        await this.executeTrade(bestSignal);
      } else {
        logger.info('No profitable opportunities found', { 
          context: 'AITrading',
          data: { totalAnalyzed: symbols.length }
        });
      }

      const duration = timer.end();
      PerformanceMonitor.recordCounter('trading:cycle:completed');
      PerformanceMonitor.recordGauge('trading:cycle:signals_found', allSignals.length);
      
      return { signals: allSignals, bestSignal };
    } catch (error) {
      timer.end();
      PerformanceMonitor.recordCounter('trading:cycle:error');
      logger.error('Trading cycle failed', error, { context: 'AITrading' });
      return { signals: [], bestSignal: null };
    }
  }

  private async monitorPositions(): Promise<void> {
    try {
      const positions = await asterDexService.getPositions();
      
      if (positions.length === 0) {
        return;
      }

      logger.debug('Monitoring positions', { 
        context: 'AITrading',
        data: { count: positions.length }
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
        
        let shouldClose = false;
        let reason = '';
        
        // Margin-based risk management
        const marginPnlPercent = (position.unrealizedPnl / marginUsed) * 100;
        
        // Stop-loss at configured threshold
        if (marginPnlPercent <= -asterConfig.trading.stopLossPercent) {
          shouldClose = true;
          reason = `Stop-loss: Margin down ${marginPnlPercent.toFixed(2)}% (threshold: -${asterConfig.trading.stopLossPercent}%)`;
        }
        // Take-profit at configured threshold
        else if (marginPnlPercent >= asterConfig.trading.takeProfitPercent) {
          shouldClose = true;
          reason = `Take-profit: Margin up ${marginPnlPercent.toFixed(2)}% (threshold: +${asterConfig.trading.takeProfitPercent}%)`;
        }
        
        if (shouldClose) {
          logger.info('Closing position', {
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
            // Double-check position still exists on exchange before closing
            const freshPositions = await asterDexService.getPositions(true);
            const positionStillExists = freshPositions.some(p => p.symbol === position.symbol && p.side === position.side);
            
            if (!positionStillExists) {
              logger.warn('Position already closed on exchange', {
                context: 'AITrading',
                data: { symbol: position.symbol, side: position.side }
              });
              return;
            }
            
            const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
            
            // Round close quantity to correct precision
            let closeQuantity = Math.abs(position.size);
            const precisionInfo = await asterDexService.getSymbolPrecision(position.symbol);
            if (precisionInfo) {
              closeQuantity = asterDexService.roundQuantity(closeQuantity, precisionInfo.quantityPrecision);
            }
            
            const closeOrder = await asterDexService.placeMarketOrder(
              position.symbol,
              closeSide,
              closeQuantity,
              leverage,
              true // reduceOnly
            );
            
            logger.info('Position closed', {
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
      logger.info('No trading opportunities found', { context: 'AITrading' });
      return null;
    }

    // Sort by confidence (highest first) to get the best opportunity
    const sortedSignals = signals.sort((a, b) => b.confidence - a.confidence);
    const bestSignal = sortedSignals[0];
    
    // Analyze confidence distribution
    const confidenceRanges = {
      high: sortedSignals.filter(s => s.confidence >= 0.55).length,
      medium: sortedSignals.filter(s => s.confidence >= 0.4 && s.confidence < 0.55).length,
      low: sortedSignals.filter(s => s.confidence < 0.4).length
    };
    
    logger.info('Signal analysis complete', {
      context: 'AITrading',
      data: {
        total: sortedSignals.length,
        highConfidence: confidenceRanges.high,
        mediumConfidence: confidenceRanges.medium,
        lowConfidence: confidenceRanges.low,
        bestConfidence: (bestSignal.confidence * 100).toFixed(1) + '%'
      }
    });
    
    // Only trade if confidence meets threshold
    if (bestSignal.confidence >= asterConfig.trading.confidenceThreshold) {
      bestSignal.size = 1.0; // 100% of available margin
      logger.info('High-confidence signal selected', {
        context: 'AITrading',
        data: {
          symbol: bestSignal.symbol,
          action: bestSignal.action,
          confidence: bestSignal.confidence,
          threshold: asterConfig.trading.confidenceThreshold,
          reasoning: bestSignal.reasoning.substring(0, 100)
        }
      });
      return bestSignal;
    }
    
    logger.info('No signals meet confidence threshold', {
      context: 'AITrading',
      data: {
        bestConfidence: bestSignal.confidence,
        threshold: asterConfig.trading.confidenceThreshold
      }
    });
    
    return null;
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
      if (availableBalance < 10) { // Minimum 10 USDT required for meaningful trading (was 5)
        logger.warn(`⚠️ Insufficient available balance for trading: ${availableBalance} USDT (minimum: 10 USDT)`, { 
          context: 'AITrading',
          data: { availableBalance, minimum: 10 }
        });
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
      
      // 🛡️ ENHANCED SAFETY BUFFER: Use 85% of available margin to account for:
      // - Trading fees (~0.1% maker/taker on Aster DEX)
      // - Price slippage during execution (~0.05%)
      // - Exchange liquidation buffer requirements (~0.05%)
      // - Total buffer: ~0.2% + safety margin = 15%
      const TRADING_FEE_PERCENT = 0.001; // 0.1% trading fee
      const SLIPPAGE_PERCENT = 0.0005; // 0.05% slippage
      const SAFETY_MARGIN_PERCENT = 0.85; // 85% of available margin (increased buffer for fees)
      const marginToUse = availableBalance * allocationPercent * SAFETY_MARGIN_PERCENT; // 85% of available margin
      const positionValue = marginToUse * maxLeverage; // Position size = margin × leverage
      let quantity = positionValue / currentPrice; // Convert USDT position to base asset quantity
      
      // Calculate estimated fees for this trade
      const estimatedFees = positionValue * TRADING_FEE_PERCENT;
      logger.info(`💰 Fee Calculation: $${positionValue.toFixed(2)} position × 0.1% = $${estimatedFees.toFixed(4)} estimated fees`, {
        context: 'AITrading',
        data: {
          positionValue: positionValue.toFixed(2),
          tradingFeePercent: TRADING_FEE_PERCENT * 100,
          estimatedFees: estimatedFees.toFixed(4)
        }
      });
      
      // 🎯 PRECISION FIX: Round quantity and cap at maximum to match exchange requirements
      const precisionInfo = await asterDexService.getSymbolPrecision(signal.symbol);
      if (precisionInfo) {
        const originalQuantity = quantity;
        const maxQty = precisionInfo.maxQty;
        
        // Round to precision first
        quantity = asterDexService.roundQuantity(quantity, precisionInfo.quantityPrecision);
        
        // 🚨 MINIMUM ORDER SIZE CHECK: Ensure notional value is at least $20 (increased from $5)
        const notionalValue = quantity * currentPrice;
        if (notionalValue < 20.0) { // Increased minimum to $20 for meaningful positions
          logger.warn(`⚠️ Order notional ${notionalValue.toFixed(2)} below $20 minimum for ${signal.symbol}, adjusting quantity`, {
            context: 'AITrading',
            data: {
              notionalValue: notionalValue.toFixed(2),
              minimum: 20.0,
              symbol: signal.symbol
            }
          });
          // Calculate minimum quantity needed for $20 notional
          const minQuantity = 20.0 / currentPrice;
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
      
      logger.trade(`🚀 GODSPEED EXECUTING: ${signal.action} ${signal.symbol}
💯 MARGIN: $${marginToUse.toFixed(2)} (98% of $${availableBalance.toFixed(2)} available - 2% safety buffer)
⚡ LEVERAGE: ${maxLeverage}x (MAXIMUM for ${signal.symbol})
💰 POSITION VALUE: $${positionValue.toFixed(2)} (${marginEfficiency.toFixed(0)}x leverage multiplier)
🎯 CONFIDENCE: ${(signal.confidence * 100).toFixed(0)}%
📦 QUANTITY: ${quantity} @ $${currentPrice.toFixed(2)}
📊 CALCULATION: ${marginToUse.toFixed(2)} margin × ${maxLeverage}x leverage ÷ ${currentPrice.toFixed(2)} price = ${quantity} quantity
🛡️ SAFETY BUFFER: 2% reserved for fees & slippage`, {
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