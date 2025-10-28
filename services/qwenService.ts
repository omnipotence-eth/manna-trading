/**
 * Qwen LLM Service for Multi-Agent Trading System
 * Provides communication with Qwen 2.5 models via Ollama
 */

import { logger } from '@/lib/logger';

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface QwenResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

export interface QwenOptions {
  temperature?: number;
  top_p?: number;
  num_predict?: number;
  format?: 'json' | 'text';
}

export class QwenService {
  private baseUrl: string;
  private defaultModel: string;

  constructor(baseUrl: string = 'http://localhost:11434', defaultModel: string = 'qwen2.5:7b-instruct') {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  /**
   * Send a chat message to Qwen model
   */
  async chat(
    prompt: string, 
    model: string = this.defaultModel, 
    options: QwenOptions = {}
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      const messages: QwenMessage[] = [
        { role: 'user', content: prompt }
      ];

      const requestBody = {
        model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          top_p: options.top_p || 0.9,
          num_predict: options.num_predict || 1000,
          ...options
        }
      };

      logger.debug('Sending request to Qwen', {
        context: 'QwenService',
        model,
        promptLength: prompt.length,
        options: requestBody.options
      });

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Qwen API error: ${response.status} ${response.statusText}`);
      }

      const result: QwenResponse = await response.json();
      const duration = Date.now() - startTime;

      logger.info('Qwen response received', {
        context: 'QwenService',
        model,
        duration: `${duration}ms`,
        responseLength: result.message.content.length,
        tokensGenerated: result.eval_count,
        totalDuration: result.total_duration
      });

      // If format is JSON, try to parse the response
      if (options.format === 'json') {
        try {
          return JSON.parse(result.message.content);
        } catch (parseError) {
          logger.warn('Failed to parse JSON response from Qwen', {
            context: 'QwenService',
            error: parseError,
            content: result.message.content.substring(0, 200) + '...'
          });
          return { error: 'Invalid JSON response', content: result.message.content };
        }
      }

      return result.message.content;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Qwen API call failed', error, {
        context: 'QwenService',
        model,
        duration: `${duration}ms`,
        promptLength: prompt.length
      });
      throw error;
    }
  }

  /**
   * Send a chat with system prompt
   */
  async chatWithSystem(
    systemPrompt: string,
    userPrompt: string,
    model: string = this.defaultModel,
    options: QwenOptions = {}
  ): Promise<any> {
    const messages: QwenMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const requestBody = {
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        num_predict: options.num_predict || 1000,
        ...options
      }
    };

    const startTime = Date.now();

    try {
      logger.debug('Sending system chat to Qwen', {
        context: 'QwenService',
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
        throw new Error(`Qwen API error: ${response.status} ${response.statusText}`);
      }

      const result: QwenResponse = await response.json();
      const duration = Date.now() - startTime;

      logger.info('Qwen system chat response received', {
        context: 'QwenService',
        model,
        duration: `${duration}ms`,
        responseLength: result.message.content.length
      });

      if (options.format === 'json') {
        try {
          return JSON.parse(result.message.content);
        } catch (parseError) {
          logger.warn('Failed to parse JSON response from Qwen system chat', {
            context: 'QwenService',
            error: parseError,
            content: result.message.content.substring(0, 200) + '...'
          });
          return { error: 'Invalid JSON response', content: result.message.content };
        }
      }

      return result.message.content;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Qwen system chat failed', error, {
        context: 'QwenService',
        model,
        duration: `${duration}ms`
      });
      throw error;
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
        logger.info('Ollama connection successful', {
          context: 'QwenService',
          availableModels: models.models?.map((m: any) => m.name) || []
        });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Ollama connection failed', error, { context: 'QwenService' });
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
      logger.error('Failed to get available models', error, { context: 'QwenService' });
      return [];
    }
  }

  /**
   * Generate a simple analysis (for testing)
   */
  async generateAnalysis(prompt: string, model: string = this.defaultModel): Promise<any> {
    return this.chat(prompt, model, { format: 'json', temperature: 0.7 });
  }
}

// Export singleton instance
export const qwenService = new QwenService();
export default qwenService;
