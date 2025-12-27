import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { openFolderCommand } from '../commands/openFolderCommand';

suite('openFolderCommand Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let executeCommandStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('Opening Folder', () => {
    test('should execute revealFileInOS command with correct URI', async () => {
      await openFolderCommand('/test/worktrees/my-feature');

      assert.ok(executeCommandStub.calledOnce);
      assert.strictEqual(executeCommandStub.firstCall.args[0], 'revealFileInOS');

      const uri = executeCommandStub.firstCall.args[1];
      assert.ok(uri instanceof vscode.Uri);
      assert.strictEqual(uri.fsPath, '/test/worktrees/my-feature');
    });

    test('should display success message', async () => {
      await openFolderCommand('/test/worktrees/my-feature');

      assert.ok(showInformationMessageStub.calledOnce);
      assert.strictEqual(showInformationMessageStub.firstCall.args[0], 'Worktree folder opened');
    });

    test('should handle Windows-style paths', async () => {
      await openFolderCommand('C:\\test\\worktrees\\my-feature');

      assert.ok(executeCommandStub.calledOnce);
      const uri = executeCommandStub.firstCall.args[1];
      assert.ok(uri instanceof vscode.Uri);
      // On Unix-like systems, Windows paths are normalized with lowercase drive letter
      const expectedPath = process.platform === 'win32' ? 'C:\\test\\worktrees\\my-feature' : 'c:\\test\\worktrees\\my-feature';
      assert.strictEqual(uri.fsPath, expectedPath);
    });

    test('should handle paths with spaces', async () => {
      await openFolderCommand('/test/my worktrees/my feature');

      assert.ok(executeCommandStub.calledOnce);
      const uri = executeCommandStub.firstCall.args[1];
      assert.ok(uri instanceof vscode.Uri);
      assert.strictEqual(uri.fsPath, '/test/my worktrees/my feature');
    });

    test('should handle paths with special characters', async () => {
      await openFolderCommand('/test/worktrees/feature-123_test');

      assert.ok(executeCommandStub.calledOnce);
      const uri = executeCommandStub.firstCall.args[1];
      assert.ok(uri instanceof vscode.Uri);
      assert.strictEqual(uri.fsPath, '/test/worktrees/feature-123_test');
    });

    test('should handle relative paths', async () => {
      await openFolderCommand('.clauding/worktrees/my-feature');

      assert.ok(executeCommandStub.calledOnce);
      const uri = executeCommandStub.firstCall.args[1];
      assert.ok(uri instanceof vscode.Uri);
      // vscode.Uri.file() resolves relative paths to absolute paths
      assert.ok(uri.fsPath.endsWith('.clauding/worktrees/my-feature') || uri.fsPath.endsWith('.clauding\\worktrees\\my-feature'));
    });
  });

  suite('Command Execution', () => {
    test('should wait for command to complete before showing message', async () => {
      let commandCompleted = false;
      executeCommandStub.callsFake(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        commandCompleted = true;
      });

      await openFolderCommand('/test/worktrees/my-feature');

      assert.ok(commandCompleted);
      assert.ok(showInformationMessageStub.calledOnce);
    });
  });
});
