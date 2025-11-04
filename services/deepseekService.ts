/**
 * DeepSeek R1 LLM Service for Multi-Agent Trading System
 * Optimized for RTX 5070 Ti with 16GB VRAM
 * Provides superior reasoning capabilities for trading decisions
 */

import { logger } from '@/lib/logger';

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
}

export class DeepSeekService {
  private baseUrl: string;
  private defaultModel: string;
  private fallbackModels: string[];

  constructor(
    baseUrl: string = 'http://localhost:11434',
    defaultModel: string = 'deepseek-r1:14b'
  ) {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
    
    // Fallback models in order of preference (14B -> 8B -> 7B)
    this.fallbackModels = [
      'deepseek-r1:14b',
      'deepseek-r1:8b',
      'deepseek-r1:7b'
    ];

    logger.info('DeepSeek R1 Service initialized', {
      context: 'DeepSeekService',
      defaultModel: this.defaultModel,
      baseUrl: this.baseUrl,
      gpuOptimized: true
    });
  }

  /**
   * Send a chat message to DeepSeek R1 model
   */
  async chat(
    prompt: string,
    model: string = this.defaultModel,
    options: DeepSeekOptions = {}
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      const messages: DeepSeekMessage[] = [
        { role: 'user', content: prompt }
      ];

      const requestBody = {
        model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.6, // Lower for trading (more deterministic)
          top_p: options.top_p ?? 0.9,
          num_predict: options.num_predict ?? options.max_tokens ?? 2000, // R1 needs more tokens for reasoning
          ...options
        }
      };

      logger.debug('💭 Sending request to DeepSeek R1', {
        context: 'DeepSeekService',
        model,
        promptLength: prompt.length,
        temperature: requestBody.options.temperature,
        thinking: options.thinking
      });

      // HIGH PRIORITY FIX: Add request timeout to prevent hanging requests
      // NOTE: 420 seconds (7 minutes) allows for initial model loading (18.9GB model can take 5+ minutes on slow systems)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 420000); // 420 second timeout (7 minutes) for LLM to accommodate slow model loading

