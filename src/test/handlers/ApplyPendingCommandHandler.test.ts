import * as assert from 'assert';
import * as sinon from 'sinon';
import { ApplyPendingCommandHandler } from '../../providers/sidebar/handlers/ApplyPendingCommandHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';
import { FeatureCommandOrchestrator } from '../../providers/sidebar/FeatureCommandOrchestrator';

suite('ApplyPendingCommandHandler Test Suite', () => {
  let handler: ApplyPendingCommandHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let commandOrchestrator: FeatureCommandOrchestrator;
  let onWebviewUpdate: sinon.SinonStub;
  let onFileTreeRefresh: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock objects with the methods that will be stubbed
    commandOrchestrator = {
      applyPendingCommand: async () => {}
    } as any;
    featureService = {} as any;
    messageService = {} as any;
    onWebviewUpdate = sandbox.stub();
    onFileTreeRefresh = sandbox.stub();

    handler = new ApplyPendingCommandHandler(
      featureService,
      messageService,
      commandOrchestrator,
      onWebviewUpdate,
      onFileTreeRefresh
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should apply pending command successfully', async () => {
      // Arrange
      const message = { command: 'applyPendingCommand' as const, featureName: 'test-feature' };
      const applyStub = sandbox.stub(commandOrchestrator, 'applyPendingCommand').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(applyStub.calledOnce);
      assert.strictEqual(applyStub.firstCall.args[0], 'test-feature');
      assert.strictEqual(applyStub.firstCall.args[1], onWebviewUpdate);
      assert.strictEqual(applyStub.firstCall.args[2], onFileTreeRefresh);
    });

    test('should pass onWebviewUpdate callback', async () => {
      // Arrange
      const message = { command: 'applyPendingCommand' as const, featureName: 'test-feature' };
      const applyStub = sandbox.stub(commandOrchestrator, 'applyPendingCommand').resolves();

      // Act
      await handler.handle(message);

      // Assert
      const callback = applyStub.firstCall.args[1];
      assert.strictEqual(typeof callback, 'function');
      assert.strictEqual(callback, onWebviewUpdate);
    });

    test('should pass onFileTreeRefresh callback', async () => {
      // Arrange
      const message = { command: 'applyPendingCommand' as const, featureName: 'test-feature' };
      const applyStub = sandbox.stub(commandOrchestrator, 'applyPendingCommand').resolves();

      // Act
      await handler.handle(message);

      // Assert
      const callback = applyStub.firstCall.args[2];
      assert.strictEqual(typeof callback, 'function');
      assert.strictEqual(callback, onFileTreeRefresh);
    });

    test('should handle apply errors', async () => {
      // Arrange
      const message = { command: 'applyPendingCommand' as const, featureName: 'test-feature' };
      const error = new Error('Apply failed');
      sandbox.stub(commandOrchestrator, 'applyPendingCommand').rejects(error);
      const handleErrorStub = sandbox.stub(handler as any, 'handleError');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(handleErrorStub.calledOnceWith(error, 'Apply', 'test-feature'));
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should update webview after error', async () => {
      // Arrange
      const message = { command: 'applyPendingCommand' as const, featureName: 'test-feature' };
      const error = new Error('Apply failed');
      sandbox.stub(commandOrchestrator, 'applyPendingCommand').rejects(error);
      sandbox.stub(handler as any, 'handleError');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should call applyPendingCommand with correct feature name', async () => {
      // Arrange
      const featureName = 'my-special-feature';
      const message = { command: 'applyPendingCommand' as const, featureName };
      const applyStub = sandbox.stub(commandOrchestrator, 'applyPendingCommand').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(applyStub.calledOnce);
      assert.strictEqual(applyStub.firstCall.args[0], featureName);
    });

    test('should handle non-Error exceptions', async () => {
      // Arrange
      const message = { command: 'applyPendingCommand' as const, featureName: 'test-feature' };
      sandbox.stub(commandOrchestrator, 'applyPendingCommand').rejects('String error');
      const handleErrorStub = sandbox.stub(handler as any, 'handleError');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(handleErrorStub.calledOnce);
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should not call callbacks if applyPendingCommand fails', async () => {
      // Arrange
      const message = { command: 'applyPendingCommand' as const, featureName: 'test-feature' };
      sandbox.stub(commandOrchestrator, 'applyPendingCommand').rejects(new Error('Failed'));
      sandbox.stub(handler as any, 'handleError');

      // Reset stubs to track calls after setup
      onWebviewUpdate.resetHistory();
      onFileTreeRefresh.resetHistory();

      // Act
      await handler.handle(message);

      // Assert
      // onWebviewUpdate should be called once (in error handler)
      assert.strictEqual(onWebviewUpdate.callCount, 1);
      // onFileTreeRefresh should not be called since applyPendingCommand handles it
      assert.strictEqual(onFileTreeRefresh.callCount, 0);
    });
  });
});
