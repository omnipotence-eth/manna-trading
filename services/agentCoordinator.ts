/**
 * Agent Coordination Framework
 * Manages communication, state, and workflow between AI agents
 */

import { logger } from '@/lib/logger';
import { qwenService } from '@/services/qwenService';
import { AGENT_PROMPTS, MarketData, SentimentData, OnChainData, AnalystReports, FinalDecision, Portfolio, RiskApprovedTrade } from '@/lib/agentPrompts';
import { realBalanceService } from '@/services/realBalanceService';

export interface AgentMessage {
  from: string;
  to: string;
  type: 'analysis' | 'decision' | 'query' | 'response' | 'alert';
  content: any;
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  correlationId: string;
}

export interface AgentState {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'waiting' | 'error';
  lastActivity: number;
  currentTask?: string;
  performance: {
    totalTasks: number;
    successfulTasks: number;
    averageResponseTime: number;
    errorRate: number;
  };
}

export interface WorkflowStep {
  id: string;
  name: string;
  agent: string;
  dependencies: string[];
  timeout: number;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TradingWorkflow {
  id: string;
  symbol: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  steps: WorkflowStep[];
  currentStep?: string;
  startedAt: number;
  completedAt?: number;
  result?: any;
  context: {
    marketData?: MarketData;
    sentimentData?: SentimentData;
    onchainData?: OnChainData;
    analystReports?: AnalystReports;
    finalDecision?: FinalDecision;
    portfolio?: Portfolio;
    riskAssessment?: any;
    executionPlan?: any;
    tradeResult?: any;
    technicalAnalysis?: any;
    sentimentAnalysis?: any;
    onchainAnalysis?: any;
  };
}

export class AgentCoordinator {
  private agents: Map<string, AgentState> = new Map();
  private messageQueue: AgentMessage[] = [];
  private workflows: Map<string, TradingWorkflow> = new Map();
  private isRunning = false;
  private messageHandlers: Map<string, (message: AgentMessage) => Promise<void>> = new Map();

  constructor() {
    this.initializeAgents();
    this.setupMessageHandlers();
    logger.info('🤖 Agent Coordinator initialized', {
      context: 'AgentCoordinator',
      data: { agents: Array.from(this.agents.keys()) }
    });
  }

  /**
   * Initialize all agents
   */
  private initializeAgents(): void {
    const agentConfigs = [
      { id: 'technical', name: 'Technical Analyst', model: 'qwen2.5:7b-instruct' },
      { id: 'chief', name: 'Chief Analyst', model: 'qwen2.5:14b-instruct' },
      { id: 'risk', name: 'Risk Manager', model: 'qwen2.5:7b-instruct' },
      { id: 'execution', name: 'Execution Specialist', model: 'qwen2.5:7b-instruct' }
    ];

    agentConfigs.forEach(config => {
      this.agents.set(config.id, {
        id: config.id,
        name: config.name,
        status: 'idle',
        lastActivity: Date.now(),
        performance: {
          totalTasks: 0,
          successfulTasks: 0,
          averageResponseTime: 0,
          errorRate: 0
        }
      });
    });
  }

  /**
   * Setup message handlers for different message types
   */
  private setupMessageHandlers(): void {
    this.messageHandlers.set('analysis', this.handleAnalysisMessage.bind(this));
    this.messageHandlers.set('decision', this.handleDecisionMessage.bind(this));
    this.messageHandlers.set('query', this.handleQueryMessage.bind(this));
    this.messageHandlers.set('response', this.handleResponseMessage.bind(this));
    this.messageHandlers.set('alert', this.handleAlertMessage.bind(this));
  }

  /**
   * Start a new trading workflow
   */
  async startTradingWorkflow(symbol: string): Promise<string> {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const steps = this.createWorkflowSteps();
    
    const workflow: TradingWorkflow = {
      id: workflowId,
      symbol,
      status: 'running',
      startedAt: Date.now(),
      steps: steps,
      context: {}
    };

    this.workflows.set(workflowId, workflow);
    
    logger.info('🚀 Started trading workflow', {
      context: 'AgentCoordinator',
      data: {
        workflowId,
        symbol,
        totalSteps: steps.length,
        stepsCreated: steps.map(s => s.name),
        workflowsInMemory: this.workflows.size
      }
    });

    // Start the workflow execution immediately (don't use catch - let it throw)
    setImmediate(async () => {
      try {
        await this.executeWorkflow(workflowId);
      } catch (error) {
        logger.error('❌ Workflow execution failed', error, {
          context: 'AgentCoordinator',
          data: { workflowId, symbol }
        });
      }
    });

    return workflowId;
  }