      // CRITICAL FIX: Use 127.0.0.1 instead of localhost (Node.js fetch sometimes has DNS issues)
      const ollamaUrl = this.baseUrl.replace('localhost', '127.0.0.1');
      
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        // CRITICAL FIX: Add keepAlive for better connection handling
        keepalive: true
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        clearTimeout(timeoutId);
        // Try fallback models if primary fails
        if (model === this.defaultModel) {
          logger.warn('Primary model failed, trying fallback', {
            context: 'DeepSeekService',
            failedModel: model
          });
          return await this.chatWithFallback(prompt, options);
        }
        throw new Error(`DeepSeek R1 API error: ${response.status} ${response.statusText}`);
      }

      const result: DeepSeekResponse = await response.json();
      const duration = Date.now() - startTime;

      // Calculate tokens per second for performance monitoring
      const tokensPerSecond = result.eval_count && result.eval_duration 
        ? (result.eval_count / (result.eval_duration / 1000000000)).toFixed(2)
        : 'N/A';

      logger.info('DeepSeek R1 response received', {
        context: 'DeepSeekService',
        model,
        duration: `${duration}ms`,
        responseLength: result.message.content.length,
        tokensGenerated: result.eval_count || 0,
        tokensPerSecond,
        usingGPU: duration < 2000 // Likely GPU if < 2s
      });

      // If format is JSON, try to parse the response
      if (options.format === 'json') {
        try {
          // R1 might include reasoning before JSON, extract JSON
          const content = result.message.content;
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          return JSON.parse(content);
        } catch (parseError) {
          logger.warn('Failed to parse JSON response from DeepSeek R1', {
            context: 'DeepSeekService',
            error: parseError,
            content: result.message.content.substring(0, 300) + '...'
          });
          
          // Try to extract structured data even if not perfect JSON
          return this.extractStructuredData(result.message.content);
        }
      }

      return result.message.content;

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
   * Try fallback models in order
   */
  private async chatWithFallback(
    prompt: string,
    options: DeepSeekOptions = {}
  ): Promise<any> {
    for (const model of this.fallbackModels) {
      try {
        logger.info(`Trying fallback model: ${model}`, {
          context: 'DeepSeekService'
        });
        return await this.chat(prompt, model, options);
      } catch (error) {
        logger.warn(`Fallback model ${model} failed`, {
          context: 'DeepSeekService',
          error: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
    }
    throw new Error('All DeepSeek R1 models failed');
  }

  /**
   * Send a chat with system prompt (best for structured tasks)
   */
  async chatWithSystem(
    systemPrompt: string,
    userPrompt: string,
    model: string = this.defaultModel,
    options: DeepSeekOptions = {}
  ): Promise<any> {
    const messages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const requestBody = {
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.6,
        top_p: options.top_p ?? 0.9,
        num_predict: options.num_predict ?? options.max_tokens ?? 2000,
        ...options
      }
    };

    const startTime = Date.now();

    try {
      logger.debug('💭 Sending system chat to DeepSeek R1', {
        context: 'DeepSeekService',
        model,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length
      });

      // HIGH PRIORITY FIX: Add request timeout to prevent hanging requests
      // NOTE: 120 seconds allows for initial model loading (18.9GB model can take 60-90s on first request)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 420000); // 420 second timeout (7 minutes) for LLM to accommodate slow model loading

      // CRITICAL FIX: Use 127.0.0.1 instead of localhost (Node.js fetch sometimes has DNS issues)
      const ollamaUrl = this.baseUrl.replace('localhost', '127.0.0.1');

      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        // CRITICAL FIX: Add keepAlive for better connection handling
        keepalive: true
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Try fallback
        if (model === this.defaultModel) {
          return await this.chatWithSystemFallback(systemPrompt, userPrompt, options);
        }
        throw new Error(`DeepSeek R1 API error: ${response.status} ${response.statusText}`);
      }

      const result: DeepSeekResponse = await response.json();
      const duration = Date.now() - startTime;

      logger.info('DeepSeek R1 system chat response received', {
        context: 'DeepSeekService',
        model,
        duration: `${duration}ms`,
        responseLength: result.message.content.length
      });

      if (options.format === 'json') {
        try {
          const content = result.message.content;
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          return JSON.parse(content);
        } catch (parseError) {
          logger.warn('Failed to parse JSON response from DeepSeek R1 system chat', {
            context: 'DeepSeekService',
            error: parseError,
            content: result.message.content.substring(0, 300) + '...'
          });
          return this.extractStructuredData(result.message.content);
        }
      }

      return result.message.content;

    } catch (error) {
      const duration = Date.now() - startTime;
      // HIGH PRIORITY FIX: Handle timeout errors specifically
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('DeepSeek R1 system chat timeout', error, {
          context: 'DeepSeekService',
          model,
          duration: `${duration}ms`
        });
        throw new Error('DeepSeek R1 system chat timeout - request took too long');
      }
      logger.error('DeepSeek R1 system chat failed', error, {
        context: 'DeepSeekService',
        model,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  /**
   * Fallback for system chat
   */
  private async chatWithSystemFallback(
    systemPrompt: string,
    userPrompt: string,
    options: DeepSeekOptions = {}
  ): Promise<any> {
    for (const model of this.fallbackModels) {
      try {
        return await this.chatWithSystem(systemPrompt, userPrompt, model, options);
      } catch (error) {
        continue;
      }
    }
    throw new Error('All DeepSeek R1 models failed for system chat');
  }

  /**
   * Extract structured data from response (even if JSON parsing fails)
   */
  private extractStructuredData(content: string): any {
    try {
      // Try to find action, confidence, reasoning patterns
      const actionMatch = content.match(/action["']?\s*:\s*["']?(BUY|SELL|HOLD)["']?/i);
      const confidenceMatch = content.match(/confidence["']?\s*:\s*(0?\.\d+|\d+)/i);
      const reasoningMatch = content.match(/reasoning["']?\s*:\s*["']([^"']+)["']?/i);

      if (actionMatch || confidenceMatch) {
        return {
          action: actionMatch ? actionMatch[1].toUpperCase() : 'HOLD',
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
          reasoning: reasoningMatch ? reasoningMatch[1] : content.substring(0, 200),
          rawContent: content
        };
      }

      return { error: 'Invalid JSON response', content };
    } catch (error) {
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
      // NOTE: First request can take 60-120 seconds to load model into memory - this is normal!
      try {
        // Use a longer timeout for the test since first load takes time
        // The chat() method now has a 420-second timeout (7 minutes), so we need at least that + buffer
        const testResult = await Promise.race([
          this.chat('Test', this.defaultModel, { max_tokens: 10 }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Model loading timeout - this is normal for first request. Wait 60-120 seconds and try again.')), 450000) // 7.5 minutes buffer
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
        const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('60-120 seconds') || errorMsg.includes('60-90 seconds');
        
        logger.error('DeepSeek R1 model test failed - model may not be loaded', chatError as Error, {
          context: 'DeepSeekService',
          model: this.defaultModel,
          message: isTimeout 
            ? 'Model loading timeout - first request can take 60-120 seconds to load model into memory. This is normal. Try again in a minute or pre-load the model.'
            : 'Model may need to be loaded. First request can take 60-120 seconds to load model into memory.'
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
   * Get best available DeepSeek model
   */
  async getBestAvailableModel(): Promise<string> {
    try {
      const available = await this.getAvailableModels();
      const deepseekModels = available.filter(m => m.includes('deepseek-r1'));
      
      // Return best available in order of preference
      for (const preferred of this.fallbackModels) {
        if (deepseekModels.includes(preferred)) {
          logger.info(`Using DeepSeek R1 model: ${preferred}`, {
            context: 'DeepSeekService'
          });
          return preferred;
        }
      }
      
      // If no preferred model, return first deepseek model found
      if (deepseekModels.length > 0) {
        return deepseekModels[0];
      }
      
      return this.defaultModel;
    } catch (error) {
      logger.warn('Failed to detect best model, using default', {
        context: 'DeepSeekService',
        default: this.defaultModel
      });
      return this.defaultModel;
    }
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

// Export singleton instance
export const deepseekService = new DeepSeekService();
export default deepseekService;

