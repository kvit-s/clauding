import * as assert from 'assert';
import * as sinon from 'sinon';
import { DismissMessageHandler } from '../../providers/sidebar/handlers/DismissMessageHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';

suite('DismissMessageHandler Test Suite', () => {
  let handler: DismissMessageHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let onWebviewUpdate: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock objects with the methods that will be stubbed
    messageService = {
      dismissMessage: async () => {}
    } as any;
    featureService = {
      invalidateCache: () => {}
    } as any;
    onWebviewUpdate = sandbox.stub();

    handler = new DismissMessageHandler(
      featureService,
      messageService,
      onWebviewUpdate
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should dismiss message successfully', async () => {
      // Arrange
      const message = {
        command: 'dismissMessage' as const,
        featureName: 'test-feature',
        messageId: 'msg-123'
      };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      const dismissMessageStub = sandbox.stub(messageService, 'dismissMessage');
      const invalidateCacheStub = sandbox.stub(featureService, 'invalidateCache');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(dismissMessageStub.calledOnceWith(feature.worktreePath, 'msg-123'));
      assert.ok(invalidateCacheStub.calledOnce);
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should handle feature not found', async () => {
      // Arrange
      const message = {
        command: 'dismissMessage' as const,
        featureName: 'nonexistent',
        messageId: 'msg-123'
      };

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(null);
      const dismissMessageStub = sandbox.stub(messageService, 'dismissMessage');

      // Act
      await handler.handle(message);

      // Assert
      // When feature is not found, dismissMessage should not be called
      assert.ok(dismissMessageStub.notCalled);
    });

    test('should invalidate cache after dismissing message', async () => {
      // Arrange
      const message = {
        command: 'dismissMessage' as const,
        featureName: 'test-feature',
        messageId: 'msg-123'
      };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(messageService, 'dismissMessage');
      const invalidateCacheStub = sandbox.stub(featureService, 'invalidateCache');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(invalidateCacheStub.calledOnce);
    });

    test('should handle dismissMessage errors', async () => {
      // Arrange
      const message = {
        command: 'dismissMessage' as const,
        featureName: 'test-feature',
        messageId: 'msg-123'
      };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const error = new Error('Dismiss failed');

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      const dismissStub = sandbox.stub(messageService, 'dismissMessage').throws(error);

      // Act
      await handler.handle(message);

      // Assert
      // Verify that dismissMessage was attempted
      assert.ok(dismissStub.calledOnce);
    });
  });
});
