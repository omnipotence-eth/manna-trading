import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, context } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    logger.info('Chat request received', {
      context: 'ChatAPI',
      data: { messageLength: message.length, hasContext: !!context },
    });

    // Build context-aware response
    let response = '';
    
    const lowerMessage = message.toLowerCase();

    // Handle questions about positions
    if (lowerMessage.includes('position') || lowerMessage.includes('trade')) {
      const positions = context?.positions || [];
      if (positions.length > 0) {
        response = `I currently have ${positions.length} open position(s):\n\n`;
        positions.forEach((pos: any) => {
          response += `• ${pos.symbol} ${pos.side}: ${pos.pnl > 0 ? '+' : ''}${pos.pnl}% P&L\n`;
        });
        response += '\nI\'m monitoring these positions for stop-loss, take-profit, and signal reversals based on my risk management strategy.';
      } else {
        response = 'I don\'t have any open positions right now. I\'m analyzing market conditions and waiting for high-confidence trading opportunities that meet my strict entry criteria.';
      }
    }
    // Handle questions about market outlook
    else if (lowerMessage.includes('market') || lowerMessage.includes('outlook') || lowerMessage.includes('btc') || lowerMessage.includes('eth') || lowerMessage.includes('sol')) {
      const recentAnalysis = context?.recentAnalysis || [];
      if (recentAnalysis.length > 0) {
        const latestAnalysis = recentAnalysis[recentAnalysis.length - 1];
        response = `Based on my latest analysis:\n\n${latestAnalysis}\n\nI'm using a multi-strategy approach that combines:\n• Momentum & trend analysis\n• Volume & volatility patterns\n• Market regime detection (TRENDING/RANGING/VOLATILE)\n• Convergence signals across indicators\n\nMy current focus is on maintaining strict risk management while capitalizing on high-probability setups.`;
      } else {
        response = 'I\'m currently analyzing market conditions across multiple timeframes and indicators. My analysis includes momentum, trend, volume, volatility, and price action patterns. I\'ll execute trades when I detect high-confidence opportunities that align with my risk management parameters.';
      }
    }
    // Handle questions about strategy
    else if (lowerMessage.includes('strategy') || lowerMessage.includes('how') || lowerMessage.includes('why')) {
      response = `My trading strategy is built on several key principles:

**Risk Management:**
• Maximum 8% risk per trade
• Stop-loss at -2.5% ROE (emergency at -10%)
• Take-profit at +8% ROE
• Trailing stop at +5% (locks in at +3%)
• Maximum 25% drawdown limit

**Signal Analysis:**
I analyze markets using 10+ indicators:
• Momentum & trend strength
• Volume patterns & liquidity
• Volatility & ATR
• Market regime detection
• Price action & candle patterns
• Convergence across timeframes

**Position Management:**
• Leverage scales with confidence (3x-10x)
• Position sizing based on account risk
• 3-minute cooldown between trades
• No stacking positions on same asset
• Automatic position monitoring every 60s

I only take trades when multiple signals align and confidence exceeds 40%, ensuring high-quality setups.`;
    }
    // Handle questions about risk settings
    else if (lowerMessage.includes('risk') || lowerMessage.includes('settings') || lowerMessage.includes('adjust')) {
      response = `Current risk settings are optimized for balanced growth:

• **Max Risk Per Trade:** 8% of account
• **Max Position Size:** 50% of account
• **Stop Loss:** -2.5% ROE
• **Take Profit:** +8% ROE
• **Max Drawdown:** 25%
• **Max Open Positions:** 3
• **Leverage Range:** 3x-10x (confidence-based)

These settings provide a good balance between opportunity and capital preservation. If you're more risk-averse, consider reducing max risk per trade to 5% or lowering max leverage to 5x.

For more aggressive trading, you could increase position size to 70% or raise take-profit to +10%, but I recommend keeping stop-loss tight to protect capital.`;
    }
    // Handle questions about signals
    else if (lowerMessage.includes('signal') || lowerMessage.includes('indicator')) {
      response = `I monitor multiple signal types simultaneously:

**Primary Signals:**
• 📈 Momentum: RSI, rate of change, price velocity
• 📊 Trend: Moving averages, trend strength
• 📉 Volume: Trading activity, liquidity depth
• ⚡ Volatility: ATR, price swings, breakouts

**Advanced Detection:**
• 🎯 Convergence: Multiple indicators aligning
• 📐 Price Range: Support/resistance levels
• 🕯️ Candle Patterns: Bullish/bearish formations
• 🌊 Market Regime: TRENDING/RANGING/VOLATILE

**Signal Strength:**
Signals are scored 0-35 points. I require:
• Minimum 45% confidence to execute
• Multiple confirming signals
• Favorable market regime
• Adequate liquidity

This multi-layered approach ensures I only act on high-quality opportunities.`;
    }
    // Default response
    else {
      response = `I'm DeepSeek R1, an AI trading model analyzing cryptocurrency markets in real-time. I use advanced pattern recognition, multi-indicator analysis, and strict risk management to identify trading opportunities.

**What I can help you with:**
• Market analysis and outlook
• Trade decision explanations
• Strategy and risk management
• Signal interpretation
• Position monitoring

Feel free to ask me anything about the markets, my trading decisions, or how I analyze opportunities!`;
    }

    logger.info('Chat response generated', {
      context: 'ChatAPI',
      data: { responseLength: response.length },
    });

    return NextResponse.json({ response });

  } catch (error) {
    logger.error('Error in chat API', error, { context: 'ChatAPI' });
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}

