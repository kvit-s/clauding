import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { OpenFolderHandler } from '../../providers/sidebar/handlers/OpenFolderHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';

suite('OpenFolderHandler Test Suite', () => {
  let handler: OpenFolderHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let onWebviewUpdate: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    featureService = {} as FeatureService;
    messageService = {} as MessageService;
    onWebviewUpdate = sandbox.stub();

    handler = new OpenFolderHandler(
      featureService,
      messageService,
      onWebviewUpdate
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should open folder successfully', async () => {
      // Arrange
      const message = { command: 'openfolder' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
      sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(executeCommandStub.calledOnce);
      const [command, uri] = executeCommandStub.firstCall.args;
      assert.strictEqual(command, 'revealInExplorer');
      assert.strictEqual((uri as vscode.Uri).fsPath, feature.worktreePath);
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should handle feature not found', async () => {
      // Arrange
      const message = { command: 'openfolder' as const, featureName: 'nonexistent' };
      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(null);
      const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(executeCommandStub.notCalled);
      assert.ok(onWebviewUpdate.notCalled);
    });

    test('should show success message', async () => {
      // Arrange
      const message = { command: 'openfolder' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.commands, 'executeCommand').resolves();
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnceWith(
        'test-feature',
        'Worktree folder revealed in Explorer',
        'success'
      ));
    });

    test('should handle command execution errors', async () => {
      // Arrange
      const message = { command: 'openfolder' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const error = new Error('Command failed');

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(vscode.commands, 'executeCommand').rejects(error);
      const handleErrorStub = sandbox.stub(handler as any, 'handleError');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(handleErrorStub.calledOnceWith(error, 'Failed to open folder', 'test-feature'));
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should create URI with correct path', async () => {
      // Arrange
      const message = { command: 'openfolder' as const, featureName: 'test-feature' };
      const worktreePath = '/some/custom/path/to/worktree';
      const feature = { name: 'test-feature', worktreePath };

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
      sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      const uri = executeCommandStub.firstCall.args[1] as vscode.Uri;
      assert.strictEqual(uri.scheme, 'file');
      assert.strictEqual(uri.fsPath, worktreePath);
    });
  });
});
