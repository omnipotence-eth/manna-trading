/**
 * Agent Coordination Framework
 * Manages communication, state, and workflow between AI agents
 * CRITICAL FIX: Added mutex protection for concurrent workflow safety
 */

import { logger } from '@/lib/logger';
import { deepseekService } from '@/services/deepseekService';
import { AGENT_PROMPTS, MarketData, SentimentData, OnChainData, AnalystReports, FinalDecision, Portfolio, RiskApprovedTrade } from '@/lib/agentPrompts';
import { DEEPSEEK_OPTIMIZED_PROMPTS } from '@/lib/agentPromptsOptimized';
import { realBalanceService } from '@/services/realBalanceService';
import { TRADING_THRESHOLDS } from '@/constants/tradingConstants';
import { Mutex } from 'async-mutex';

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

export interface WorkflowContext {
  marketData?: any;
  technicalAnalysis?: any;
  chiefDecision?: any;
  riskAssessment?: any;
  executionPlan?: any;
  [key: string]: any;
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
  context: WorkflowContext;
}

export class AgentCoordinator {
  private agents: Map<string, AgentState> = new Map();
  private messageQueue: AgentMessage[] = [];
  private workflows: Map<string, TradingWorkflow> = new Map();
  private isRunning = false;
  private messageHandlers: Map<string, (message: AgentMessage) => Promise<void>> = new Map();
  // CRITICAL FIX: Add mutex for workflow synchronization
  private workflowMutex = new Mutex();

  constructor() {
    this.initializeAgents();
    this.setupMessageHandlers();
    logger.info('Agent Coordinator initialized', {
      context: 'AgentCoordinator',
      data: { agents: Array.from(this.agents.keys()) }
    });
  }