  /**
   * Create workflow steps for trading process
   */
  private createWorkflowSteps(): WorkflowStep[] {
    return [
      {
        id: 'data_gathering',
        name: 'Data Gathering',
        agent: 'system',
        dependencies: [],
        timeout: 30000,
        retryCount: 0,
        maxRetries: 3,
        status: 'pending'
      },
      {
        id: 'technical_analysis',
        name: 'Technical Analysis',
        agent: 'technical',
        dependencies: ['data_gathering'],
        timeout: 60000,
        retryCount: 0,
        maxRetries: 2,
        status: 'pending'
      },
      {
        id: 'chief_decision',
        name: 'Chief Analyst Decision',
        agent: 'chief',
        dependencies: ['technical_analysis'],
        timeout: 90000,
        retryCount: 0,
        maxRetries: 2,
        status: 'pending'
      },
      {
        id: 'risk_assessment',
        name: 'Risk Assessment',
        agent: 'risk',
        dependencies: ['chief_decision'],
        timeout: 60000,
        retryCount: 0,
        maxRetries: 2,
        status: 'pending'
      },
      {
        id: 'execution_planning',
        name: 'Execution Planning',
        agent: 'execution',
        dependencies: ['risk_assessment'],
        timeout: 60000,
        retryCount: 0,
        maxRetries: 2,
        status: 'pending'
      },
      {
        id: 'trade_execution',
        name: 'Trade Execution',
        agent: 'execution',
        dependencies: ['execution_planning'],
        timeout: 30000,
        retryCount: 0,
        maxRetries: 1,
        status: 'pending'
      }
    ];
  }

  /**
   * Execute workflow steps
   */
  private async executeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    logger.debug('🔄 Executing workflow steps', {
      context: 'AgentCoordinator',
      workflowId,
      totalSteps: workflow.steps.length
    });

    try {
      // Execute steps sequentially, waiting for each to complete
      let executedSteps = 0;
      const maxIterations = workflow.steps.length * 2; // Safety limit
      let iterations = 0;
      
      while (executedSteps < workflow.steps.length && iterations < maxIterations) {
        iterations++;
        
        // Find next executable step
        let stepExecuted = false;
        for (const step of workflow.steps) {
          if (step.status === 'pending' && this.canExecuteStep(step, workflow)) {
            logger.debug(`📌 Executing step: ${step.name}`, {
              context: 'AgentCoordinator',
              workflowId,
              step: step.id
            });
            
            await this.executeStep(workflowId, step);
            executedSteps++;
            stepExecuted = true;
            break; // Execute one step at a time
          }
        }
        
        // If no step was executed and we still have pending steps, there's a dependency issue
        if (!stepExecuted) {
          const pendingSteps = workflow.steps.filter(s => s.status === 'pending');
          if (pendingSteps.length > 0) {
            logger.error('⚠️ Workflow stuck - pending steps with unmet dependencies', null, {
              context: 'AgentCoordinator',
              workflowId,
              pendingSteps: pendingSteps.map(s => s.id)
            });
            break;
          }
        }
      }

      // Check if workflow is complete
      const completedSteps = workflow.steps.filter(s => s.status === 'completed').length;
      const failedSteps = workflow.steps.filter(s => s.status === 'failed').length;
      
      if (completedSteps === workflow.steps.length) {
        workflow.status = 'completed';
        workflow.completedAt = Date.now();
        
        logger.info('✅ Workflow completed successfully', {
          context: 'AgentCoordinator',
          workflowId,
          duration: `${((workflow.completedAt - workflow.startedAt) / 1000).toFixed(1)}s`,
          completedSteps,
          totalSteps: workflow.steps.length
        });
      } else if (failedSteps > 0) {
        workflow.status = 'failed';
        workflow.completedAt = Date.now();
        
        logger.error('❌ Workflow failed with errors', null, {
          context: 'AgentCoordinator',
          workflowId,
          failedSteps,
          completedSteps
        });
      } else {
        workflow.status = 'failed';
        workflow.completedAt = Date.now();
        
        logger.warn('⚠️ Workflow partially completed', {
          context: 'AgentCoordinator',
          workflowId,
          completedSteps,
          totalSteps: workflow.steps.length
        });
      }
    } catch (error) {
      workflow.status = 'failed';
      workflow.completedAt = Date.now();
      
      logger.error('❌ Workflow execution error', error, {
        context: 'AgentCoordinator',
        workflowId
      });
    }
  }

