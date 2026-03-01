/**
 * Real-time Market Data API
 * Serves unified market data with funding rates, liquidations, and microstructure
 * 
 * Endpoints:
 * - GET: Fetch current market data for all subscribed symbols
 * - POST: Subscribe to additional symbols
 */

import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering to suppress Next.js static generation warnings
export const dynamic = 'force-dynamic';

// Lazy import to avoid build-time issues
async function getUnifiedDataAggregator() {
  const { unifiedDataAggregator } = await import('@/services/data/unifiedDataAggregator');
  return unifiedDataAggregator;
}

async function getMLDataCollector() {
  const { mlDataCollector } = await import('@/services/ml/mlDataCollector');
  return mlDataCollector;
}

async function getAPIKeyManager() {
  const { apiKeyManager } = await import('@/lib/apiKeyManager');
  return apiKeyManager;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbols = searchParams.get('symbols')?.split(',') || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const includeML = searchParams.get('includeML') === 'true';
    const includeAPIStats = searchParams.get('includeAPIStats') === 'true';
    
    const aggregator = await getUnifiedDataAggregator();
    const status = aggregator.getStatus();
    
    // Get market data for requested symbols
    const marketData: Record<string, any> = {};
    for (const symbol of symbols) {
      const data = aggregator.getMarketData(symbol);
      if (data) {
        marketData[symbol] = {
          ...data,
          // Add computed fields for dashboard
          priceFormatted: data.price.toFixed(data.price < 1 ? 6 : 2),
          changeFormatted: `${data.priceChangePercent24h >= 0 ? '+' : ''}${data.priceChangePercent24h.toFixed(2)}%`,
          volumeFormatted: formatVolume(data.volume24h),
          fundingFormatted: `${(data.fundingRate * 100).toFixed(4)}%`,
          spreadFormatted: `${data.spreadPercent.toFixed(4)}%`,
          signalColor: getSignalColor(data.signalStrength)
        };
      }
    }
    
    // Get recent liquidations (last 10)
    const recentLiquidations = aggregator.getRecentLiquidations().slice(0, 10).map(liq => ({
      ...liq,
      valueFormatted: formatVolume(liq.value),
      timeAgo: getTimeAgo(liq.timestamp)
    }));
    
    // Calculate market-wide metrics
    const allData = Array.from(aggregator.getAllMarketData().values());
    const marketOverview = {
      avgScore: allData.length > 0 
        ? allData.reduce((sum, d) => sum + d.overallScore, 0) / allData.length 
        : 50,
      bullishCount: allData.filter(d => d.signalStrength === 'STRONG_BUY' || d.signalStrength === 'BUY').length,
      bearishCount: allData.filter(d => d.signalStrength === 'STRONG_SELL' || d.signalStrength === 'SELL').length,
      neutralCount: allData.filter(d => d.signalStrength === 'NEUTRAL').length,
      avgVolatility: allData.length > 0
        ? allData.reduce((sum, d) => sum + d.atrPercent, 0) / allData.length
        : 0,
      totalLiquidations24h: allData.reduce((sum, d) => sum + d.totalLiquidationValue24h, 0)
    };
    
    // Include ML insights if requested
    let mlInsights = null;
    if (includeML) {
      try {
        const mlCollector = await getMLDataCollector();
        mlInsights = {
          patterns: await mlCollector.getLearningInsights(),
          featureImportance: await mlCollector.getFeatureImportance()
        };
      } catch (e) {
        mlInsights = { patterns: [], featureImportance: [] };
      }
    }
    
    // Include API stats if requested
    let apiStats = null;
    if (includeAPIStats) {
      try {
        const apiManager = await getAPIKeyManager();
        apiStats = apiManager.getStats();
      } catch (e) {
        apiStats = null;
      }
    }
    
    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      connection: status,
      marketData,
      recentLiquidations,
      marketOverview,
      mlInsights,
      apiStats
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Data-Source': 'unified-aggregator',
        'X-Update-Frequency': '100ms'
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, symbols } = body;
    
    const aggregator = await getUnifiedDataAggregator();
    
    switch (action) {
      case 'subscribe':
        if (Array.isArray(symbols)) {
          for (const symbol of symbols) {
            await aggregator.addSymbol(symbol);
          }
        }
        break;
        
      case 'connect':
        await aggregator.connect(symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
        break;
        
      case 'disconnect':
        aggregator.disconnect();
        break;
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      status: aggregator.getStatus()
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper functions
function formatVolume(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function getSignalColor(signal: string): string {
  switch (signal) {
    case 'STRONG_BUY': return '#00ff88';
    case 'BUY': return '#00cc66';
    case 'STRONG_SELL': return '#ff4444';
    case 'SELL': return '#ff6666';
    default: return '#888888';
  }
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}


