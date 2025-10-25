/**
 * Trading System Configuration
 * Centralized configuration for all trading systems
 */

export interface TradingSystemConfig {
  // System modes
  enableLegacyTrading: boolean;
  enableAdvancedTrading: boolean;
  tradingMode: 'legacy' | 'advanced' | 'hybrid';
  
  // Performance settings
  analysisInterval: number; // milliseconds
  cacheTTL: number; // milliseconds
  maxRetries: number;
  
  // Risk management
  maxPortfolioRisk: number;
  maxDrawdown: number;
  maxOpenPositions: number;
  
  // Advanced features
  enableMarketRegimeDetection: boolean;
  enableMultiFactorAnalysis: boolean;
  enableRiskManagement: boolean;
  enablePerformanceTracking: boolean;
}

export const DEFAULT_TRADING_CONFIG: TradingSystemConfig = {
  // System modes
  enableLegacyTrading: true,
  enableAdvancedTrading: true,
  tradingMode: 'hybrid',
  
  // Performance settings
  analysisInterval: 60000, // 1 minute
  cacheTTL: 2000, // 2 seconds
  maxRetries: 3,
  
  // Risk management
  maxPortfolioRisk: 0.20, // 20%
  maxDrawdown: 0.15, // 15%
  maxOpenPositions: 5,
  
  // Advanced features
  enableMarketRegimeDetection: true,
  enableMultiFactorAnalysis: true,
  enableRiskManagement: true,
  enablePerformanceTracking: true
};

export const PRODUCTION_TRADING_CONFIG: TradingSystemConfig = {
  // System modes
  enableLegacyTrading: false,
  enableAdvancedTrading: true,
  tradingMode: 'advanced',
  
  // Performance settings
  analysisInterval: 30000, // 30 seconds for production
  cacheTTL: 1000, // 1 second for real-time
  maxRetries: 5,
  
  // Risk management
  maxPortfolioRisk: 0.15, // 15% for production
  maxDrawdown: 0.10, // 10% for production
  maxOpenPositions: 3,
  
  // Advanced features
  enableMarketRegimeDetection: true,
  enableMultiFactorAnalysis: true,
  enableRiskManagement: true,
  enablePerformanceTracking: true
};

export const DEVELOPMENT_TRADING_CONFIG: TradingSystemConfig = {
  // System modes
  enableLegacyTrading: true,
  enableAdvancedTrading: true,
  tradingMode: 'hybrid',
  
  // Performance settings
  analysisInterval: 60000, // 1 minute for development
  cacheTTL: 5000, // 5 seconds for development
  maxRetries: 2,
  
  // Risk management
  maxPortfolioRisk: 0.25, // 25% for development
  maxDrawdown: 0.20, // 20% for development
  maxOpenPositions: 5,
  
  // Advanced features
  enableMarketRegimeDetection: true,
  enableMultiFactorAnalysis: true,
  enableRiskManagement: true,
  enablePerformanceTracking: true
};

/**
 * Get trading configuration based on environment
 */
export function getTradingConfig(): TradingSystemConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isProduction) {
    return PRODUCTION_TRADING_CONFIG;
  } else if (isDevelopment) {
    return DEVELOPMENT_TRADING_CONFIG;
  } else {
    return DEFAULT_TRADING_CONFIG;
  }
}
