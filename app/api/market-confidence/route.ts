import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { marketScannerService } from '@/services/marketScannerService';

/**
 * Market Confidence Analysis API
 * Scans market and returns detailed confidence statistics
 */
export async function GET(request: NextRequest) {
  try {
    logger.info('📊 Running market confidence analysis', {
      context: 'MarketConfidenceAnalysis'
    });

    // Perform comprehensive market scan
    const scanResult = await marketScannerService.scanMarkets();
    
    // Get all symbols analyzed (including those that didn't become opportunities)
    // We need to check the internal scanner state or re-analyze with relaxed filters
    const { asterDexService } = await import('@/services/asterDexService');
    const exchangeInfo = await asterDexService.getExchangeInfo();
    const allSymbols = exchangeInfo.topSymbolsByVolume || exchangeInfo.symbols || [];
    
    // Analyze ALL opportunities (not filtered)
    const allOpportunities = scanResult.opportunities;
    
    // Also get top symbols by volume to see what's available
    const topByVolume = scanResult.topByVolume || [];
    
    // Calculate confidence statistics
    const confidences = allOpportunities.map(opp => opp.confidence);
    const scores = allOpportunities.map(opp => opp.score);
    
    const avgConfidence = confidences.length > 0 
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
      : 0;
    
    const avgScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
    
    const confidenceDistribution = {
      '90-100%': confidences.filter(c => c >= 0.9).length,
      '80-89%': confidences.filter(c => c >= 0.8 && c < 0.9).length,
      '70-79%': confidences.filter(c => c >= 0.7 && c < 0.8).length,
      '65-69%': confidences.filter(c => c >= 0.65 && c < 0.7).length,
      '60-64%': confidences.filter(c => c >= 0.6 && c < 0.65).length,
      '50-59%': confidences.filter(c => c >= 0.5 && c < 0.6).length,
      '40-49%': confidences.filter(c => c >= 0.4 && c < 0.5).length,
      '<40%': confidences.filter(c => c < 0.4).length
    };
    
    const topOpportunities = allOpportunities
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map(opp => ({
        symbol: opp.symbol,
        score: opp.score,
        confidence: Math.round(opp.confidence * 100),
        recommendation: opp.recommendation,
        volumeStrength: Math.round(((opp as any).volumeStrength || 0) * 100),
        liquidityScore: Math.round(((opp as any).liquidityScore || 0) * 100)
      }));
    
    // If no opportunities, analyze top symbols by volume instead
    let analyzedSymbols = [];
    if (allOpportunities.length === 0 && topByVolume.length > 0) {
      analyzedSymbols = topByVolume.slice(0, 20).map(opp => ({
        symbol: opp.symbol,
        score: opp.score || 0,
        confidence: opp.confidence || 0,
        recommendation: opp.recommendation || 'NEUTRAL'
      }));
      
      // Recalculate stats from top symbols
      const topConfidences = analyzedSymbols.map(s => s.confidence).filter(c => c > 0);
      const topScores = analyzedSymbols.map(s => s.score).filter(s => s > 0);
      
      if (topConfidences.length > 0) {
        avgConfidence = topConfidences.reduce((a, b) => a + b, 0) / topConfidences.length;
        avgScore = topScores.length > 0 ? topScores.reduce((a, b) => a + b, 0) / topScores.length : 0;
        
        // Recalculate distribution
        Object.keys(confidenceDistribution).forEach(key => {
          confidenceDistribution[key] = topConfidences.filter(c => {
            const range = key.replace('%', '').split('-');
            if (key === '<40%') return c < 0.4;
            if (key.includes('-')) {
              const min = parseFloat(range[0]) / 100;
              const max = parseFloat(range[1]) / 100;
              return c >= min && c < max;
            }
            return false;
          }).length;
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        totalSymbols: scanResult.totalSymbols,
        totalOpportunities: allOpportunities.length,
        analyzedSymbols: analyzedSymbols.length,
        statistics: {
          averageConfidence: Math.round(avgConfidence * 100),
          averageScore: Math.round(avgScore),
          minConfidence: confidences.length > 0 ? Math.round(Math.min(...confidences) * 100) : 0,
          maxConfidence: confidences.length > 0 ? Math.round(Math.max(...confidences) * 100) : 0,
          medianConfidence: confidences.length > 0 
            ? Math.round(confidences.sort((a, b) => a - b)[Math.floor(confidences.length / 2)] * 100)
            : 0
        },
        confidenceDistribution,
        topOpportunities: topOpportunities.length > 0 ? topOpportunities : analyzedSymbols.slice(0, 10),
        marketCondition: avgConfidence === 0 
          ? 'MARKET QUIET - No opportunities found (filters may be too strict)'
          : avgConfidence > 0.7 
          ? 'HIGH CONFIDENCE MARKET'
          : avgConfidence > 0.6
          ? 'MODERATE CONFIDENCE MARKET'
          : avgConfidence > 0.5
          ? 'LOW-MODERATE CONFIDENCE MARKET'
          : 'LOW CONFIDENCE MARKET',
        recommendations: {
          suggestedThreshold: avgConfidence > 0 
            ? Math.max(0.55, Math.round((avgConfidence - 0.1) * 100) / 100)
            : 0.55,
          suggestedThresholdPercent: avgConfidence > 0 
            ? Math.max(55, Math.round(avgConfidence * 100) - 10)
            : 55,
          note: avgConfidence === 0
            ? '⚠️ No opportunities found - current filters may be too strict. Consider lowering confidence threshold to 55-60%'
            : avgConfidence > 0.7 
            ? '✅ Market confidence is high - can use 70%+ threshold'
            : avgConfidence > 0.6
            ? '✅ Market confidence is moderate - use 60-65% threshold'
            : avgConfidence > 0.5
            ? '⚠️ Market confidence is low-moderate - use 55-60% threshold with quality filters'
            : '⚠️ Market confidence is low - use 55% threshold with very tight quality filters'
        }
      }
    });
  } catch (error) {
    logger.error('Failed to analyze market confidence', error as Error, {
      context: 'MarketConfidenceAnalysis'
    });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to analyze market confidence'
    }, { status: 500 });
  }
}