  /**
   * Check if a step can be executed
   */
  private canExecuteStep(step: WorkflowStep, workflow: TradingWorkflow): boolean {
    return step.dependencies.every(depId => {
      const depStep = workflow.steps.find(s => s.id === depId);
      return depStep?.status === 'completed';
    });
  }

  /**
   * Execute a workflow step
   */
  private async executeStep(workflowId: string, step: WorkflowStep): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    step.status = 'running';
    step.startedAt = Date.now();

    logger.debug('🔄 Executing step', {
      context: 'AgentCoordinator',
      workflowId,
      stepId: step.id,
      agent: step.agent
    });

    try {
      let result: any;

      switch (step.id) {
        case 'data_gathering':
          result = await this.executeDataGathering(workflow);
          break;
        case 'technical_analysis':
          result = await this.executeTechnicalAnalysis(workflow);
          break;
        case 'chief_decision':
          result = await this.executeChiefDecision(workflow);
          break;
        case 'risk_assessment':
          result = await this.executeRiskAssessment(workflow);
          break;
        case 'execution_planning':
          result = await this.executeExecutionPlanning(workflow);
          break;
        case 'trade_execution':
          result = await this.executeTradeExecution(workflow);
          break;
        default:
          throw new Error(`Unknown step: ${step.id}`);
      }

      step.status = 'completed';
      step.completedAt = Date.now();
      step.result = result;

      // Update workflow context
      this.updateWorkflowContext(workflow, step.id, result);

      logger.debug('✅ Step completed', {
        context: 'AgentCoordinator',
        workflowId,
        stepId: step.id,
        duration: step.completedAt - step.startedAt!
      });

      // Continue workflow execution
      await this.executeWorkflow(workflowId);

    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      step.completedAt = Date.now();

      logger.error('❌ Step failed', error, {
        context: 'AgentCoordinator',
        workflowId,
        stepId: step.id
      });

      // Retry logic
      if (step.retryCount < step.maxRetries) {
        step.retryCount++;
        step.status = 'pending';
        step.startedAt = undefined;
        step.completedAt = undefined;
        step.error = undefined;
        
        logger.info('🔄 Retrying step', {
          context: 'AgentCoordinator',
          workflowId,
          stepId: step.id,
          retryCount: step.retryCount
        });

        // Wait before retry
        setTimeout(() => this.executeStep(workflowId, step), 5000);
      }
    }
  }

  /**
   * Execute data gathering step
   */
  private async executeDataGathering(workflow: TradingWorkflow): Promise<any> {
    logger.debug('📊 Gathering market data', {
      context: 'AgentCoordinator',
      data: { workflowId: workflow.id, symbol: workflow.symbol }
    });

    // Import data ingestion service dynamically to avoid circular dependencies
    const { dataIngestionService } = await import('@/services/dataIngestionService');
    
    // Only get market data for technical analysis
    const marketData = await dataIngestionService.getMarketData(workflow.symbol);
    
    return {
      market: marketData,
      timestamp: Date.now()
    };
  }

  /**
   * Execute technical analysis step
   */
  private async executeTechnicalAnalysis(workflow: TradingWorkflow): Promise<any> {
    const agent = this.agents.get('technical');
    if (!agent) throw new Error('Technical agent not found');

    agent.status = 'working';
    agent.currentTask = 'Technical Analysis';
    agent.lastActivity = Date.now();

    try {
      const marketData = workflow.context.marketData;
      if (!marketData) throw new Error('Market data not available');

      const prompt = AGENT_PROMPTS.TECHNICAL_ANALYST.analysisTemplate(marketData);
      const result = await qwenService.chat(prompt, 'qwen2.5:7b-instruct');

      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.performance.totalTasks++;
      agent.performance.successfulTasks++;

      return result;
    } catch (error) {
      agent.status = 'error';
      agent.performance.totalTasks++;
      agent.performance.errorRate = agent.performance.errorRate + (1 / agent.performance.totalTasks);
      throw error;
    }
  }



  /**
   * Execute chief analyst decision step
   */
  private async executeChiefDecision(workflow: TradingWorkflow): Promise<any> {
    const agent = this.agents.get('chief');
    if (!agent) throw new Error('Chief agent not found');

    agent.status = 'working';
    agent.currentTask = 'Chief Decision';
    agent.lastActivity = Date.now();

    try {
      // Ensure we have technical analysis data
      const technicalAnalysis = workflow.context.technicalAnalysis;

      if (!technicalAnalysis) {
        throw new Error('Missing technical analysis data for Chief Analyst decision');
      }

      // Create simplified decision based on technical analysis only
      const decision = {
        symbol: workflow.symbol,
        action: technicalAnalysis.action || 'HOLD',
        confidence: technicalAnalysis.confidence || 0.5,
        reasoning: `Based on technical analysis: ${technicalAnalysis.reasoning || 'No reasoning provided'}`,
        conviction: technicalAnalysis.confidence > 0.7 ? 'high' : technicalAnalysis.confidence > 0.5 ? 'medium' : 'low',
        recommendedHolding: technicalAnalysis.timeframe || 'hours',
        currentPrice: workflow.context.marketData?.price || 0,
        bid: workflow.context.marketData?.price ? workflow.context.marketData.price * 0.999 : 0,
        ask: workflow.context.marketData?.price ? workflow.context.marketData.price * 1.001 : 0,
        spread: 0.002,
        liquidity: workflow.context.marketData?.volume || 0,
        correlation: workflow.context.marketData?.volatility || 15
      };

      logger.info('Chief Analyst Decision (Technical Analysis Only)', {
        context: 'AgentCoordinator',
        data: { decision }
      });

      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.performance.totalTasks++;
      agent.performance.successfulTasks++;

      return decision;
    } catch (error) {
      agent.status = 'error';
      agent.performance.totalTasks++;
      agent.performance.errorRate = agent.performance.errorRate + (1 / agent.performance.totalTasks);
      throw error;
    }
  }

  /**
   * Execute risk assessment step
   */
  private async executeRiskAssessment(workflow: TradingWorkflow): Promise<any> {
    const agent = this.agents.get('risk');
    if (!agent) throw new Error('Risk agent not found');

    agent.status = 'working';
    agent.currentTask = 'Risk Assessment';
    agent.lastActivity = Date.now();

    try {
      // Get real balance data
      const balanceConfig = realBalanceService.getBalanceConfig();
      const balance = balanceConfig?.availableBalance || 42.16;
      
      // Ensure we have the final decision from Chief Analyst
      const finalDecision = workflow.context.finalDecision;
      if (!finalDecision) {
        throw new Error('Final decision not available for risk assessment');
      }

      // PRODUCTION RISK ASSESSMENT - Real trading logic
      const currentPrice = workflow.context.marketData?.price || 0;
      const confidence = finalDecision.confidence || 0.3;
      
      // Get configuration
      const { asterConfig } = await import('@/lib/configService');
      
      // Check minimum balance
      if (balance < asterConfig.trading.minBalanceForTrade) {
        const rejection = {
          approved: false,
          action: 'HOLD' as const,
          positionSize: 0,
          leverage: 1,
          stopLoss: currentPrice,
          takeProfit: currentPrice,
          riskPercentage: 0,
          expectedRisk: 0,
          expectedReward: 0,
          riskRewardRatio: 0,
          reasoning: `Insufficient balance: $${balance.toFixed(2)} < $${asterConfig.trading.minBalanceForTrade} minimum`
        };
        
        logger.warn('Trade rejected: Insufficient balance', {
          context: 'AgentCoordinator',
          data: rejection
        });
        
        agent.status = 'idle';
        agent.performance.totalTasks++;
        return rejection;
      }
      
      // Check confidence threshold
      if (confidence < asterConfig.trading.confidenceThreshold) {
        const rejection = {
          approved: false,
          action: 'HOLD' as const,
          positionSize: 0,
          leverage: 1,
          stopLoss: currentPrice,
          takeProfit: currentPrice,
          riskPercentage: 0,
          expectedRisk: 0,
          expectedReward: 0,
          riskRewardRatio: 0,
          reasoning: `Confidence ${(confidence * 100).toFixed(1)}% below ${(asterConfig.trading.confidenceThreshold * 100).toFixed(1)}% threshold`
        };
        
        logger.info('Trade rejected: Low confidence', {
          context: 'AgentCoordinator',
          data: rejection
        });
        
        agent.status = 'idle';
        agent.performance.totalTasks++;
        return rejection;
      }
      
      // Respect AI decision - don't override HOLD
      if (finalDecision.action === 'HOLD') {
        const rejection = {
          approved: false,
          action: 'HOLD' as const,
          positionSize: 0,
          leverage: 1,
          stopLoss: currentPrice,
          takeProfit: currentPrice,
          riskPercentage: 0,
          expectedRisk: 0,
          expectedReward: 0,
          riskRewardRatio: 0,
          reasoning: 'AI decision: HOLD - market conditions not favorable'
        };
        
        logger.info('Trade rejected: AI recommended HOLD', {
          context: 'AgentCoordinator',
          data: { finalDecision }
        });
        
        agent.status = 'idle';
        agent.performance.totalTasks++;
        return rejection;
      }
      
      // Calculate position size (10-30% of balance based on confidence)
      const riskPercent = Math.min(Math.max(confidence * 30, 10), 30);
      const positionValue = balance * (riskPercent / 100);
      
      // Dynamic leverage (1-3x based on confidence, conservative)
      const leverage = Math.min(Math.max(Math.floor(confidence * 5), 1), 3);
      const positionSize = positionValue / currentPrice;
      
      // Adaptive stop loss and take profit
      const volatility = workflow.context.marketData?.volatility || 5;
      const stopLossPercent = Math.max(asterConfig.trading.stopLossPercent, volatility * 0.5);
      const takeProfitPercent = stopLossPercent * (asterConfig.trading.takeProfitPercent / asterConfig.trading.stopLossPercent);
      
      const stopLoss = finalDecision.action === 'BUY' 
        ? currentPrice * (1 - stopLossPercent / 100)
        : currentPrice * (1 + stopLossPercent / 100);
        
      const takeProfit = finalDecision.action === 'BUY'
        ? currentPrice * (1 + takeProfitPercent / 100)
        : currentPrice * (1 - takeProfitPercent / 100);

      const riskAssessment = {
        approved: true, // Approved after all checks passed
        action: finalDecision.action, // Respect AI decision (BUY/SELL)
        positionSize: positionSize,
        leverage: leverage,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        riskPercentage: riskPercent,
        expectedRisk: stopLossPercent,
        expectedReward: takeProfitPercent,
        riskRewardRatio: takeProfitPercent / stopLossPercent,
        reasoning: `${finalDecision.action} ${workflow.symbol}: ${positionSize.toFixed(4)} units ($${positionValue.toFixed(2)}, ${riskPercent.toFixed(1)}% of balance) with ${leverage}x leverage. SL: ${stopLossPercent.toFixed(2)}%, TP: ${takeProfitPercent.toFixed(2)}% (${(takeProfitPercent/stopLossPercent).toFixed(2)}:1 R/R). Confidence: ${(confidence * 100).toFixed(1)}%`
      };

      logger.info('Risk Assessment - Trade Approved', {
        context: 'AgentCoordinator',
        data: { 
          balance,
          confidence,
          approved: riskAssessment.approved,
          positionSize: riskAssessment.positionSize,
          leverage: riskAssessment.leverage,
          riskRewardRatio: riskAssessment.riskRewardRatio
        }
      });

      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.performance.totalTasks++;
      agent.performance.successfulTasks++;

      return riskAssessment;
    } catch (error) {
      agent.status = 'error';
      agent.performance.totalTasks++;
      agent.performance.errorRate = agent.performance.errorRate + (1 / agent.performance.totalTasks);
      throw error;
    }
  }

  /**
   * Execute execution planning step
   */
  private async executeExecutionPlanning(workflow: TradingWorkflow): Promise<any> {
    const agent = this.agents.get('execution');
    if (!agent) throw new Error('Execution agent not found');

    agent.status = 'working';
    agent.currentTask = 'Execution Planning';
    agent.lastActivity = Date.now();

    try {
      const riskAssessment = workflow.context.riskAssessment;
      
      if (!riskAssessment || !riskAssessment.approved) {
        logger.info('Trade not approved by Risk Manager', {
          context: 'AgentCoordinator',
          data: { 
            symbol: workflow.symbol,
            approved: riskAssessment?.approved || false
          }
        });
        
        agent.status = 'idle';
        agent.currentTask = undefined;
        agent.performance.totalTasks++;
        agent.performance.successfulTasks++;
        
        return {
          readyToExecute: false,
          reason: 'Trade rejected by Risk Manager',
          action: 'HOLD'
        };
      }

      // SIMPLIFIED EXECUTION PLAN - Just execute if approved
      const executionPlan = {
        readyToExecute: true,
        action: riskAssessment.action,
        symbol: workflow.symbol,
        positionSize: riskAssessment.positionSize,
        leverage: riskAssessment.leverage,
        stopLoss: riskAssessment.stopLoss,
        takeProfit: riskAssessment.takeProfit,
        orderType: 'MARKET',
        timing: 'IMMEDIATE',
        reasoning: `Executing ${riskAssessment.action} on ${workflow.symbol}. ${riskAssessment.reasoning}`
      };

      logger.info('Execution Plan Ready', {
        context: 'AgentCoordinator',
        data: executionPlan
      });

      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.performance.totalTasks++;
      agent.performance.successfulTasks++;

      return executionPlan;
    } catch (error) {
      agent.status = 'error';
      agent.performance.totalTasks++;
      agent.performance.errorRate = agent.performance.errorRate + (1 / agent.performance.errorRate);
      throw error;
    }
  }

  /**
   * Execute actual trade execution step
   */
  private async executeTradeExecution(workflow: TradingWorkflow): Promise<any> {
    const agent = this.agents.get('execution');
    if (!agent) throw new Error('Execution agent not found');

    agent.status = 'working';
    agent.currentTask = 'Trade Execution';
    agent.lastActivity = Date.now();

    try {
      // Check if we have all required data
      const executionPlan = workflow.context.executionPlan;
      const riskAssessment = workflow.context.riskAssessment;
      const finalDecision = workflow.context.finalDecision;

      if (!executionPlan?.readyToExecute || !riskAssessment?.approved) {
        logger.info('Trade not ready for execution', {
          context: 'AgentCoordinator',
          readyToExecute: executionPlan?.readyToExecute,
          approved: riskAssessment?.approved
        });
        
        return {
          executed: false,
          reason: 'Trade not approved or not ready for execution',
          executionPlan,
          riskAssessment
        };
      }

      // Import asterDexService for actual trade execution
      const { asterDexService } = await import('@/services/asterDexService');
      const { positionMonitorService } = await import('@/services/positionMonitorService');
      
      let tradeResult: any = null;
      
      // Execute trade with retry logic (no mock fallback)
      const maxRetries = 3;
      let attempt = 0;
      let lastError: Error | null = null;
      
      while (attempt < maxRetries && !tradeResult) {
        attempt++;
        try {
          logger.info(`Executing trade (attempt ${attempt}/${maxRetries})`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              action: riskAssessment.action,
              size: riskAssessment.positionSize,
              leverage: riskAssessment.leverage
            }
          });
          
          tradeResult = await asterDexService.placeMarketOrder(
            workflow.symbol,
            riskAssessment.action === 'BUY' ? 'BUY' : 'SELL',
            riskAssessment.positionSize,
            riskAssessment.leverage
          );
          
        } catch (orderError) {
          lastError = orderError as Error;
          logger.error(`Trade execution failed (attempt ${attempt}/${maxRetries})`, orderError as Error, {
            context: 'AgentCoordinator',
            data: { 
              symbol: workflow.symbol,
              action: riskAssessment.action,
              attempt
            }
          });
          
          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      // If all retries failed, return error (NO MOCK FALLBACK)
      if (!tradeResult) {
        logger.error('❌ Trade execution failed after all retries', lastError!, {
          context: 'AgentCoordinator',
          data: { symbol: workflow.symbol, maxRetries }
        });
        
        agent.status = 'error';
        agent.performance.totalTasks++;
        agent.performance.errorRate = agent.performance.errorRate + (1 / agent.performance.totalTasks);
        
        return {
          executed: false,
          error: `Trade execution failed: ${lastError?.message || 'Unknown error'}`,
          retries: maxRetries
        };
      }

      // Trade executed successfully
      logger.info('✅ Trade executed successfully', {
          context: 'AgentCoordinator',
          symbol: workflow.symbol,
          action: riskAssessment.action,
          positionSize: riskAssessment.positionSize,
          leverage: riskAssessment.leverage,
          orderId: tradeResult.orderId
        });

        // Add position to monitor
        try {
          logger.info('📍 Adding position to monitor', {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              side: riskAssessment.action === 'BUY' ? 'LONG' : 'SHORT',
              entryPrice: finalDecision?.currentPrice,
              size: riskAssessment.positionSize,
              leverage: riskAssessment.leverage,
              stopLoss: riskAssessment.stopLoss,
              takeProfit: riskAssessment.takeProfit
            }
          });

          const positionId = await positionMonitorService.addPosition({
            symbol: workflow.symbol,
            side: riskAssessment.action === 'BUY' ? 'LONG' : 'SHORT',
            entryPrice: finalDecision?.currentPrice || 0,
            size: riskAssessment.positionSize,
            leverage: riskAssessment.leverage,
            stopLoss: riskAssessment.stopLoss,
            takeProfit: riskAssessment.takeProfit,
            trailingStopPercent: 2.0, // 2% trailing stop
            openedAt: Date.now(),
            orderId: tradeResult.orderId || ''
          });

          logger.info('✅ Position added to monitor successfully!', {
            context: 'AgentCoordinator',
            data: { 
              positionId, 
              symbol: workflow.symbol,
              side: riskAssessment.action === 'BUY' ? 'LONG' : 'SHORT'
            }
          });
          
          agent.status = 'idle';
          agent.currentTask = undefined;
          agent.performance.totalTasks++;
          agent.performance.successfulTasks++;

          return {
            executed: true,
            positionId,
            tradeResult,
            orderId: tradeResult.orderId,
            symbol: workflow.symbol,
            action: riskAssessment.action,
            positionSize: riskAssessment.positionSize,
            leverage: riskAssessment.leverage,
            timestamp: new Date().toISOString()
          };
        } catch (monitorError) {
          logger.error('❌ CRITICAL: Failed to add position to monitor', monitorError, {
            context: 'AgentCoordinator',
            data: { 
              symbol: workflow.symbol,
              errorMessage: monitorError instanceof Error ? monitorError.message : String(monitorError),
              errorStack: monitorError instanceof Error ? monitorError.stack : undefined
            }
          });
          
          agent.status = 'error';
          agent.performance.totalTasks++;
          
          return {
            executed: false,
            error: 'Failed to add position to monitor',
            errorDetails: monitorError instanceof Error ? monitorError.message : String(monitorError)
          };
        }

    } catch (error) {
      agent.status = 'error';
      agent.performance.totalTasks++;
      agent.performance.errorRate = agent.performance.errorRate + (1 / agent.performance.totalTasks);
      
      logger.error('Trade execution failed', error, {
        context: 'AgentCoordinator',
        symbol: workflow.symbol
      });
      
      throw error;
    }
  }

  /**
   * Update workflow context with step result
   */
  private updateWorkflowContext(workflow: TradingWorkflow, stepId: string, result: any): void {
    switch (stepId) {
      case 'data_gathering':
        workflow.context.marketData = result.market;
        break;
      case 'technical_analysis':
        workflow.context.technicalAnalysis = result;
        break;
      case 'chief_decision':
        workflow.context.finalDecision = result;
        break;
      case 'risk_assessment':
        workflow.context.riskAssessment = result;
        break;
      case 'execution_planning':
        workflow.context.executionPlan = result;
        break;
      case 'trade_execution':
        workflow.context.tradeResult = result;
        workflow.result = result;
        break;
    }
  }

  /**
   * Handle analysis messages
   */
  private async handleAnalysisMessage(message: AgentMessage): Promise<void> {
    logger.debug('📊 Handling analysis message', {
      context: 'AgentCoordinator',
      from: message.from,
      to: message.to,
      type: message.type
    });
    // Implementation for analysis message handling
  }

  /**
   * Handle decision messages
   */
  private async handleDecisionMessage(message: AgentMessage): Promise<void> {
    logger.debug('🎯 Handling decision message', {
      context: 'AgentCoordinator',
      from: message.from,
      to: message.to,
      type: message.type
    });
    // Implementation for decision message handling
  }

  /**
   * Handle query messages
   */
  private async handleQueryMessage(message: AgentMessage): Promise<void> {
    logger.debug('❓ Handling query message', {
      context: 'AgentCoordinator',
      from: message.from,
      to: message.to,
      type: message.type
    });
    // Implementation for query message handling
  }

  /**
   * Handle response messages
   */
  private async handleResponseMessage(message: AgentMessage): Promise<void> {
    logger.debug('💬 Handling response message', {
      context: 'AgentCoordinator',
      from: message.from,
      to: message.to,
      type: message.type
    });
    // Implementation for response message handling
  }

  /**
   * Handle alert messages
   */
  private async handleAlertMessage(message: AgentMessage): Promise<void> {
    logger.debug('🚨 Handling alert message', {
      context: 'AgentCoordinator',
      from: message.from,
      to: message.to,
      type: message.type
    });
    // Implementation for alert message handling
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentId: string): AgentState | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents status
   */
  getAllAgentsStatus(): AgentState[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): TradingWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get all workflows status
   */
  getAllWorkflowsStatus(): TradingWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Cancel workflow
   */
  cancelWorkflow(workflowId: string): boolean {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    workflow.status = 'cancelled';
    workflow.completedAt = Date.now();

    logger.info('🛑 Workflow cancelled', {
      context: 'AgentCoordinator',
      workflowId
    });

    return true;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    totalWorkflows: number;
    completedWorkflows: number;
    failedWorkflows: number;
    averageWorkflowTime: number;
    agentPerformance: AgentState[];
  } {
    const workflows = Array.from(this.workflows.values());
    const totalWorkflows = workflows.length;
    const completedWorkflows = workflows.filter(w => w.status === 'completed').length;
    const failedWorkflows = workflows.filter(w => w.status === 'failed').length;
    
    const completedWorkflowsWithTime = workflows.filter(w => w.status === 'completed' && w.completedAt);
    const averageWorkflowTime = completedWorkflowsWithTime.length > 0 
      ? completedWorkflowsWithTime.reduce((sum, w) => sum + (w.completedAt! - w.startedAt), 0) / completedWorkflowsWithTime.length
      : 0;

    return {
      totalWorkflows,
      completedWorkflows,
      failedWorkflows,
      averageWorkflowTime,
      agentPerformance: Array.from(this.agents.values())
    };
  }
}

// Export singleton instance with globalThis for Next.js dev hot-reload persistence
const globalForAgentCoordinator = globalThis as typeof globalThis & {
  __agentCoordinator?: AgentCoordinator;
};

if (!globalForAgentCoordinator.__agentCoordinator) {
  globalForAgentCoordinator.__agentCoordinator = new AgentCoordinator();
}

export const agentCoordinator = globalForAgentCoordinator.__agentCoordinator;
export default agentCoordinator;
