/**
 * Agent Prompts - Type Definitions and Legacy Exports
 * Centralized type definitions for agent coordination
 * 
 * NOTE: This file exists to maintain compatibility with existing imports.
 * The actual prompts are in agentPromptsOptimized.ts
 */

// Re-export types from their actual locations
export type { MarketData } from '@/services/dataIngestionService';
export type { 
  AnalystReports, 
  FinalDecision, 
  Portfolio,
  TechnicalAnalysisReport,
  SentimentAnalysisReport,
  OnChainAnalysisReport,
  RiskAssessment,
  ExecutionPlan,
  TradeResult,
  WorkflowContext
} from './workflowTypes';

/**
 * Risk-Approved Trade Interface
 * Represents a trade that has passed all risk checks
 */
export interface RiskApprovedTrade {
  symbol: string;
  side: 'BUY' | 'SELL';
  size: number;
  leverage: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskPercentage: number;
  expectedRisk: number; // Stop loss percentage
  expectedReward: number; // Take profit percentage
  riskRewardRatio: number;
  confidence: number;
  approved: boolean;
  reasoning: string[];
  positionSize: number;
  maxConcurrentPositions: number;
}

/**
 * Legacy AGENT_PROMPTS export
 * NOTE: The actual prompts are in agentPromptsOptimized.ts (DEEPSEEK_OPTIMIZED_PROMPTS)
 * This is a placeholder for backward compatibility
 */
export const AGENT_PROMPTS = {
  // Legacy placeholder - actual prompts are in agentPromptsOptimized.ts
  // Import DEEPSEEK_OPTIMIZED_PROMPTS instead for production use
  TECHNICAL_ANALYST: {
    systemPrompt: 'Use DEEPSEEK_OPTIMIZED_PROMPTS.TECHNICAL_ANALYST instead',
    analysisTemplate: () => 'Use DEEPSEEK_OPTIMIZED_PROMPTS.TECHNICAL_ANALYST instead'
  },
  CHIEF_ANALYST: {
    systemPrompt: 'Use DEEPSEEK_OPTIMIZED_PROMPTS.CHIEF_ANALYST instead',
    debateTemplate: () => 'Use DEEPSEEK_OPTIMIZED_PROMPTS.CHIEF_ANALYST instead'
  },
  RISK_MANAGER: {
    systemPrompt: 'Use DEEPSEEK_OPTIMIZED_PROMPTS.RISK_MANAGER instead',
    assessmentTemplate: () => 'Use DEEPSEEK_OPTIMIZED_PROMPTS.RISK_MANAGER instead'
  },
  EXECUTION_SPECIALIST: {
    systemPrompt: 'Use DEEPSEEK_OPTIMIZED_PROMPTS.EXECUTION_SPECIALIST instead',
    executionTemplate: () => 'Use DEEPSEEK_OPTIMIZED_PROMPTS.EXECUTION_SPECIALIST instead'
  }
} as const;

