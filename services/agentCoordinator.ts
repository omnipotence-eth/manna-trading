/**
 * Agent Coordination Framework
 * Manages communication, state, and workflow between AI agents
 */

import { logger } from '@/lib/logger';
import { deepseekService } from '@/services/deepseekService';
import { AGENT_PROMPTS, MarketData, SentimentData, OnChainData, AnalystReports, FinalDecision, Portfolio, RiskApprovedTrade } from '@/lib/agentPrompts';
import { DEEPSEEK_OPTIMIZED_PROMPTS } from '@/lib/agentPromptsOptimized';
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
      { id: 'technical', name: 'Technical Analyst', model: 'deepseek-r1:32b' },
      { id: 'chief', name: 'Chief Analyst', model: 'deepseek-r1:32b' },
      { id: 'risk', name: 'Risk Manager', model: 'deepseek-r1:32b' },
      { id: 'execution', name: 'Execution Specialist', model: 'deepseek-r1:32b' }
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

      // Use OPTIMIZED prompts for DeepSeek R1's advanced reasoning
      const systemPrompt = DEEPSEEK_OPTIMIZED_PROMPTS.TECHNICAL_ANALYST.systemPrompt;
      const prompt = DEEPSEEK_OPTIMIZED_PROMPTS.TECHNICAL_ANALYST.analysisTemplate(marketData);
      const result = await deepseekService.chatWithSystem(systemPrompt, prompt, undefined, {
        format: 'json',
        temperature: 0.6,
        thinking: true, // Enable Chain-of-Thought reasoning
        max_tokens: 3000 // More tokens for detailed analysis
      });

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
   * Execute risk assessment step - USING DEEPSEEK R1 LLM
   */
  private async executeRiskAssessment(workflow: TradingWorkflow): Promise<any> {
    const agent = this.agents.get('risk');
    if (!agent) throw new Error('Risk agent not found');

    agent.status = 'working';
    agent.currentTask = 'Risk Assessment';
    agent.lastActivity = Date.now();

    try {
      // Get real balance data from API (no fallback - fail if unavailable)
      const balanceConfig = realBalanceService.getBalanceConfig();
      if (!balanceConfig || balanceConfig.availableBalance === undefined) {
        throw new Error('Unable to fetch real-time balance from Aster DEX API');
      }
      const balance = balanceConfig.availableBalance;
      
      // Ensure we have the final decision from Chief Analyst
      const finalDecision = workflow.context.finalDecision;
      if (!finalDecision) {
        throw new Error('Final decision not available for risk assessment');
      }

      const currentPrice = workflow.context.marketData?.price || 0;
      
      // CALL DEEPSEEK R1 LLM FOR RISK ASSESSMENT
      logger.info('🤖 Calling DeepSeek R1 for Risk Assessment', {
        context: 'AgentCoordinator',
        data: { 
          symbol: workflow.symbol,
          balance,
          chiefDecision: finalDecision.action,
          confidence: finalDecision.confidence
        }
      });

      const systemPrompt = DEEPSEEK_OPTIMIZED_PROMPTS.RISK_MANAGER.systemPrompt;
      const prompt = DEEPSEEK_OPTIMIZED_PROMPTS.RISK_MANAGER.assessmentTemplate({
        symbol: workflow.symbol,
        availableBalance: balance,
        currentPrice: currentPrice,
        marketData: workflow.context.marketData,
        technicalAnalysis: workflow.context.technicalAnalysis,
        chiefDecision: finalDecision
      });

      const result = await deepseekService.chatWithSystem(systemPrompt, prompt, undefined, {
        format: 'json',
        temperature: 0.4, // Conservative for risk assessment
        thinking: true,
        max_tokens: 2000
      });

      let riskAssessment: any;
      try {
        riskAssessment = JSON.parse(result);
      } catch (parseError) {
        logger.error('Failed to parse Risk Manager response', parseError as Error, {
          context: 'AgentCoordinator',
          response: result
        });
        throw new Error('Invalid Risk Manager response format');
      }

      // Validate required fields
      if (typeof riskAssessment.approved !== 'boolean' ||
          !riskAssessment.action ||
          typeof riskAssessment.positionSize !== 'number') {
        throw new Error('Risk Manager response missing required fields');
      }

      // ENFORCE CONCURRENT POSITION LIMITS (CRITICAL FOR SMALL ACCOUNTS)
      if (riskAssessment.approved) {
        const { asterConfig } = await import('@/lib/configService');
        const { positionMonitorService } = await import('@/services/positionMonitorService');
        const openPositions = positionMonitorService.getOpenPositions();
        const maxConcurrentPositions = asterConfig.trading.maxConcurrentPositions || 2;
        const maxPortfolioRiskPercent = asterConfig.trading.maxPortfolioRiskPercent || 10;

        // Check concurrent positions limit (STRICTER for <$100 accounts)
        const maxPositionsForAccount = balance < 100 ? 1 : maxConcurrentPositions;
        if (openPositions.length >= maxPositionsForAccount) {
          logger.warn(`⛔ Trade REJECTED: Max concurrent positions (${maxPositionsForAccount}) reached`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              currentPositions: openPositions.length,
              maxPositions: maxPositionsForAccount,
              accountBalance: balance,
              openPositions: openPositions.map(p => p.symbol)
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Maximum concurrent positions (${maxPositionsForAccount}) already open. Current positions: ${openPositions.map(p => p.symbol).join(', ')}`;
        }

        // Check portfolio risk limit (STRICTER for <$100 accounts)
        const maxRiskForAccount = balance < 100 ? 5 : maxPortfolioRiskPercent;
        const totalRisk = openPositions.reduce((sum, pos) => {
          const positionRisk = Math.abs((pos.stopLoss - pos.entryPrice) / pos.entryPrice * 100);
          return sum + (positionRisk * (pos.entryPrice * pos.size) / balance * 100);
        }, 0);
        
        const newPositionRisk = riskAssessment.riskPercentage || 0;
        const totalRiskAfter = totalRisk + newPositionRisk;
        
        if (totalRiskAfter > maxRiskForAccount) {
          logger.warn(`⛔ Trade REJECTED: Portfolio risk would exceed ${maxRiskForAccount}%`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              currentRisk: totalRisk.toFixed(2),
              newPositionRisk: newPositionRisk.toFixed(2),
              totalRiskAfter: totalRiskAfter.toFixed(2),
              maxRisk: maxRiskForAccount,
              accountBalance: balance
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Portfolio risk would exceed ${maxRiskForAccount}% limit (currently ${totalRisk.toFixed(2)}% + ${newPositionRisk.toFixed(2)}% = ${totalRiskAfter.toFixed(2)}%)`;
        }

        // ENFORCE LEVERAGE LIMIT FOR SMALL ACCOUNTS
        if (balance < 500 && riskAssessment.leverage > 1) {
          logger.warn(`⛔ Trade REJECTED: Account <$500 cannot use leverage`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              balance,
              requestedLeverage: riskAssessment.leverage
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Accounts <$500 cannot use leverage (requested ${riskAssessment.leverage}x, must be 1x)`;
        }

        // ENFORCE POSITION SIZE LIMIT FOR MICRO ACCOUNTS (ULTRA STRICT)
        const positionRiskPercent = riskAssessment.riskPercentage || 0;
        if (balance < 100 && positionRiskPercent > 3) {
          logger.warn(`⛔ Trade REJECTED: Position risk exceeds 3% limit for accounts <$100`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              balance,
              riskPercent: positionRiskPercent
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Position risk (${positionRiskPercent.toFixed(2)}%) exceeds 3% maximum for accounts <$100`;
        } else if (balance < 200 && positionRiskPercent > 5) {
          logger.warn(`⛔ Trade REJECTED: Position risk exceeds 5% limit for accounts <$200`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              balance,
              riskPercent: positionRiskPercent
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Position risk (${positionRiskPercent.toFixed(2)}%) exceeds 5% maximum for accounts <$200`;
        } else if (balance < 500 && positionRiskPercent > 5) {
          logger.warn(`⛔ Trade REJECTED: Position risk exceeds 5% limit for accounts <$500`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              balance,
              riskPercent: positionRiskPercent
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Position risk (${positionRiskPercent.toFixed(2)}%) exceeds 5% maximum for accounts <$500`;
        }
        
        // ENFORCE MINIMUM R:R RATIO FOR MICRO ACCOUNTS
        const minRRForAccount = balance < 100 ? 4.0 : balance < 200 ? 3.5 : balance < 500 ? 3.0 : 2.5;
        const actualRR = riskAssessment.riskRewardRatio || 0;
        if (actualRR < minRRForAccount) {
          logger.warn(`⛔ Trade REJECTED: Risk/Reward ratio ${actualRR.toFixed(2)}:1 below ${minRRForAccount}:1 minimum for account size`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              balance,
              actualRR,
              minRR: minRRForAccount
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Risk/Reward ratio ${actualRR.toFixed(2)}:1 below ${minRRForAccount}:1 minimum required for accounts of this size`;
        }

        // FINAL CHECK: Verify coin is not problematic (COSMO/APE-like issues)
        const { problematicCoinDetector } = await import('@/services/problematicCoinDetector');
        if (problematicCoinDetector.isProblematic(workflow.symbol)) {
          const problematicCoin = problematicCoinDetector.getProblematicCoin(workflow.symbol);
          logger.warn(`⛔ Trade REJECTED: Coin is problematic (execution issues like COSMO/APE)`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              reason: problematicCoin?.reason || 'Execution problems detected',
              metrics: problematicCoin?.metrics
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: ${workflow.symbol} is problematic - ${problematicCoin?.reason || 'Execution issues detected (similar to COSMO/APE)'}`;
        }
      }

      logger.info(`🛡️ Risk Manager Decision: ${riskAssessment.approved ? 'APPROVED' : 'REJECTED'}`, {
        context: 'AgentCoordinator',
        data: {
          symbol: workflow.symbol,
          approved: riskAssessment.approved,
          action: riskAssessment.action,
          positionSize: riskAssessment.positionSize,
          leverage: riskAssessment.leverage,
          riskRewardRatio: riskAssessment.riskRewardRatio,
          reasoning: riskAssessment.reasoning
        }
      });

      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.performance.totalTasks++;
      if (riskAssessment.approved) {
        agent.performance.successfulTasks++;
      }

      return riskAssessment;
    } catch (error) {
      agent.status = 'error';
      agent.performance.totalTasks++;
      agent.performance.errorRate = agent.performance.errorRate + (1 / agent.performance.totalTasks);
      
      logger.error('Risk Assessment failed', error as Error, {
        context: 'AgentCoordinator',
        symbol: workflow.symbol
      });
      
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
      
      // Check blacklist FIRST
      const { asterConfig } = await import('@/lib/configService');
      const blacklist = asterConfig.trading.blacklistedSymbols || [];
      const symbolVariants = [workflow.symbol, workflow.symbol.replace('/', '')];
      const isBlacklisted = blacklist.some(b => symbolVariants.includes(b));

      if (isBlacklisted) {
        logger.warn('⛔ Symbol is blacklisted - trade blocked', {
          context: 'AgentCoordinator',
          data: { 
            symbol: workflow.symbol,
            blacklist
          }
        });
        
        agent.status = 'idle';
        agent.currentTask = undefined;
        agent.performance.totalTasks++;
        agent.performance.successfulTasks++;
        
        return {
          readyToExecute: false,
          reason: 'Symbol is blacklisted',
          action: 'HOLD'
        };
      }

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

        // Save trade to database for trade journal/chat
        try {
          const { addTrade } = await import('@/lib/db');
          const tradeEntry = {
            id: `trade-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            timestamp: new Date().toISOString(),
            model: 'Multi-Agent AI',
            symbol: workflow.symbol,
            side: (riskAssessment.action === 'BUY' ? 'LONG' : 'SHORT') as 'LONG' | 'SHORT',
            size: riskAssessment.positionSize,
            entryPrice: finalDecision?.currentPrice || 0,
            exitPrice: 0, // Will be updated when position closes
            pnl: 0, // Will be updated when position closes
            pnlPercent: 0,
            leverage: riskAssessment.leverage,
            entryReason: `Multi-Agent Analysis: ${finalDecision?.reasoning?.substring(0, 200) || 'High confidence opportunity'}`,
            entryConfidence: finalDecision?.confidence || 0,
            entrySignals: {
              volumeScore: (workflow.context.marketData as any)?.volumeScore || 0,
              momentumScore: (workflow.context.marketData as any)?.momentumScore || 0,
              liquidityScore: (workflow.context.marketData as any)?.liquidityScore || 0,
              technicalAnalysis: workflow.context.technicalAnalysis || {},
              sentiment: (workflow.context.sentimentData as any)?.sentiment || 'neutral'
            },
            entryMarketRegime: (workflow.context.marketData as any)?.regime || 'unknown',
            entryScore: (finalDecision as any)?.opportunityScore || 0,
            exitReason: '', // Will be set when position closes
            exitTimestamp: null,
            duration: 0
          };
          
          await addTrade(tradeEntry);
          logger.info('📝 Trade saved to database for journal', {
            context: 'AgentCoordinator',
            data: { tradeId: tradeEntry.id, symbol: workflow.symbol }
          });
        } catch (dbError) {
          logger.error('Failed to save trade to database (non-critical)', dbError, {
            context: 'AgentCoordinator'
          });
          // Non-critical error, continue with position monitoring
        }

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
