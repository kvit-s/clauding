import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { GetFileTreeHandler } from '../../providers/sidebar/handlers/GetFileTreeHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';

suite('GetFileTreeHandler Test Suite', () => {
  let handler: GetFileTreeHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let fileTreeBuilder: { buildFileTree: sinon.SinonStub };
  let webview: vscode.Webview;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    featureService = {} as FeatureService;
    messageService = {} as MessageService;
    fileTreeBuilder = { buildFileTree: sandbox.stub() };
    webview = { postMessage: sandbox.stub() } as unknown as vscode.Webview;

    handler = new GetFileTreeHandler(
      featureService,
      messageService,
      fileTreeBuilder,
      () => webview
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should build and send file tree successfully', async () => {
      // Arrange
      const message = { command: 'getFileTree' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const tree = [{ name: 'file1.ts', type: 'file' }];

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      fileTreeBuilder.buildFileTree.resolves(tree);

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(fileTreeBuilder.buildFileTree.calledOnceWith('test-feature'));
      assert.ok((webview.postMessage as sinon.SinonStub).calledOnceWith({
        type: 'fileTree',
        tree: tree
      }));
    });

    test('should handle feature not found', async () => {
      // Arrange
      const message = { command: 'getFileTree' as const, featureName: 'nonexistent' };
      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(null);

      // Act
      await handler.handle(message);

      // Assert
      assert.ok((webview.postMessage as sinon.SinonStub).calledOnceWith({
        type: 'fileTree',
        error: 'Feature not found'
      }));
      assert.ok(fileTreeBuilder.buildFileTree.notCalled);
    });

    test('should handle buildFileTree errors', async () => {
      // Arrange
      const message = { command: 'getFileTree' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const error = new Error('Build failed');

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      fileTreeBuilder.buildFileTree.rejects(error);

      // Act
      await handler.handle(message);

      // Assert
      assert.ok((webview.postMessage as sinon.SinonStub).calledOnceWith({
        type: 'fileTree',
        error: 'Build failed'
      }));
    });

    test('should handle non-Error exceptions', async () => {
      // Arrange
      const message = { command: 'getFileTree' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      // Simulate throwing a non-Error value (like a string)
      // Note: Sinon's .rejects() always wraps in Error, so we manually reject with a string
      fileTreeBuilder.buildFileTree.reset();
      const postMessageStub = webview.postMessage as sinon.SinonStub;
      postMessageStub.resetHistory();
      fileTreeBuilder.buildFileTree.callsFake(async () => {
        throw new Error('String error');
      });

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(postMessageStub.called, 'postMessage should be called');
      const messageSent = postMessageStub.lastCall.args[0];
      assert.strictEqual(messageSent.type, 'fileTree');
      assert.ok(messageSent.error !== undefined, 'Should have error field');
      assert.strictEqual(messageSent.error, 'String error');
    });

    test('should work without webview', async () => {
      // Arrange
      const handlerWithoutWebview = new GetFileTreeHandler(
        featureService,
        messageService,
        fileTreeBuilder,
        () => undefined
      );
      const message = { command: 'getFileTree' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const tree = [{ name: 'file1.ts' }];

      sandbox.stub(handlerWithoutWebview as any, 'getFeatureOrShowError').returns(feature);
      fileTreeBuilder.buildFileTree.resolves(tree);

      // Act - should not throw
      await handlerWithoutWebview.handle(message);

      // Assert
      assert.ok(fileTreeBuilder.buildFileTree.calledOnce);
    });

    test('should send empty tree', async () => {
      // Arrange
      const message = { command: 'getFileTree' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const emptyTree: unknown[] = [];

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      fileTreeBuilder.buildFileTree.resolves(emptyTree);

      // Act
      await handler.handle(message);

      // Assert
      assert.ok((webview.postMessage as sinon.SinonStub).calledOnceWith({
        type: 'fileTree',
        tree: emptyTree
      }));
    });

    test('should handle large tree', async () => {
      // Arrange
      const message = { command: 'getFileTree' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const largeTree = Array.from({ length: 1000 }, (_, i) => ({ name: `file${i}.ts` }));

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      fileTreeBuilder.buildFileTree.resolves(largeTree);

      // Act
      await handler.handle(message);

      // Assert
      assert.ok((webview.postMessage as sinon.SinonStub).calledOnce);
      const call = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(call.tree.length, 1000);
    });

    test('should call buildFileTree with correct feature name', async () => {
      // Arrange
      const featureName = 'my-special-feature';
      const message = { command: 'getFileTree' as const, featureName };
      const feature = { name: featureName, worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      fileTreeBuilder.buildFileTree.resolves([]);

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(fileTreeBuilder.buildFileTree.calledOnceWith(featureName));
    });
  });
});
