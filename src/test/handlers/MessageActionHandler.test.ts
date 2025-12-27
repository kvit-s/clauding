import * as assert from 'assert';
import * as sinon from 'sinon';
import { MessageActionHandler } from '../../providers/sidebar/handlers/MessageActionHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';

suite('MessageActionHandler Test Suite', () => {
  let handler: MessageActionHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let commandHandlers: {
    executeAgentCommand?: sinon.SinonStub;
    runTests?: sinon.SinonStub;
    merge?: sinon.SinonStub;
    saveTestResults?: sinon.SinonStub;
  };
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    featureService = {} as FeatureService;
    messageService = {} as MessageService;
    commandHandlers = {
      executeAgentCommand: sandbox.stub(),
      runTests: sandbox.stub(),
      merge: sandbox.stub(),
      saveTestResults: sandbox.stub()
    };

    handler = new MessageActionHandler(
      featureService,
      messageService,
      commandHandlers
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should execute agent command', async () => {
      // Arrange
      const message = {
        command: 'messageAction' as const,
        featureName: 'test-feature',
        action: { command: 'executeAgentCommand', args: ['myCommand'] }
      };

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(commandHandlers.executeAgentCommand?.calledOnceWith('test-feature', 'myCommand'));
    });

    test('should execute runTests command', async () => {
      // Arrange
      const message = {
        command: 'messageAction' as const,
        featureName: 'test-feature',
        action: { command: 'runTests' }
      };

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(commandHandlers.runTests?.calledOnceWith('test-feature'));
    });

    test('should execute merge command', async () => {
      // Arrange
      const message = {
        command: 'messageAction' as const,
        featureName: 'test-feature',
        action: { command: 'merge' }
      };

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(commandHandlers.merge?.calledOnceWith('test-feature'));
    });

    test('should execute saveTestResults command', async () => {
      // Arrange
      const message = {
        command: 'messageAction' as const,
        featureName: 'test-feature',
        action: { command: 'saveTestResults' }
      };

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(commandHandlers.saveTestResults?.calledOnceWith('test-feature'));
    });

    test('should handle unknown command', async () => {
      // Arrange
      const message = {
        command: 'messageAction' as const,
        featureName: 'test-feature',
        action: { command: 'unknownCommand' }
      };

      // Act
      await handler.handle(message);

      // Assert
      // The console.warn is called for unknown commands
      // Just verify no command handlers were called
      assert.ok(commandHandlers.executeAgentCommand?.notCalled);
      assert.ok(commandHandlers.runTests?.notCalled);
      assert.ok(commandHandlers.merge?.notCalled);
      assert.ok(commandHandlers.saveTestResults?.notCalled);
    });

    test('should handle executeAgentCommand without args', async () => {
      // Arrange
      const message = {
        command: 'messageAction' as const,
        featureName: 'test-feature',
        action: { command: 'executeAgentCommand' }
      };

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(commandHandlers.executeAgentCommand?.notCalled);
    });

    test('should handle command execution errors', async () => {
      // Arrange
      const message = {
        command: 'messageAction' as const,
        featureName: 'test-feature',
        action: { command: 'runTests' }
      };
      const error = new Error('Command failed');
      commandHandlers.runTests?.rejects(error);

      // Act
      await handler.handle(message);

      // Assert
      // The error is logged but we just verify the handler attempted to call runTests
      assert.ok(commandHandlers.runTests?.calledOnce);
    });

    test('should work with missing command handlers', async () => {
      // Arrange
      const handlerWithoutCommands = new MessageActionHandler(
        featureService,
        messageService,
        {}
      );
      const message = {
        command: 'messageAction' as const,
        featureName: 'test-feature',
        action: { command: 'runTests' }
      };

      // Act - should not throw
      await handlerWithoutCommands.handle(message);

      // Assert - no error thrown
    });
  });
});
