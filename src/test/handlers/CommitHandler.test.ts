import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CommitHandler } from '../../providers/sidebar/handlers/CommitHandler';
import { FeatureService } from '../../services/FeatureService';
import { GitService } from '../../services/GitService';
import { TimelogService } from '../../services/TimelogService';
import { MessageService } from '../../services/MessageService';

suite('CommitHandler Test Suite', () => {
  let handler: CommitHandler;
  let featureService: FeatureService;
  let gitService: GitService;
  let timelogService: TimelogService;
  let messageService: MessageService;
  let onWebviewUpdate: sinon.SinonStub;
  let onFileTreeRefresh: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock objects with the methods that will be stubbed
    gitService = {
      hasUncommittedChanges: async () => true,
      stageAndCommit: async () => 'abc123'
    } as any;
    timelogService = {
      addEntry: () => {}
    } as any;
    messageService = {
      addMessage: () => {}
    } as any;
    featureService = {
      getFeature: () => null
    } as any;
    onWebviewUpdate = sandbox.stub();
    onFileTreeRefresh = sandbox.stub();

    handler = new CommitHandler(
      featureService,
      messageService,
      gitService,
      timelogService,
      onWebviewUpdate,
      onFileTreeRefresh
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should commit changes successfully', async () => {
      // Arrange
      const message = { command: 'commit' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const commitHash = 'abc123';

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      sandbox.stub(vscode.window, 'showInputBox').resolves('feat: Add feature');
      sandbox.stub(gitService, 'stageAndCommit').resolves(commitHash);
      sandbox.stub(timelogService, 'addEntry').resolves();
      sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.strictEqual(onWebviewUpdate.callCount, 1);
      assert.ok(onFileTreeRefresh.calledOnceWith('test-feature'));
    });

    test('should handle feature not found', async () => {
      // Arrange
      const message = { command: 'commit' as const, featureName: 'nonexistent' };
      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(null);

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(onWebviewUpdate.notCalled);
      assert.ok(onFileTreeRefresh.notCalled);
    });

    test('should handle no changes to commit', async () => {
      // Arrange
      const message = { command: 'commit' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(false);
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnceWith('test-feature', 'No changes to commit', 'info'));
      assert.ok(onWebviewUpdate.calledOnce);
      assert.ok(onFileTreeRefresh.notCalled);
    });

    test('should handle user cancellation', async () => {
      // Arrange
      const message = { command: 'commit' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
      const stageAndCommitStub = sandbox.stub(gitService, 'stageAndCommit');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(stageAndCommitStub.notCalled);
      assert.ok(onWebviewUpdate.notCalled);
    });

    test('should validate commit message is not empty', async () => {
      // Arrange
      const message = { command: 'commit' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);

      let validateInput: any;
      sandbox.stub(vscode.window, 'showInputBox').callsFake((options?: vscode.InputBoxOptions) => {
        validateInput = options?.validateInput;
        return Promise.resolve('valid message');
      });

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(validateInput);
      assert.strictEqual(validateInput!(''), 'Commit message cannot be empty');
      assert.strictEqual(validateInput!('   '), 'Commit message cannot be empty');
      assert.strictEqual(validateInput!('valid'), null);
    });

    test('should add timelog entry with commit details', async () => {
      // Arrange
      const message = { command: 'commit' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const commitHash = 'abc123';
      const commitMessage = 'feat: Add feature';

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      sandbox.stub(vscode.window, 'showInputBox').resolves(commitMessage);
      sandbox.stub(gitService, 'stageAndCommit').resolves(commitHash);
      const addEntryStub = sandbox.stub(timelogService, 'addEntry').resolves();
      sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addEntryStub.calledOnceWith(
        feature.worktreePath,
        feature.name,
        'Commit',
        'Success',
        {
          message: commitMessage
        },
        commitHash
      ));
    });

    test('should handle commit errors', async () => {
      // Arrange
      const message = { command: 'commit' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const error = new Error('Git error');

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      sandbox.stub(vscode.window, 'showInputBox').resolves('feat: Add feature');
      sandbox.stub(gitService, 'stageAndCommit').rejects(error);
      const handleErrorStub = sandbox.stub(handler as any, 'handleError');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(handleErrorStub.calledOnceWith(error, 'Commit', 'test-feature'));
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should show success message with commit hash', async () => {
      // Arrange
      const message = { command: 'commit' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const commitHash = 'abc123';

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      sandbox.stub(vscode.window, 'showInputBox').resolves('feat: Add feature');
      sandbox.stub(gitService, 'stageAndCommit').resolves(commitHash);
      sandbox.stub(timelogService, 'addEntry').resolves();
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnceWith(
        'test-feature',
        `✓ Changes committed: ${commitHash}`,
        'success'
      ));
    });
  });
});
