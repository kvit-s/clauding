import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { LLMService, LLMMessage } from '../services/LLMService';

suite('LLMService Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let llmService: LLMService;
  let getConfigurationStub: sinon.SinonStub;
  let fetchStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    llmService = new LLMService();

    // Setup default configuration stub
    const mockConfig = {
      get: sandbox.stub()
    };
    mockConfig.get.withArgs('apiKey', '').returns('test-api-key');
    mockConfig.get.withArgs('baseURL', 'https://openrouter.ai/api/v1').returns('https://openrouter.ai/api/v1');
    mockConfig.get.withArgs('model', 'anthropic/claude-3.5-sonnet').returns('anthropic/claude-3.5-sonnet');
    mockConfig.get.withArgs('temperature', 0.7).returns(0.7);
    mockConfig.get.withArgs('maxTokens', 4000).returns(4000);

    getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);

    // Setup fetch stub for API calls
    fetchStub = sandbox.stub(global, 'fetch');
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('Configuration Loading', () => {
    test('should load configuration from VS Code settings', () => {
      const isConfigured = llmService.isConfigured();
      assert.strictEqual(isConfigured, true);
      assert.ok(getConfigurationStub.calledWith('clauding.llm'));
    });

    test('should detect missing API key', () => {
      // Reconfigure to return empty API key
      llmService.clearConfig();
      const mockConfig = {
        get: sandbox.stub()
      };
      mockConfig.get.withArgs('apiKey', '').returns('');
      mockConfig.get.withArgs('baseURL', 'https://openrouter.ai/api/v1').returns('https://openrouter.ai/api/v1');
      mockConfig.get.withArgs('model', 'anthropic/claude-3.5-sonnet').returns('anthropic/claude-3.5-sonnet');
      mockConfig.get.withArgs('temperature', 0.7).returns(0.7);
      mockConfig.get.withArgs('maxTokens', 4000).returns(4000);

      getConfigurationStub.returns(mockConfig as any);

      const isConfigured = llmService.isConfigured();
      assert.strictEqual(isConfigured, false);
    });

    test('should cache configuration after first load', () => {
      llmService.isConfigured();
      llmService.isConfigured();

      // Should only call getConfiguration once
      assert.strictEqual(getConfigurationStub.callCount, 1);
    });

    test('should clear cached configuration', () => {
      llmService.isConfigured();
      llmService.clearConfig();
      llmService.isConfigured();

      // Should call getConfiguration twice (once before clear, once after)
      assert.strictEqual(getConfigurationStub.callCount, 2);
    });
  });

  suite('Chat Completion', () => {
    test('should successfully call LLM API', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Hello! How can I help you?'
              }
            }
          ],
          model: 'anthropic/claude-3.5-sonnet',
          usage: {
            /* eslint-disable @typescript-eslint/naming-convention */
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
            /* eslint-enable @typescript-eslint/naming-convention */
          }
        }),
        text: async () => ''
      };

      fetchStub.resolves(mockResponse as any);

      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      const response = await llmService.chat(messages);

      assert.strictEqual(response.content, 'Hello! How can I help you?');
      assert.strictEqual(response.model, 'anthropic/claude-3.5-sonnet');
      assert.ok(response.usage);
      assert.strictEqual(response.usage?.total_tokens, 30);
    });

    test('should handle message history', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          model: 'anthropic/claude-3.5-sonnet'
        })
      };

      fetchStub.resolves(mockResponse as any);

      const messages: LLMMessage[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' }
      ];

      await llmService.chat(messages);

      // Verify fetch was called with correct message history
      assert.ok(fetchStub.calledOnce);
      const fetchCall = fetchStub.firstCall;
      const requestBody = JSON.parse(fetchCall.args[1].body);
      assert.strictEqual(requestBody.messages.length, 4);
      assert.strictEqual(requestBody.messages[0].role, 'system');
    });

    test('should include proper headers in API request', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      };

      fetchStub.resolves(mockResponse as any);

      await llmService.chat([{ role: 'user', content: 'Test' }]);

      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers['Content-Type'], 'application/json');
      assert.strictEqual(headers['Authorization'], 'Bearer test-api-key');
      assert.ok(headers['HTTP-Referer']);
      assert.ok(headers['X-Title']);
    });
  });

  suite('Error Handling', () => {
    test('should throw error when LLM not configured', async () => {
      llmService.clearConfig();
      const mockConfig = {
        get: sandbox.stub().returns('')
      };
      getConfigurationStub.returns(mockConfig as any);

      await assert.rejects(
        async () => await llmService.chat([{ role: 'user', content: 'Test' }]),
        /LLM not configured/
      );
    });

    test('should handle API error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: async () => 'Invalid API key'
      };

      fetchStub.resolves(mockResponse as any);

      await assert.rejects(
        async () => await llmService.chat([{ role: 'user', content: 'Test' }]),
        /LLM API error \(401\): Invalid API key/
      );
    });

    test('should handle network errors', async () => {
      fetchStub.rejects(new Error('Network error'));

      await assert.rejects(
        async () => await llmService.chat([{ role: 'user', content: 'Test' }]),
        /Failed to call LLM API: Network error/
      );
    });

    test('should handle rate limiting (429)', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      };

      fetchStub.resolves(mockResponse as any);

      await assert.rejects(
        async () => await llmService.chat([{ role: 'user', content: 'Test' }]),
        /LLM API error \(429\)/
      );
    });

    test('should handle invalid response format (no choices)', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ choices: [] })
      };

      fetchStub.resolves(mockResponse as any);

      await assert.rejects(
        async () => await llmService.chat([{ role: 'user', content: 'Test' }]),
        /No response from LLM API/
      );
    });

    test('should handle missing choices array', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({})
      };

      fetchStub.resolves(mockResponse as any);

      await assert.rejects(
        async () => await llmService.chat([{ role: 'user', content: 'Test' }]),
        /No response from LLM API/
      );
    });
  });

  suite('Simple Completion Helper', () => {
    test('should handle simple prompt', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response to prompt' } }]
        })
      };

      fetchStub.resolves(mockResponse as any);

      const result = await llmService.complete('What is 2+2?');

      assert.strictEqual(result, 'Response to prompt');

      // Verify only user message was sent
      const requestBody = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.strictEqual(requestBody.messages.length, 1);
      assert.strictEqual(requestBody.messages[0].role, 'user');
    });

    test('should include system prompt when provided', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      };

      fetchStub.resolves(mockResponse as any);

      await llmService.complete('What is 2+2?', 'You are a math teacher');

      // Verify system and user messages were sent
      const requestBody = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.strictEqual(requestBody.messages.length, 2);
      assert.strictEqual(requestBody.messages[0].role, 'system');
      assert.strictEqual(requestBody.messages[0].content, 'You are a math teacher');
      assert.strictEqual(requestBody.messages[1].role, 'user');
      assert.strictEqual(requestBody.messages[1].content, 'What is 2+2?');
    });
  });

  suite('Configuration Parameters', () => {
    test('should use correct model from config', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      };

      fetchStub.resolves(mockResponse as any);

      await llmService.chat([{ role: 'user', content: 'Test' }]);

      const requestBody = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.strictEqual(requestBody.model, 'anthropic/claude-3.5-sonnet');
    });

    test('should use correct temperature from config', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      };

      fetchStub.resolves(mockResponse as any);

      await llmService.chat([{ role: 'user', content: 'Test' }]);

      const requestBody = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.strictEqual(requestBody.temperature, 0.7);
    });

    test('should use correct max tokens from config', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      };

      fetchStub.resolves(mockResponse as any);

      await llmService.chat([{ role: 'user', content: 'Test' }]);

      const requestBody = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.strictEqual(requestBody.max_tokens, 4000);
    });

    test('should use correct base URL from config', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      };

      fetchStub.resolves(mockResponse as any);

      await llmService.chat([{ role: 'user', content: 'Test' }]);

      const fetchUrl = fetchStub.firstCall.args[0];
      assert.ok(fetchUrl.startsWith('https://openrouter.ai/api/v1'));
      assert.ok(fetchUrl.includes('/chat/completions'));
    });
  });
});