  /**
   * Initialize all agents
   */
  private initializeAgents(): void {
    const agentConfigs = [
      { id: 'technical', name: 'Technical Analyst', model: 'deepseek-r1:14b' },
      { id: 'chief', name: 'Chief Analyst', model: 'deepseek-r1:14b' },
      { id: 'risk', name: 'Risk Manager', model: 'deepseek-r1:14b' },
      { id: 'execution', name: 'Execution Specialist', model: 'deepseek-r1:14b' }
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
   * CRITICAL FIX: Protected with mutex to prevent duplicate workflows
   */
  async startTradingWorkflow(symbol: string): Promise<string> {
    return await this.workflowMutex.runExclusive(async () => {
      // Check if workflow already exists for this symbol
      const existingWorkflow = Array.from(this.workflows.values()).find(
        wf => wf.symbol === symbol && wf.status === 'running'
      );
      
      if (existingWorkflow) {
        logger.warn('Workflow already running for symbol, returning existing', {
          context: 'AgentCoordinator',
          data: { symbol, existingId: existingWorkflow.id }
        });
        return existingWorkflow.id;
      }
      
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
    
    logger.info('Started trading workflow', {
      context: 'AgentCoordinator',
      data: {
        workflowId,
        symbol,
        totalSteps: steps.length,
        stepsCreated: steps.map(s => s.name),
        workflowsInMemory: this.workflows.size
      }
    });

    // CRITICAL FIX: Start workflow execution properly without fire-and-forget
    // Execute in background but track errors correctly
    // IMPORTANT: Don't await - workflow execution is async and may take time
    // But verify it's queued properly
    this.executeWorkflow(workflowId).catch(error => {
      logger.error('Workflow execution failed', error, {
        context: 'AgentCoordinator',
        data: { workflowId, symbol }
      });
      
      // Update workflow status on error
      const wf = this.workflows.get(workflowId);
      if (wf) {
        wf.status = 'failed';
        wf.completedAt = Date.now();
      }
    });
    
    // CRITICAL FIX: Verify workflow is in the map and has correct status
    const verifyWorkflow = this.workflows.get(workflowId);
    if (!verifyWorkflow) {
      throw new Error(`Workflow ${workflowId} not found in workflows map after creation`);
    }
    
    if (verifyWorkflow.status !== 'running') {
      throw new Error(`Workflow ${workflowId} status is ${verifyWorkflow.status}, expected 'running'`);
    }
    
    // Verify workflow has steps
    if (!verifyWorkflow.steps || verifyWorkflow.steps.length === 0) {
      throw new Error(`Workflow ${workflowId} has no steps`);
    }

      return workflowId;
    }); // End of mutex.runExclusive
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

    logger.debug('Executing workflow steps', {
      context: 'AgentCoordinator',
      workflowId,
      totalSteps: workflow.steps.length
    });

    // CRITICAL FIX: Add workflow-level timeout (5 minutes)
    const WORKFLOW_TIMEOUT = 300000; // 5 minutes
    const workflowStartTime = Date.now();

    try {
      // Execute steps sequentially, waiting for each to complete
      let executedSteps = 0;
      const maxIterations = workflow.steps.length * 2; // Safety limit
      let iterations = 0;
      
      while (executedSteps < workflow.steps.length && iterations < maxIterations) {
        iterations++;
        
        // Check if workflow has exceeded timeout
        const elapsed = Date.now() - workflowStartTime;
        if (elapsed > WORKFLOW_TIMEOUT) {
          throw new Error(`Workflow timeout: exceeded ${WORKFLOW_TIMEOUT / 1000}s limit (elapsed: ${(elapsed / 1000).toFixed(1)}s)`);
        }
        
        // Find next executable step
        let stepExecuted = false;
        for (const step of workflow.steps) {
          if (step.status === 'pending' && this.canExecuteStep(step, workflow)) {
            logger.debug(`Executing step: ${step.name}`, {
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
            logger.error('Workflow stuck - pending steps with unmet dependencies', null, {
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
        
        logger.info('Workflow completed successfully', {
          context: 'AgentCoordinator',
          workflowId,
          duration: `${((workflow.completedAt - workflow.startedAt) / 1000).toFixed(1)}s`,
          completedSteps,
          totalSteps: workflow.steps.length
        });
      } else if (failedSteps > 0) {
        workflow.status = 'failed';
        workflow.completedAt = Date.now();
        
        logger.error('Workflow failed with errors', null, {
          context: 'AgentCoordinator',
          workflowId,
          failedSteps,
          completedSteps
        });
      } else {
        workflow.status = 'failed';
        workflow.completedAt = Date.now();
        
        logger.warn('Workflow partially completed', {
          context: 'AgentCoordinator',
          workflowId,
          completedSteps,
          totalSteps: workflow.steps.length
        });
      }
    } catch (error) {
      workflow.status = 'failed';
      workflow.completedAt = Date.now();
      
      logger.error('Workflow execution error', error, {
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

    logger.debug('Executing step', {
      context: 'AgentCoordinator',
      workflowId,
      stepId: step.id,
      agent: step.agent
    });

    try {
      let result: any;

      // CRITICAL FIX: Add timeout protection (2 minutes per step)
      const STEP_TIMEOUT = 120000; // 2 minutes
      const stepPromise = (async () => {
        switch (step.id) {
          case 'data_gathering':
            return await this.executeDataGathering(workflow);
          case 'technical_analysis':
            return await this.executeTechnicalAnalysis(workflow);
          case 'chief_decision':
            return await this.executeChiefDecision(workflow);
          case 'risk_assessment':
            return await this.executeRiskAssessment(workflow);
          case 'execution_planning':
            return await this.executeExecutionPlanning(workflow);
          case 'trade_execution':
            return await this.executeTradeExecution(workflow);
          default:
            throw new Error(`Unknown step: ${step.id}`);
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Step timeout: ${step.id} exceeded ${STEP_TIMEOUT / 1000}s limit`));
        }, STEP_TIMEOUT);
      });

      result = await Promise.race([stepPromise, timeoutPromise]);

      step.status = 'completed';
      step.completedAt = Date.now();
      step.result = result;

      // Update workflow context
      this.updateWorkflowContext(workflow, step.id, result);

      logger.debug('Step completed', {
        context: 'AgentCoordinator',
        workflowId,
        stepId: step.id,
        duration: step.completedAt - step.startedAt!
      });

      // CRITICAL FIX: Don't recursively call executeWorkflow!
      // The main loop in executeWorkflow will handle the next step

    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      step.completedAt = Date.now();

      logger.error('Step failed', error, {
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
        
        logger.info('Retrying step', {
          context: 'AgentCoordinator',
          workflowId,
          stepId: step.id,
          retryCount: step.retryCount
        });

        // CRITICAL FIX: Use proper async delay instead of setTimeout
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Retry will be handled by main workflow loop
      }
    }
  }

  /**
   * Execute data gathering step
   */
  private async executeDataGathering(workflow: TradingWorkflow): Promise<any> {
    logger.debug('Gathering market data', {
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

      // DEEPSEEK R1 REQUIRED - No fallback!
      const systemPrompt = DEEPSEEK_OPTIMIZED_PROMPTS.TECHNICAL_ANALYST.systemPrompt;
      const prompt = DEEPSEEK_OPTIMIZED_PROMPTS.TECHNICAL_ANALYST.analysisTemplate(marketData);
      
      // CRITICAL DEBUG: Log prompt details to diagnose hangs
      logger.info('🔍 Calling DeepSeek R1 for Technical Analysis', {
        context: 'AgentCoordinator',
        symbol: workflow.symbol,
        model: 'deepseek-r1:14b',
        promptLength: prompt.length,
        systemPromptLength: systemPrompt.length,
        totalChars: prompt.length + systemPrompt.length,
        promptPreview: prompt.substring(0, 200) + '...',
        options: {
          format: 'json',
          temperature: 0.6,
          thinking: true,
          max_tokens: 3000
        }
      });
      
      const startTime = Date.now();
      const result = await deepseekService.chatWithSystem(systemPrompt, prompt, undefined, {
        format: 'json',
        temperature: 0.6,
        thinking: true, // Enable Chain-of-Thought reasoning
        max_tokens: 3000 // More tokens for detailed analysis
      });
      const elapsed = Date.now() - startTime;
      
      logger.info('✅ DeepSeek Technical Analysis response received', {
        context: 'AgentCoordinator',
        symbol: workflow.symbol,
        elapsed: `${elapsed}ms`,
        resultType: typeof result
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
   * Execute chief analyst decision step - USING DEEPSEEK R1 LLM
   */
  private async executeChiefDecision(workflow: TradingWorkflow): Promise<any> {
    const agent = this.agents.get('chief');
    if (!agent) throw new Error('Chief agent not found');

    agent.status = 'working';
    agent.currentTask = 'Chief Decision';
    agent.lastActivity = Date.now();

    try {
      // Validate technical analysis data
      const technicalAnalysis = workflow.context.technicalAnalysis;
      if (!technicalAnalysis || typeof technicalAnalysis !== 'object') {
        throw new Error('Missing or invalid technical analysis data for Chief Analyst decision');
      }

      // DEEPSEEK R1 REQUIRED - Chief Analyst makes final decision with AI
      logger.info('Calling DeepSeek R1 for Chief Analyst Decision', {
        context: 'AgentCoordinator',
        symbol: workflow.symbol,
        technicalAction: technicalAnalysis.action
      });

      // Use Technical Analyst prompt for now (Chief Analyst prompt template)
      const systemPrompt = `You are the Chief Analyst AI agent in a multi-agent trading system. Your role is to make the FINAL BUY/SELL/HOLD decision based on technical analysis provided by the Technical Analyst. You must be decisive and provide clear reasoning.`;
      
      const prompt = `Analyze this trading opportunity and make a FINAL decision:

Symbol: ${workflow.symbol}
Current Price: $${workflow.context.marketData?.price || 0}

Technical Analyst Says:
- Action: ${technicalAnalysis.action}
- Confidence: ${(technicalAnalysis.confidence * 100).toFixed(0)}%
- Reasoning: ${technicalAnalysis.reasoning}

Market Data:
- RSI: ${(workflow.context.marketData as any)?.rsi || 'N/A'}
- Momentum: ${(workflow.context.marketData as any)?.change1h || 0}%
- Volume: ${(workflow.context.marketData as any)?.volume || 0}
- Volatility: ${(workflow.context.marketData as any)?.volatility || 0}%

Make your FINAL decision (BUY/SELL/HOLD) with confidence level and reasoning.

Respond in JSON format:
{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": 0.0-1.0,
  "reasoning": "your detailed reasoning",
  "conviction": "low" | "medium" | "high"
}`;

      const result = await deepseekService.chatWithSystem(systemPrompt, prompt, undefined, {
        format: 'json',
        temperature: 0.5, // Balanced for decision making
        thinking: true, // Chain-of-Thought reasoning
        max_tokens: 2000
      });

      let decision: any;
      try {
        // CRITICAL FIX: DeepSeek might return already-parsed object or JSON string
        // Check if it's already an object before parsing
        if (typeof result === 'string') {
          decision = JSON.parse(result);
        } else if (typeof result === 'object' && result !== null) {
          decision = result; // Already parsed
        } else {
          throw new Error(`Unexpected result type: ${typeof result}`);
        }
      } catch (parseError) {
        logger.error('Failed to parse Chief Analyst response', parseError as Error, {
          context: 'AgentCoordinator',
          response: result,
          resultType: typeof result
        });
        throw new Error('Invalid Chief Analyst response format');
      }

      // Validate decision structure
      if (!decision.action || !decision.confidence) {
        throw new Error('Chief Analyst response missing required fields');
      }

      logger.info('Chief Analyst Decision (DeepSeek R1)', {
        context: 'AgentCoordinator',
        data: {
          symbol: workflow.symbol,
          action: decision.action,
          confidence: decision.confidence,
          reasoning: decision.reasoning?.substring(0, 100)
        }
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
      // CRITICAL FIX: Add null check with default value
      const balance = balanceConfig.availableBalance ?? 0;
      if (balance <= 0) {
        throw new Error('Account balance is zero or negative - cannot trade');
      }
      
      // HIGH PRIORITY FIX: Validate final decision structure before using
      const finalDecision = workflow.context.finalDecision;
      if (!finalDecision || typeof finalDecision !== 'object') {
        throw new Error('Final decision not available or invalid for risk assessment');
      }
      
      // HIGH PRIORITY FIX: Validate required fields exist
      if (typeof finalDecision.action !== 'string' || !['BUY', 'SELL', 'HOLD'].includes(finalDecision.action)) {
        throw new Error(`Invalid final decision action: ${finalDecision.action}`);
      }
      if (typeof finalDecision.confidence !== 'number' || finalDecision.confidence < 0 || finalDecision.confidence > 1) {
        throw new Error(`Invalid final decision confidence: ${finalDecision.confidence}`);
      }

      const currentPrice = workflow.context.marketData?.price || 0;
      
      // REINFORCEMENT LEARNING PHASE 1: Get lessons learned from trade history
      let lessonsLearned: any = null;
      try {
        const { tradePatternAnalyzer } = await import('@/services/tradePatternAnalyzer');
        lessonsLearned = await tradePatternAnalyzer.getLessonsLearned(30); // Last 30 days
        
        logger.info('Loaded lessons learned from trade history', {
          context: 'AgentCoordinator',
          data: {
            successfulPatterns: lessonsLearned.successfulPatterns?.length || 0,
            failurePatterns: lessonsLearned.failurePatterns?.length || 0,
            insights: lessonsLearned.insights?.length || 0,
            winRate: lessonsLearned.averageWinRate?.toFixed(1) + '%' || 'N/A'
          }
        });
      } catch (error) {
        logger.warn('Failed to load lessons learned (continuing without RL)', {
          context: 'AgentCoordinator',
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue without lessons learned if there's an error (no trades yet, etc.)
      }
      
      // REINFORCEMENT LEARNING PHASE 2: Get RL-optimized parameters
      let dynamicConfig: any = null;
      
      // TEMPORARY FOR DEMO: Check if RL optimizer should be disabled
      const disableRLOptimizer = process.env.DISABLE_RL_OPTIMIZER === 'true';
      
      if (!disableRLOptimizer) {
        try {
          const { dynamicConfigService } = await import('@/services/dynamicConfigService');
          dynamicConfig = await dynamicConfigService.getOptimizedConfig();
          
          logger.info('Loaded RL-optimized parameters', {
            context: 'AgentCoordinator',
            data: {
              confidenceThreshold: dynamicConfig.confidenceThreshold,
              rrRatio: dynamicConfig.minRRRatio,
              positionSize: dynamicConfig.maxPositionRiskPercent + '%',
              stopLoss: dynamicConfig.stopLossPercent + '%',
              reasoning: dynamicConfig.reasoning
            }
          });
        } catch (error) {
        logger.warn('Failed to load dynamic config (using defaults)', {
          context: 'AgentCoordinator',
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with default config
        }
      } else {
        const { asterConfig } = await import('@/lib/configService');
        logger.info('RL optimizer DISABLED for demo - using env var confidence threshold', {
          context: 'AgentCoordinator',
          data: {
            confidenceThreshold: asterConfig.trading.confidenceThreshold,
            reason: 'DISABLE_RL_OPTIMIZER=true in .env.local'
          }
        });
      }
      
      // CALL DEEPSEEK R1 LLM FOR RISK ASSESSMENT
      logger.info('Calling DeepSeek R1 for Risk Assessment', {
        context: 'AgentCoordinator',
        data: { 
          symbol: workflow.symbol,
          balance,
          chiefDecision: finalDecision.action,
          confidence: finalDecision.confidence,
          hasLessonsLearned: !!lessonsLearned
        }
      });

      // ENHANCED: Get ATR-based stop loss recommendations
      // CRITICAL FIX: Use correct side (LONG or SHORT) for ATR calculation
      let atrBasedLevels = null;
      try {
        const { calculateSimpleATRWithSide } = await import('@/lib/atr');
        const marketData = workflow.context.marketData as any;
        
        // Determine side based on Chief Analyst decision
        // BUY = LONG, SELL = SHORT
        const side = finalDecision.action === 'BUY' ? 'LONG' : finalDecision.action === 'SELL' ? 'SHORT' : 'LONG'; // Default to LONG for HOLD
        
        if (marketData?.high && marketData?.low && marketData?.open) {
          const atrResult = calculateSimpleATRWithSide(
            marketData.price || currentPrice,
            marketData.high,
            marketData.low,
            marketData.open,
            side
          );
          
          atrBasedLevels = {
            atr: atrResult.atr,
            atrPercent: atrResult.atrPercent,
            recommendedStopLoss: atrResult.stopLoss,
            recommendedTakeProfit: atrResult.takeProfit,
            volatilityLevel: atrResult.volatilityLevel,
            trailingStop: atrResult.trailingStop
          };
          
          logger.info('ATR-based levels calculated', {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              side: side, // Log the side being used
              action: finalDecision.action,
              atrPercent: atrResult.atrPercent.toFixed(2) + '%',
              volatility: atrResult.volatilityLevel,
              stopLoss: atrResult.stopLoss.toFixed(2),
              takeProfit: atrResult.takeProfit.toFixed(2)
            }
          });
        }
      } catch (atrError) {
        logger.warn('Failed to calculate ATR levels (using defaults)', {
          context: 'AgentCoordinator',
          error: atrError instanceof Error ? atrError.message : String(atrError)
        });
      }

      const systemPrompt = DEEPSEEK_OPTIMIZED_PROMPTS.RISK_MANAGER.systemPrompt;
      const prompt = DEEPSEEK_OPTIMIZED_PROMPTS.RISK_MANAGER.assessmentTemplate({
        symbol: workflow.symbol,
        availableBalance: balance,
        currentPrice: currentPrice,
        marketData: workflow.context.marketData,
        technicalAnalysis: workflow.context.technicalAnalysis,
        chiefDecision: finalDecision,
        lessonsLearned: lessonsLearned, // Phase 1: Lessons learned from patterns
        dynamicConfig: dynamicConfig // Phase 2: RL-optimized parameters
        // Note: ATR levels available via marketData if needed
      });

      const result = await deepseekService.chatWithSystem(systemPrompt, prompt, undefined, {
        format: 'json',
        temperature: 0.4, // Conservative for risk assessment
        thinking: true,
        max_tokens: 2000
      });

      // CRITICAL FIX: Log immediately after DeepSeek responds
      logger.info('✅ DeepSeek Risk Assessment response received', {
        context: 'AgentCoordinator',
        data: {
          symbol: workflow.symbol,
          resultType: typeof result,
          resultIsNull: result === null,
          resultIsUndefined: result === undefined,
          resultLength: typeof result === 'string' ? result.length : 'N/A',
          firstChars: typeof result === 'string' ? result.substring(0, 100) : JSON.stringify(result).substring(0, 100)
        }
      });

      let riskAssessment: any;
      try {
        // CRITICAL FIX: DeepSeek might return already-parsed object or JSON string
        if (typeof result === 'string') {
          logger.debug('Parsing DeepSeek response as JSON string', {
            context: 'AgentCoordinator'
          });
          riskAssessment = JSON.parse(result);
        } else if (typeof result === 'object' && result !== null) {
          logger.debug('DeepSeek response already parsed as object', {
            context: 'AgentCoordinator'
          });
          riskAssessment = result; // Already parsed
        } else {
          throw new Error(`Unexpected result type: ${typeof result}`);
        }
      } catch (parseError) {
        logger.error('Failed to parse Risk Manager response', parseError as Error, {
          context: 'AgentCoordinator',
          response: result,
          resultType: typeof result
        });
        throw new Error('Invalid Risk Manager response format');
      }

      // CRITICAL FIX: Log actual response structure for debugging
      logger.debug('Risk Manager response structure', {
        context: 'AgentCoordinator',
        data: {
          hasApproved: riskAssessment.approved !== undefined,
          approvedType: typeof riskAssessment.approved,
          approvedValue: riskAssessment.approved,
          hasAction: !!riskAssessment.action,
          actionValue: riskAssessment.action,
          hasPositionSize: riskAssessment.positionSize !== undefined,
          positionSizeType: typeof riskAssessment.positionSize,
          positionSizeValue: riskAssessment.positionSize,
          allKeys: Object.keys(riskAssessment),
          fullResponse: JSON.stringify(riskAssessment).substring(0, 500)
        }
      });

      // Validate required fields with better error messages
      const missingFields: string[] = [];
      
      if (typeof riskAssessment.approved !== 'boolean') {
        missingFields.push(`approved (got ${typeof riskAssessment.approved}: ${riskAssessment.approved})`);
      }
      if (!riskAssessment.action) {
        missingFields.push(`action (got ${typeof riskAssessment.action}: ${riskAssessment.action})`);
      }
      if (typeof riskAssessment.positionSize !== 'number') {
        missingFields.push(`positionSize (got ${typeof riskAssessment.positionSize}: ${riskAssessment.positionSize})`);
      }
      
      if (missingFields.length > 0) {
        logger.error('Risk Manager response validation failed', null, {
          context: 'AgentCoordinator',
          data: {
            missingFields,
            receivedFields: Object.keys(riskAssessment),
            response: riskAssessment
          }
        });
        throw new Error(`Risk Manager response missing required fields: ${missingFields.join(', ')}`);
      }

      // CRITICAL FIX: Check Chief Analyst confidence vs threshold FIRST
      // This ensures we use AI agents' confidence, NOT Market Scanner confidence
      if (riskAssessment.approved) {
        const { asterConfig } = await import('@/lib/configService');
        const chiefConfidence = finalDecision.confidence;
        const threshold = asterConfig.trading.confidenceThreshold;
        
        if (chiefConfidence < threshold) {
          logger.warn(`Trade REJECTED: Chief Analyst confidence below threshold`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              chiefConfidence: (chiefConfidence * 100).toFixed(0) + '%',
              threshold: (threshold * 100).toFixed(0) + '%',
              balance
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Chief Analyst confidence ${(chiefConfidence*100).toFixed(0)}% below required ${(threshold*100).toFixed(0)}% threshold`;
          return riskAssessment;
        }
        
        logger.info(`✅ Confidence check PASSED: Chief Analyst ${(chiefConfidence*100).toFixed(0)}% >= Threshold ${(threshold*100).toFixed(0)}%`, {
          context: 'AgentCoordinator',
          data: { symbol: workflow.symbol, chiefConfidence, threshold }
        });
      }
      
      // ENFORCE CONCURRENT POSITION LIMITS (CRITICAL FOR SMALL ACCOUNTS)
      if (riskAssessment.approved) {
        const { positionMonitorService } = await import('@/services/positionMonitorService');
        const openPositions = positionMonitorService.getOpenPositions();
        const { asterConfig } = await import('@/lib/configService');
        const maxConcurrentPositions = asterConfig.trading.maxConcurrentPositions || 2;
        const maxPortfolioRiskPercent = asterConfig.trading.maxPortfolioRiskPercent || 10;

        // ENFORCE MAX CONCURRENT POSITIONS FOR MICRO ACCOUNTS
        const maxPositionsForAccount = balance < TRADING_THRESHOLDS.MICRO_ACCOUNT_THRESHOLD ? 1 : maxConcurrentPositions;
        if (openPositions.length >= maxPositionsForAccount) {
          logger.warn(`Trade REJECTED: Max concurrent positions (${maxPositionsForAccount}) reached`, {
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
        const maxRiskForAccount = balance < TRADING_THRESHOLDS.MICRO_ACCOUNT_THRESHOLD ? TRADING_THRESHOLDS.MAX_PORTFOLIO_RISK_MICRO : maxPortfolioRiskPercent;
        
        // HIGH PRIORITY FIX: Validate portfolio risk calculation with type safety
        let totalRisk = openPositions.reduce((sum, pos) => {
          // Validate position data before calculation
          if (!pos.stopLoss || !pos.entryPrice || !pos.size || pos.entryPrice <= 0 || balance <= 0) {
            logger.warn(`Invalid position data for risk calculation: ${pos.symbol}`, {
              context: 'AgentCoordinator',
              data: { symbol: pos.symbol, stopLoss: pos.stopLoss, entryPrice: pos.entryPrice, size: pos.size }
            });
            return sum; // Skip invalid positions
          }
          
          const positionRisk = Math.abs((pos.stopLoss - pos.entryPrice) / pos.entryPrice * 100);
          const positionRiskValue = (positionRisk * (pos.entryPrice * pos.size) / balance * 100);
          
          // Validate result is finite and reasonable
          if (!isFinite(positionRiskValue) || positionRiskValue < 0 || positionRiskValue > 100) {
            logger.warn(`Invalid risk calculation result for ${pos.symbol}: ${positionRiskValue}`, {
              context: 'AgentCoordinator',
              data: { symbol: pos.symbol, positionRiskValue }
            });
            return sum; // Skip invalid calculations
          }
          
          return sum + positionRiskValue;
        }, 0);
        
        // HIGH PRIORITY FIX: Validate new position risk
        const newPositionRisk = typeof riskAssessment.riskPercentage === 'number' 
          ? Math.max(0, Math.min(100, riskAssessment.riskPercentage)) // Clamp between 0-100
          : 0;
        
        // Validate total risk calculation
        if (!isFinite(totalRisk) || totalRisk < 0) {
          logger.warn('Invalid total risk calculation, resetting to 0', {
            context: 'AgentCoordinator',
            data: { totalRisk, balance }
          });
          totalRisk = 0;
        }
        
        const totalRiskAfter = totalRisk + newPositionRisk;
        
        // Validate total risk after is reasonable
        if (!isFinite(totalRiskAfter) || totalRiskAfter < 0 || totalRiskAfter > 200) {
          logger.error('Invalid total risk after calculation', {
            context: 'AgentCoordinator',
            data: { totalRisk, newPositionRisk, totalRiskAfter, balance }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = 'Trade rejected: Invalid risk calculation - system error';
          return riskAssessment;
        }
        
        if (totalRiskAfter > maxRiskForAccount) {
          logger.warn(`Trade REJECTED: Portfolio risk would exceed ${maxRiskForAccount}%`, {
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

        // OPTIMIZE LEVERAGE: Maximize per coin based on confidence and symbol limits
        // Small accounts NEED leverage to grow - calculate optimal leverage
        try {
          const { asterDexService } = await import('./asterDexService');
          const maxLeverageForSymbol = await asterDexService.getMaxLeverage(workflow.symbol);
          const chiefConfidence = finalDecision.confidence;
          
          // Calculate optimal leverage based on confidence
          // Higher confidence = use more of available leverage
          let optimalLeverage: number;
          
          if (chiefConfidence >= 0.80) {
            // Very high confidence (80-100%): Use 90-100% of max leverage
            optimalLeverage = Math.floor(maxLeverageForSymbol * 0.95);
          } else if (chiefConfidence >= 0.70) {
            // High confidence (70-79%): Use 75-85% of max leverage
            optimalLeverage = Math.floor(maxLeverageForSymbol * 0.80);
          } else if (chiefConfidence >= 0.60) {
            // Medium-high confidence (60-69%): Use 60-70% of max leverage
            optimalLeverage = Math.floor(maxLeverageForSymbol * 0.65);
          } else if (chiefConfidence >= 0.55) {
            // Medium confidence (55-59%): Use 50-60% of max leverage
            optimalLeverage = Math.floor(maxLeverageForSymbol * 0.55);
          } else {
            // Lower confidence (50-54%): Use 40-50% of max leverage
            optimalLeverage = Math.floor(maxLeverageForSymbol * 0.45);
          }
          
          // Ensure leverage is within bounds
          const minLeverage = parseInt(process.env.TRADING_MIN_LEVERAGE || '10');
          const maxLeverage = parseInt(process.env.TRADING_MAX_LEVERAGE || '20');
          
          optimalLeverage = Math.max(minLeverage, Math.min(optimalLeverage, maxLeverage, maxLeverageForSymbol));
          
          // Update risk assessment with optimized leverage
          const originalLeverage = riskAssessment.leverage || 1;
          riskAssessment.leverage = optimalLeverage;
          
          logger.info(`🚀 Leverage optimized for ${workflow.symbol}`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              maxLeverageForSymbol,
              chiefConfidence: (chiefConfidence * 100).toFixed(1) + '%',
              originalLeverage,
              optimalLeverage,
              leverageUtilization: ((optimalLeverage / maxLeverageForSymbol) * 100).toFixed(1) + '%',
              reasoning: `Confidence-based leverage optimization: ${(chiefConfidence * 100).toFixed(1)}% confidence → ${optimalLeverage}x leverage (${maxLeverageForSymbol}x max available)`
            }
          });
        } catch (leverageError) {
          logger.warn('Failed to optimize leverage (using AI-suggested value)', {
            context: 'AgentCoordinator',
            error: leverageError instanceof Error ? leverageError.message : String(leverageError),
            symbol: workflow.symbol,
            aiSuggestedLeverage: riskAssessment.leverage
          });
          // Continue with AI-suggested leverage if optimization fails
        }

        // ENFORCE POSITION SIZE LIMIT FOR MICRO ACCOUNTS (ULTRA STRICT)
        const positionRiskPercent = riskAssessment.riskPercentage || 0;
        if (balance < TRADING_THRESHOLDS.MICRO_ACCOUNT_THRESHOLD && positionRiskPercent > TRADING_THRESHOLDS.MAX_POSITION_RISK_MICRO) {
          logger.warn(`Trade REJECTED: Position risk exceeds ${TRADING_THRESHOLDS.MAX_POSITION_RISK_MICRO}% limit for accounts <$${TRADING_THRESHOLDS.MICRO_ACCOUNT_THRESHOLD}`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              balance,
              riskPercent: positionRiskPercent
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Position risk (${positionRiskPercent.toFixed(2)}%) exceeds ${TRADING_THRESHOLDS.MAX_POSITION_RISK_MICRO}% maximum for accounts <$${TRADING_THRESHOLDS.MICRO_ACCOUNT_THRESHOLD}`;
        } else if (balance < TRADING_THRESHOLDS.SMALL_ACCOUNT_THRESHOLD && positionRiskPercent > TRADING_THRESHOLDS.MAX_POSITION_RISK_SMALL) {
          logger.warn(`Trade REJECTED: Position risk exceeds ${TRADING_THRESHOLDS.MAX_POSITION_RISK_SMALL}% limit for accounts <$${TRADING_THRESHOLDS.SMALL_ACCOUNT_THRESHOLD}`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              balance,
              riskPercent: positionRiskPercent
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Position risk (${positionRiskPercent.toFixed(2)}%) exceeds ${TRADING_THRESHOLDS.MAX_POSITION_RISK_SMALL}% maximum for accounts <$${TRADING_THRESHOLDS.SMALL_ACCOUNT_THRESHOLD}`;
        } else if (balance < TRADING_THRESHOLDS.MEDIUM_ACCOUNT_THRESHOLD && positionRiskPercent > TRADING_THRESHOLDS.MAX_POSITION_RISK_SMALL) {
          logger.warn(`Trade REJECTED: Position risk exceeds ${TRADING_THRESHOLDS.MAX_POSITION_RISK_SMALL}% limit for accounts <$${TRADING_THRESHOLDS.MEDIUM_ACCOUNT_THRESHOLD}`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              balance,
              riskPercent: positionRiskPercent
            }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Position risk (${positionRiskPercent.toFixed(2)}%) exceeds ${TRADING_THRESHOLDS.MAX_POSITION_RISK_SMALL}% maximum for accounts <$${TRADING_THRESHOLDS.MEDIUM_ACCOUNT_THRESHOLD}`;
        }
        
        // ENFORCE MINIMUM R:R RATIO FOR MICRO ACCOUNTS
        const minRRForAccount = balance < TRADING_THRESHOLDS.MICRO_ACCOUNT_THRESHOLD 
          ? TRADING_THRESHOLDS.MIN_RR_MICRO 
          : balance < TRADING_THRESHOLDS.SMALL_ACCOUNT_THRESHOLD 
          ? TRADING_THRESHOLDS.MIN_RR_SMALL 
          : balance < TRADING_THRESHOLDS.MEDIUM_ACCOUNT_THRESHOLD 
          ? TRADING_THRESHOLDS.MIN_RR_MEDIUM 
          : TRADING_THRESHOLDS.MIN_RR_LARGE;
        const actualRR = riskAssessment.riskRewardRatio || 0;
        // HIGH PRIORITY FIX: Validate R:R is positive and reasonable
        if (actualRR < 0 || actualRR > 100) {
          logger.warn(`Trade REJECTED: Invalid Risk/Reward ratio ${actualRR.toFixed(2)}:1`, {
            context: 'AgentCoordinator',
            data: { symbol: workflow.symbol, actualRR }
          });
          riskAssessment.approved = false;
          riskAssessment.reasoning = `Trade rejected: Invalid Risk/Reward ratio ${actualRR.toFixed(2)}:1 (must be between 0 and 100)`;
        } else if (actualRR < minRRForAccount) {
          logger.warn(`Trade REJECTED: Risk/Reward ratio ${actualRR.toFixed(2)}:1 below ${minRRForAccount}:1 minimum for account size`, {
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
          logger.warn(`Trade REJECTED: Coin is problematic (execution issues like COSMO/APE)`, {
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

      logger.info(`Risk Manager Decision: ${riskAssessment.approved ? 'APPROVED' : 'REJECTED'}`, {
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
        logger.warn('Symbol is blacklisted - trade blocked', {
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

      // DEEPSEEK R1 REQUIRED - Execution Specialist reviews final execution plan
      logger.info('Calling DeepSeek R1 for Execution Planning', {
        context: 'AgentCoordinator',
        symbol: workflow.symbol,
        riskApproved: true
      });

      const systemPrompt = `You are the Execution Specialist powered by DeepSeek R1. Your role is to create the OPTIMAL execution plan for approved trades. You determine timing, order type, and execution strategy.`;
      
      const currentPrice = workflow.context.marketData?.price || 0;
      const prompt = `Create execution plan for this APPROVED trade:

Symbol: ${workflow.symbol}
Current Price: $${currentPrice}
Action: ${riskAssessment.action}
Position Size: ${riskAssessment.positionSize}
Leverage: ${riskAssessment.leverage}x
Stop Loss: $${riskAssessment.stopLoss}
Take Profit: $${riskAssessment.takeProfit}

Market Conditions:
- Volatility: ${(workflow.context.marketData as any)?.volatility || 0}%
- Volume: ${(workflow.context.marketData as any)?.volume || 0}
- Spread: ${(workflow.context.marketData as any)?.bidAskSpread || 0}%

Create optimal execution plan with order type and timing.

Respond in JSON:
{
  "readyToExecute": true,
  "orderType": "MARKET" | "LIMIT",
  "timing": "IMMEDIATE" | "WAIT_FOR_DIP",
  "reasoning": "your execution strategy"
}`;

      const result = await deepseekService.chatWithSystem(systemPrompt, prompt, undefined, {
        format: 'json',
        temperature: 0.3, // Very conservative for execution
        thinking: true,
        max_tokens: 1000
      });

      let executionPlan: any;
      try {
        // CRITICAL FIX: DeepSeek might return already-parsed object or JSON string
        if (typeof result === 'string') {
          executionPlan = JSON.parse(result);
        } else if (typeof result === 'object' && result !== null) {
          executionPlan = result; // Already parsed
        } else {
          throw new Error(`Unexpected result type: ${typeof result}`);
        }
      } catch (parseError) {
        logger.error('Failed to parse Execution Specialist response', parseError as Error, {
          context: 'AgentCoordinator',
          response: result,
          resultType: typeof result
        });
        throw new Error('Invalid Execution Specialist response format');
      }

      // Add risk assessment details to execution plan
      executionPlan.action = riskAssessment.action;
      executionPlan.symbol = workflow.symbol;
      executionPlan.positionSize = riskAssessment.positionSize;
      executionPlan.leverage = riskAssessment.leverage;
      executionPlan.stopLoss = riskAssessment.stopLoss;
      executionPlan.takeProfit = riskAssessment.takeProfit;

      logger.info('Execution Plan Ready (DeepSeek R1)', {
        context: 'AgentCoordinator',
        data: {
          symbol: workflow.symbol,
          orderType: executionPlan.orderType,
          timing: executionPlan.timing,
          reasoning: executionPlan.reasoning?.substring(0, 100)
        }
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
        logger.error('Trade execution failed after all retries', lastError!, {
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
      logger.info('Trade executed successfully', {
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
          logger.info('Trade saved to database for journal', {
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
          logger.info('Adding position to monitor', {
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
            trailingStopPercent: TRADING_THRESHOLDS.DEFAULT_TRAILING_STOP_PERCENT, // 2% trailing stop
            openedAt: Date.now(),
            orderId: tradeResult.orderId || ''
          });

          logger.info('Position added to monitor successfully!', {
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
          logger.error('CRITICAL: Failed to add position to monitor', monitorError, {
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
    logger.debug('Handling analysis message', {
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
    logger.debug('Handling decision message', {
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
    logger.debug('Handling query message', {
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
    logger.debug('Handling response message', {
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
    logger.debug('Handling alert message', {
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

    logger.info('Workflow cancelled', {
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
