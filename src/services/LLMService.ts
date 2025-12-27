import * as vscode from 'vscode';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    prompt_tokens: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    completion_tokens: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    total_tokens: number;
  };
}

export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Service for interacting with LLM APIs (OpenAI-compatible)
 * Supports OpenRouter and other OpenAI-compatible endpoints
 */
export class LLMService {
  private config: LLMConfig | null = null;

  constructor(private configService?: unknown) {}

  /**
   * Initialize LLM configuration from VS Code settings
   */
  private getConfig(): LLMConfig | null {
    if (this.config) {
      return this.config;
    }

    const vsConfig = vscode.workspace.getConfiguration('clauding.llm');
    const apiKey = vsConfig.get<string>('apiKey', '');
    const baseURL = vsConfig.get<string>('baseURL', 'https://openrouter.ai/api/v1');
    const model = vsConfig.get<string>('model', 'anthropic/claude-3.5-sonnet');
    const temperature = vsConfig.get<number>('temperature', 0.7);
    const maxTokens = vsConfig.get<number>('maxTokens', 4000);

    if (!apiKey) {
      return null;
    }

    this.config = {
      apiKey,
      baseURL,
      model,
      temperature,
      maxTokens,
    };

    return this.config;
  }

  /**
   * Check if LLM is configured
   */
  isConfigured(): boolean {
    const config = this.getConfig();
    return config !== null && config.apiKey.length > 0;
  }

  /**
   * Send a chat completion request to the LLM API
   */
  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const config = this.getConfig();

    if (!config) {
      throw new Error(
        'LLM not configured. Please set API key in settings: clauding.llm.apiKey'
      );
    }

    const endpoint = `${config.baseURL}/chat/completions`;

    const requestBody = {
      model: config.model,
      messages: messages,
      temperature: config.temperature,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      max_tokens: config.maxTokens,
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          /* eslint-disable @typescript-eslint/naming-convention */
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://github.com/clauding/vscode-extension',
          'X-Title': 'Clauding VSCode Extension',
          /* eslint-enable @typescript-eslint/naming-convention */
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `LLM API error (${response.status}): ${errorText}`
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await response.json()) as any;

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from LLM API');
      }

      const content = data.choices[0].message.content;

      if (!content) {
        throw new Error('LLM API returned empty content');
      }

      return {
        content,
        model: data.model || config.model,
        usage: data.usage,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to call LLM API: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Simple completion helper for single prompts
   */
  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: LLMMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const response = await this.chat(messages);
    return response.content;
  }

  /**
   * Clear cached configuration (useful for testing or when settings change)
   */
  clearConfig(): void {
    this.config = null;
  }
}
