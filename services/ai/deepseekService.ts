/**
 * DeepSeek R1 LLM Service for Multi-Agent Trading System
 * Optimized for RTX 5070 Ti with 16GB VRAM
 * Provides superior reasoning capabilities for trading decisions
 * 
 * MODEL SELECTION: Using 14B model for better stability
 * - 14B is more stable than 8B (fewer empty responses)
 * - Better reasoning capabilities
 * - Fits comfortably in 16GB VRAM
 * - More consistent output quality
 * 
 * WHY EMPTY RESPONSES CAN OCCUR:
 * 1. Model not loaded: Ollama may return 200 OK but empty content if model isn't fully loaded
 * 2. Generation stopped early: Token limits, errors, or interruptions can cause empty output
 * 3. API errors: Network issues or Ollama service problems can return empty responses
 * 4. Memory pressure: If system is low on RAM/VRAM, generation may fail silently
 * 5. Model corruption: Corrupted model files can cause generation failures
 * 
 * MITIGATION:
 * - Validate content before processing
 * - Retry logic with exponential backoff
 * - Default to safe rejection when response is empty
 * - Using 14B model for stability (no fallbacks)
 */

import { logger } from '@/lib/logger';
import { aiConfig } from '@/lib/configService';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface DeepSeekOptions {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  num_predict?: number;
  format?: 'json' | 'text';
  thinking?: boolean; // Enable Chain-of-Thought reasoning
  _skipPreload?: boolean; // Internal flag to prevent infinite recursion in preload mechanism
  _skipRetry?: boolean; // Internal flag to prevent infinite retry loops
}

export class DeepSeekService {
  private baseUrl: string;
  private defaultModel: string;
  private provider: 'groq' | 'ollama';
  private groqApiKey: string;
  private consecutiveEmptyResponses: number = 0;
  private lastEmptyResponseTime: number = 0;
  private circuitBreakerOpen: boolean = false;
  private circuitBreakerOpenTime: number = 0;
  private readonly MAX_CONSECUTIVE_EMPTY = 3;
  private readonly CIRCUIT_BREAKER_RESET_MS = 60000;
  private readonly CIRCUIT_BREAKER_HALF_OPEN_WAIT_MS = 30000;
  
  private requestQueue: Array<{
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    execute: () => Promise<any>;
  }> = [];
  private isProcessingQueue: boolean = false;
  private readonly MAX_CONCURRENT_REQUESTS = 1;
  
  private pendingRequests = new Map<string, Promise<any>>();
  
  private lastRetryTime: number = 0;
  private retryCount: number = 0;
  
  private modelReady: boolean = false;
  private modelPreloadPromise: Promise<boolean> | null = null;
  private lastPreloadTime: number = 0;
  private lastKeepAliveTime: number = 0;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private readonly PRELOAD_VALIDATION_REQUESTS = 3;
  private readonly KEEP_ALIVE_INTERVAL_MS = 60000;
  private readonly PRELOAD_STALE_MS = 300000;

  constructor(
    baseUrl?: string,
    defaultModel?: string
  ) {
    this.provider = aiConfig.provider;
    this.groqApiKey = aiConfig.groqApiKey;

    if (this.provider === 'groq') {
      this.baseUrl = aiConfig.groqBaseUrl;
      this.defaultModel = defaultModel || aiConfig.groqModel;
      this.modelReady = true;
    } else {
      this.baseUrl = baseUrl || aiConfig.ollamaBaseUrl;
      this.defaultModel = defaultModel || aiConfig.ollamaModel;
    }

    logger.info('DeepSeek R1 Service initialized', {
      context: 'DeepSeekService',
      provider: this.provider,
      defaultModel: this.defaultModel,
      baseUrl: this.provider === 'groq' ? 'groq-cloud' : this.baseUrl,
      requestQueueEnabled: true,
      maxConcurrent: this.MAX_CONCURRENT_REQUESTS
    });
  }

