import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as sinon from 'sinon';
import { MessageService } from '../services/MessageService';

suite('MessageService Test Suite', () => {
	let testDir: string;
	let service: MessageService;
	let sandbox: sinon.SinonSandbox;
	let testCounter: number = 0;
	const createdFeaturePaths: string[] = [];

	setup(() => {
		sandbox = sinon.createSandbox();

		// Create a temporary directory for tests
		testDir = path.join(__dirname, '../../test-temp', `message-${Date.now()}-${testCounter++}`);
		fs.mkdirSync(testDir, { recursive: true });

		service = new MessageService();
	});

	teardown(() => {
		sandbox.restore();

		// Clean up test directory
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}

		// Clean up all feature paths created during tests
		for (const featurePath of createdFeaturePaths) {
			if (fs.existsSync(featurePath)) {
				fs.rmSync(featurePath, { recursive: true, force: true });
			}
		}
		createdFeaturePaths.length = 0;

		// Clean up .clauding directory (if it exists from test features)
		const claudingDir = path.join('.clauding');
		if (fs.existsSync(claudingDir)) {
			fs.rmSync(claudingDir, { recursive: true, force: true });
		}
	});

	// Helper to get a unique feature path and name for each test
	// MessageService now expects both worktreePath and featureName
	// Returns [worktreePath, featureName]
	function getFeaturePathAndName(): [string, string] {
		const featureName = `test-feature-${Date.now()}-${Math.random()}`;
		const worktreePath = path.join(testDir, '.clauding', 'worktrees', featureName);
		createdFeaturePaths.push(worktreePath);
		// Create the worktree directory structure
		fs.mkdirSync(worktreePath, { recursive: true });

		// Also create features folder for new architecture
		const projectRoot = path.join(testDir);
		const featuresFolder = path.join(projectRoot, '.clauding', 'features', featureName);
		fs.mkdirSync(featuresFolder, { recursive: true });

		return [worktreePath, featureName];
	}

	suite('addMessage', () => {
		test('should add a message to empty list', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Test message', 'info');

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 1);
			assert.strictEqual(messages[0].text, 'Test message');
			assert.strictEqual(messages[0].type, 'info');
		});

		test('should add multiple messages', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Message 1', 'info');
			service.addMessage(worktreePath, featureName, 'Message 2', 'warning');

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 2);
			assert.strictEqual(messages[0].text, 'Message 1');
			assert.strictEqual(messages[1].text, 'Message 2');
		});

		test('should add message with actions', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Test message', 'info', {
				actions: [
					{ label: 'Action 1', command: 'test.command1' },
					{ label: 'Action 2', command: 'test.command2' }
				]
			});

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages[0].actions?.length, 2);
			assert.strictEqual(messages[0].actions?.[0].label, 'Action 1');
		});

		test('should add message with dismissible option', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Test message', 'info', {
				dismissible: false
			});

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages[0].dismissible, false);
		});

		test('should set dismissible to true by default', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Test message', 'info');

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages[0].dismissible, true);
		});

		test('should generate unique IDs for messages', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Message 1', 'info');
			service.addMessage(worktreePath, featureName, 'Message 2', 'info');

			const messages = service.getMessages(worktreePath, featureName);
			assert.notStrictEqual(messages[0].id, messages[1].id);
		});

		test('should add timestamp to messages', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			const before = new Date().toISOString();
			service.addMessage(worktreePath, featureName, 'Test message', 'info');
			const after = new Date().toISOString();

			const messages = service.getMessages(worktreePath, featureName);
			assert.ok(messages[0].timestamp >= before);
			assert.ok(messages[0].timestamp <= after);
		});

		test('should support all message types', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Info', 'info');
			service.addMessage(worktreePath, featureName, 'Warning', 'warning');
			service.addMessage(worktreePath, featureName, 'Error', 'error');
			service.addMessage(worktreePath, featureName, 'Success', 'success');

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 4);
			assert.strictEqual(messages[0].type, 'info');
			assert.strictEqual(messages[1].type, 'warning');
			assert.strictEqual(messages[2].type, 'error');
			assert.strictEqual(messages[3].type, 'success');
		});
	});

	suite('dismissMessage', () => {
		test('should remove message by ID', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Message 1', 'info');
			service.addMessage(worktreePath, featureName, 'Message 2', 'info');

			const messages = service.getMessages(worktreePath, featureName);
			const idToRemove = messages[0].id;

			service.dismissMessage(worktreePath, featureName, idToRemove);

			const remaining = service.getMessages(worktreePath, featureName);
			assert.strictEqual(remaining.length, 1);
			assert.strictEqual(remaining[0].text, 'Message 2');
		});

		test('should handle dismissing non-existent message', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Message 1', 'info');

			service.dismissMessage(worktreePath, featureName, 'non-existent-id');

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 1);
		});

		test('should handle dismissing from empty list', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			// Should not throw
			service.dismissMessage(worktreePath, featureName, 'any-id');

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 0);
		});

		test('should dismiss multiple messages', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Message 1', 'info');
			service.addMessage(worktreePath, featureName, 'Message 2', 'info');
			service.addMessage(worktreePath, featureName, 'Message 3', 'info');

			const messages = service.getMessages(worktreePath, featureName);
			service.dismissMessage(worktreePath, featureName, messages[0].id);
			service.dismissMessage(worktreePath, featureName, messages[2].id);

			const remaining = service.getMessages(worktreePath, featureName);
			assert.strictEqual(remaining.length, 1);
			assert.strictEqual(remaining[0].text, 'Message 2');
		});
	});

	suite('clearMessages', () => {
		test('should remove all messages', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Message 1', 'info');
			service.addMessage(worktreePath, featureName, 'Message 2', 'info');
			service.addMessage(worktreePath, featureName, 'Message 3', 'info');

			service.clearMessages(worktreePath, featureName);

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 0);
		});

		test('should handle clearing empty list', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			// Should not throw
			service.clearMessages(worktreePath, featureName);

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 0);
		});

		test('should allow adding messages after clear', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Message 1', 'info');
			service.clearMessages(worktreePath, featureName);
			service.addMessage(worktreePath, featureName, 'Message 2', 'info');

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 1);
			assert.strictEqual(messages[0].text, 'Message 2');
		});
	});

	suite('getMessages', () => {
		test('should return empty array for non-existent file', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 0);
		});

		test('should return all messages', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Message 1', 'info');
			service.addMessage(worktreePath, featureName, 'Message 2', 'warning');

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 2);
		});

		test('should handle corrupted JSON gracefully', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			// Create meta directory and write corrupted JSON
			const metaDir = path.join('.clauding');
			fs.mkdirSync(metaDir, { recursive: true });
			const messagesPath = path.join(metaDir, 'messages.json');
			fs.writeFileSync(messagesPath, 'invalid json {]');

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 0);
		});

		test('should handle missing meta directory', () => {
			const nonExistentPath = path.join(testDir, 'non-existent');
			const messages = service.getMessages(nonExistentPath, 'non-existent-feature');
			assert.strictEqual(messages.length, 0);
		});
	});

	suite('persistence', () => {
		test('should persist messages to disk', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Test message', 'info');

			// Create new service instance to test persistence
			const newService = new MessageService();
			const messages = newService.getMessages(worktreePath, featureName);

			assert.strictEqual(messages.length, 1);
			assert.strictEqual(messages[0].text, 'Test message');
		});

		test('should create features folder if it does not exist', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Test message', 'info');

			// Messages are now stored in features folder
			const featuresDir = path.join(testDir, '.clauding', 'features', featureName);
			assert.ok(fs.existsSync(featuresDir));
		});

		test('should format JSON with indentation', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Test message', 'info');

			// Messages are now stored in features folder
			const messagesPath = path.join(testDir, '.clauding', 'features', featureName, 'messages.json');
			const content = fs.readFileSync(messagesPath, 'utf-8');

			// Check for indentation (pretty-printed)
			assert.ok(content.includes('\n'));
			assert.ok(content.includes('  '));
		});
	});

	suite('concurrent modifications', () => {
		test('should handle rapid additions', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			for (let i = 0; i < 10; i++) {
				service.addMessage(worktreePath, featureName, `Message ${i}`, 'info');
			}

			const messages = service.getMessages(worktreePath, featureName);
			assert.strictEqual(messages.length, 10);
		});

		test('should handle mixed operations', () => {
			const [worktreePath, featureName] = getFeaturePathAndName();
			service.addMessage(worktreePath, featureName, 'Message 1', 'info');
			service.addMessage(worktreePath, featureName, 'Message 2', 'info');
			const messages = service.getMessages(worktreePath, featureName);
			service.dismissMessage(worktreePath, featureName, messages[0].id);
			service.addMessage(worktreePath, featureName, 'Message 3', 'info');

			const final = service.getMessages(worktreePath, featureName);
			assert.strictEqual(final.length, 2);
			assert.strictEqual(final[0].text, 'Message 2');
			assert.strictEqual(final[1].text, 'Message 3');
		});
	});
});
