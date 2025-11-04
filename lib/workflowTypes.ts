/**
 * Workflow Type Definitions
 * Centralized types for trading workflows
 */

import { MarketData, SentimentData, OnChainData } from '@/services/dataIngestionService';

export interface AnalystReports {
  technical?: TechnicalAnalysisReport;
  sentiment?: SentimentAnalysisReport;
  onchain?: OnChainAnalysisReport;
}

export interface TechnicalAnalysisReport {
  score: number;
  signals: string[];
  recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  reasoning: string[];
  indicators?: Record<string, number>;
  trend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  momentum?: number;
  volatility?: number;
}

export interface SentimentAnalysisReport {
  sentiment: number;
  confidence: number;
  sources: {
    news?: number;
    social?: number;
    onchain?: number;
  };
}

export interface OnChainAnalysisReport {
  score: number;
  signals: string[];
  confidence: number;
}

export interface FinalDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string[];
  opportunityScore?: number;
}

export interface Portfolio {
  balance: number;
  positions: number;
  risk: number;
}

export interface RiskAssessment {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskScore: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  maxLoss: number;
  maxGain: number;
  reasoning: string[];
}

export interface ExecutionPlan {
  symbol: string;
  side: 'BUY' | 'SELL';
  size: number;
  leverage: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string[];
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  price?: number;
  size?: number;
  error?: string;
}

export interface WorkflowContext {
  marketData?: MarketData;
  sentimentData?: SentimentData;
  onchainData?: OnChainData;
  analystReports?: AnalystReports;
  finalDecision?: FinalDecision;
  portfolio?: Portfolio;
  riskAssessment?: RiskAssessment;
  executionPlan?: ExecutionPlan;
  tradeResult?: TradeResult;
  technicalAnalysis?: TechnicalAnalysisReport;
  sentimentAnalysis?: SentimentAnalysisReport;
  onchainAnalysis?: OnChainAnalysisReport;
}