  /**
   * Unified LLM call that works with both Groq (OpenAI format) and Ollama.
   * Returns the response content string.
   */
  private async callProvider(
    messages: DeepSeekMessage[],
    model: string,
    options: DeepSeekOptions,
    timeoutMs: number = 60000
  ): Promise<{ content: string; evalCount?: number; done?: boolean }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (this.provider === 'groq') {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.groqApiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: options.temperature ?? 0.6,
            max_tokens: options.max_tokens ?? options.num_predict ?? 2000,
            top_p: options.top_p ?? 0.9,
            stream: false,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorBody.substring(0, 200)}`);
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content ?? '';
        return {
          content,
          evalCount: result.usage?.completion_tokens ?? 0,
          done: true,
        };
      } else {
        const ollamaUrl = this.baseUrl.replace('localhost', '127.0.0.1');
        const response = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            options: {
              temperature: options.temperature ?? 0.6,
              top_p: options.top_p ?? 0.9,
              num_predict: options.num_predict ?? options.max_tokens ?? 2000,
            },
          }),
          signal: controller.signal,
          keepalive: true,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const result: DeepSeekResponse = await response.json();
        return {
          content: result.message?.content ?? '',
          evalCount: result.eval_count ?? 0,
          done: result.done,
        };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Record an empty response for circuit breaker / backoff
   */
  private recordEmptyResponse(): void {
    this.consecutiveEmptyResponses++;
    this.lastEmptyResponseTime = Date.now();
    if (this.consecutiveEmptyResponses >= this.MAX_CONSECUTIVE_EMPTY) {
      this.circuitBreakerOpen = true;
      this.circuitBreakerOpenTime = Date.now();
    }
  }

  /**
   * Exponential backoff with jitter (baseMs * 2^retryCount, capped at maxMs)
   */
  private calculateBackoff(retryCount: number, baseMs: number, maxMs: number): number {
    const exp = Math.min(baseMs * Math.pow(2, retryCount), maxMs);
    const jitter = Math.random() * 0.3 * exp;
    return Math.round(exp + jitter);
  }

  /**
   * Reset circuit breaker and empty-response counter on success
   */
  private resetCircuitBreaker(): void {
    this.circuitBreakerOpen = false;
    this.consecutiveEmptyResponses = 0;
  }

  /**
   * Check if request is allowed by circuit breaker
   */
  private checkCircuitBreaker(): { allowed: boolean; reason: string } {
    if (!this.circuitBreakerOpen) {
      return { allowed: true, reason: '' };
    }
    const elapsed = Date.now() - this.circuitBreakerOpenTime;
    if (elapsed >= this.CIRCUIT_BREAKER_RESET_MS) {
      this.circuitBreakerOpen = false;
      this.consecutiveEmptyResponses = 0;
      return { allowed: true, reason: '' };
    }
    return {
      allowed: false,
      reason: `Open after ${this.consecutiveEmptyResponses} empty responses. Retry after ${Math.ceil((this.CIRCUIT_BREAKER_RESET_MS - elapsed) / 1000)}s`,
    };
  }

  /**
   * Process request queue to prevent concurrent overload
   * This ensures Ollama doesn't get overwhelmed with simultaneous requests
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    const queueSize = this.requestQueue.length;
    
    if (queueSize > 1) {
      logger.debug('[QUEUE] Processing request queue', {
        context: 'DeepSeekService',
        queueSize,
        note: 'Requests will be processed sequentially to prevent Ollama overload'
      });
    }

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (!request) continue;

      const remainingInQueue = this.requestQueue.length;
      if (remainingInQueue > 0) {
        logger.debug('[QUEUE] Processing request', {
          context: 'DeepSeekService',
          remainingInQueue,
          note: 'Other requests waiting in queue'
        });
      }

      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }

      // Small delay between requests to prevent overwhelming Ollama
      // This gives Ollama time to process and prevents model unload/reload cycles
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between requests
      }
    }

    this.isProcessingQueue = false;
    
    if (queueSize > 1) {
      logger.debug('[QUEUE] Request queue processed', {
        context: 'DeepSeekService',
        totalProcessed: queueSize,
        note: 'All queued requests completed'
      });
    }
  }

  /**
   * Queue a request to prevent concurrent overload
   */
  private async queueRequest<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, execute });
      // Start processing if not already processing
      this.processQueue().catch(err => {
        logger.error('Request queue processing error', err as Error, {
          context: 'DeepSeekService'
        });
      });
    });
  }

  /**
   * Send a chat message to DeepSeek R1 model
   * QUEUED: All requests are queued to prevent concurrent overload
   */
  async chat(
    prompt: string,
    model: string = this.defaultModel,
    options: DeepSeekOptions = {}
  ): Promise<any> {
    // Queue the request to prevent concurrent overload
    return this.queueRequest(() => this._chat(prompt, model, options));
  }

  /**
   * Internal chat implementation (called by queue)
   * Enhanced with automatic preload check
   */
  private async _chat(
    prompt: string,
    model: string = this.defaultModel,
    options: DeepSeekOptions = {}
  ): Promise<any> {
    // CRITICAL: Ensure model is preloaded before processing requests (unless explicitly skipped)
    if (!options._skipPreload && !this.isModelReady()) {
      logger.info('Model not ready, ensuring preload before request...', {
        context: 'DeepSeekService',
        model,
        promptLength: prompt.length
      });
      
      try {
        await this.ensureModelPreloaded();
      } catch (preloadError) {
        logger.warn('Preload check failed, proceeding with request anyway', {
          context: 'DeepSeekService',
          model,
          error: preloadError instanceof Error ? preloadError.message : String(preloadError),
          note: 'Request will proceed - model may load during request'
        });
      }
    }
    const startTime = Date.now();
    
    try {
      const messages: DeepSeekMessage[] = [
        { role: 'user', content: prompt }
      ];

      logger.debug('[DEEPSEEK] Sending request', {
        context: 'DeepSeekService',
        provider: this.provider,
        model,
        promptLength: prompt.length,
      });

      const timeoutMs = this.provider === 'groq' ? 60000 : 180000;
      const result = await this.callProvider(messages, model, options, timeoutMs);
      const duration = Date.now() - startTime;

      const hasContent = result.content && result.content.trim().length > 0;
      const hasTokens = (result.evalCount ?? 0) > 0;

      if (!hasContent) {
        logger.info('[DEBUG] EMPTY RESPONSE DETECTED', {
          context: 'DeepSeekService',
          method: '_chat',
          provider: this.provider,
          model,
          prompt: prompt.substring(0, 150),
          hasContent,
          evalCount: result.evalCount || 0,
          done: result.done,
        });
      }

      // Validate response has content
      if (!hasContent) {
        const isDone = result.done === true;
        const likelyNotLoaded = !hasTokens && isDone && this.provider === 'ollama';
        
        const logData = {
          context: 'DeepSeekService',
          provider: this.provider,
          model,
          duration: `${duration}ms`,
          hasContent,
          hasTokens,
          isDone,
          tokensGenerated: result.evalCount || 0,
          promptLength: prompt.length,
          likelyNotLoaded,
        };
        
        const isKeepAlive = prompt.toLowerCase().includes('ping') || prompt.toLowerCase().includes('ok');
        if (isKeepAlive) {
          logger.error('LLM returned empty response', null, logData);
        } else {
          logger.debug('LLM returned empty response (keep-alive)', logData);
        }

        this.recordEmptyResponse();
        
        const hasTokensButNoContent = hasTokens && !hasContent;
        if (hasTokensButNoContent && !options._skipRetry) {
          if (isKeepAlive) {
            return 'ok';
          }
          
          const backoffDelay = this.calculateBackoff(this.retryCount, 2000, 15000);
          this.retryCount++;
          
          logger.warn('LLM generated tokens but content empty - retrying', {
            context: 'DeepSeekService',
            provider: this.provider,
            model,
            tokensGenerated: result.evalCount,
            retryCount: this.retryCount,
            backoffDelay: `${backoffDelay}ms`,
          });
          
          try {
            // Mark that we're retrying to prevent infinite recursion
            const retryOptions = { ...options, _skipRetry: true };
            
            // Wait with exponential backoff + jitter
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            
            // Reset retry count on successful retry
            this.retryCount = 0;
            
            // Retry the request ONCE with flags to prevent further recursion
            // CRITICAL FIX: Call _chat directly to avoid double-queuing (we're already in a queued context)
            return await this._chat(prompt, model, retryOptions);
          } catch (retryError) {
            // Reset retry count on failure
            this.retryCount = 0;
            
            logger.warn('Retry after token generation failed', {
              context: 'DeepSeekService',
              model,
              error: retryError instanceof Error ? retryError.message : String(retryError),
              note: options._skipPreload ? 'Preload will continue despite retry failure' : 'Will try preload approach'
            });
            // Continue to try preload approach if not already in preload
            if (!options._skipPreload) {
              // Continue to preload approach below
            } else {
              // During preload, throw error so preload can handle it
              throw retryError;
            }
          }
        }
        
        // CRITICAL FIX: If model likely not loaded, try to preload it before retrying
        // BUT: Only do this once to prevent infinite loops
        if (likelyNotLoaded && !options._skipPreload) {
          logger.warn('Model appears not loaded, attempting to preload before retry (one time only)', {
            context: 'DeepSeekService',
            model,
            action: 'Preloading model into memory',
            note: 'Will not retry preload to prevent infinite loop'
          });
          
          try {
            // Mark that we're trying preload to prevent recursion
            const preloadOptions = { ...options, _skipPreload: true };
            
            // Try to preload the model (this will load it into memory)
            await this.preloadModel();
            logger.info('Model preload initiated, retrying request once', {
              context: 'DeepSeekService',
              model,
              note: 'First request after preload may still take 10-30 seconds'
            });
            
            // Wait a bit for model to start loading, then retry ONCE
            await new Promise(resolve => setTimeout(resolve, 5000)); // Increased to 5 seconds
            
            // Retry the request ONCE with flags to prevent further recursion
            // CRITICAL FIX: Call _chat directly to avoid double-queuing (we're already in a queued context)
            return await this._chat(prompt, model, preloadOptions);
          } catch (preloadError) {
            logger.warn('Model preload failed or retry failed', {
              context: 'DeepSeekService',
              model,
              error: preloadError instanceof Error ? preloadError.message : String(preloadError),
              note: 'Will throw error'
            });
            // Continue to throw error
          }
        }
        
        throw new Error(`LLM returned empty response - provider: ${this.provider}, model: ${model}, tokens: ${result.evalCount || 0}. Service may be unavailable.`);
      }

      this.resetCircuitBreaker();
      this.retryCount = 0;
      
      logger.info('LLM response received', {
        context: 'DeepSeekService',
        provider: this.provider,
        model,
        duration: `${duration}ms`,
        responseLength: result.content.length,
        tokensGenerated: result.evalCount || 0,
      });

      if (options.format === 'json') {
        try {
          const content = result.content;
          try {
            return JSON.parse(content);
          } catch (e1) {
            const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
              try { return JSON.parse(codeBlockMatch[1].trim()); } catch { /* next strategy */ }
            }
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
              try {
                let jsonStr = jsonMatch[0];
                jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
                jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
                return JSON.parse(jsonStr);
              } catch { /* next strategy */ }
            }
            return this.extractStructuredData(content);
          }
        } catch (parseError) {
          logger.error('All JSON parsing strategies failed', parseError as Error, {
            context: 'DeepSeekService',
            content: result.content.substring(0, 500) + '...'
          });
          return this.extractStructuredData(result.content);
        }
      }

      return result.content;

    } catch (error) {
      const duration = Date.now() - startTime;
      // HIGH PRIORITY FIX: Handle timeout errors specifically
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('DeepSeek R1 request timeout', error, {
          context: 'DeepSeekService',
          model,
          duration: `${duration}ms`,
          promptLength: prompt.length
        });
        throw new Error('DeepSeek R1 request timeout - request took too long');
      }
      logger.error('DeepSeek R1 API call failed', error, {
        context: 'DeepSeekService',
        model,
        duration: `${duration}ms`,
        promptLength: prompt.length
      });
      throw error;
    }
  }


  /**
   * Send a chat with system prompt (best for structured tasks)
   * ENHANCED: Includes retry logic for empty responses
   * QUEUED: All requests are queued to prevent concurrent overload
   */
  async chatWithSystem(
    systemPrompt: string,
    userPrompt: string,
    model: string = this.defaultModel,
    options: DeepSeekOptions = {},
    retryCount: number = 0,
    maxRetries: number = 2
  ): Promise<any> {
    // Queue the request to prevent concurrent overload
    return this.queueRequest(() => this._chatWithSystem(systemPrompt, userPrompt, model, options, retryCount, maxRetries));
  }

  /**
   * Internal chatWithSystem implementation (called by queue)
   */
  private async _chatWithSystem(
    systemPrompt: string,
    userPrompt: string,
    model: string = this.defaultModel,
    options: DeepSeekOptions = {},
    retryCount: number = 0,
    maxRetries: number = 2
  ): Promise<any> {
    // ENTERPRISE FIX: Check circuit breaker before making request
    const circuitCheck = this.checkCircuitBreaker();
    if (!circuitCheck.allowed) {
      throw new Error(`[CIRCUIT BREAKER] ${circuitCheck.reason}`);
    }
    
    const messages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const startTime = Date.now();

    try {
      logger.debug('[DEEPSEEK] Sending system chat', {
        context: 'DeepSeekService',
        provider: this.provider,
        model,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length
      });

      const timeoutMs = this.provider === 'groq' ? 60000 : 180000;
      const result = await this.callProvider(messages, model, options, timeoutMs);
      const duration = Date.now() - startTime;

      const hasContent = result.content && result.content.trim().length > 0;
      const hasTokens = (result.evalCount ?? 0) > 0;

      if (!hasContent) {
        this.recordEmptyResponse();
        
        const circuitCheck = this.checkCircuitBreaker();
        if (!circuitCheck.allowed) {
          throw new Error(`[CIRCUIT BREAKER] ${circuitCheck.reason}`);
        }
        
        const isDone = result.done === true;
        const likelyNotLoaded = !hasTokens && isDone && this.provider === 'ollama';
        
        logger.error('LLM system chat returned empty response', null, {
          context: 'DeepSeekService',
          provider: this.provider,
          model,
          duration: `${duration}ms`,
          hasTokens,
          isDone,
          tokensGenerated: result.evalCount || 0,
          likelyNotLoaded,
          consecutiveEmpty: this.consecutiveEmptyResponses,
        });
        
        // CRITICAL FIX: If model likely not loaded, try to preload it before retrying
        // BUT: Only do this once to prevent infinite loops
        if (likelyNotLoaded && retryCount === 0 && !options._skipPreload) {
          logger.warn('Model appears not loaded, attempting to preload before retry', {
            context: 'DeepSeekService',
            model,
            action: 'Preloading model into memory',
            retryCount
          });
          
          try {
            // Try to preload the model (this will load it into memory)
            await this.preloadModel();
            logger.info('Model preload initiated, will retry request', {
              context: 'DeepSeekService',
              model,
              note: 'First request after preload may still take 10-30 seconds'
            });
            
            // Wait a bit for model to start loading, then retry
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second wait for preload to start
            
            // Mark that we're trying preload to prevent recursion
            const preloadOptions = { ...options, _skipPreload: true };
            
            // Retry the request ONCE with flags to prevent further recursion
            // CRITICAL FIX: Call _chatWithSystem directly to avoid double-queuing (we're already in a queued context)
            return await this._chatWithSystem(systemPrompt, userPrompt, model, preloadOptions, retryCount + 1, maxRetries);
          } catch (preloadError) {
            logger.warn('Model preload failed, continuing with normal retry logic', {
              context: 'DeepSeekService',
              model,
              error: preloadError instanceof Error ? preloadError.message : String(preloadError)
            });
          }
        }
        
        // ENTERPRISE FIX: Retry logic with exponential backoff + jitter
        if (retryCount < maxRetries) {
          const retryDelay = this.calculateBackoff(retryCount, 1000, 10000);
          logger.warn(`Empty response received, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`, {
            context: 'DeepSeekService',
            model,
            retryCount: retryCount + 1,
            maxRetries,
            delay: retryDelay,
            likelyNotLoaded
          });
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          // CRITICAL FIX: Call _chatWithSystem directly to avoid double-queuing (we're already in a queued context)
          return await this._chatWithSystem(systemPrompt, userPrompt, model, options, retryCount + 1, maxRetries);
        }
        
        throw new Error(`LLM system chat returned empty response after ${maxRetries} retries - provider: ${this.provider}, model: ${model}, tokens: ${result.evalCount || 0}.`);
      }

      this.resetCircuitBreaker();
      this.retryCount = 0;
      
      logger.info('LLM system chat response received', {
        context: 'DeepSeekService',
        provider: this.provider,
        model,
        duration: `${duration}ms`,
        responseLength: result.content.length
      });

      if (options.format === 'json') {
        try {
          const content = result.content;
          try {
            return JSON.parse(content);
          } catch (e1) {
            const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
              try { return JSON.parse(codeBlockMatch[1].trim()); } catch { /* next strategy */ }
            }
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
              try {
                let jsonStr = jsonMatch[0];
                jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
                jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
                return JSON.parse(jsonStr);
              } catch { /* next strategy */ }
            }
            return this.extractStructuredData(content);
          }
        } catch (parseError) {
          logger.error('All JSON parsing strategies failed in system chat', parseError as Error, {
            context: 'DeepSeekService',
            content: result.content.substring(0, 500) + '...'
          });
          return this.extractStructuredData(result.content);
        }
      }

      return result.content;

    } catch (error) {
      const duration = Date.now() - startTime;
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('LLM system chat timeout', error, {
          context: 'DeepSeekService',
          provider: this.provider,
          model,
          duration: `${duration}ms`
        });
        throw new Error('LLM system chat timeout - request took too long');
      }
      logger.error('LLM system chat failed', error, {
        context: 'DeepSeekService',
        provider: this.provider,
        model,
        duration: `${duration}ms`
      });
      throw error;
    }
  }


  /**
   * Extract structured data from response (even if JSON parsing fails)
   * ENHANCED: Handles multiple JSON formats, code blocks, and malformed responses
   */
  public extractStructuredData(content: string): any {
    try {
      // Strategy 1: Try to extract JSON from code blocks first
      const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        try {
          const parsed = JSON.parse(codeBlockMatch[1].trim());
          logger.info('Extracted JSON from code block', {
            context: 'DeepSeekService',
            data: { hasApproved: 'approved' in parsed, hasAction: 'action' in parsed }
          });
          return parsed;
        } catch (e) {
          // Continue to next strategy
        }
      }

      // Strategy 2: Try to find JSON object in content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch && jsonMatch[0]) {
        try {
          // Try to fix common JSON issues
          let jsonStr = jsonMatch[0];
          // Fix trailing commas
          jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
          // Fix unquoted keys
          jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
          
          const parsed = JSON.parse(jsonStr);
          logger.info('Extracted JSON from content', {
            context: 'DeepSeekService',
            data: { hasApproved: 'approved' in parsed, hasAction: 'action' in parsed }
          });
          return parsed;
        } catch (e) {
          // Continue to next strategy
        }
      }

      // Strategy 3: Extract key-value pairs using regex (fallback)
      const extracted: any = { rawContent: content };
      
      // Handle empty content - return default rejection
      if (!content || content.trim().length === 0 || (content.trim() === '{}' || content.trim() === '{"rawContent":"","reasoning":""}')) {
        logger.warn('Empty or invalid response from DeepSeek, returning default rejection', {
          context: 'DeepSeekService',
          content: content?.substring(0, 100)
        });
        return {
          approved: false,
          action: 'HOLD',
          reasoning: 'Empty response from AI model - defaulting to rejection for safety',
          confidence: 0.1
        };
      }
      
      // Extract approved
      const approvedMatch = content.match(/approved["']?\s*:\s*(true|false|"true"|"false")/i);
      if (approvedMatch) {
        extracted.approved = approvedMatch[1].toLowerCase().replace(/"/g, '') === 'true';
      }
      
      // Also check for approve/approved/reject/rejected keywords if no explicit approved field
      if (extracted.approved === undefined) {
        const approveKeywords = /(?:approved?|accept|yes|ok|go)/i;
        const rejectKeywords = /(?:rejected?|denied?|no|reject|hold|wait)/i;
        if (approveKeywords.test(content)) {
          extracted.approved = true;
        } else if (rejectKeywords.test(content)) {
          extracted.approved = false;
        }
      }
      
      // Extract action (more flexible patterns)
      const actionMatch = content.match(/action["']?\s*:\s*["']?(BUY|SELL|HOLD|STRONG_BUY|STRONG_SELL)["']?/i);
      if (actionMatch) {
        const action = actionMatch[1].toUpperCase();
        // Normalize STRONG_BUY/STRONG_SELL to BUY/SELL
        extracted.action = action === 'STRONG_BUY' ? 'BUY' : action === 'STRONG_SELL' ? 'SELL' : action;
      } else {
        // Try to infer action from content text
        const contentLower = content.toLowerCase();
        if (contentLower.match(/\b(buy|long|purchase|acquire|enter long|go long)\b/)) {
          extracted.action = 'BUY';
        } else if (contentLower.match(/\b(sell|short|exit|close|liquidate|go short)\b/)) {
          extracted.action = 'SELL';
        } else if (contentLower.match(/\b(hold|wait|pause|no action|stay|neutral)\b/)) {
          extracted.action = 'HOLD';
        }
      }
      
      // Extract confidence
      const confidenceMatch = content.match(/confidence["']?\s*:\s*(0?\.\d+|\d+)/i);
      if (confidenceMatch) {
        const conf = parseFloat(confidenceMatch[1]);
        extracted.confidence = conf > 1 ? conf / 100 : conf; // Normalize if percentage
      }
      
      // Extract positionSize
      const positionSizeMatch = content.match(/positionSize["']?\s*:\s*(\d+\.?\d*)/i);
      if (positionSizeMatch) {
        extracted.positionSize = parseFloat(positionSizeMatch[1]);
      }
      
      // Extract stopLoss
      const stopLossMatch = content.match(/stopLoss["']?\s*:\s*(\d+\.?\d*)/i);
      if (stopLossMatch) {
        extracted.stopLoss = parseFloat(stopLossMatch[1]);
      }
      
      // Extract takeProfit
      const takeProfitMatch = content.match(/takeProfit["']?\s*:\s*(\d+\.?\d*)/i);
      if (takeProfitMatch) {
        extracted.takeProfit = parseFloat(takeProfitMatch[1]);
      }
      
      // Extract reasoning (more flexible pattern)
      const reasoningMatch = content.match(/reasoning["']?\s*:\s*["']([^"']{10,500})["']?/i);
      if (reasoningMatch) {
        extracted.reasoning = reasoningMatch[1];
      } else {
        // Fallback: try to find reasoning text after "reasoning:" or in the content
        const reasoningTextMatch = content.match(/(?:reasoning|analysis|assessment)[:：]\s*([^\n]{20,500})/i);
        if (reasoningTextMatch) {
          extracted.reasoning = reasoningTextMatch[1].trim();
        } else {
          // Last fallback: use first 500 chars as reasoning
          extracted.reasoning = content.substring(0, 500);
        }
      }

      // CRITICAL FIX: Try to infer approved from reasoning text if not explicitly found
      if (extracted.approved === undefined && extracted.reasoning) {
        const reasoningLower = extracted.reasoning.toLowerCase();
        // Look for approval indicators in reasoning
        if (reasoningLower.match(/\b(approved?|accept|yes|go|proceed|execute|take the trade|enter|buy|sell|recommend)\b/)) {
          extracted.approved = true;
          logger.info('Inferred approved=true from reasoning text', {
            context: 'DeepSeekService',
            data: { reasoningPreview: extracted.reasoning.substring(0, 100) }
          });
        } else if (reasoningLower.match(/\b(rejected?|denied?|no|reject|hold|wait|decline|skip|avoid|not approved|do not|should not)\b/)) {
          extracted.approved = false;
          logger.info('Inferred approved=false from reasoning text', {
            context: 'DeepSeekService',
            data: { reasoningPreview: extracted.reasoning.substring(0, 100) }
          });
        } else if (extracted.action) {
          // If we have action but no approved, infer from action
          extracted.approved = extracted.action === 'HOLD' ? false : true;
        }
      }
      
      // CRITICAL FIX: Also check rawContent if reasoning didn't help
      if (extracted.approved === undefined && content && content.length > 0) {
        const contentLower = content.toLowerCase();
        // Look for approval indicators in full content
        if (contentLower.match(/\b(approved?|accept|yes|go|proceed|execute|take the trade|enter)\b/)) {
          extracted.approved = true;
        } else if (contentLower.match(/\b(rejected?|denied?|no|reject|hold|wait|decline|skip|avoid|not approved)\b/)) {
          extracted.approved = false;
        }
      }

      // If we extracted at least approved or action, return it
      if (extracted.approved !== undefined || extracted.action) {
        // Ensure approved is set if we have action but no approved
        if (extracted.approved === undefined && extracted.action) {
          extracted.approved = extracted.action === 'HOLD' ? false : true;
        }
        logger.warn('Extracted partial data from malformed JSON', {
          context: 'DeepSeekService',
          data: { 
            extractedKeys: Object.keys(extracted).filter(k => k !== 'rawContent'),
            inferredApproved: extracted.approved !== undefined && !extracted.approved && extracted.reasoning ? 'from reasoning text' : undefined
          }
        });
        return extracted;
      }

      // Final fallback: if we have any content, try to infer from text
      if (content && content.trim().length > 0) {
        logger.warn('Could not extract structured data, returning default rejection', {
          context: 'DeepSeekService',
          content: content.substring(0, 200)
        });
        return {
          approved: false,
          action: 'HOLD',
          reasoning: `Unable to parse AI response: ${content.substring(0, 100)}`,
          confidence: 0.1
        };
      }

      return { error: 'Invalid JSON response', content };
    } catch (error) {
      logger.error('Failed to extract structured data', error as Error, {
        context: 'DeepSeekService',
        data: { contentLength: content.length, contentPreview: content.substring(0, 200) }
      });
      return { error: 'Failed to extract data', content };
    }
  }

  /**
   * Test connection to Ollama AND DeepSeek R1 model
   * IMPROVED: Actually tests if DeepSeek R1 can respond, not just if Ollama is running
   */
  async testConnection(): Promise<boolean> {
    try {
      // Step 1: Check if Ollama is running
      const controller1 = new AbortController();
      const timeoutId1 = setTimeout(() => controller1.abort(), 5000); // 5 second timeout
      
      const tagsResponse = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller1.signal
      });
      
      clearTimeout(timeoutId1);
      
      if (!tagsResponse.ok) {
        logger.error('Ollama is not responding', undefined, { context: 'DeepSeekService' });
        return false;
      }
      
      const models = await tagsResponse.json();
      const availableModels = models.models?.map((m: any) => m.name) || [];
      const hasDeepSeek = availableModels.some((m: string) => m.includes('deepseek') && m.includes('r1'));
      
      if (!hasDeepSeek) {
        logger.error('DeepSeek R1 model not found in Ollama', undefined, {
          context: 'DeepSeekService',
          availableModels,
          message: 'Run: ollama pull deepseek-r1:14b'
        });
        return false;
      }
      
      logger.info('Ollama connection successful, DeepSeek R1 model found', {
        context: 'DeepSeekService',
        availableModels: availableModels.filter((m: string) => m.includes('deepseek')),
        deepSeekModel: availableModels.find((m: string) => m.includes('deepseek') && m.includes('r1'))
      });
      
      // Step 2: Actually test if DeepSeek R1 can respond (CRITICAL TEST)
      // This ensures the model is loaded and can process requests
      // NOTE: First request can take 30-60 seconds to load model into memory - this is normal!
      try {
        // Use a longer timeout for the test since first load takes time
        // The chat() method now has a 180-second timeout (3 minutes), so we need at least that + buffer
        const testResult = await Promise.race([
          this.chat('Say hello in one sentence.', this.defaultModel, { max_tokens: 20 }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Model loading timeout - this is normal for first request. Wait 30-60 seconds and try again.')), 180000) // 3 minutes buffer
          )
        ]);
        
        if (testResult && typeof testResult === 'string' && testResult.length > 0) {
          logger.info('DeepSeek R1 is fully operational and responding', {
            context: 'DeepSeekService',
            model: this.defaultModel,
            responseLength: testResult.length
          });
          return true;
        } else {
          logger.error('DeepSeek R1 responded but with empty/invalid response', undefined, {
            context: 'DeepSeekService',
            response: testResult
          });
          return false;
        }
      } catch (chatError) {
        const errorMsg = chatError instanceof Error ? chatError.message : String(chatError);
        const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('30-60 seconds') || errorMsg.includes('60-90 seconds');
        
        logger.error('DeepSeek R1 model test failed - model may not be loaded', chatError as Error, {
          context: 'DeepSeekService',
          model: this.defaultModel,
          message: isTimeout 
            ? 'Model loading timeout - first request can take 30-60 seconds to load model into memory. This is normal. Try again in a minute or pre-load the model.'
            : 'Model may need to be loaded. First request can take 30-60 seconds to load model into memory.'
        });
        return false;
      }
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('DeepSeek connection test timeout - Ollama may not be running', error, { 
          context: 'DeepSeekService',
          message: 'Ensure Ollama is running: ollama serve'
        });
      } else {
        logger.error('DeepSeek connection test failed', error as Error, { context: 'DeepSeekService' });
      }
      return false;
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        return data.models?.map((model: any) => model.name) || [];
      }
      return [];
    } catch (error) {
      logger.error('Failed to get available models', error, { context: 'DeepSeekService' });
      return [];
    }
  }

  /**
   * Download the DeepSeek R1 14B model if not available
   * Returns true if model is available (either already downloaded or successfully downloaded)
   */
  async ensureModelDownloaded(): Promise<boolean> {
    try {
      // Check if model is already available
      const availableModels = await this.getAvailableModels();
      const hasModel = availableModels.some(m => m === this.defaultModel);
      
      if (hasModel) {
        logger.info('DeepSeek R1 14B model already downloaded', {
          context: 'DeepSeekService',
          model: this.defaultModel
        });
        return true;
      }
      
      // Model not found - download it
      logger.info('Downloading DeepSeek R1 14B model (this may take a few minutes)...', {
        context: 'DeepSeekService',
        model: this.defaultModel,
        note: 'Model size: ~4.7GB'
      });
      
      const ollamaUrl = this.baseUrl.replace('localhost', '127.0.0.1');
      const response = await fetch(`${ollamaUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: this.defaultModel,
          stream: false
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      logger.info('DeepSeek R1 14B model downloaded successfully', {
        context: 'DeepSeekService',
        model: this.defaultModel
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to download DeepSeek R1 14B model', error as Error, {
        context: 'DeepSeekService',
        model: this.defaultModel,
        note: 'You can manually download with: ollama pull deepseek-r1:14b'
      });
      return false;
    }
  }

  /**
   * Check if model is ready (preloaded and validated)
   */
  isModelReady(): boolean {
    const preloadStale = Date.now() - this.lastPreloadTime > this.PRELOAD_STALE_MS;
    return this.modelReady && !preloadStale;
  }

  /**
   * Get model readiness status
   */
  getModelStatus(): {
    ready: boolean;
    preloaded: boolean;
    lastPreloadTime: number;
    keepAliveActive: boolean;
    timeSincePreload: number;
  } {
    return {
      ready: this.isModelReady(),
      preloaded: this.modelReady,
      lastPreloadTime: this.lastPreloadTime,
      keepAliveActive: this.keepAliveInterval !== null,
      timeSincePreload: Date.now() - this.lastPreloadTime
    };
  }

  /**
   * Start keep-alive mechanism to prevent model unloading
   * ENHANCED: More resilient to empty responses and model quirks
   */
  private startKeepAlive(): void {
    // Clear existing interval if any
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.keepAliveInterval = setInterval(async () => {
      try {
        // Make a minimal request to keep model in memory
        // Use _skipPreload and _skipRetry to prevent recursion
        // CRITICAL: Use a simple prompt that's more likely to generate content
        const result = await this._chat('Say "ok".', this.defaultModel, {
          max_tokens: 10,
          _skipPreload: true,
          _skipRetry: true
        });
        
        // Check if we got any meaningful response (even if empty, model is still loaded)
        // Empty responses during keep-alive are acceptable - model is still in memory
        if (result && typeof result === 'string' && result.trim().length > 0) {
          this.lastKeepAliveTime = Date.now();
          
          logger.debug('Model keep-alive ping successful', {
            context: 'DeepSeekService',
            model: this.defaultModel,
            timeSinceLastKeepAlive: Date.now() - this.lastKeepAliveTime
          });
        } else {
          // Empty response but no error - model is still loaded, just didn't generate content
          // This is acceptable for keep-alive (model stays in memory)
          this.lastKeepAliveTime = Date.now();
          
          logger.debug('Model keep-alive ping completed (empty response acceptable)', {
            context: 'DeepSeekService',
            model: this.defaultModel,
            note: 'Empty response during keep-alive is acceptable - model remains in memory'
          });
        }
      } catch (error) {
        // Keep-alive failures are non-critical - just log at debug level
        // Don't spam error logs for keep-alive failures
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isEmptyResponse = errorMsg.includes('empty response');
        
        if (isEmptyResponse) {
          // Empty response during keep-alive is acceptable - model may still be loaded
          // Just mark as potentially not ready, but don't log as error
          this.modelReady = false;
          logger.debug('Model keep-alive got empty response (acceptable)', {
            context: 'DeepSeekService',
            model: this.defaultModel,
            note: 'Model may have been unloaded - will reload on next request'
          });
        } else {
          // Other errors (network, timeout, etc.) - log at debug level
          logger.debug('Model keep-alive ping failed (non-critical)', {
            context: 'DeepSeekService',
            model: this.defaultModel,
            error: errorMsg,
            note: 'Model may have been unloaded - will reload on next request'
          });
          this.modelReady = false;
        }
      }
    }, this.KEEP_ALIVE_INTERVAL_MS);

    logger.info('Model keep-alive mechanism started', {
      context: 'DeepSeekService',
      model: this.defaultModel,
      interval: `${this.KEEP_ALIVE_INTERVAL_MS}ms`
    });
  }

  /**
   * Stop keep-alive mechanism
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      logger.info('Model keep-alive mechanism stopped', {
        context: 'DeepSeekService',
        model: this.defaultModel
      });
    }
  }

  /**
   * Validate model readiness with multiple test requests
   * This ensures the model is truly ready and stable
   */
  private async validateModelReadiness(): Promise<boolean> {
    logger.info('Validating model readiness with multiple test requests...', {
      context: 'DeepSeekService',
      model: this.defaultModel,
      validationRequests: this.PRELOAD_VALIDATION_REQUESTS
    });

    let successCount = 0;
    const testPrompts = [
      'Say hello.',
      'Say yes.',
      'Say ok.'
    ];

    for (let i = 0; i < this.PRELOAD_VALIDATION_REQUESTS; i++) {
      try {
        const prompt = testPrompts[i % testPrompts.length];
        const result = await Promise.race([
          this._chat(prompt, this.defaultModel, {
            max_tokens: 10,
            _skipPreload: true,
            _skipRetry: true
          }),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Validation timeout')), 30000) // 30s timeout per request
          )
        ]);

        if (result && typeof result === 'string' && result.trim().length > 0) {
          successCount++;
          logger.debug(`Validation request ${i + 1}/${this.PRELOAD_VALIDATION_REQUESTS} passed`, {
            context: 'DeepSeekService',
            model: this.defaultModel,
            response: result.substring(0, 50)
          });
        } else {
          logger.warn(`Validation request ${i + 1}/${this.PRELOAD_VALIDATION_REQUESTS} returned empty response`, {
            context: 'DeepSeekService',
            model: this.defaultModel
          });
        }

        // Small delay between validation requests
        if (i < this.PRELOAD_VALIDATION_REQUESTS - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.warn(`Validation request ${i + 1}/${this.PRELOAD_VALIDATION_REQUESTS} failed`, {
          context: 'DeepSeekService',
          model: this.defaultModel,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const allPassed = successCount === this.PRELOAD_VALIDATION_REQUESTS;
    logger.info('Model readiness validation complete', {
      context: 'DeepSeekService',
      model: this.defaultModel,
      successCount,
      required: this.PRELOAD_VALIDATION_REQUESTS,
      validated: allPassed
    });

    return allPassed;
  }

  /**
   * Preload the model into RAM by making a warm-up request
   * This ensures the model is ready for fast responses
   * Enhanced with multiple validation requests and keep-alive
   */
  async preloadModel(): Promise<boolean> {
    try {
      logger.info('Preloading DeepSeek R1 14B model into RAM...', {
        context: 'DeepSeekService',
        model: this.defaultModel,
        note: 'This may take 30-60 seconds on first load'
      });
      
      const startTime = Date.now();
      
      // Make a small warm-up request to load the model into memory
      // CRITICAL FIX: Use _skipPreload to prevent recursion during preload
      // CRITICAL FIX: Use sufficient tokens (at least 30) to ensure model generates actual content
      // CRITICAL FIX: Allow retry for empty responses (but prevent infinite loops with _skipRetry)
      let warmupResult: string | null = null;
      let retryCount = 0;
      const maxRetries = 2; // Allow 2 retries for empty responses
      
      while (!warmupResult && retryCount <= maxRetries) {
        try {
          warmupResult = await Promise.race([
            this.chat('Say hello in one sentence.', this.defaultModel, { 
              max_tokens: 30, // Increased from 20 to 30
              _skipPreload: true,
              _skipRetry: retryCount > 0 // Only skip retry on second retry attempt
            }) as Promise<string>,
            new Promise<string>((_, reject) => 
              setTimeout(() => reject(new Error('Preload timeout')), 180000) // 3 minutes max
            )
          ]);
          
          // Validate response has content
          if (warmupResult && typeof warmupResult === 'string' && warmupResult.trim().length > 0) {
            break; // Success - exit retry loop
          } else {
            warmupResult = null; // Empty response, will retry
            retryCount++;
            if (retryCount <= maxRetries) {
              logger.warn(`Preload attempt ${retryCount} returned empty response, retrying...`, {
                context: 'DeepSeekService',
                model: this.defaultModel,
                retryAttempt: retryCount,
                maxRetries
              });
              // Wait before retry (longer wait for each retry)
              await new Promise(resolve => setTimeout(resolve, 5000 * retryCount));
            }
          }
        } catch (attemptError) {
          const errorMsg = attemptError instanceof Error ? attemptError.message : String(attemptError);
          if (errorMsg.includes('empty response') && retryCount < maxRetries) {
            retryCount++;
            logger.warn(`Preload attempt ${retryCount} failed with empty response, retrying...`, {
              context: 'DeepSeekService',
              model: this.defaultModel,
              retryAttempt: retryCount,
              maxRetries
            });
            await new Promise(resolve => setTimeout(resolve, 5000 * retryCount));
            continue; // Retry
          } else {
            throw attemptError; // Re-throw if not retryable
          }
        }
      }
      
      const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (warmupResult && typeof warmupResult === 'string' && warmupResult.trim().length > 0) {
        // CRITICAL: Validate model readiness with multiple requests
        logger.info('Initial preload successful, validating model stability...', {
          context: 'DeepSeekService',
          model: this.defaultModel,
          loadTime: `${loadTime}s`,
          retries: retryCount
        });

        const isValidated = await this.validateModelReadiness();
        
        if (isValidated) {
          // Mark model as ready
          this.modelReady = true;
          this.lastPreloadTime = Date.now();
          
          // Start keep-alive mechanism to prevent unloading
          this.startKeepAlive();
          
          logger.info('DeepSeek R1 14B model preloaded and validated successfully', {
            context: 'DeepSeekService',
            model: this.defaultModel,
            totalLoadTime: `${loadTime}s`,
            retries: retryCount,
            validated: true,
            keepAliveActive: true,
            ready: true
          });
          return true;
        } else {
          logger.warn('Model preload successful but validation failed', {
            context: 'DeepSeekService',
            model: this.defaultModel,
            loadTime: `${loadTime}s`,
            note: 'Model may still work but stability is uncertain'
          });
          // Still mark as ready but without keep-alive
          this.modelReady = true;
          this.lastPreloadTime = Date.now();
          return true; // Return true since initial preload worked
        }
      }
      
      logger.warn('Model preload completed but response was invalid after retries', {
        context: 'DeepSeekService',
        model: this.defaultModel,
        retries: retryCount,
        note: 'Model may still work on first actual request'
      });
      this.modelReady = false;
      return false;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('timeout') || errorMsg.includes('Preload timeout')) {
        logger.warn('Model preload timeout (this is normal on first load)', {
          context: 'DeepSeekService',
          model: this.defaultModel,
          note: 'Model will load on first actual request'
        });
      } else {
        logger.error('Failed to preload model', error as Error, {
          context: 'DeepSeekService',
          model: this.defaultModel,
          note: 'Model may still work on first actual request'
        });
      }
      return false;
    }
  }

  /**
   * Ensure model is ready before processing requests
   * Checks if preload is needed and ensures model is loaded
   */
  private async ensureModelPreloaded(): Promise<void> {
    // If model is already ready and not stale, return immediately
    if (this.isModelReady()) {
      return;
    }

    // If preload is already in progress, wait for it
    if (this.modelPreloadPromise) {
      await this.modelPreloadPromise;
      return;
    }

    // Start new preload
    this.modelPreloadPromise = this.preloadModel();
    try {
      await this.modelPreloadPromise;
    } finally {
      this.modelPreloadPromise = null;
    }
  }

  /**
   * Ensure model is downloaded and preloaded (downloads if needed, then preloads)
   * This is the main method to call on startup
   * Enhanced with readiness validation and keep-alive
   */
  async ensureModelReady(): Promise<boolean> {
    try {
      // Step 1: Ensure model is downloaded
      const downloaded = await this.ensureModelDownloaded();
      if (!downloaded) {
        logger.error('Model download failed - cannot proceed with preload', undefined, {
          context: 'DeepSeekService',
          model: this.defaultModel
        });
        return false;
      }
      
      // Step 2: Preload model into RAM with validation
      const preloaded = await this.preloadModel();
      if (!preloaded) {
        logger.warn('Model preload failed, but model is available', {
          context: 'DeepSeekService',
          model: this.defaultModel,
          note: 'First request will be slower as model loads'
        });
        // Don't fail - model is downloaded, just not preloaded
        return true;
      }
      
      logger.info('Model is fully ready and validated', {
        context: 'DeepSeekService',
        model: this.defaultModel,
        status: this.getModelStatus()
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to ensure model is ready', error as Error, {
        context: 'DeepSeekService',
        model: this.defaultModel
      });
      return false;
    }
  }

  /**
   * Cleanup: Stop keep-alive and reset state
   */
  cleanup(): void {
    this.stopKeepAlive();
    this.modelReady = false;
    this.modelPreloadPromise = null;
    logger.info('DeepSeekService cleaned up', {
      context: 'DeepSeekService',
      model: this.defaultModel
    });
  }

  /**
   * Get the default model (14B only - no alternatives)
   */
  getModel(): string {
    return this.defaultModel;
  }

  /**
   * Generate trading analysis with Chain-of-Thought reasoning
   */
  async generateTradingAnalysis(
    prompt: string,
    model: string = this.defaultModel
  ): Promise<any> {
    return this.chat(prompt, model, {
      format: 'json',
      temperature: 0.6,
      thinking: true, // Enable reasoning mode
      max_tokens: 3000 // More tokens for detailed analysis
    });
  }
}

const globalForDeepSeek = globalThis as typeof globalThis & {
  __deepseekService?: DeepSeekService;
};

if (!globalForDeepSeek.__deepseekService) {
  globalForDeepSeek.__deepseekService = new DeepSeekService();
}

export const deepseekService = globalForDeepSeek.__deepseekService;
export default deepseekService;

