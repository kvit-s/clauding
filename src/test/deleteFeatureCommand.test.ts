import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { deleteFeatureCommand } from '../commands/deleteFeatureCommand';
import { FeatureService } from '../services/FeatureService';
import { WorktreeService } from '../services/WorktreeService';
import { GitService } from '../services/GitService';
import { TimelogService } from '../services/TimelogService';

suite('deleteFeatureCommand Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let featureService: FeatureService;
  let worktreeService: WorktreeService;
  let gitService: GitService;
  let timelogService: TimelogService;
  let showErrorMessageStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;

  const commitMessagePrefix = 'feat';

  setup(() => {
    sandbox = sinon.createSandbox();
    featureService = new FeatureService('/test/worktrees', 'main', 'feature/');
    worktreeService = new WorktreeService('/test/root', '/test/worktrees', 'main', 'feature/');
    gitService = new GitService();
    timelogService = new TimelogService();

    showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
    showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('Feature Not Found', () => {
    test('should show error message when feature does not exist', async () => {
      sandbox.stub(featureService, 'getFeature').returns(null);

      await deleteFeatureCommand(
        'nonexistent',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.calledWith('Feature "nonexistent" not found'));
    });
  });

  suite('Delete with Uncommitted Changes', () => {
    test('should prompt to commit changes when uncommitted changes exist', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showWarningMessageStub.resolves('Cancel');

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(showWarningMessageStub.calledOnce);
      assert.ok(showWarningMessageStub.firstCall.args[0].includes('uncommitted changes'));
    });

    test('should cancel deletion when user clicks Cancel', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showWarningMessageStub.resolves('Cancel');
      const removeWorktreeStub = sandbox.stub(worktreeService, 'removeWorktree');

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(removeWorktreeStub.notCalled);
    });

    test('should cancel deletion when user closes dialog', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showWarningMessageStub.resolves(undefined);
      const removeWorktreeStub = sandbox.stub(worktreeService, 'removeWorktree');

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(removeWorktreeStub.notCalled);
    });

    test('should commit and delete when user chooses "Commit & Delete"', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showWarningMessageStub.resolves('Commit & Delete');

      const stageAndCommitStub = sandbox.stub(gitService, 'stageAndCommit').resolves('abc123def456');
      const addEntryStub = sandbox.stub(timelogService, 'addEntry').resolves();
      const removeWorktreeStub = sandbox.stub(worktreeService, 'removeWorktree').resolves();
      const deleteBranchStub = sandbox.stub(gitService, 'deleteBranch').resolves();

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(stageAndCommitStub.calledOnce);
      assert.ok(stageAndCommitStub.calledWith(
        mockFeature.worktreePath,
        'feat: Auto-commit before deletion'
      ));
      assert.ok(addEntryStub.calledOnce);
      assert.ok(removeWorktreeStub.calledOnce);
      assert.ok(deleteBranchStub.calledOnce);
      assert.ok(deleteBranchStub.calledWith('test-feature', '/test'));
      assert.ok(showInformationMessageStub.calledTwice); // Commit message + deletion message
    });

    test('should delete without committing when user chooses "Delete Without Committing"', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showWarningMessageStub.resolves('Delete Without Committing');

      const stageAndCommitStub = sandbox.stub(gitService, 'stageAndCommit');
      const removeWorktreeStub = sandbox.stub(worktreeService, 'removeWorktree').resolves();
      const deleteBranchStub = sandbox.stub(gitService, 'deleteBranch').resolves();

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(stageAndCommitStub.notCalled);
      assert.ok(removeWorktreeStub.calledOnce);
      assert.ok(deleteBranchStub.calledOnce);
      assert.ok(deleteBranchStub.calledWith('test-feature', '/test'));
      assert.ok(showInformationMessageStub.calledOnce);
    });
  });

  suite('Delete without Uncommitted Changes', () => {
    test('should prompt for confirmation when no uncommitted changes exist', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(false);
      showWarningMessageStub.resolves('Cancel');

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(showWarningMessageStub.calledOnce);
      assert.ok(showWarningMessageStub.firstCall.args[0].includes('Delete feature'));
      assert.ok(showWarningMessageStub.firstCall.args[0].includes('permanently delete the branch'));
    });

    test('should cancel deletion when user does not confirm', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(false);
      showWarningMessageStub.resolves('Cancel');
      const removeWorktreeStub = sandbox.stub(worktreeService, 'removeWorktree');

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(removeWorktreeStub.notCalled);
    });

    test('should delete when user confirms', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(false);
      showWarningMessageStub.resolves('Delete');
      const removeWorktreeStub = sandbox.stub(worktreeService, 'removeWorktree').resolves();
      const deleteBranchStub = sandbox.stub(gitService, 'deleteBranch').resolves();

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(removeWorktreeStub.calledOnce);
      assert.ok(removeWorktreeStub.calledWith('test-feature'));
      assert.ok(deleteBranchStub.calledOnce);
      assert.ok(deleteBranchStub.calledWith('test-feature', '/test'));
      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('deleted'));
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Branch and worktree removed'));
    });
  });

  suite('Error Handling', () => {
    test('should show error message when deletion fails', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(false);
      showWarningMessageStub.resolves('Delete');
      sandbox.stub(worktreeService, 'removeWorktree').rejects(new Error('Worktree removal failed'));

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Failed to delete feature'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Worktree removal failed'));
    });

    test('should show error message when commit fails', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showWarningMessageStub.resolves('Commit & Delete');
      sandbox.stub(gitService, 'stageAndCommit').rejects(new Error('Commit failed'));

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Failed to delete feature'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Commit failed'));
    });

    test('should show warning when branch deletion fails after worktree removal', async () => {
      const mockFeature = {
        name: 'test-feature',
        worktreePath: '/test/worktrees/test-feature',
        branchName: 'feature/test-feature',
        status: { type: 'implementing' as const, message: 'Implementing' },
        lifecycleStatus: 'implement' as const
      };

      sandbox.stub(featureService, 'getFeature').returns(mockFeature);
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(false);
      showWarningMessageStub.resolves('Delete');
      sandbox.stub(worktreeService, 'removeWorktree').resolves();
      sandbox.stub(gitService, 'deleteBranch').rejects(new Error('Branch deletion failed'));

      await deleteFeatureCommand(
        'test-feature',
        featureService,
        worktreeService,
        gitService,
        timelogService,
        commitMessagePrefix
      );

      assert.ok(showWarningMessageStub.calledTwice); // Confirmation + failure warning
      assert.ok(showWarningMessageStub.secondCall.args[0].includes('Worktree removed but failed to delete branch'));
      assert.ok(showWarningMessageStub.secondCall.args[0].includes('Branch deletion failed'));
    });
  });
});
