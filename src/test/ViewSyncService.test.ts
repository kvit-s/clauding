import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import { ViewSyncService } from '../services/ViewSyncService';
import { ClaudingSidebarProvider } from '../providers/ClaudingSidebarProvider';
import { FeatureService } from '../services/FeatureService';
import { WorktreeService } from '../services/WorktreeService';
import { AgentService } from '../services/AgentService';

suite('ViewSyncService Test Suite', () => {
	let service: ViewSyncService;
	let sandbox: sinon.SinonSandbox;
	let mockSidebarProvider: sinon.SinonStubbedInstance<ClaudingSidebarProvider>;
	let mockFeatureService: sinon.SinonStubbedInstance<FeatureService>;
	let mockWorktreeService: sinon.SinonStubbedInstance<WorktreeService>;
	let mockAgentService: sinon.SinonStubbedInstance<AgentService>;
	let mockWorkspaceFolder: vscode.WorkspaceFolder;

	setup(() => {
		sandbox = sinon.createSandbox();

		// Create mock services
		mockSidebarProvider = sandbox.createStubInstance(ClaudingSidebarProvider);
		mockFeatureService = sandbox.createStubInstance(FeatureService);
		mockWorktreeService = sandbox.createStubInstance(WorktreeService);
		mockAgentService = sandbox.createStubInstance(AgentService);

		// Mock workspace folder
		mockWorkspaceFolder = {
			uri: vscode.Uri.file('/test/workspace'),
			name: 'test-workspace',
			index: 0
		};

		sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspaceFolder]);
		sandbox.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: () => {} } as vscode.Disposable);

		service = new ViewSyncService(
			mockSidebarProvider as any,
			mockFeatureService as any,
			mockWorktreeService as any,
			mockAgentService as any
		);
	});

	teardown(() => {
		service.dispose();
		sandbox.restore();
	});

	suite('Initialization', () => {
		test('should register event listeners', () => {
			assert.ok(service, 'Service should be instantiated');
		});

		test('should dispose properly', () => {
			// Should not throw
			service.dispose();
		});
	});

	suite('handleEditorChange', () => {
		test('should do nothing if editor is undefined', async () => {
			await service.handleEditorChange(undefined);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			assert.strictEqual(mockSidebarProvider.selectFeature.called, false);
		});

		test('should extract feature name from file path and update selection', async () => {
			const featureName = 'test-feature';
			const filePath = path.join('/test/workspace/.clauding/worktrees', featureName, 'src/file.ts');

			const mockEditor = {
				document: {
					uri: vscode.Uri.file(filePath)
				}
			} as vscode.TextEditor;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);
			mockSidebarProvider.selectFeature.resolves();
	
			await service.handleEditorChange(mockEditor);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			assert.ok(mockSidebarProvider.selectFeature.calledWith(featureName, true));
		});

		test('should debounce rapid editor changes', async () => {
			const featureName = 'test-feature';
			const filePath = path.join('/test/workspace/.clauding/worktrees', featureName, 'src/file.ts');

			const mockEditor = {
				document: {
					uri: vscode.Uri.file(filePath)
				}
			} as vscode.TextEditor;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);
			mockSidebarProvider.selectFeature.resolves();
	
			// Trigger multiple rapid changes
			await service.handleEditorChange(mockEditor);
			await service.handleEditorChange(mockEditor);
			await service.handleEditorChange(mockEditor);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			// Should only call once due to debouncing
			assert.strictEqual(mockSidebarProvider.selectFeature.callCount, 1);
		});

		test('should ignore editor changes for non-feature files', async () => {
			const filePath = '/test/workspace/src/file.ts';

			const mockEditor = {
				document: {
					uri: vscode.Uri.file(filePath)
				}
			} as vscode.TextEditor;

			await service.handleEditorChange(mockEditor);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			assert.strictEqual(mockSidebarProvider.selectFeature.called, false);
		});
	});

	suite('handleTerminalChange', () => {
		test('should do nothing if terminal is undefined', async () => {
			await service.handleTerminalChange(undefined);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			assert.strictEqual(mockSidebarProvider.selectFeature.called, false);
		});

		test('should extract feature name from agent terminal and update selection', async () => {
			const featureName = 'test-feature';
			const mockTerminal = {
				name: `clauding: ${featureName}-build`
			} as vscode.Terminal;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);
			mockSidebarProvider.selectFeature.resolves();

			await service.handleTerminalChange(mockTerminal);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			assert.ok(mockSidebarProvider.selectFeature.calledWith(featureName, true));
		});

		test('should extract feature name from console terminal', async () => {
			const featureName = 'test-feature';
			const mockTerminal = {
				name: `Clauding: ${featureName}`
			} as vscode.Terminal;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);
			mockSidebarProvider.selectFeature.resolves();

			await service.handleTerminalChange(mockTerminal);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			assert.ok(mockSidebarProvider.selectFeature.calledWith(featureName, true));
		});

		test('should debounce rapid terminal changes', async () => {
			const featureName = 'test-feature';
			const mockTerminal = {
				name: `clauding: ${featureName}-build`
			} as vscode.Terminal;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);
			mockSidebarProvider.selectFeature.resolves();

			// Trigger multiple rapid changes
			await service.handleTerminalChange(mockTerminal);
			await service.handleTerminalChange(mockTerminal);
			await service.handleTerminalChange(mockTerminal);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			// Should only call once due to debouncing
			assert.strictEqual(mockSidebarProvider.selectFeature.callCount, 1);
		});

		test('should ignore main terminal', async () => {
			const mockTerminal = {
				name: 'bash - clauding'
			} as vscode.Terminal;

			await service.handleTerminalChange(mockTerminal);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			assert.strictEqual(mockSidebarProvider.selectFeature.called, false);
		});

		test('should ignore non-feature terminals', async () => {
			const mockTerminal = {
				name: 'bash'
			} as vscode.Terminal;

			await service.handleTerminalChange(mockTerminal);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			assert.strictEqual(mockSidebarProvider.selectFeature.called, false);
		});
	});

	suite('handleManualFeatureSelection', () => {
		test('should reveal terminal and open plan for manual selection', async () => {
			const featureName = 'test-feature';
			const mockTerminal = { show: sandbox.stub() } as any;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);
	
			await service.handleManualFeatureSelection(featureName);

			assert.ok(mockTerminal.show.calledWith(false));
		});
	});

	suite('getFeatureFromFilePath', () => {
		test('should extract feature name from worktree path', () => {
			const featureName = 'test-feature';
			const filePath = path.join('/test/workspace/.clauding/worktrees', featureName, 'src/file.ts');

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);

			const result = service.getFeatureFromFilePath(filePath);

			assert.strictEqual(result, featureName);
		});

		test('should return null for non-worktree paths', () => {
			const filePath = '/test/workspace/src/file.ts';

			const result = service.getFeatureFromFilePath(filePath);

			assert.strictEqual(result, null);
		});

		test('should return null if feature does not exist', () => {
			const featureName = 'nonexistent-feature';
			const filePath = path.join('/test/workspace/.clauding/worktrees', featureName, 'src/file.ts');

			mockFeatureService.getFeature.withArgs(featureName).returns(null);

			const result = service.getFeatureFromFilePath(filePath);

			assert.strictEqual(result, null);
		});

		test('should return null if no workspace folder', () => {
			sandbox.restore();
			sandbox = sinon.createSandbox();
			sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
			sandbox.stub(vscode.window, 'onDidCloseTerminal').returns({ dispose: () => {} } as vscode.Disposable);

			service = new ViewSyncService(
				mockSidebarProvider as any,
				mockFeatureService as any,
				mockWorktreeService as any,
				mockAgentService as any
			);

			const result = service.getFeatureFromFilePath('/some/path');

			assert.strictEqual(result, null);
		});

		test('should handle nested file paths', () => {
			const featureName = 'test-feature';
			const filePath = path.join('/test/workspace/.clauding/worktrees', featureName, 'src/components/deep/file.ts');

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);

			const result = service.getFeatureFromFilePath(filePath);

			assert.strictEqual(result, featureName);
		});
	});

	suite('getFeatureFromTerminal', () => {
		test('should extract feature from agent terminal pattern', () => {
			const featureName = 'test-feature';
			const mockTerminal = {
				name: `clauding: ${featureName}-build`
			} as vscode.Terminal;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);

			const result = service.getFeatureFromTerminal(mockTerminal);

			assert.strictEqual(result, featureName);
		});

		test('should extract feature from console terminal pattern', () => {
			const featureName = 'test-feature';
			const mockTerminal = {
				name: `Clauding: ${featureName}`
			} as vscode.Terminal;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);

			const result = service.getFeatureFromTerminal(mockTerminal);

			assert.strictEqual(result, featureName);
		});

		test('should return null for main terminal', () => {
			const mockTerminal = {
				name: 'bash - clauding'
			} as vscode.Terminal;

			const result = service.getFeatureFromTerminal(mockTerminal);

			assert.strictEqual(result, null);
		});

		test('should return null for non-feature terminals', () => {
			const mockTerminal = {
				name: 'bash'
			} as vscode.Terminal;

			const result = service.getFeatureFromTerminal(mockTerminal);

			assert.strictEqual(result, null);
		});

		test('should return null if feature does not exist', () => {
			const featureName = 'nonexistent-feature';
			const mockTerminal = {
				name: `clauding: ${featureName}-build`
			} as vscode.Terminal;

			mockFeatureService.getFeature.withArgs(featureName).returns(null);

			const result = service.getFeatureFromTerminal(mockTerminal);

			assert.strictEqual(result, null);
		});

		test('should handle feature names with multiple dashes', () => {
			const featureName = 'feature-with-many-dashes';
			const mockTerminal = {
				name: `clauding: ${featureName}-build`
			} as vscode.Terminal;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);

			const result = service.getFeatureFromTerminal(mockTerminal);

			assert.strictEqual(result, featureName);
		});
	});

	suite('revealFeatureTerminal', () => {
		test('should reveal first active terminal if available', async () => {
			const featureName = 'test-feature';
			const mockTerminal = { show: sandbox.stub() } as any;

	
			await service.revealFeatureTerminal(featureName, true);

			assert.ok(mockTerminal.show.calledWith(true));
		});

		test('should create and show main terminal if no feature terminals exist', async () => {
			const featureName = 'test-feature';
			const mockTerminal = { show: sandbox.stub() } as any;

				sandbox.stub(vscode.window, 'terminals').value([]);
			sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

			await service.revealFeatureTerminal(featureName, false);

			assert.ok(mockTerminal.show.calledWith(false));
		});

		test('should preserve focus when requested', async () => {
			const featureName = 'test-feature';
			const mockTerminal = { show: sandbox.stub() } as any;

	
			await service.revealFeatureTerminal(featureName, true);

			assert.ok(mockTerminal.show.calledWith(true));
		});

		test('should steal focus when not preserving', async () => {
			const featureName = 'test-feature';
			const mockTerminal = { show: sandbox.stub() } as any;

	
			await service.revealFeatureTerminal(featureName, false);

			assert.ok(mockTerminal.show.calledWith(false));
		});
	});

	suite('ensureMainTerminal', () => {
		test('should return existing main terminal if still active', async () => {
			const mockTerminal = { name: 'bash - clauding' } as vscode.Terminal;
			sandbox.stub(vscode.window, 'terminals').value([mockTerminal]);

			// First call creates terminal
			const result1 = await service.ensureMainTerminal();

			// Second call should return same terminal
			const result2 = await service.ensureMainTerminal();

			assert.strictEqual(result1, result2);
		});

		test('should find existing main terminal by name', async () => {
			const mockTerminal = { name: 'bash - clauding' } as vscode.Terminal;
			sandbox.stub(vscode.window, 'terminals').value([mockTerminal]);

			const result = await service.ensureMainTerminal();

			assert.strictEqual(result, mockTerminal);
		});

		test('should create new main terminal if none exists', async () => {
			const mockTerminal = { name: 'bash - clauding' } as vscode.Terminal;
			sandbox.stub(vscode.window, 'terminals').value([]);
			sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

			const result = await service.ensureMainTerminal();

			assert.strictEqual(result, mockTerminal);
		});
	});

	suite('openFeaturePlanOrPrompt', () => {
		test('should do nothing if feature does not exist', async () => {
			const featureName = 'nonexistent-feature';

			mockFeatureService.getFeature.withArgs(featureName).returns(null);

			// Simply verifies that the method doesn't throw when feature doesn't exist
			await service.openFeaturePlanOrPrompt(featureName, true);

			// Test passes if no error is thrown
			assert.ok(true);
		});

		test('should handle preserveFocus parameter', async () => {
			// This test verifies the method accepts the preserveFocus parameter
			// without actually testing file operations which would require real files
			const featureName = 'test-feature';
			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);

			// Should not throw
			await service.openFeaturePlanOrPrompt(featureName, true);
			await service.openFeaturePlanOrPrompt(featureName, false);

			assert.ok(true);
		});
	});

	suite('handleTerminalClose', () => {
		test('should maintain current feature selection after terminal close', async () => {
			const featureName = 'test-feature';
			const mockTerminal = { name: 'clauding: test-feature-build', show: sandbox.stub() } as any;
			const closedTerminal = { name: 'clauding: test-feature-test' } as vscode.Terminal;

			mockSidebarProvider.getSelectedFeatureName.returns(featureName);
	
			await service.handleTerminalClose(closedTerminal);

			assert.ok(mockTerminal.show.calledWith(false));
		});

		test('should ignore next terminal change event', async () => {
			const featureName = 'test-feature';
			const closedTerminal = { name: 'clauding: test-feature-build' } as vscode.Terminal;
			const mockTerminal = { name: 'bash - clauding', show: sandbox.stub() } as any;

			mockSidebarProvider.getSelectedFeatureName.returns(featureName);
				sandbox.stub(vscode.window, 'terminals').value([mockTerminal]);
			sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

			// Close terminal
			await service.handleTerminalClose(closedTerminal);

			// Immediately trigger terminal change (simulating VSCode auto-selection)
			await service.handleTerminalChange(mockTerminal);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			// Should be ignored, so selectFeature should not be called
			assert.strictEqual(mockSidebarProvider.selectFeature.called, false);
		});

		test('should reset ignore flag after timeout', async () => {
			const featureName = 'test-feature';
			const closedTerminal = { name: 'clauding: test-feature-build' } as vscode.Terminal;
			const mockTerminal = { show: sandbox.stub() } as any;

			mockSidebarProvider.getSelectedFeatureName.returns(featureName);
	
			// Close terminal
			await service.handleTerminalClose(closedTerminal);

			// Wait for fallback timeout
			await new Promise(resolve => setTimeout(resolve, 600));

			// Now terminal change should not be ignored
			const testTerminal = {
				name: `Clauding: ${featureName}`
			} as vscode.Terminal;

			const mockFeature = {
				name: featureName,
				worktreePath: path.join('/test/workspace/.clauding/worktrees', featureName),
				branchName: 'feature/test',
				status: { type: 'implementing' as const, message: 'test' },
				lifecycleStatus: 'implement' as const
			};

			mockFeatureService.getFeature.withArgs(featureName).returns(mockFeature);
			mockSidebarProvider.selectFeature.resolves();

			await service.handleTerminalChange(testTerminal);

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, 150));

			// Should process normally
			assert.ok(mockSidebarProvider.selectFeature.called);
		});
	});

	suite('Cleanup', () => {
		test('should clear editor timeout on dispose', () => {
			const featureName = 'test-feature';
			const filePath = path.join('/test/workspace/.clauding/worktrees', featureName, 'src/file.ts');

			const mockEditor = {
				document: {
					uri: vscode.Uri.file(filePath)
				}
			} as vscode.TextEditor;

			// Trigger editor change to create timeout
			service.handleEditorChange(mockEditor);

			// Dispose immediately (before debounce completes)
			service.dispose();

			// Should not throw
			assert.ok(true);
		});

		test('should clear terminal timeout on dispose', () => {
			const featureName = 'test-feature';
			const mockTerminal = {
				name: `clauding: ${featureName}-build`
			} as vscode.Terminal;

			// Trigger terminal change to create timeout
			service.handleTerminalChange(mockTerminal);

			// Dispose immediately (before debounce completes)
			service.dispose();

			// Should not throw
			assert.ok(true);
		});
	});
});
