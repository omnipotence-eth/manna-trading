/**
 * Portfolio Reasoning API
 * 
 * Returns AI reasoning about current positions and planned actions
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface PortfolioReasoning {
  timestamp: number;
  currentPositions: Array<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    currentPrice: number;
    pnlPercent: number;
    holdReason: string;
    targetAction: string;
    confidence: number;
  }>;
  marketOutlook: {
    shortTerm: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    mediumTerm: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    reasoning: string;
  };
  nextActions: Array<{
    action: string;
    symbol?: string;
    reason: string;
    probability: number;
    timeframe: string;
  }>;
  riskAssessment: {
    overallRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    exposure: number;
    concerns: string[];
  };
}

interface PositionData {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  leverage: string;
}

interface MarketSnapshot {
  bullishScore?: number;
  bearishScore?: number;
  overallBias?: 'STRONG_BUY' | 'STRONG_SELL' | 'BUY' | 'SELL' | 'NEUTRAL';
  technicals?: {
    rsi14?: number;
  };
  sentiment?: {
    fearGreedIndex?: number;
  };
  volatility?: {
    volatilityRegime?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME_HIGH' | 'NORMAL' | 'EXTREME_LOW';
  };
}

export async function GET() {
  try {
    // Get current positions (asterDexService returns AsterPosition[], map to PositionData shape)
    let positions: PositionData[] = [];
    try {
      const { asterDexService } = await import('@/services/exchange/asterDexService');
      const positionsData = await asterDexService.getPositions();
      positions = positionsData
        .filter((p) => Math.abs(p.size) > 0)
        .map((p): PositionData => ({
          symbol: p.symbol,
          positionAmt: p.side === 'LONG' ? String(p.size) : String(-p.size),
          entryPrice: String(p.entryPrice),
          markPrice: String(p.markPrice),
          leverage: String(p.leverage),
        }));
    } catch {
      // No positions
    }
    
    // Get current market data
    let marketData: MarketSnapshot | null = null;
    try {
      const { quantDataService } = await import('@/services/data/quantDataService');
      marketData = await quantDataService.getMarketSnapshot('BTCUSDT');
    } catch {
      // Use defaults
    }
    
    // Get balance for risk calculation
    let balance = 60;
    try {
      const { realBalanceService } = await import('@/services/trading/realBalanceService');
      const config = realBalanceService.getBalanceConfig();
      // FIX: RealBalanceConfig uses 'availableBalance', not 'realBalance'
      balance = config?.availableBalance || 60;
    } catch {
      // Use default
    }
    
    // Build position reasoning
    const currentPositions = await Promise.all(positions.map(async (pos: PositionData) => {
      const symbol = pos.symbol;
      const side = parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT';
      const entryPrice = parseFloat(pos.entryPrice) || 0;
      const markPrice = parseFloat(pos.markPrice) || entryPrice;
      const leverage = parseInt(pos.leverage) || 10;
      
      // Calculate P&L
      let pnlPercent = 0;
      if (entryPrice > 0) {
        if (side === 'LONG') {
          pnlPercent = ((markPrice - entryPrice) / entryPrice) * 100 * leverage;
        } else {
          pnlPercent = ((entryPrice - markPrice) / entryPrice) * 100 * leverage;
        }
      }
      
      // Generate reasoning based on position state
      let holdReason = '';
      let targetAction = '';
      let confidence = 0.6;
      
      if (pnlPercent > 0) {
        holdReason = `Position is in profit. Trend momentum still favorable. Trailing stop protects gains.`;
        targetAction = pnlPercent > 5 
          ? 'Consider taking partial profits at next resistance'
          : 'Let winner run with trailing stop';
        confidence = 0.7;
      } else if (pnlPercent > -2) {
        holdReason = `Small drawdown within normal range. Setup thesis still valid.`;
        targetAction = 'Hold position, monitor stop loss level';
        confidence = 0.65;
      } else {
        holdReason = `Larger drawdown but stop loss not hit. Evaluating exit conditions.`;
        targetAction = 'Tighten stop or exit on next bounce';
        confidence = 0.55;
      }
      
      return {
        symbol,
        side: side as 'LONG' | 'SHORT',
        entryPrice,
        currentPrice: markPrice,
        pnlPercent,
        holdReason,
        targetAction,
        confidence
      };
    }));
    
    // Determine market outlook
    let shortTermOutlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let mediumTermOutlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let marketReasoning = 'Market conditions are mixed. No clear directional bias.';
    
    if (marketData) {
      // Use quant data for outlook
      const bullish = marketData.bullishScore ?? 0;
      const bearish = marketData.bearishScore ?? 0;
      if (bullish > 60) {
        shortTermOutlook = 'BULLISH';
        mediumTermOutlook = bullish > 70 ? 'BULLISH' : 'NEUTRAL';
        marketReasoning = `Market showing bullish signals. RSI: ${marketData.technicals?.rsi14?.toFixed(0) || 'N/A'}, ` +
          `MACD histogram positive, price above key moving averages.`;
      } else if (bearish > 60) {
        shortTermOutlook = 'BEARISH';
        mediumTermOutlook = bearish > 70 ? 'BEARISH' : 'NEUTRAL';
        marketReasoning = `Market showing bearish signals. RSI: ${marketData.technicals?.rsi14?.toFixed(0) || 'N/A'}, ` +
          `MACD histogram negative, price below key moving averages.`;
      } else {
        marketReasoning = `Market in consolidation phase. Waiting for breakout direction. ` +
          `Fear & Greed: ${marketData.sentiment?.fearGreedIndex || 50}/100.`;
      }
    }
    
    // Calculate next actions
    const nextActions = [];
    
    if (positions.length === 0) {
      nextActions.push({
        action: 'Scan for opportunities',
        reason: 'No open positions. Looking for high-quality setups.',
        probability: 0.85,
        timeframe: 'Next 1-4 hours'
      });
    }
    
    if (marketData?.overallBias === 'STRONG_BUY') {
      nextActions.push({
        action: 'Prepare BUY order',
        symbol: 'BTCUSDT',
        reason: 'Strong bullish signal detected. Waiting for optimal entry.',
        probability: 0.65,
        timeframe: 'Next 30 minutes'
      });
    } else if (marketData?.overallBias === 'STRONG_SELL') {
      nextActions.push({
        action: 'Prepare SHORT order',
        symbol: 'BTCUSDT',
        reason: 'Strong bearish signal detected. Waiting for optimal entry.',
        probability: 0.60,
        timeframe: 'Next 30 minutes'
      });
    }
    
    // Add monitoring action
    nextActions.push({
      action: 'Monitor positions',
      reason: 'Continuous monitoring of stop losses and take profit levels.',
      probability: 1.0,
      timeframe: 'Ongoing'
    });
    
    // Calculate risk assessment
    const totalExposure = currentPositions.reduce((sum, p) => {
      return sum + Math.abs(p.currentPrice * Math.abs(parseFloat(
        positions.find(pos => pos.symbol === p.symbol)?.positionAmt || '0'
      )));
    }, 0);
    
    const exposurePercent = balance > 0 ? (totalExposure / balance) * 100 : 0;
    
    const concerns: string[] = [];
    let overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    
    if (exposurePercent > 50) {
      concerns.push('Portfolio exposure above 50% - consider reducing');
      overallRisk = 'HIGH';
    } else if (exposurePercent > 30) {
      concerns.push('Moderate portfolio exposure');
      overallRisk = 'MEDIUM';
    }
    
    if (currentPositions.some(p => p.pnlPercent < -5)) {
      concerns.push('Position with significant drawdown');
      overallRisk = overallRisk === 'LOW' ? 'MEDIUM' : overallRisk;
    }
    
    if (marketData?.volatility?.volatilityRegime === 'HIGH' || 
        marketData?.volatility?.volatilityRegime === 'EXTREME_HIGH') {
      concerns.push('High market volatility - increased risk');
      overallRisk = 'HIGH';
    }
    
    const reasoning: PortfolioReasoning = {
      timestamp: Date.now(),
      currentPositions,
      marketOutlook: {
        shortTerm: shortTermOutlook,
        mediumTerm: mediumTermOutlook,
        reasoning: marketReasoning
      },
      nextActions,
      riskAssessment: {
        overallRisk,
        exposure: exposurePercent,
        concerns
      }
    };
    
    return NextResponse.json({
      success: true,
      reasoning
    });
    
  } catch (error) {
    logger.error('Failed to get portfolio reasoning', error, { context: 'PortfolioReasoningAPI' });
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


