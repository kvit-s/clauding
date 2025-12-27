import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FeatureClassificationService, ClassificationMetadata, ProjectContext } from '../services/FeatureClassificationService';
import { LLMService } from '../services/LLMService';

suite('FeatureClassificationService Test Suite', () => {
	let testDir: string;
	let worktreePath: string;
	let service: FeatureClassificationService;
	let sandbox: sinon.SinonSandbox;
	let llmChatStub: sinon.SinonStub;

	setup(() => {
		sandbox = sinon.createSandbox();

		// Create a temporary directory for tests
		testDir = path.join(__dirname, '../../test-temp', `classification-${Date.now()}`);
		worktreePath = path.join(testDir, 'worktrees', 'test-feature');
		fs.mkdirSync(worktreePath, { recursive: true });

		// Mock workspace configuration
		const mockConfig = {
			get: (key: string, defaultValue?: any) => {
				if (key === 'baseURL') { return 'https://openrouter.ai/api/v1'; }
				if (key === 'model') { return 'anthropic/claude-3.5-sonnet'; }
				if (key === 'apiKey') { return 'test-api-key'; }
				return defaultValue;
			}
		};
		sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);

		// Mock workspace folders
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			value: [{ uri: { fsPath: worktreePath } }],
			configurable: true
		});

		service = new FeatureClassificationService(worktreePath);

		// Stub LLMService.chat
		llmChatStub = sandbox.stub(LLMService.prototype, 'chat');
		sandbox.stub(LLMService.prototype, 'isConfigured').returns(true);
	});

	teardown(() => {
		sandbox.restore();

		// Clean up test directory
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	suite('initialization', () => {
		test('should create service with worktree path', () => {
			assert.ok(service);
		});

		test('should create service without worktree path', () => {
			const defaultService = new FeatureClassificationService();
			assert.ok(defaultService);
		});
	});

	suite('classifyFeature', () => {
		test('should classify feature as lightweight', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const result = await service.classifyFeature(
				'test-feature',
				'Change button color to blue'
			);

			assert.strictEqual(result.classification.result, 'lightweight');
			assert.strictEqual(result.classification.confidence, 'high');
		});

		test('should classify feature as standard', async () => {
			llmChatStub.resolves({
				content: 'standard',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const result = await service.classifyFeature(
				'test-feature',
				'Implement new authentication system with OAuth2'
			);

			assert.strictEqual(result.classification.result, 'standard');
			assert.strictEqual(result.classification.confidence, 'high');
		});

		test('should handle verbose LLM response', async () => {
			llmChatStub.resolves({
				content: 'This feature should be classified as lightweight because it only involves simple UI changes.',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const result = await service.classifyFeature(
				'test-feature',
				'Update text on homepage'
			);

			assert.strictEqual(result.classification.result, 'lightweight');
			assert.strictEqual(result.classification.confidence, 'low'); // Keyword is buried in text
		});

		test('should default to standard for ambiguous response', async () => {
			llmChatStub.resolves({
				content: 'unclear response',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const result = await service.classifyFeature(
				'test-feature',
				'Do something'
			);

			assert.strictEqual(result.classification.result, 'standard');
			// Note: console.warn is called but we don't test for it
		});

		test('should include project context in prompt', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const context: ProjectContext = {
				readme: 'This is a React application',
				architecture: 'Uses Redux for state management'
			};

			await service.classifyFeature(
				'test-feature',
				'Add new button',
				context
			);

			// Verify prompt includes context
			const callArgs = llmChatStub.firstCall.args[0];
			const userMessage = callArgs.find((m: any) => m.role === 'user');
			assert.ok(userMessage.content.includes('This is a React application'));
			assert.ok(userMessage.content.includes('Uses Redux for state management'));
		});

		test('should throw error if LLM not configured', async () => {
			sandbox.restore();
			sandbox = sinon.createSandbox();
			sandbox.stub(LLMService.prototype, 'isConfigured').returns(false);

			const unconfiguredService = new FeatureClassificationService(worktreePath);

			await assert.rejects(
				() => unconfiguredService.classifyFeature('test', 'prompt'),
				/LLM not configured/
			);
		});

		test('should handle API errors', async () => {
			llmChatStub.rejects(new Error('API error'));

			await assert.rejects(
				() => service.classifyFeature('test-feature', 'prompt'),
				/API error/
			);
		});

		test('should save metadata to file', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			await service.classifyFeature('test-feature', 'prompt');

			const metaPath = path.join(
				worktreePath,
				'.clauding',
				'classification.json'
			);

			assert.ok(fs.existsSync(metaPath));
		});

		test('should include LLM raw response in metadata', async () => {
			llmChatStub.resolves({
				content: 'This is a lightweight feature.',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const result = await service.classifyFeature('test-feature', 'prompt');

			assert.strictEqual(
				result.classification.llmRawResponse,
				'This is a lightweight feature.'
			);
		});

		test('should determine high confidence for single word response', async () => {
			llmChatStub.resolves({
				content: 'standard',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const result = await service.classifyFeature('test-feature', 'prompt');

			assert.strictEqual(result.classification.confidence, 'high');
		});

		test('should determine medium confidence for prefixed response', async () => {
			llmChatStub.resolves({
				content: 'lightweight - simple change',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const result = await service.classifyFeature('test-feature', 'prompt');

			assert.strictEqual(result.classification.confidence, 'medium');
		});

		test('should determine low confidence for buried keyword', async () => {
			llmChatStub.resolves({
				content: 'After careful analysis, this appears to be lightweight in nature.',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const result = await service.classifyFeature('test-feature', 'prompt');

			assert.strictEqual(result.classification.confidence, 'low');
		});

		test('should include timestamp in metadata', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const before = new Date().toISOString();
			const result = await service.classifyFeature('test-feature', 'prompt');
			const after = new Date().toISOString();

			assert.ok(result.metadata.timestamp >= before);
			assert.ok(result.metadata.timestamp <= after);
		});

		test('should include prompt in metadata', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const result = await service.classifyFeature('test-feature', 'test prompt');

			assert.ok(result.metadata.prompt.user.includes('test prompt'));
			assert.ok(result.metadata.prompt.system.includes('lightweight'));
			assert.ok(result.metadata.prompt.system.includes('standard'));
		});

		test('should track context inclusion in metadata', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const context: ProjectContext = {
				readme: 'README content'
			};

			const result = await service.classifyFeature('test-feature', 'prompt', context);

			assert.strictEqual(result.metadata.prompt.contextIncluded.readme, true);
			assert.strictEqual(result.metadata.prompt.contextIncluded.architecture, false);
		});
	});

	suite('saveClassificationMetadata', () => {
		test('should save metadata to correct path', async () => {
			const metadata: ClassificationMetadata = {
				timestamp: new Date().toISOString(),
				featureName: 'test-feature',
				classification: {
					result: 'lightweight',
					confidence: 'high',
					llmRawResponse: 'lightweight'
				},
				llm: {
					provider: 'openrouter',
					baseURL: 'https://openrouter.ai/api/v1',
					model: 'anthropic/claude-3.5-sonnet',
					temperature: 0.3,
					maxTokens: 500
				},
				prompt: {
					system: 'system prompt',
					user: 'user prompt',
					contextIncluded: { readme: false, architecture: false }
				},
				response: {
					raw: 'lightweight',
					parsed: 'lightweight',
					receivedAt: new Date().toISOString()
				},
				userChoice: null,
				commitHash: null
			};

			await service.saveClassificationMetadata('test-feature', metadata);

			const metaPath = path.join(
				worktreePath,
				'.clauding',
				'classification.json'
			);

			assert.ok(fs.existsSync(metaPath));

			const saved = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
			assert.strictEqual(saved.classification.result, 'lightweight');
		});

		test('should create directory if it does not exist', async () => {
			const metadata: ClassificationMetadata = {
				timestamp: new Date().toISOString(),
				featureName: 'new-feature',
				classification: {
					result: 'standard',
					confidence: 'high',
					llmRawResponse: 'standard'
				},
				llm: {
					provider: 'openrouter',
					baseURL: 'https://openrouter.ai/api/v1',
					model: 'anthropic/claude-3.5-sonnet',
					temperature: 0.3,
					maxTokens: 500
				},
				prompt: {
					system: 'system prompt',
					user: 'user prompt',
					contextIncluded: { readme: false, architecture: false }
				},
				response: {
					raw: 'standard',
					parsed: 'standard',
					receivedAt: new Date().toISOString()
				},
				userChoice: null,
				commitHash: null
			};

			await service.saveClassificationMetadata('new-feature', metadata);

			const metaDir = path.join(
				worktreePath,
				'.clauding'
			);

			assert.ok(fs.existsSync(metaDir));
		});
	});

	suite('loadClassificationMetadata', () => {
		test('should load saved metadata', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			await service.classifyFeature('test-feature', 'prompt');

			const loaded = await service.loadClassificationMetadata('test-feature');

			assert.ok(loaded);
			assert.strictEqual(loaded?.classification.result, 'lightweight');
		});

		test('should return null for non-existent metadata', async () => {
			const loaded = await service.loadClassificationMetadata('non-existent');
			assert.strictEqual(loaded, null);
		});

		test('should preserve all metadata fields', async () => {
			llmChatStub.resolves({
				content: 'standard',
				model: 'anthropic/claude-3.5-sonnet'
			});

			const context: ProjectContext = {
				readme: 'README',
				architecture: 'ARCH'
			};

			await service.classifyFeature('test-feature', 'test prompt', context);

			const loaded = await service.loadClassificationMetadata('test-feature');

			assert.ok(loaded);
			assert.strictEqual(loaded?.featureName, 'test-feature');
			assert.ok(loaded?.prompt.user.includes('test prompt'));
			assert.strictEqual(loaded?.prompt.contextIncluded.readme, true);
			assert.strictEqual(loaded?.prompt.contextIncluded.architecture, true);
		});
	});

	suite('updateUserChoice', () => {
		test('should update user choice in metadata', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			await service.classifyFeature('test-feature', 'prompt');
			await service.updateUserChoice('test-feature', 'standard');

			const loaded = await service.loadClassificationMetadata('test-feature');

			assert.strictEqual(loaded?.userChoice, 'standard');
			assert.ok(loaded?.userChoiceTimestamp);
		});

		test('should create minimal metadata if metadata does not exist', async () => {
			await service.updateUserChoice('non-existent', 'standard');

			const loaded = await service.loadClassificationMetadata('non-existent');

			assert.ok(loaded);
			assert.strictEqual(loaded?.userChoice, 'standard');
			assert.ok(loaded?.userChoiceTimestamp);
			assert.strictEqual(loaded?.featureName, 'non-existent');
		});

		test('should add timestamp when updating user choice', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			await service.classifyFeature('test-feature', 'prompt');

			const before = new Date().toISOString();
			await service.updateUserChoice('test-feature', 'standard');
			const after = new Date().toISOString();

			const loaded = await service.loadClassificationMetadata('test-feature');

			assert.ok(loaded?.userChoiceTimestamp);
			assert.ok(loaded!.userChoiceTimestamp! >= before);
			assert.ok(loaded!.userChoiceTimestamp! <= after);
		});
	});

	suite('updateCommitHash', () => {
		test('should update commit hash in metadata', async () => {
			llmChatStub.resolves({
				content: 'lightweight',
				model: 'anthropic/claude-3.5-sonnet'
			});

			await service.classifyFeature('test-feature', 'prompt');
			await service.updateCommitHash('test-feature', 'abc123');

			const loaded = await service.loadClassificationMetadata('test-feature');

			assert.strictEqual(loaded?.commitHash, 'abc123');
		});

		test('should throw error if metadata does not exist', async () => {
			await assert.rejects(
				() => service.updateCommitHash('non-existent', 'abc123'),
				/No classification metadata found/
			);
		});

		test('should preserve other metadata when updating commit hash', async () => {
			llmChatStub.resolves({
				content: 'standard',
				model: 'anthropic/claude-3.5-sonnet'
			});

			await service.classifyFeature('test-feature', 'prompt');
			await service.updateUserChoice('test-feature', 'lightweight');
			await service.updateCommitHash('test-feature', 'def456');

			const loaded = await service.loadClassificationMetadata('test-feature');

			assert.strictEqual(loaded?.commitHash, 'def456');
			assert.strictEqual(loaded?.userChoice, 'lightweight');
			assert.strictEqual(loaded?.classification.result, 'standard');
		});
	});
});
