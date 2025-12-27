import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { RunHandler } from '../../providers/sidebar/handlers/RunHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';
import { DebugConfigurationManager } from '../../providers/sidebar/DebugConfigurationManager';

suite('RunHandler Test Suite', () => {
  let handler: RunHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let debugConfigManager: DebugConfigurationManager;
  let terminalProvider: any;
  let onWebviewUpdate: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    featureService = {} as any;
    messageService = {} as any;
    // Create mock object with the methods that will be stubbed
    debugConfigManager = {
      readLaunchJson: () => null,
      createWorktreeConfig: () => ({} as any),
      startDebugSession: async () => true
    } as any;
    terminalProvider = {} as any;
    onWebviewUpdate = sandbox.stub();

    handler = new RunHandler(
      featureService,
      messageService,
      debugConfigManager,
      terminalProvider,
      onWebviewUpdate
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should start debugging successfully', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;
      const launchConfig = { configurations: [{ type: 'node', name: 'Launch', request: 'launch' }] } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(launchConfig);
      sandbox.stub(debugConfigManager, 'createWorktreeConfig').returns({} as any);
      sandbox.stub(debugConfigManager, 'startDebugSession').resolves(true);
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, msg, type] = addMessageStub.firstCall.args;
      assert.ok(msg.includes('Started debugging'));
      assert.strictEqual(type, 'success');
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should handle feature not found', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'nonexistent' };
      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(null);

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(onWebviewUpdate.notCalled);
    });

    test('should handle no workspace folder', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, msg, type] = addMessageStub.firstCall.args;
      assert.ok(msg.includes('No workspace folder found'));
      assert.strictEqual(type, 'error');
    });

    test('should handle missing launch.json', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(null);
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, msg, type] = addMessageStub.firstCall.args;
      assert.ok(msg.includes('No launch.json found'));
      assert.strictEqual(type, 'error');
    });

    test('should handle empty configurations', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;
      const launchConfig = { configurations: [] } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(launchConfig);
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, msg, type] = addMessageStub.firstCall.args;
      assert.ok(msg.includes('No debug configurations found'));
      assert.strictEqual(type, 'error');
    });

    test('should use first configuration as base', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;
      const baseConfig = { type: 'node', name: 'First', request: 'launch' } as any;
      const launchConfig = { configurations: [baseConfig, { type: 'node', name: 'Second', request: 'launch' }] } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(launchConfig);
      const createConfigStub = sandbox.stub(debugConfigManager, 'createWorktreeConfig').returns({} as any);
      sandbox.stub(debugConfigManager, 'startDebugSession').resolves(true);
      sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(createConfigStub.calledOnce);
      assert.strictEqual(createConfigStub.firstCall.args[0], baseConfig);
    });

    test('should handle failed debug session', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;
      const launchConfig = { configurations: [{ type: 'node', name: 'Launch', request: 'launch' }] } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(launchConfig);
      sandbox.stub(debugConfigManager, 'createWorktreeConfig').returns({} as any);
      sandbox.stub(debugConfigManager, 'startDebugSession').resolves(false);
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.strictEqual(addMessageStub.callCount, 1);
      const [, msg, type] = addMessageStub.firstCall.args;
      assert.ok(msg.includes('Failed to start debugging'));
      assert.strictEqual(type, 'error');
    });

    test('should handle errors during execution', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const error = new Error('Debug error');

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([{ uri: vscode.Uri.file('/root') }]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').throws(error);
      const handleErrorStub = sandbox.stub(handler as any, 'handleError');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(handleErrorStub.calledOnceWith(error, 'Run', 'test-feature'));
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should create worktree config with correct parameters', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;
      const baseConfig = { type: 'node', name: 'Launch', request: 'launch' };
      const launchConfig = { configurations: [baseConfig] } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(launchConfig);
      const createConfigStub = sandbox.stub(debugConfigManager, 'createWorktreeConfig').returns({} as any);
      sandbox.stub(debugConfigManager, 'startDebugSession').resolves(true);
      sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(createConfigStub.calledOnce);
      assert.strictEqual(createConfigStub.firstCall.args[1], 'test-feature');
      assert.strictEqual(createConfigStub.firstCall.args[2], '/path/to/worktree');
    });

    test('should execute pre-run commands sequentially before starting debug', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;
      const launchConfig = { configurations: [{ type: 'node', name: 'Launch', request: 'launch' }] } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(launchConfig);
      sandbox.stub(debugConfigManager, 'createWorktreeConfig').returns({} as any);
      sandbox.stub(debugConfigManager, 'startDebugSession').resolves(true);
      sandbox.stub(handler as any, 'addMessageToPanel');

      // Mock configuration with pre-run commands
      const mockConfig = {
        get: (key: string, defaultValue?: any) => {
          if (key === 'preRunCommands') {
            return ['npm install', 'npm run build'];
          }
          if (key === 'autoCloseRunTerminal') {
            return true;
          }
          return defaultValue;
        }
      } as any;
      sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig);

      // Mock terminal creation
      const mockTerminal = {
        sendText: sandbox.stub(),
        show: sandbox.stub(),
        dispose: sandbox.stub()
      } as any;
      sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

      // Mock executeCommand to track execution order
      const executeCommandStub = sandbox.stub(handler as any, 'executeCommand').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(executeCommandStub.calledTwice);
      assert.strictEqual(executeCommandStub.firstCall.args[0], 'npm install');
      assert.strictEqual(executeCommandStub.secondCall.args[0], 'npm run build');
      assert.strictEqual(executeCommandStub.firstCall.args[1], '/path/to/worktree');
    });

    test('should abort debug launch if pre-run command fails', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;
      const launchConfig = { configurations: [{ type: 'node', name: 'Launch', request: 'launch' }] } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(launchConfig);
      sandbox.stub(debugConfigManager, 'createWorktreeConfig').returns({} as any);
      const startDebugStub = sandbox.stub(debugConfigManager, 'startDebugSession').resolves(true);
      sandbox.stub(handler as any, 'addMessageToPanel');

      // Mock configuration with pre-run commands
      const mockConfig = {
        get: (key: string, defaultValue?: any) => {
          if (key === 'preRunCommands') {
            return ['npm install', 'npm run build'];
          }
          return defaultValue;
        }
      } as any;
      sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig);

      // Mock terminal creation
      const mockTerminal = {
        sendText: sandbox.stub(),
        show: sandbox.stub(),
        dispose: sandbox.stub()
      } as any;
      sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

      // Mock executeCommand to fail on first command
      sandbox.stub(handler as any, 'executeCommand').rejects(new Error('Command failed with exit code 1'));

      // Act
      await handler.handle(message);

      // Assert - debug session should not have been started
      assert.ok(startDebugStub.notCalled, 'Debug session should not start when pre-run command fails');
      assert.ok(mockTerminal.dispose.called, 'Terminals should be cleaned up on failure');
    });

    test('should wait for all pre-run commands to complete before starting debug', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;
      const launchConfig = { configurations: [{ type: 'node', name: 'Launch', request: 'launch' }] } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(launchConfig);
      sandbox.stub(debugConfigManager, 'createWorktreeConfig').returns({} as any);
      const startDebugStub = sandbox.stub(debugConfigManager, 'startDebugSession').resolves(true);
      sandbox.stub(handler as any, 'addMessageToPanel');

      // Mock configuration with pre-run commands
      const mockConfig = {
        get: (key: string, defaultValue?: any) => {
          if (key === 'preRunCommands') {
            return ['command1', 'command2'];
          }
          if (key === 'autoCloseRunTerminal') {
            return true;
          }
          return defaultValue;
        }
      } as any;
      sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig);

      // Mock terminal creation
      const mockTerminal = {
        sendText: sandbox.stub(),
        show: sandbox.stub(),
        dispose: sandbox.stub()
      } as any;
      sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

      // Track execution order
      const executionOrder: string[] = [];

      // Mock executeCommand to track when commands complete
      sandbox.stub(handler as any, 'executeCommand').callsFake(async (...args: any[]) => {
        const command = args[0] as string;
        executionOrder.push(`execute:${command}`);
        // Simulate async delay
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push(`complete:${command}`);
      });

      // Mock startDebugSession to track when it's called
      startDebugStub.callsFake(async () => {
        executionOrder.push('debug:start');
        return true;
      });

      // Act
      await handler.handle(message);

      // Assert - debug should start only after all commands complete
      assert.deepStrictEqual(executionOrder, [
        'execute:command1',
        'complete:command1',
        'execute:command2',
        'complete:command2',
        'debug:start'
      ]);
    });

    test('should show progress messages for each pre-run command', async () => {
      // Arrange
      const message = { command: 'run' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const rootWorkspace = { uri: vscode.Uri.file('/root') } as vscode.WorkspaceFolder;
      const launchConfig = { configurations: [{ type: 'node', name: 'Launch', request: 'launch' }] } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.workspace, 'workspaceFolders').value([rootWorkspace]);
      sandbox.stub(debugConfigManager, 'readLaunchJson').returns(launchConfig);
      sandbox.stub(debugConfigManager, 'createWorktreeConfig').returns({} as any);
      sandbox.stub(debugConfigManager, 'startDebugSession').resolves(true);
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Mock configuration with pre-run commands
      const mockConfig = {
        get: (key: string, defaultValue?: any) => {
          if (key === 'preRunCommands') {
            return ['npm install', 'npm test'];
          }
          if (key === 'autoCloseRunTerminal') {
            return true;
          }
          return defaultValue;
        }
      } as any;
      sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig);

      // Mock terminal creation
      const mockTerminal = {
        sendText: sandbox.stub(),
        show: sandbox.stub(),
        dispose: sandbox.stub()
      } as any;
      sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

      // Mock executeCommand
      sandbox.stub(handler as any, 'executeCommand').resolves();

      // Act
      await handler.handle(message);

      // Assert - check progress messages
      const messages = addMessageStub.getCalls().map(call => call.args[1]);
      assert.ok(messages.some(msg => msg.includes('Executing 2 pre-run command(s)')));
      assert.ok(messages.some(msg => msg.includes('Running pre-run command (1/2): npm install')));
      assert.ok(messages.some(msg => msg.includes('Completed pre-run command (1/2): npm install')));
      assert.ok(messages.some(msg => msg.includes('Running pre-run command (2/2): npm test')));
      assert.ok(messages.some(msg => msg.includes('Completed pre-run command (2/2): npm test')));
      assert.ok(messages.some(msg => msg.includes('All pre-run commands completed successfully')));
    });
  });
});
