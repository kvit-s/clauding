import * as assert from 'assert';
import * as sinon from 'sinon';
import { UpdateFromMainHandler } from '../../providers/sidebar/handlers/UpdateFromMainHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';
import { MergeConflictOrchestrator } from '../../providers/sidebar/MergeConflictOrchestrator';
import { FeatureCommandOrchestrator } from '../../providers/sidebar/FeatureCommandOrchestrator';

suite('UpdateFromMainHandler Test Suite', () => {
  let handler: UpdateFromMainHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let mergeOrchestrator: MergeConflictOrchestrator;
  let commandOrchestrator: FeatureCommandOrchestrator;
  let onWebviewUpdate: sinon.SinonStub;
  let onFileTreeRefresh: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock objects with the methods that will be stubbed
    featureService = {
      getMainBranch: () => '',
      updateFromMain: async () => ({ success: true, hasConflicts: false, conflictedFiles: [] })
    } as any;
    messageService = {
      addMessage: () => {}
    } as any;
    mergeOrchestrator = {
      showConflictResolutionDialog: async () => 'manual' as any,
      resolveConflicts: async () => {}
    } as any;
    commandOrchestrator = {
      executeAgentCommand: async () => {}
    } as any;
    onWebviewUpdate = sandbox.stub();
    onFileTreeRefresh = sandbox.stub();

    handler = new UpdateFromMainHandler(
      featureService,
      messageService,
      mergeOrchestrator,
      commandOrchestrator,
      onWebviewUpdate,
      onFileTreeRefresh
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should update from main successfully without conflicts', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'getMainBranch').returns('main');
      sandbox.stub(featureService, 'updateFromMain').resolves({ success: true, hasConflicts: false, conflictedFiles: [] });
      sandbox.stub(handler as any, 'autoTriggerModifyPlanIfNeeded').resolves();
      const addMessageStub = sandbox.stub(messageService, 'addMessage');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, msg, type] = addMessageStub.firstCall.args;
      assert.ok(msg.includes('Updated from main successfully'));
      assert.strictEqual(type, 'success');
      assert.ok(onWebviewUpdate.calledOnce);
      assert.ok(onFileTreeRefresh.calledOnceWith('test-feature'));
    });

    test('should handle feature not found', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'nonexistent' };
      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(null);
      const updateStub = sandbox.stub(featureService, 'updateFromMain');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(updateStub.notCalled);
      assert.ok(onWebviewUpdate.notCalled);
    });

    test('should handle conflicts with manual resolution', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const conflictedFiles = ['file1.ts', 'file2.ts'];

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'getMainBranch').returns('main');
      sandbox.stub(featureService, 'updateFromMain').resolves({ success: true, hasConflicts: true, conflictedFiles });
      sandbox.stub(mergeOrchestrator, 'showConflictResolutionDialog').resolves('manual' as any);
      const resolveConflictsStub = sandbox.stub(mergeOrchestrator, 'resolveConflicts').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(resolveConflictsStub.calledOnceWith('test-feature', conflictedFiles, 'manual' as any, false));
      assert.ok(onWebviewUpdate.calledOnce);
      assert.ok(onFileTreeRefresh.calledOnceWith('test-feature'));
    });

    test('should handle conflicts with agent resolution', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const conflictedFiles = ['file1.ts'];

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'getMainBranch').returns('main');
      sandbox.stub(featureService, 'updateFromMain').resolves({ success: true, hasConflicts: true, conflictedFiles });
      sandbox.stub(mergeOrchestrator, 'showConflictResolutionDialog').resolves('agent');
      const addMessageStub = sandbox.stub(messageService, 'addMessage');
      const resolveConflictsStub = sandbox.stub(mergeOrchestrator, 'resolveConflicts');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, msg, type] = addMessageStub.firstCall.args;
      assert.ok(msg.includes('Agent resolution for update from main is not yet implemented'));
      assert.strictEqual(type, 'warning');
      assert.ok(resolveConflictsStub.notCalled);
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should handle update errors', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const error = new Error('Update failed');

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'getMainBranch').returns('main');
      sandbox.stub(featureService, 'updateFromMain').rejects(error);
      const handleErrorStub = sandbox.stub(handler as any, 'handleError');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(handleErrorStub.calledOnceWith(error, 'Update from main', 'test-feature'));
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should refresh file tree after successful update', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'getMainBranch').returns('main');
      sandbox.stub(featureService, 'updateFromMain').resolves({ success: true, hasConflicts: false, conflictedFiles: [] });
      sandbox.stub(handler as any, 'autoTriggerModifyPlanIfNeeded').resolves();
      sandbox.stub(messageService, 'addMessage');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(onFileTreeRefresh.calledOnceWith('test-feature'));
    });

    test('should use correct main branch in success message', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const mainBranch = 'develop';

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'getMainBranch').returns(mainBranch);
      sandbox.stub(featureService, 'updateFromMain').resolves({ success: true, hasConflicts: false, conflictedFiles: [] });
      sandbox.stub(handler as any, 'autoTriggerModifyPlanIfNeeded').resolves();
      const addMessageStub = sandbox.stub(messageService, 'addMessage');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, msg] = addMessageStub.firstCall.args;
      assert.ok(msg.includes(`Updated from ${mainBranch} successfully`));
    });

    test('should pass correct isUpdateFromMain flag to resolveConflicts', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'getMainBranch').returns('main');
      sandbox.stub(featureService, 'updateFromMain').resolves({ success: true,
        hasConflicts: true,
        conflictedFiles: ['file1.ts']
      });
      sandbox.stub(mergeOrchestrator, 'showConflictResolutionDialog').resolves('manual' as any);
      const resolveConflictsStub = sandbox.stub(mergeOrchestrator, 'resolveConflicts').resolves();

      // Act
      await handler.handle(message);

      // Assert
      const isUpdateFromMain = resolveConflictsStub.firstCall.args[3];
      assert.strictEqual(isUpdateFromMain, false);
    });

    test('should call autoTriggerModifyPlanIfNeeded after successful merge', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'getMainBranch').returns('main');
      sandbox.stub(featureService, 'updateFromMain').resolves({ success: true, hasConflicts: false, conflictedFiles: [] });
      sandbox.stub(messageService, 'addMessage');
      const autoTriggerStub = sandbox.stub(handler as any, 'autoTriggerModifyPlanIfNeeded').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(autoTriggerStub.calledOnceWith('test-feature', '/path/to/worktree'));
    });

    test('should not call autoTriggerModifyPlanIfNeeded when there are conflicts', async () => {
      // Arrange
      const message = { command: 'updateFromMain' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'getMainBranch').returns('main');
      sandbox.stub(featureService, 'updateFromMain').resolves({ success: true, hasConflicts: true, conflictedFiles: ['file1.ts'] });
      sandbox.stub(mergeOrchestrator, 'showConflictResolutionDialog').resolves('manual' as any);
      sandbox.stub(mergeOrchestrator, 'resolveConflicts').resolves();
      const autoTriggerStub = sandbox.stub(handler as any, 'autoTriggerModifyPlanIfNeeded').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(autoTriggerStub.notCalled);
    });
  });
});
