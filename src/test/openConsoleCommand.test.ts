import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { openConsoleCommand } from '../commands/openConsoleCommand';

suite('openConsoleCommand Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let createTerminalStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let mockTerminal: any;

  setup(() => {
    sandbox = sinon.createSandbox();

    mockTerminal = {
      show: sandbox.stub()
    };

    createTerminalStub = sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('Terminal Creation', () => {
    test('should create terminal with correct name and working directory', async () => {
      await openConsoleCommand('/test/worktrees/my-feature', 'my-feature');

      assert.ok(createTerminalStub.calledOnce);
      const terminalOptions = createTerminalStub.firstCall.args[0];
      assert.strictEqual(terminalOptions.name, 'Clauding: my-feature');
      assert.strictEqual(terminalOptions.cwd, '/test/worktrees/my-feature');
    });

    test('should show the created terminal', async () => {
      await openConsoleCommand('/test/worktrees/my-feature', 'my-feature');

      assert.ok(mockTerminal.show.calledOnce);
    });

    test('should display success message', async () => {
      await openConsoleCommand('/test/worktrees/my-feature', 'my-feature');

      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Console opened'));
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('my-feature'));
    });

    test('should handle features with special characters in name', async () => {
      await openConsoleCommand('/test/worktrees/feature-123', 'feature-123');

      assert.ok(createTerminalStub.calledOnce);
      const terminalOptions = createTerminalStub.firstCall.args[0];
      assert.strictEqual(terminalOptions.name, 'Clauding: feature-123');
      assert.strictEqual(terminalOptions.cwd, '/test/worktrees/feature-123');
    });
  });
});
