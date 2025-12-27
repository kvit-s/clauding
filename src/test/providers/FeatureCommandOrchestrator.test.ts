import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FeatureCommandOrchestrator } from '../../providers/sidebar/FeatureCommandOrchestrator';
import { FeatureService } from '../../services/FeatureService';
import { FileCheckService } from '../../services/FileCheckService';
import { MessageService } from '../../services/MessageService';
import { GitService } from '../../services/GitService';

suite('FeatureCommandOrchestrator Test Suite', () => {
  let orchestrator: FeatureCommandOrchestrator;
  let featureService: FeatureService;
  let fileCheckService: FileCheckService;
  let messageService: MessageService;
  let gitService: GitService;
  let onWebviewUpdate: sinon.SinonStub;
  let onFileTreeRefresh: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock objects with the methods that will be stubbed
    featureService = {
      getFeature: () => null,
      updateFeatureStatus: () => {},
      executeAgentCommand: async () => {},
      clearPendingCommand: () => {},
      savePendingCommand: () => {}
    } as any;
    fileCheckService = {
      checkRequiredFiles: async () => ({ allExist: true, missingFiles: [] }),
      createMissingFiles: () => {}
    } as any;
    messageService = {
      addMessage: () => {}
    } as any;
    gitService = {} as any;
    onWebviewUpdate = sandbox.stub();
    onFileTreeRefresh = sandbox.stub();

    orchestrator = new FeatureCommandOrchestrator(
      featureService,
      fileCheckService,
      messageService,
      gitService,
      '/worktrees'
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('executeAgentCommand', () => {
    test('should throw error when feature not found', async () => {
      // Arrange
      sandbox.stub(featureService, 'getFeature').returns(null);

      // Act & Assert
      await assert.rejects(
        () => orchestrator.executeAgentCommand('nonexistent', 'Create Plan', onWebviewUpdate, onFileTreeRefresh),
        /Feature not found/
      );
    });

    test('should execute command when all files exist', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({ allExist: true, missingFiles: [], existingFiles: [], patternErrors: [] });
      const executeStub = sandbox.stub(featureService, 'executeAgentCommand').resolves();
      sandbox.stub(messageService, 'addMessage');

      // Act
      await orchestrator.executeAgentCommand('test-feature', 'Create Plan', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(executeStub.calledOnce);
      assert.ok(onWebviewUpdate.called);
      assert.ok(onFileTreeRefresh.calledOnceWith('test-feature'));
    });

    test('should add success message after command completion', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({ allExist: true, missingFiles: [], existingFiles: [], patternErrors: [] });
      sandbox.stub(featureService, 'executeAgentCommand').resolves();
      const addMessageStub = sandbox.stub(messageService, 'addMessage');

      // Act
      await orchestrator.executeAgentCommand('test-feature', 'Create Plan', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(addMessageStub.calledWith(
        '/path/to/worktree',
        sinon.match(/Create Plan completed/),
        'success'
      ));
    });

    test('should refresh file tree after command', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({ allExist: true, missingFiles: [], existingFiles: [], patternErrors: [] });
      sandbox.stub(featureService, 'executeAgentCommand').resolves();
      sandbox.stub(messageService, 'addMessage');

      // Act
      await orchestrator.executeAgentCommand('test-feature', 'Create Plan', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(onFileTreeRefresh.calledOnceWith('test-feature'));
    });

    test('should update feature status to implementation when Implement Plan is executed', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({ allExist: true, missingFiles: [], existingFiles: [], patternErrors: [] });
      sandbox.stub(featureService, 'executeAgentCommand').resolves();
      sandbox.stub(messageService, 'addMessage');
      const updateStatusStub = sandbox.stub(featureService, 'updateFeatureStatus');

      // Act
      await orchestrator.executeAgentCommand('test-feature', 'Implement Plan', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(updateStatusStub.calledWith('test-feature', 'implement'));
    });

    test('should update feature status to wrap-up after Implement Plan completes', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({ allExist: true, missingFiles: [], existingFiles: [], patternErrors: [] });
      sandbox.stub(featureService, 'executeAgentCommand').resolves();
      sandbox.stub(messageService, 'addMessage');
      const updateStatusStub = sandbox.stub(featureService, 'updateFeatureStatus');

      // Act
      await orchestrator.executeAgentCommand('test-feature', 'Implement Plan', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(updateStatusStub.calledWith('test-feature', 'wrap-up'));
    });

    test('should handle missing files', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({
        allExist: false, existingFiles: [],
        missingFiles: [{ path: 'prompt.md', type: 'exact' }],
        patternErrors: []
      });
      const createStub = sandbox.stub(fileCheckService, 'createMissingFiles');
      sandbox.stub(featureService, 'savePendingCommand');
      sandbox.stub(messageService, 'addMessage');

      // Mock vscode.workspace and vscode.window
      sandbox.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
      sandbox.stub(vscode.window, 'showTextDocument').resolves();

      // Act
      await orchestrator.executeAgentCommand('test-feature', 'Create Plan', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(createStub.calledOnce);
    });
  });

  suite('applyPendingCommand', () => {
    test('should execute pending command', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        pendingCommand: { command: 'Create Plan', missingFiles: ['prompt.md'] } as any
      };
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({ allExist: true, missingFiles: [], existingFiles: [], patternErrors: [] });
      const executeStub = sandbox.stub(featureService, 'executeAgentCommand').resolves();
      sandbox.stub(featureService, 'clearPendingCommand');
      sandbox.stub(messageService, 'addMessage');
      sandbox.stub(vscode.workspace, 'saveAll').resolves(true);

      // Act
      await orchestrator.applyPendingCommand('test-feature', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(executeStub.calledOnce);
    });

    test('should add error message when no pending command', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      const addMessageStub = sandbox.stub(messageService, 'addMessage');

      // Act
      await orchestrator.applyPendingCommand('test-feature', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(addMessageStub.calledOnceWith(
        '/path/to/worktree',
        'No pending command found',
        'error',
        sinon.match({ dismissible: true })
      ));
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should clear pending command after execution', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        pendingCommand: { command: 'Create Plan', missingFiles: ['prompt.md'] } as any
      };
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({ allExist: true, missingFiles: [], existingFiles: [], patternErrors: [] });
      sandbox.stub(featureService, 'executeAgentCommand').resolves();
      const clearStub = sandbox.stub(featureService, 'clearPendingCommand');
      sandbox.stub(messageService, 'addMessage');
      sandbox.stub(vscode.workspace, 'saveAll').resolves(true);

      // Act
      await orchestrator.applyPendingCommand('test-feature', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(clearStub.calledOnce);
    });

    test('should handle files still missing', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        pendingCommand: { command: 'Create Plan', missingFiles: ['prompt.md'] } as any
      };
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({
        allExist: false, existingFiles: [],
        missingFiles: [{ path: 'prompt.md', type: 'exact' }],
        patternErrors: []
      });
      const addMessageStub = sandbox.stub(messageService, 'addMessage');
      sandbox.stub(vscode.workspace, 'saveAll').resolves(true);

      // Act
      await orchestrator.applyPendingCommand('test-feature', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(addMessageStub.calledWith(
        '/path/to/worktree',
        sinon.match(/No changes detected/),
        'error',
        sinon.match({ dismissible: true })
      ));
    });

    test('should update webview after applying command', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        pendingCommand: { command: 'Create Plan', missingFiles: ['prompt.md'] } as any
      };
      sandbox.stub(featureService, 'getFeature').returns(feature as any);
      sandbox.stub(fileCheckService, 'checkRequiredFiles').resolves({ allExist: true, missingFiles: [], existingFiles: [], patternErrors: [] });
      sandbox.stub(featureService, 'executeAgentCommand').resolves();
      sandbox.stub(featureService, 'clearPendingCommand');
      sandbox.stub(messageService, 'addMessage');
      sandbox.stub(vscode.workspace, 'saveAll').resolves(true);

      // Act
      await orchestrator.applyPendingCommand('test-feature', onWebviewUpdate, onFileTreeRefresh);

      // Assert
      assert.ok(onWebviewUpdate.called);
    });
  });
});
