import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { OpenFileHandler } from '../../providers/sidebar/handlers/OpenFileHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';

suite('OpenFileHandler Test Suite', () => {
  let handler: OpenFileHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let onWebviewUpdate: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;
  let mockFs: any;

  setup(() => {
    sandbox = sinon.createSandbox();
    featureService = {} as FeatureService;
    messageService = {} as MessageService;
    onWebviewUpdate = sandbox.stub();

    // Create mock fs object
    mockFs = {
      existsSync: sandbox.stub(),
      writeFileSync: sandbox.stub(),
      readdirSync: sandbox.stub()
    };

    handler = new OpenFileHandler(
      featureService,
      messageService,
      onWebviewUpdate,
      '/test/project/root',
      mockFs
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should open prompt file', async () => {
      // Arrange
      const message = {
        command: 'openFile' as const,
        featureName: 'test-feature',
        fileName: 'Prompt'
      };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const mockDocument = {} as vscode.TextDocument;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockDocument);
      const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(openTextDocumentStub.calledOnce);
      assert.ok(showTextDocumentStub.calledOnce);
    });

    test('should handle feature not found', async () => {
      // Arrange
      const message = {
        command: 'openFile' as const,
        featureName: 'nonexistent',
        fileName: 'Prompt'
      };

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(null);
      const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(openTextDocumentStub.notCalled);
    });

    test('should create modify prompt file if it does not exist', async () => {
      // Arrange
      const message = {
        command: 'openFile' as const,
        featureName: 'test-feature',
        fileName: 'Modify Prompt'
      };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const mockDocument = {} as vscode.TextDocument;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      mockFs.existsSync.returns(false);
      sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockDocument);
      sandbox.stub(vscode.window, 'showTextDocument').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(mockFs.existsSync.calledOnce);
      assert.ok(mockFs.writeFileSync.calledOnce);
    });

    test('should handle missing test results', async () => {
      // Arrange
      const message = {
        command: 'openFile' as const,
        featureName: 'test-feature',
        fileName: 'Tests'
      };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      mockFs.existsSync.returns(false);
      const addMessageStub = sandbox.stub(handler as any, 'addMessageToPanel');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, msg, type] = addMessageStub.firstCall.args;
      assert.ok(msg.includes('No test results available'));
      assert.strictEqual(type, 'info');
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should handle file not found from tree view', async () => {
      // Arrange
      const message = {
        command: 'openFile' as const,
        featureName: 'test-feature',
        fileName: 'some/path/file.ts'
      };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      mockFs.existsSync.returns(false);
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(showErrorStub.calledOnce);
    });
  });
});
