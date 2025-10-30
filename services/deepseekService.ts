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
    defaultModel: string = 'deepseek-r1:32b'
  ) {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
    
    // Fallback models in order of preference (32B -> 14B -> 8B -> 7B)
    this.fallbackModels = [
      'deepseek-r1:32b',
      'deepseek-r1:14b',
      'deepseek-r1:8b',
      'deepseek-r1:7b'
    ];

    logger.info('🧠 DeepSeek R1 Service initialized', {
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

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
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

      logger.info('✅ DeepSeek R1 response received', {
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

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // Try fallback
        if (model === this.defaultModel) {
          return await this.chatWithSystemFallback(systemPrompt, userPrompt, options);
        }
        throw new Error(`DeepSeek R1 API error: ${response.status} ${response.statusText}`);
      }

      const result: DeepSeekResponse = await response.json();
      const duration = Date.now() - startTime;

      logger.info('✅ DeepSeek R1 system chat response received', {
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
   * Test connection to Ollama
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (response.ok) {
        const models = await response.json();
        const availableModels = models.models?.map((m: any) => m.name) || [];
        
        logger.info('✅ Ollama connection successful', {
          context: 'DeepSeekService',
          availableModels,
          hasDeepSeek: availableModels.some((m: string) => m.includes('deepseek'))
        });
        
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Ollama connection failed', error, { context: 'DeepSeekService' });
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

