import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { MessageHandler } from '../../providers/sidebar/MessageHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';

// Concrete implementation for testing
class TestMessageHandler extends MessageHandler<{ command: string; featureName: string }> {
  async handle(_message: { command: string; featureName: string }): Promise<void> {
    // No-op for testing base class
    void _message; // unused but required by interface
  }
}

suite('MessageHandler Test Suite', () => {
  let handler: TestMessageHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock objects with the methods that will be stubbed
    featureService = {
      getFeature: () => null
    } as any;
    messageService = {
      addMessage: () => {}
    } as any;

    handler = new TestMessageHandler(featureService, messageService);
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('getFeatureOrShowError', () => {
    test('should return feature when found', () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);

      // Act
      const result = (handler as any).getFeatureOrShowError('test-feature');

      // Assert
      assert.strictEqual(result, feature);
    });

    test('should return null and not show popup when feature not found and usePopup is false', () => {
      // Arrange
      sandbox.stub(featureService, 'getFeature').returns(null);
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');

      // Act
      const result = (handler as any).getFeatureOrShowError('nonexistent', false);

      // Assert
      assert.strictEqual(result, null);
      assert.ok(showErrorStub.notCalled);
    });

    test('should return null and show popup when feature not found and usePopup is true', () => {
      // Arrange
      sandbox.stub(featureService, 'getFeature').returns(null);
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');

      // Act
      const result = (handler as any).getFeatureOrShowError('nonexistent', true);

      // Assert
      assert.strictEqual(result, null);
      assert.ok(showErrorStub.calledOnce);
      assert.ok(showErrorStub.firstCall.args[0].includes('Feature "nonexistent" not found'));
    });

    test('should default to false for usePopup', () => {
      // Arrange
      sandbox.stub(featureService, 'getFeature').returns(null);
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');

      // Act
      const result = (handler as any).getFeatureOrShowError('nonexistent');

      // Assert
      assert.strictEqual(result, null);
      assert.ok(showErrorStub.notCalled);
    });
  });

  suite('addMessageToPanel', () => {
    test('should add message when feature exists', () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      const addMessageStub = sandbox.stub(messageService, 'addMessage');

      // Act
      (handler as any).addMessageToPanel('test-feature', 'Test message', 'info');

      // Assert
      assert.ok(addMessageStub.calledOnce);
      assert.strictEqual(addMessageStub.firstCall.args[0], '/path/to/worktree');
      assert.strictEqual(addMessageStub.firstCall.args[1], 'Test message');
      assert.strictEqual(addMessageStub.firstCall.args[2], 'info');
      assert.deepStrictEqual(addMessageStub.firstCall.args[3], { dismissible: true });
    });

    test('should not add message when feature does not exist', () => {
      // Arrange
      sandbox.stub(featureService, 'getFeature').returns(null);
      const addMessageStub = sandbox.stub(messageService, 'addMessage');

      // Act
      (handler as any).addMessageToPanel('nonexistent', 'Test message', 'info');

      // Assert
      assert.ok(addMessageStub.notCalled);
    });

    test('should support custom options', () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      const addMessageStub = sandbox.stub(messageService, 'addMessage');
      const options = {
        dismissible: false,
        actions: [{ label: 'Action', command: 'test', args: [] }]
      };

      // Act
      (handler as any).addMessageToPanel('test-feature', 'Test message', 'warning', options);

      // Assert
      assert.ok(addMessageStub.calledOnce);
      assert.strictEqual(addMessageStub.firstCall.args[3], options);
    });

    test('should support all message types', () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      const addMessageStub = sandbox.stub(messageService, 'addMessage');

      // Act & Assert
      ['info', 'success', 'warning', 'error'].forEach((type, index) => {
        (handler as any).addMessageToPanel('test-feature', `${type} message`, type);
        assert.strictEqual(addMessageStub.getCall(index).args[2], type);
      });
    });
  });

  suite('handleError', () => {
    test('should add error message to panel when feature exists', () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      const addMessageStub = sandbox.stub(messageService, 'addMessage');
      const error = new Error('Test error');

      // Act
      (handler as any).handleError(error, 'Test operation', 'test-feature');

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, message, type] = addMessageStub.firstCall.args;
      assert.ok(message.includes('Test operation failed'));
      assert.ok(message.includes('Test error'));
      assert.strictEqual(type, 'error');
    });

    test('should show popup when feature not found and fallbackToPopup is true', () => {
      // Arrange
      sandbox.stub(featureService, 'getFeature').returns(null);
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
      const error = new Error('Test error');

      // Act
      (handler as any).handleError(error, 'Test operation', 'nonexistent', true);

      // Assert
      assert.ok(showErrorStub.calledOnce);
      assert.ok(showErrorStub.firstCall.args[0].includes('Test operation failed'));
    });

    test('should not show popup when feature not found and fallbackToPopup is false', () => {
      // Arrange
      sandbox.stub(featureService, 'getFeature').returns(null);
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
      const error = new Error('Test error');

      // Act
      (handler as any).handleError(error, 'Test operation', 'nonexistent', false);

      // Assert
      assert.ok(showErrorStub.notCalled);
    });

    test('should default fallbackToPopup to true', () => {
      // Arrange
      sandbox.stub(featureService, 'getFeature').returns(null);
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
      const error = new Error('Test error');

      // Act
      (handler as any).handleError(error, 'Test operation', 'nonexistent');

      // Assert
      assert.ok(showErrorStub.calledOnce);
    });

    test('should handle non-Error objects', () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      const addMessageStub = sandbox.stub(messageService, 'addMessage');

      // Act
      (handler as any).handleError('String error', 'Test operation', 'test-feature');

      // Assert
      assert.ok(addMessageStub.calledOnce);
      const [, message] = addMessageStub.firstCall.args;
      assert.ok(message.includes('String error'));
    });

    test('should show popup when no feature name provided', () => {
      // Arrange
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
      const error = new Error('Test error');

      // Act
      (handler as any).handleError(error, 'Test operation');

      // Assert
      assert.ok(showErrorStub.calledOnce);
    });

    test('should not show popup when no feature name and fallbackToPopup is false', () => {
      // Arrange
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
      const error = new Error('Test error');

      // Act
      (handler as any).handleError(error, 'Test operation', undefined, false);

      // Assert
      assert.ok(showErrorStub.notCalled);
    });
  });
});
