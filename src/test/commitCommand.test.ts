import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { commitCommand } from '../commands/commitCommand';
import { GitService } from '../services/GitService';
import { TimelogService } from '../services/TimelogService';

suite('commitCommand Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let gitService: GitService;
  let timelogService: TimelogService;
  let showInputBoxStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    gitService = new GitService();
    timelogService = new TimelogService();

    showInputBoxStub = sandbox.stub(vscode.window, 'showInputBox');
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('No Changes to Commit', () => {
    test('should show message when no uncommitted changes exist', async () => {
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(false);

      await commitCommand('my-feature', '/test/worktrees/my-feature', gitService, timelogService);

      assert.ok(showInformationMessageStub.calledOnce);
      assert.strictEqual(showInformationMessageStub.firstCall.args[0], 'No changes to commit');
      assert.ok(showInputBoxStub.notCalled);
    });
  });

  suite('Commit Message Input', () => {
    test('should prompt for commit message with pre-filled prefix', async () => {
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showInputBoxStub.resolves(undefined);

      await commitCommand('my-feature', '/test/worktrees/my-feature', gitService, timelogService);

      assert.ok(showInputBoxStub.calledOnce);
      const options = showInputBoxStub.firstCall.args[0];
      assert.strictEqual(options.prompt, 'Enter commit message');
      assert.strictEqual(options.placeHolder, 'feat: ');
      assert.strictEqual(options.value, 'feat: ');
    });

    test('should validate that commit message is not empty', async () => {
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showInputBoxStub.resolves(undefined);

      await commitCommand('my-feature', '/test/worktrees/my-feature', gitService, timelogService);

      const options = showInputBoxStub.firstCall.args[0];
      const validator = options.validateInput;

      assert.strictEqual(validator(''), 'Commit message cannot be empty');
      assert.strictEqual(validator('   '), 'Commit message cannot be empty');
      assert.strictEqual(validator('feat: Add feature'), null);
    });

    test('should cancel when user closes input dialog', async () => {
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showInputBoxStub.resolves(undefined);
      const stageAndCommitStub = sandbox.stub(gitService, 'stageAndCommit');

      await commitCommand('my-feature', '/test/worktrees/my-feature', gitService, timelogService);

      assert.ok(stageAndCommitStub.notCalled);
    });
  });

  suite('Successful Commit', () => {
    test('should stage and commit with provided message', async () => {
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showInputBoxStub.resolves('feat: Add new functionality');
      const stageAndCommitStub = sandbox.stub(gitService, 'stageAndCommit').resolves('abc123def456');
      sandbox.stub(timelogService, 'addEntry').resolves();

      await commitCommand('my-feature', '/test/worktrees/my-feature', gitService, timelogService);

      assert.ok(stageAndCommitStub.calledOnce);
      assert.strictEqual(stageAndCommitStub.firstCall.args[0], '/test/worktrees/my-feature');
      assert.strictEqual(stageAndCommitStub.firstCall.args[1], 'feat: Add new functionality');
    });

    test('should add timelog entry with commit details', async () => {
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showInputBoxStub.resolves('feat: Add new functionality');
      sandbox.stub(gitService, 'stageAndCommit').resolves('abc123def456');
      const addEntryStub = sandbox.stub(timelogService, 'addEntry').resolves();

      await commitCommand('my-feature', '/test/worktrees/my-feature', gitService, timelogService);

      assert.ok(addEntryStub.calledOnce);
      assert.strictEqual(addEntryStub.firstCall.args[0], '/test/worktrees/my-feature');
      assert.strictEqual(addEntryStub.firstCall.args[1], 'Commit');
      assert.strictEqual(addEntryStub.firstCall.args[2], 'Success');
      assert.deepStrictEqual(addEntryStub.firstCall.args[3], {
        commitHash: 'abc123def456',
        message: 'feat: Add new functionality'
      });
    });

    test('should show success message with commit hash', async () => {
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showInputBoxStub.resolves('feat: Add new functionality');
      sandbox.stub(gitService, 'stageAndCommit').resolves('abc123def456');
      sandbox.stub(timelogService, 'addEntry').resolves();

      await commitCommand('my-feature', '/test/worktrees/my-feature', gitService, timelogService);

      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Changes committed'));
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('abc123def456'));
    });
  });

  suite('Error Handling', () => {
    test('should show error message when commit fails', async () => {
      const consoleStub = sandbox.stub(console, 'error');
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showInputBoxStub.resolves('feat: Add new functionality');
      sandbox.stub(gitService, 'stageAndCommit').rejects(new Error('Commit failed'));

      await commitCommand('my-feature', '/test/worktrees/my-feature', gitService, timelogService);

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Commit failed'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Commit failed'));

      consoleStub.restore();
    });

    test('should show error message when timelog entry fails', async () => {
      const consoleStub = sandbox.stub(console, 'error');
      sandbox.stub(gitService, 'hasUncommittedChanges').resolves(true);
      showInputBoxStub.resolves('feat: Add new functionality');
      sandbox.stub(gitService, 'stageAndCommit').resolves('abc123def456');
      sandbox.stub(timelogService, 'addEntry').rejects(new Error('Failed to write timelog'));

      await commitCommand('my-feature', '/test/worktrees/my-feature', gitService, timelogService);

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Commit failed'));

      consoleStub.restore();
    });
  });
});
