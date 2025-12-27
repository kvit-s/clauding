import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { renameFeatureCommand } from '../commands/renameFeatureCommand';
import { FeatureService } from '../services/FeatureService';
import { WorktreeService } from '../services/WorktreeService';
import { GitService } from '../services/GitService';

suite('renameFeatureCommand Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let featureService: FeatureService;
  let worktreeService: WorktreeService;
  let gitService: GitService;
  let showErrorMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    featureService = new FeatureService('/test/worktrees', 'main', 'feature/');
    worktreeService = new WorktreeService('/test/root', '/test/worktrees', 'main', 'feature/');
    gitService = new GitService();

    showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('Feature Not Found', () => {
    test('should show error message when feature does not exist', async () => {
      sandbox.stub(featureService, 'getFeature').returns(null);

      await renameFeatureCommand(
        'nonexistent',
        'new-name',
        featureService,
        worktreeService,
        gitService
      );

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.calledWith('Feature "nonexistent" not found'));
    });
  });

  suite('Validation', () => {
    test('should show error when new name is empty', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);

      await renameFeatureCommand(
        'test-feature',
        '',
        featureService,
        worktreeService,
        gitService
      );

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.calledWith('Feature name cannot be empty'));
    });

    test('should show error when new name has invalid characters', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);

      await renameFeatureCommand(
        'test-feature',
        'invalid name!',
        featureService,
        worktreeService,
        gitService
      );

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Invalid feature name'));
    });

    test('should show error when new name conflicts with existing feature', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      const existingFeature = {
        name: 'existing-feature',
        worktreePath: '/test/worktrees/existing-feature',
        branchName: 'feature/existing-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      const getFeatureStub = sandbox.stub(featureService, 'getFeature');
      getFeatureStub.withArgs('test-feature').returns(mockFeature);
      getFeatureStub.withArgs('existing-feature').returns(existingFeature);

      await renameFeatureCommand(
        'test-feature',
        'existing-feature',
        featureService,
        worktreeService,
        gitService
      );

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.calledWith('Feature "existing-feature" already exists'));
    });
  });

  suite('Successful Rename', () => {
    test('should rename feature when user confirms', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      const getFeatureStub = sandbox.stub(featureService, 'getFeature');
      getFeatureStub.withArgs('test-feature').returns(mockFeature);
      getFeatureStub.withArgs('new-feature').returns(null);

      showInformationMessageStub.resolves('Rename');

      const renameWorktreeStub = sandbox.stub(worktreeService, 'renameWorktree').resolves('/test/worktrees/new-feature');
      const renameBranchStub = sandbox.stub(gitService, 'renameBranch').resolves();

      await renameFeatureCommand(
        'test-feature',
        'new-feature',
        featureService,
        worktreeService,
        gitService
      );

      assert.ok(renameWorktreeStub.calledOnce);
      assert.ok(renameWorktreeStub.calledWith('test-feature', 'new-feature'));
      assert.ok(renameBranchStub.calledOnce);
      assert.ok(renameBranchStub.calledWith('test-feature', 'new-feature', '/test/worktrees/new-feature'));
      assert.ok(showInformationMessageStub.calledTwice); // Confirmation + success message
    });

    test('should cancel rename when user does not confirm', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      const getFeatureStub = sandbox.stub(featureService, 'getFeature');
      getFeatureStub.withArgs('test-feature').returns(mockFeature);
      getFeatureStub.withArgs('new-feature').returns(null);

      showInformationMessageStub.resolves('Cancel');

      const renameWorktreeStub = sandbox.stub(worktreeService, 'renameWorktree');
      const renameBranchStub = sandbox.stub(gitService, 'renameBranch');

      await renameFeatureCommand(
        'test-feature',
        'new-feature',
        featureService,
        worktreeService,
        gitService
      );

      assert.ok(renameWorktreeStub.notCalled);
      assert.ok(renameBranchStub.notCalled);
    });
  });

  suite('Error Handling', () => {
    test('should show error when worktree rename fails', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      const getFeatureStub = sandbox.stub(featureService, 'getFeature');
      getFeatureStub.withArgs('test-feature').returns(mockFeature);
      getFeatureStub.withArgs('new-feature').returns(null);

      showInformationMessageStub.resolves('Rename');
      sandbox.stub(worktreeService, 'renameWorktree').rejects(new Error('Worktree rename failed'));

      await renameFeatureCommand(
        'test-feature',
        'new-feature',
        featureService,
        worktreeService,
        gitService
      );

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Failed to rename feature'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Worktree rename failed'));
    });

    test('should show error when branch rename fails', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      const getFeatureStub = sandbox.stub(featureService, 'getFeature');
      getFeatureStub.withArgs('test-feature').returns(mockFeature);
      getFeatureStub.withArgs('new-feature').returns(null);

      showInformationMessageStub.resolves('Rename');
      sandbox.stub(worktreeService, 'renameWorktree').resolves('/test/worktrees/new-feature');
      sandbox.stub(gitService, 'renameBranch').rejects(new Error('Branch rename failed'));

      await renameFeatureCommand(
        'test-feature',
        'new-feature',
        featureService,
        worktreeService,
        gitService
      );

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Failed to rename feature'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Branch rename failed'));
    });
  });
});
