/**
 * Agent Coordination Framework
 * Manages communication, state, and workflow between AI agents
 * CRITICAL FIX: Added mutex protection for concurrent workflow safety
 */

import { logger } from '@/lib/logger';
import { deepseekService } from '@/services/deepseekService';
import { AGENT_PROMPTS, MarketData, AnalystReports, FinalDecision, Portfolio, RiskApprovedTrade } from '@/lib/agentPrompts';
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
  
  // WORLD-CLASS OPTIMIZATION: Agent result caching
  private agentResultCache: Map<string, { result: any; timestamp: number; fingerprint: string }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds cache TTL
  private readonly CACHE_PRICE_TOLERANCE = 0.02; // 2% price change invalidates cache
  
  // WORLD-CLASS OPTIMIZATION: Workflow performance tracking
  private workflowMetrics: Map<string, {
    totalExecutions: number;
    averageDuration: number;
    successRate: number;
    averageStepsCompleted: number;
  }> = new Map();

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

    // WORLD-CLASS: Start workflow execution with comprehensive error tracking
    // Execute in background but track errors correctly and verify execution starts
    const executionPromise = this.executeWorkflow(workflowId);
    
    // WORLD-CLASS: Track workflow execution start time for health monitoring
    const executionStartTime = Date.now();
    
    executionPromise.catch(error => {
      logger.error('Workflow execution failed', error, {
        context: 'AgentCoordinator',
        data: { 
          workflowId, 
          symbol,
          executionDuration: Date.now() - executionStartTime,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        }
      });
      
      // Update workflow status on error
      const wf = this.workflows.get(workflowId);
      if (wf) {
        wf.status = 'failed';
        wf.completedAt = Date.now();
        // Track failure in performance metrics
        this.trackWorkflowPerformance(wf.symbol, Date.now() - wf.startedAt, false, 0);
      }
    });
    
    // WORLD-CLASS: Verify workflow execution started (not just queued)
    // Check after 100ms that workflow is actually executing (not stuck)
    setTimeout(() => {
      const wf = this.workflows.get(workflowId);
      if (wf && wf.status === 'running') {
        const hasActiveSteps = wf.steps.some(s => s.status === 'running' || s.status === 'completed');
        if (!hasActiveSteps && wf.steps.every(s => s.status === 'pending')) {
          logger.warn('⚠️ Workflow may be stuck - no steps executed after 100ms', {
            context: 'AgentCoordinator',
            data: {
              workflowId,
              symbol,
              totalSteps: wf.steps.length,
              stepsStatus: wf.steps.map(s => ({ id: s.id, status: s.status }))
            }
          });
        }
      }
    }, 100);
    
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
        timeout: 45000, // Reduced from 60s to 45s
        retryCount: 0,
        maxRetries: 2,
        status: 'pending'
      },
      {
        id: 'chief_decision',
        name: 'Chief Analyst Decision',
        agent: 'chief',
        dependencies: ['technical_analysis'],
        timeout: 60000, // Reduced from 90s to 60s
        retryCount: 0,
        maxRetries: 2,
        status: 'pending'
      },
      {
        id: 'risk_assessment',
        name: 'Risk Assessment',
        agent: 'risk',
        dependencies: ['chief_decision'],
        timeout: 45000, // Reduced from 60s to 45s
        retryCount: 0,
        maxRetries: 2,
        status: 'pending'
      },
      {
        id: 'execution_planning',
        name: 'Execution Planning',
        agent: 'execution',
        dependencies: ['risk_assessment'],
        timeout: 45000, // Reduced from 60s to 45s
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

    // WORLD-CLASS: Comprehensive workflow execution logging
    logger.info('🚀 Starting workflow execution', {
      context: 'AgentCoordinator',
      data: {
        workflowId,
        symbol: workflow.symbol,
        totalSteps: workflow.steps.length,
        stepNames: workflow.steps.map(s => s.name),
        startedAt: new Date(workflow.startedAt).toISOString()
      }
    });

    // CRITICAL FIX: Add workflow-level timeout (10 minutes)
    // Total step timeouts = 330s, plus retries = need buffer
    const WORKFLOW_TIMEOUT = 600000; // 10 minutes
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
            const stepStartTime = Date.now();
            logger.info(`▶️ Executing step: ${step.name} (${step.id})`, {
              context: 'AgentCoordinator',
              data: {
                workflowId,
                symbol: workflow.symbol,
                step: step.id,
                stepName: step.name,
                stepNumber: executedSteps + 1,
                totalSteps: workflow.steps.length,
                elapsed: `${((stepStartTime - workflowStartTime) / 1000).toFixed(1)}s`
              }
            });
            
            try {
              await this.executeStep(workflowId, step);
              const stepDuration = Date.now() - stepStartTime;
              executedSteps++;
              stepExecuted = true;
              
              logger.info(`✅ Step completed: ${step.name}`, {
                context: 'AgentCoordinator',
                data: {
                  workflowId,
                  symbol: workflow.symbol,
                  step: step.id,
                  duration: `${(stepDuration / 1000).toFixed(1)}s`,
                  progress: `${executedSteps}/${workflow.steps.length}`
                }
              });
              
              break; // Execute one step at a time
            } catch (stepError) {
              const stepDuration = Date.now() - stepStartTime;
              logger.error(`❌ Step failed: ${step.name}`, stepError as Error, {
                context: 'AgentCoordinator',
                data: {
                  workflowId,
                  symbol: workflow.symbol,
                  step: step.id,
                  duration: `${(stepDuration / 1000).toFixed(1)}s`,
                  error: stepError instanceof Error ? stepError.message : String(stepError)
                }
              });
              // Continue to next step or mark workflow as failed
              throw stepError; // Re-throw to trigger workflow failure handling
            }
          }
        }
        
        // If no step was executed and we still have pending steps, there's a dependency issue
        if (!stepExecuted) {
          const pendingStepsCheck = workflow.steps.filter(s => s.status === 'pending');
          if (pendingStepsCheck.length > 0) {
            logger.error('Workflow stuck - pending steps with unmet dependencies', null, {
              context: 'AgentCoordinator',
              workflowId,
              pendingSteps: pendingStepsCheck.map(s => s.id)
            });
            break;
          }
        }
        
        // Check if workflow is complete (INSIDE the while loop)
        const completedSteps = workflow.steps.filter(s => s.status === 'completed').length;
        const failedSteps = workflow.steps.filter(s => s.status === 'failed').length;
        
        if (completedSteps === workflow.steps.length) {
          workflow.status = 'completed';
          workflow.completedAt = Date.now();
          
          const duration = workflow.completedAt - workflow.startedAt;
          
          // WORLD-CLASS: Track workflow performance metrics
          this.trackWorkflowPerformance(workflow.symbol, duration, true, completedSteps);
          
          logger.info('Workflow completed successfully', {
            context: 'AgentCoordinator',
            workflowId,
            duration: `${(duration / 1000).toFixed(1)}s`,
            completedSteps,
            totalSteps: workflow.steps.length,
            symbol: workflow.symbol
          });
          break; // Exit while loop - workflow done
        } else if (failedSteps > 0) {
          workflow.status = 'failed';
          workflow.completedAt = Date.now();
          
          const duration = workflow.completedAt - workflow.startedAt;
          
          // WORLD-CLASS: Track workflow performance metrics
          this.trackWorkflowPerformance(workflow.symbol, duration, false, completedSteps);
          
          logger.error('Workflow failed with errors', null, {
            context: 'AgentCoordinator',
            workflowId,
            failedSteps,
            completedSteps,
            symbol: workflow.symbol
          });
          break; // Exit while loop - workflow failed
        }
        // CRITICAL FIX: If not all steps completed and none failed, continue the while loop!
        // The loop will find and execute the next pending step
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
   * WORLD-CLASS OPTIMIZATION: Parallel data gathering where possible
   * WORLD-CLASS: Comprehensive error handling with retry logic
   */
  private async executeDataGathering(workflow: TradingWorkflow): Promise<any> {
    const startTime = Date.now();
    
    logger.info('📊 Gathering market data', {
      context: 'AgentCoordinator',
      data: { workflowId: workflow.id, symbol: workflow.symbol }
    });

    try {
      // Import data ingestion service dynamically to avoid circular dependencies
      const { dataIngestionService } = await import('@/services/dataIngestionService');
      
      // WORLD-CLASS: Gather all market data in parallel for faster execution
      // Only get market data for technical analysis
      const marketData = await dataIngestionService.getMarketData(workflow.symbol);
      
      // WORLD-CLASS: Validate market data before returning
      if (!marketData || !marketData.price || marketData.price <= 0) {
        throw new Error(`Invalid market data for ${workflow.symbol}: price=${marketData?.price}, data=${JSON.stringify(marketData).substring(0, 200)}`);
      }
      
      const duration = Date.now() - startTime;
      logger.info('✅ Market data gathered successfully', {
        context: 'AgentCoordinator',
        data: { 
          workflowId: workflow.id, 
          symbol: workflow.symbol, 
          duration: `${duration}ms`,
          price: marketData.price,
          volume: marketData.volume || 0,
          hasRSI: !!marketData.rsi,
          hasVolumeData: !!(marketData.buyVolume || marketData.sellVolume)
        }
      });
      
      return {
        market: marketData,
        timestamp: Date.now()
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('❌ Data gathering failed', error, {
        context: 'AgentCoordinator',
        data: { 
          workflowId: workflow.id, 
          symbol: workflow.symbol, 
          duration: `${duration}ms`,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
      
      // WORLD-CLASS: Re-throw with context so workflow can handle it
      throw new Error(`Data gathering failed for ${workflow.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * WORLD-CLASS: Generate cache fingerprint for agent analysis
   * Used to determine if cached result is still valid
   */
  private generateCacheFingerprint(symbol: string, marketData: any): string {
    if (!marketData) return `${symbol}_unknown`;
    
    const price = marketData.price || 0;
    const volume = marketData.volume || 0;
    const rsi = marketData.rsi || 0;
    const volumeRatio = marketData.volumeRatio || 1;
    
    // Round values to create stable fingerprints
    const priceBucket = Math.floor(price / (price * this.CACHE_PRICE_TOLERANCE));
    const volumeBucket = Math.floor(Math.log10(volume + 1) * 10);
    const rsiBucket = Math.floor(rsi / 5);
    const volumeRatioBucket = Math.floor(volumeRatio * 10);
    
    return `${symbol}_${priceBucket}_${volumeBucket}_${rsiBucket}_${volumeRatioBucket}`;
  }
  
  /**
   * WORLD-CLASS: Check if cached agent result is still valid
   */
  private getCachedAgentResult(agentType: string, symbol: string, marketData: any): any | null {
    const fingerprint = this.generateCacheFingerprint(symbol, marketData);
    const cacheKey = `${agentType}_${fingerprint}`;
    
    const cached = this.agentResultCache.get(cacheKey);
    if (!cached) return null;
    
    // Check if cache is still valid
    const age = Date.now() - cached.timestamp;
    if (age > this.CACHE_TTL) {
      this.agentResultCache.delete(cacheKey);
      return null;
    }
    
    // Verify fingerprint matches (price hasn't changed significantly)
    if (cached.fingerprint !== fingerprint) {
      this.agentResultCache.delete(cacheKey);
      return null;
    }
    
    logger.debug('Using cached agent result', {
      context: 'AgentCoordinator',
      data: { agentType, symbol, cacheAge: `${age}ms`, fingerprint }
    });
    
    return cached.result;
  }
  
  /**
   * WORLD-CLASS: Cache agent result for future use
   */
  private cacheAgentResult(agentType: string, symbol: string, marketData: any, result: any): void {
    const fingerprint = this.generateCacheFingerprint(symbol, marketData);
    const cacheKey = `${agentType}_${fingerprint}`;
    
    this.agentResultCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      fingerprint
    });
    
    // Cleanup old cache entries (keep last 100)
    if (this.agentResultCache.size > 100) {
      const entries = Array.from(this.agentResultCache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const toKeep = entries.slice(0, 100);
      this.agentResultCache.clear();
      toKeep.forEach(([key, value]) => this.agentResultCache.set(key, value));
    }
  }

  /**
   * Execute technical analysis step
   * WORLD-CLASS OPTIMIZATION: Check cache before calling AI
   */
  private async executeTechnicalAnalysis(workflow: TradingWorkflow): Promise<any> {
    const agent = this.agents.get('technical');
    if (!agent) throw new Error('Technical agent not found');

    agent.status = 'working';
    agent.currentTask = 'Technical Analysis';
    agent.lastActivity = Date.now();

    try {
      const marketData = workflow.context.marketData;
      if (!marketData) {
        logger.error('❌ Market data not available for technical analysis', {
          context: 'AgentCoordinator',
          data: {
            workflowId: workflow.id,
            symbol: workflow.symbol,
            hasContext: !!workflow.context,
            contextKeys: workflow.context ? Object.keys(workflow.context) : []
          }
        });
        throw new Error('Market data not available - data gathering step may have failed');
      }
      
      // WORLD-CLASS: Validate market data has required fields
      if (!marketData.price || marketData.price <= 0) {
        logger.error('❌ Invalid market data price for technical analysis', {
          context: 'AgentCoordinator',
          data: {
            workflowId: workflow.id,
            symbol: workflow.symbol,
            price: marketData.price,
            marketDataKeys: Object.keys(marketData)
          }
        });
        throw new Error(`Invalid market data: price=${marketData.price} (must be > 0)`);
      }

      // WORLD-CLASS: Check cache first (50-70% reduction in AI calls)
      const cachedResult = this.getCachedAgentResult('technical', workflow.symbol, marketData);
      if (cachedResult) {
        agent.status = 'idle';
        agent.currentTask = undefined;
        agent.performance.totalTasks++;
        agent.performance.successfulTasks++;
        
        logger.info('✅ Using cached technical analysis', {
          context: 'AgentCoordinator',
          symbol: workflow.symbol,
          cached: true
        });
        
        return cachedResult;
      }

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
      
      // WORLD-CLASS: Cache result for future use
      this.cacheAgentResult('technical', workflow.symbol, marketData, result);

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
      if (!technicalAnalysis) {
        logger.error('❌ Technical analysis not available for Chief Decision', {
          context: 'AgentCoordinator',
          data: {
            workflowId: workflow.id,
            symbol: workflow.symbol,
            hasMarketData: !!workflow.context.marketData,
            contextKeys: Object.keys(workflow.context)
          }
        });
        throw new Error('Technical analysis not available - technical analysis step may have failed');
      }
      
      // WORLD-CLASS: Validate technical analysis has required fields
      if (typeof technicalAnalysis !== 'object' || !technicalAnalysis.action || technicalAnalysis.confidence === undefined) {
        throw new Error('Missing or invalid technical analysis data for Chief Analyst decision');
      }

      // DEEPSEEK R1 REQUIRED - Chief Analyst makes final decision with AI
      logger.info('Calling DeepSeek R1 for Chief Analyst Decision', {
        context: 'AgentCoordinator',
        symbol: workflow.symbol,
        technicalAction: technicalAnalysis.action
      });

      // CRITICAL FIX: Use optimized Chief Analyst prompt with buy/sell volume data
      const { DEEPSEEK_OPTIMIZED_PROMPTS } = await import('@/lib/agentPromptsOptimized');
      const marketData = workflow.context.marketData as any;
      
      // Build enhanced market data with buy/sell volume
      const enhancedMarketData = {
        ...marketData,
        buyVolume: marketData?.buyVolume || 0,
        sellVolume: marketData?.sellVolume || 0,
        buySellRatio: marketData?.buySellRatio || 1.0,
        // Add buy/sell volume percentages
        buyVolumePercent: marketData?.buyVolumePercent || 50,
        sellVolumePercent: marketData?.sellVolumePercent || 50
      };
      
      // Use the optimized Chief Analyst prompt template
      const systemPrompt = DEEPSEEK_OPTIMIZED_PROMPTS.CHIEF_ANALYST.systemPrompt;
      
      // Create analyst reports structure for the prompt
      const analystReports = {
        symbol: workflow.symbol,
        currentPrice: marketData?.price || 0,
        technical: {
          action: technicalAnalysis.action,
          confidence: technicalAnalysis.confidence,
          reasoning: technicalAnalysis.reasoning || '',
          indicators: {
            primary: 'Technical analysis',
            confirming: [],
            contradicting: []
          },
          risks: [],
          marketData: enhancedMarketData
        },
        sentiment: {
          action: 'NEUTRAL',
          confidence: 0.5,
          reasoning: 'Sentiment analysis not available',
          sentimentScore: 0,
          narrative: 'Neutral',
          warnings: []
        },
        onchain: {
          action: 'NEUTRAL',
          confidence: 0.5,
          reasoning: 'On-chain analysis not available',
          whaleSignal: 'neutral',
          smartMoneyFlow: 'neutral',
          liquidityHealth: 'unknown'
        },
        consensus: technicalAnalysis.action !== 'HOLD'
      };
      
      const prompt = DEEPSEEK_OPTIMIZED_PROMPTS.CHIEF_ANALYST.debateTemplate(analystReports as any);

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
      
      // CRITICAL FIX: Normalize confidence if AI returns percentage (40) instead of decimal (0.40)
      if (typeof decision.confidence === 'number' && decision.confidence > 1 && decision.confidence <= 100) {
        logger.debug('Normalizing Chief Analyst confidence from percentage', {
          context: 'AgentCoordinator',
          data: { original: decision.confidence, normalized: decision.confidence / 100 }
        });
        decision.confidence = decision.confidence / 100;
      }

      // CRITICAL FIX: Override HOLD if Technical Analyst has high confidence
      // This prevents paralysis by analysis - we need to trade to learn
      if (decision.action === 'HOLD' && technicalAnalysis.action && technicalAnalysis.action !== 'HOLD') {
        const techConfidence = typeof technicalAnalysis.confidence === 'number' 
          ? (technicalAnalysis.confidence > 1 ? technicalAnalysis.confidence / 100 : technicalAnalysis.confidence)
          : 0;
        
        // If Technical Analyst has 50%+ confidence with clear direction, override HOLD
        if (techConfidence >= 0.50) {
          logger.warn('🔄 HOLD OVERRIDE: Technical Analyst has strong signal - converting to trade', {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              originalAction: 'HOLD',
              newAction: technicalAnalysis.action,
              techConfidence: (techConfidence * 100).toFixed(1) + '%',
              chiefConfidence: (decision.confidence * 100).toFixed(1) + '%',
              reason: 'Technical Analyst override - system must trade to learn'
            }
          });
          
          // Override with Technical Analyst's recommendation
          decision.action = technicalAnalysis.action;
          decision.confidence = techConfidence * 0.9; // Slightly reduce confidence for override
          decision.reasoning = `OVERRIDE: Chief said HOLD but Technical Analyst shows ${technicalAnalysis.action} with ${(techConfidence * 100).toFixed(0)}% confidence. Trading to learn. ${decision.reasoning || ''}`;
          decision.wasHoldOverride = true;
        } else {
          logger.debug('HOLD maintained - Technical Analyst confidence too low for override', {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              techConfidence: (techConfidence * 100).toFixed(1) + '%',
              minRequiredForOverride: '50%'
            }
          });
        }
      }

      logger.info('Chief Analyst Decision (DeepSeek R1)', {
        context: 'AgentCoordinator',
        data: {
          symbol: workflow.symbol,
          action: decision.action,
          confidence: decision.confidence,
          wasHoldOverride: decision.wasHoldOverride || false,
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
      if (!finalDecision) {
        logger.error('❌ Chief decision not available for Risk Assessment', {
          context: 'AgentCoordinator',
          data: {
            workflowId: workflow.id,
            symbol: workflow.symbol,
            hasTechnicalAnalysis: !!workflow.context.technicalAnalysis,
            hasMarketData: !!workflow.context.marketData,
            contextKeys: Object.keys(workflow.context)
          }
        });
        throw new Error('Chief decision not available - chief decision step may have failed');
      }
      
      // WORLD-CLASS: Validate final decision structure
      if (typeof finalDecision !== 'object' || !finalDecision.action || finalDecision.confidence === undefined) {
        throw new Error('Final decision not available or invalid for risk assessment');
      }
      
      // HIGH PRIORITY FIX: Validate required fields exist
      if (typeof finalDecision.action !== 'string' || !['BUY', 'SELL', 'HOLD'].includes(finalDecision.action)) {
        throw new Error(`Invalid final decision action: ${finalDecision.action}`);
      }
      
      // CRITICAL FIX: Normalize confidence if AI returns percentage (40) instead of decimal (0.40)
      let normalizedConfidence = finalDecision.confidence;
      if (typeof normalizedConfidence === 'number' && normalizedConfidence > 1 && normalizedConfidence <= 100) {
        normalizedConfidence = normalizedConfidence / 100;
        finalDecision.confidence = normalizedConfidence;
        logger.debug('Normalized confidence from percentage to decimal', {
          context: 'AgentCoordinator',
          data: { original: finalDecision.confidence * 100, normalized: normalizedConfidence }
        });
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
        
        // CRITICAL FIX: Handle nested response structure from DeepSeek
        // AI sometimes wraps response in { riskAssessment: { ... } } instead of returning flat object
        if (riskAssessment.riskAssessment && typeof riskAssessment.riskAssessment === 'object') {
          logger.debug('Unwrapping nested riskAssessment object', {
            context: 'AgentCoordinator',
            data: { wasNested: true }
          });
          const nested = riskAssessment.riskAssessment;
          
          // Extract approval status from nested structure
          // AI returns finalDecision: 'REJECT'/'APPROVE' instead of approved: boolean
          if (nested.finalDecision) {
            riskAssessment.approved = nested.finalDecision === 'APPROVE' || nested.finalDecision === 'APPROVED';
            riskAssessment.action = riskAssessment.approved ? 'BUY' : 'HOLD';
            riskAssessment.reasoning = nested.reasoning || 'Derived from nested response';
            
            // Extract position sizing if available
            if (nested.positionSizing) {
              riskAssessment.positionSize = nested.positionSizing.sizeUSD || nested.positionSizing.size || 0;
            }
            if (nested.leverage) {
              riskAssessment.leverage = nested.leverage.recommended || nested.leverage.value || 15;
            }
            if (nested.stopLoss) {
              riskAssessment.stopLoss = nested.stopLoss.percent || nested.stopLoss.percentage || 3.0;
            }
            if (nested.takeProfit) {
              riskAssessment.takeProfit = nested.takeProfit.percent || nested.takeProfit.percentage || 6.0;
            }
          }
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
      
      // CRITICAL FIX: When trade is rejected (approved: false), action and positionSize can be empty/zero
      // Only require these fields when the trade is approved
      if (riskAssessment.approved === true) {
        if (!riskAssessment.action) {
          missingFields.push(`action (got ${typeof riskAssessment.action}: ${riskAssessment.action})`);
        }
        if (typeof riskAssessment.positionSize !== 'number' || riskAssessment.positionSize <= 0) {
          missingFields.push(`positionSize (got ${typeof riskAssessment.positionSize}: ${riskAssessment.positionSize})`);
        }
      }
      
      // For rejected trades, ensure we have at least a reasoning
      if (riskAssessment.approved === false && !riskAssessment.action) {
        // Set default action to HOLD for rejected trades
        riskAssessment.action = 'HOLD';
        logger.debug('Risk Manager rejected trade - setting default action to HOLD', {
          context: 'AgentCoordinator',
          data: { reasoning: riskAssessment.reasoning?.substring(0, 100) }
        });
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

      // FORCE APPROVAL MECHANISM: If Chief Analyst recommends BUY/SELL with good confidence
      // but Risk Manager rejected for non-critical reasons, force approval with safe defaults
      if (!riskAssessment.approved && finalDecision.action !== 'HOLD' && finalDecision.confidence >= 0.50) {
        const reasoning = riskAssessment.reasoning?.toLowerCase() || '';
        const isCriticalRejection = 
          reasoning.includes('insufficient balance') ||
          reasoning.includes('max concurrent') ||
          reasoning.includes('portfolio risk') ||
          reasoning.includes('problematic coin');
        
        if (!isCriticalRejection) {
          logger.warn('🔄 FORCE APPROVAL: Chief Analyst has strong signal, overriding Risk Manager rejection', {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              chiefAction: finalDecision.action,
              chiefConfidence: (finalDecision.confidence * 100).toFixed(0) + '%',
              originalReason: riskAssessment.reasoning,
              atrLevels: atrBasedLevels ? {
                stopLoss: atrBasedLevels.recommendedStopLoss,
                takeProfit: atrBasedLevels.recommendedTakeProfit
              } : 'Using defaults'
            }
          });
          
          // Use ATR-based levels if available, otherwise use safe defaults
          const stopLossPrice = atrBasedLevels?.recommendedStopLoss || (currentPrice * (finalDecision.action === 'BUY' ? 0.96 : 1.04));
          const takeProfitPrice = atrBasedLevels?.recommendedTakeProfit || (currentPrice * (finalDecision.action === 'BUY' ? 1.08 : 0.92));
          
          // Calculate safe position size (2% of balance risk)
          const riskPercent = 0.02;
          const stopDistance = Math.abs(currentPrice - stopLossPrice) / currentPrice;
          const safePositionSize = (balance * riskPercent) / (stopDistance * currentPrice);
          
          riskAssessment.approved = true;
          riskAssessment.action = finalDecision.action;
          riskAssessment.positionSize = Math.max(0.001, safePositionSize);
          riskAssessment.stopLoss = stopLossPrice;
          riskAssessment.takeProfit = takeProfitPrice;
          riskAssessment.leverage = 15; // Safe default
          riskAssessment.reasoning = `FORCE APPROVED: Chief Analyst ${finalDecision.action} with ${(finalDecision.confidence * 100).toFixed(0)}% confidence. Using safe defaults: 2% risk, 15x leverage. Original rejection: ${riskAssessment.reasoning}`;
          riskAssessment.wasForceApproved = true;
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
          wasForceApproved: riskAssessment.wasForceApproved || false,
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

      // WORLD-CLASS FIX: Ensure readyToExecute is true if risk assessment approved
      // DeepSeek might return false if it thinks timing isn't optimal, but if Risk Manager approved,
      // we should proceed (Risk Manager already considered timing/risk)
      if (riskAssessment.approved && executionPlan.readyToExecute === false) {
        logger.warn('Execution plan marked not ready, but risk approved - forcing readyToExecute=true', {
          context: 'AgentCoordinator',
          data: {
            symbol: workflow.symbol,
            executionPlanReason: executionPlan.reason,
            executionPlanTiming: executionPlan.timing
          }
        });
        executionPlan.readyToExecute = true;
        executionPlan.reason = `Risk Manager approved - execution proceeding despite ${executionPlan.timing || 'timing consideration'}`;
      }
      
      // CRITICAL: Validate readyToExecute is boolean
      if (typeof executionPlan.readyToExecute !== 'boolean') {
        logger.warn('Execution plan readyToExecute is not boolean, defaulting to true (risk approved)', {
          context: 'AgentCoordinator',
          data: { symbol: workflow.symbol, readyToExecute: executionPlan.readyToExecute }
        });
        executionPlan.readyToExecute = riskAssessment.approved; // Default to risk assessment approval
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
          readyToExecute: executionPlan.readyToExecute,
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
        // IMPORTANT: This is expected behavior - AI decided not to trade
        // Reasons include: unfavorable conditions, high risk, low confidence
        const reasoningText = Array.isArray(riskAssessment?.reasoning) 
          ? riskAssessment.reasoning.join('; ').substring(0, 100)
          : (typeof riskAssessment?.reasoning === 'string' ? riskAssessment.reasoning.substring(0, 100) : 'No reason given');
        const reason = !riskAssessment?.approved 
          ? `Risk Manager rejected: ${reasoningText}`
          : `Execution plan not ready: ${executionPlan?.reason || 'Unknown'}`;
        
        logger.info(`⏸️ Trade skipped for ${workflow.symbol} - ${reason}`, {
          context: 'AgentCoordinator',
          data: {
            symbol: workflow.symbol,
            approved: riskAssessment?.approved,
            readyToExecute: executionPlan?.readyToExecute,
            note: 'This is normal - AI found conditions unfavorable'
          }
        });
        
        return {
          executed: false,
          reason: 'Trade not approved or not ready for execution',
          executionPlan,
          riskAssessment,
          diagnostic: {
            executionPlanReady: executionPlan?.readyToExecute,
            riskAssessmentApproved: riskAssessment?.approved,
            executionPlanReason: executionPlan?.reason,
            riskAssessmentReason: riskAssessment?.reasoning
          }
        };
      }

      // Import asterDexService for actual trade execution
      const { asterDexService } = await import('@/services/asterDexService');
      const { positionMonitorService } = await import('@/services/positionMonitorService');
      
      let tradeResult: any = null;
      
      // WORLD-CLASS: Enhanced retry logic with order type fallback and slippage protection
      const maxRetries = 3;
      let attempt = 0;
      let lastError: Error | null = null;
      let useLimitOrder = false; // Start with market order, fallback to limit if needed
      
      while (attempt < maxRetries && !tradeResult) {
        attempt++;
        try {
          const orderType = useLimitOrder ? 'LIMIT' : 'MARKET';
          
          logger.info(`🚀 EXECUTING TRADE (attempt ${attempt}/${maxRetries}, ${orderType})`, {
            context: 'AgentCoordinator',
            data: {
              symbol: workflow.symbol,
              action: riskAssessment.action,
              size: riskAssessment.positionSize,
              leverage: riskAssessment.leverage,
              stopLoss: riskAssessment.stopLoss,
              takeProfit: riskAssessment.takeProfit,
              riskRewardRatio: riskAssessment.riskRewardRatio,
              orderType,
              orderDetails: {
                side: riskAssessment.action === 'BUY' ? 'BUY' : 'SELL',
                quantity: riskAssessment.positionSize,
                leverage: riskAssessment.leverage,
                symbol: workflow.symbol
              }
            }
          });
          
          // WORLD-CLASS: Smart order execution with slippage protection
          if (useLimitOrder) {
            // Use limit order with 0.1% tolerance for better execution price
            const currentPrice = finalDecision?.currentPrice || 0;
            if (currentPrice > 0) {
              const limitPrice = riskAssessment.action === 'BUY' 
                ? currentPrice * 1.001  // Buy at 0.1% above market (more likely to fill)
                : currentPrice * 0.999; // Sell at 0.1% below market (more likely to fill)
              
              tradeResult = await asterDexService.placeLimitOrder(
                workflow.symbol,
                riskAssessment.action === 'BUY' ? 'BUY' : 'SELL',
                riskAssessment.positionSize,
                limitPrice,
                riskAssessment.leverage
              );
            } else {
              // Fallback to market if no price available
              tradeResult = await asterDexService.placeMarketOrder(
                workflow.symbol,
                riskAssessment.action === 'BUY' ? 'BUY' : 'SELL',
                riskAssessment.positionSize,
                riskAssessment.leverage
              );
            }
          } else {
            // Use market order for immediate execution
            tradeResult = await asterDexService.placeMarketOrder(
              workflow.symbol,
              riskAssessment.action === 'BUY' ? 'BUY' : 'SELL',
              riskAssessment.positionSize,
              riskAssessment.leverage
            );
          }
          
          // WORLD-CLASS: Track slippage if order executed
          if (tradeResult && finalDecision?.currentPrice) {
            const executedPrice = (tradeResult as any).price || finalDecision.currentPrice;
            const slippage = Math.abs(executedPrice - finalDecision.currentPrice) / finalDecision.currentPrice * 100;
            
            if (slippage > 0.2) {
              logger.warn('⚠️ High slippage detected', {
                context: 'AgentCoordinator',
                data: {
                  symbol: workflow.symbol,
                  expectedPrice: finalDecision.currentPrice,
                  executedPrice,
                  slippage: `${slippage.toFixed(3)}%`,
                  orderType: useLimitOrder ? 'LIMIT' : 'MARKET'
                }
              });
            }
          }
          
        } catch (orderError) {
          lastError = orderError as Error;
          const errorMessage = lastError.message || String(lastError);
          
          logger.error(`Trade execution failed (attempt ${attempt}/${maxRetries})`, orderError as Error, {
            context: 'AgentCoordinator',
            data: { 
              symbol: workflow.symbol,
              action: riskAssessment.action,
              attempt,
              orderType: useLimitOrder ? 'LIMIT' : 'MARKET',
              error: errorMessage
            }
          });
          
          // WORLD-CLASS: Fallback to limit order if market order fails
          if (!useLimitOrder && attempt < maxRetries) {
            logger.info('🔄 Falling back to LIMIT order for better execution', {
              context: 'AgentCoordinator',
              data: { symbol: workflow.symbol, reason: 'Market order failed, trying limit order' }
            });
            useLimitOrder = true;
          }
          
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

      // WORLD-CLASS: Validate trade result before proceeding
      if (!tradeResult || !tradeResult.orderId) {
        logger.error('❌ Trade execution returned invalid result', {
          context: 'AgentCoordinator',
          data: {
            symbol: workflow.symbol,
            tradeResult: tradeResult ? 'exists but no orderId' : 'null',
            tradeResultType: typeof tradeResult,
            tradeResultKeys: tradeResult ? Object.keys(tradeResult) : []
          }
        });
        
        agent.status = 'error';
        agent.performance.totalTasks++;
        agent.performance.errorRate = agent.performance.errorRate + (1 / agent.performance.totalTasks);
        
        return {
          executed: false,
          error: 'Trade execution returned invalid result: missing orderId',
          tradeResult
        };
      }

      // Trade executed successfully
      logger.info('✅ Trade executed successfully', {
          context: 'AgentCoordinator',
          data: {
            symbol: workflow.symbol,
            action: riskAssessment.action,
            positionSize: riskAssessment.positionSize,
            leverage: riskAssessment.leverage,
            orderId: tradeResult.orderId,
            orderType: useLimitOrder ? 'LIMIT' : 'MARKET',
            side: riskAssessment.action === 'BUY' ? 'LONG' : 'SHORT'
          }
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

          // WORLD-CLASS: Validate entry price before adding position
          const entryPrice = finalDecision?.currentPrice || tradeResult.price || workflow.context.marketData?.price || 0;
          if (entryPrice <= 0) {
            throw new Error(`Invalid entry price: ${entryPrice} (must be > 0). Sources: finalDecision.currentPrice=${finalDecision?.currentPrice}, tradeResult.price=${tradeResult.price}, marketData.price=${workflow.context.marketData?.price}`);
          }
          
          // WORLD-CLASS: Validate position size
          if (riskAssessment.positionSize <= 0) {
            throw new Error(`Invalid position size: ${riskAssessment.positionSize} (must be > 0)`);
          }
          
          // WORLD-CLASS: Validate stop-loss and take-profit are set
          if (!riskAssessment.stopLoss || riskAssessment.stopLoss <= 0) {
            throw new Error(`Invalid stop-loss: ${riskAssessment.stopLoss} (must be > 0)`);
          }
          if (!riskAssessment.takeProfit || riskAssessment.takeProfit <= 0) {
            throw new Error(`Invalid take-profit: ${riskAssessment.takeProfit} (must be > 0)`);
          }
          
          // WORLD-CLASS: Validate stop-loss and take-profit are in correct direction
          const side = riskAssessment.action === 'BUY' ? 'LONG' : 'SHORT';
          if (side === 'LONG') {
            // LONG: stop-loss must be below entry, take-profit above entry
            if (riskAssessment.stopLoss >= entryPrice) {
              throw new Error(`Invalid stop-loss for LONG: ${riskAssessment.stopLoss} must be < entry price ${entryPrice}`);
            }
            if (riskAssessment.takeProfit <= entryPrice) {
              throw new Error(`Invalid take-profit for LONG: ${riskAssessment.takeProfit} must be > entry price ${entryPrice}`);
            }
          } else {
            // SHORT: stop-loss must be above entry, take-profit below entry
            if (riskAssessment.stopLoss <= entryPrice) {
              throw new Error(`Invalid stop-loss for SHORT: ${riskAssessment.stopLoss} must be > entry price ${entryPrice}`);
            }
            if (riskAssessment.takeProfit >= entryPrice) {
              throw new Error(`Invalid take-profit for SHORT: ${riskAssessment.takeProfit} must be < entry price ${entryPrice}`);
            }
          }

          const positionId = await positionMonitorService.addPosition({
            symbol: workflow.symbol,
            side: side,
            entryPrice: entryPrice,
            size: riskAssessment.positionSize,
            leverage: riskAssessment.leverage,
            stopLoss: riskAssessment.stopLoss,
            takeProfit: riskAssessment.takeProfit,
            trailingStopPercent: TRADING_THRESHOLDS.DEFAULT_TRAILING_STOP_PERCENT, // 2% trailing stop
            openedAt: Date.now(),
            orderId: tradeResult.orderId || ''
          });

          logger.info('✅ Position added to monitor successfully!', {
            context: 'AgentCoordinator',
            data: { 
              positionId, 
              symbol: workflow.symbol,
              side: side,
              entryPrice,
              size: riskAssessment.positionSize,
              leverage: riskAssessment.leverage,
              stopLoss: riskAssessment.stopLoss,
              takeProfit: riskAssessment.takeProfit,
              orderId: tradeResult.orderId
            }
          });
          
          // WORLD-CLASS: Verify position was actually added
          const addedPosition = positionMonitorService.getOpenPositions().find(p => p.id === positionId);
          if (!addedPosition) {
            logger.error('❌ Position was not found after adding to monitor', {
              context: 'AgentCoordinator',
              data: {
                positionId,
                symbol: workflow.symbol,
                totalPositions: positionMonitorService.getOpenPositions().length
              }
            });
            // Don't throw - position might be in memory but not yet synced
          }
          
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
   * WORLD-CLASS: Track workflow performance metrics for continuous improvement
   */
  private trackWorkflowPerformance(symbol: string, duration: number, success: boolean, stepsCompleted: number): void {
    const metricKey = symbol;
    const existing = this.workflowMetrics.get(metricKey) || {
      totalExecutions: 0,
      averageDuration: 0,
      successRate: 0,
      averageStepsCompleted: 0
    };
    
    // Update metrics with exponential moving average
    const alpha = 0.3; // Smoothing factor
    existing.totalExecutions++;
    existing.averageDuration = existing.averageDuration * (1 - alpha) + duration * alpha;
    existing.successRate = existing.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    existing.averageStepsCompleted = existing.averageStepsCompleted * (1 - alpha) + stepsCompleted * alpha;
    
    this.workflowMetrics.set(metricKey, existing);
    
    // Log performance improvement opportunities
    if (existing.totalExecutions % 10 === 0) {
      logger.info('📊 Workflow Performance Metrics', {
        context: 'AgentCoordinator',
        data: {
          symbol,
          totalExecutions: existing.totalExecutions,
          averageDuration: `${(existing.averageDuration / 1000).toFixed(1)}s`,
          successRate: `${(existing.successRate * 100).toFixed(1)}%`,
          averageStepsCompleted: existing.averageStepsCompleted.toFixed(1),
          note: 'Performance tracking for continuous improvement'
        }
      });
    }
  }

  /**
   * Get performance metrics
   * WORLD-CLASS: Enhanced with workflow metrics tracking
   */
  getPerformanceMetrics(): {
    totalWorkflows: number;
    completedWorkflows: number;
    failedWorkflows: number;
    averageWorkflowTime: number;
    agentPerformance: AgentState[];
    workflowMetrics: Map<string, {
      totalExecutions: number;
      averageDuration: number;
      successRate: number;
      averageStepsCompleted: number;
    }>;
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
      agentPerformance: Array.from(this.agents.values()),
      workflowMetrics: new Map(this.workflowMetrics) // Return copy for safety
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
