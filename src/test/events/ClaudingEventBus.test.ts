import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ClaudingEventBus } from '../../events/ClaudingEventBus';
import { ClaudingEvent } from '../../events/types';

suite('ClaudingEventBus Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let eventBus: ClaudingEventBus;
  let mockLogger: vscode.LogOutputChannel;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = {
      info: sandbox.stub(),
      trace: sandbox.stub(),
      error: sandbox.stub()
    } as any;

    eventBus = new ClaudingEventBus(mockLogger);
  });

  teardown(() => {
    sandbox.restore();
    eventBus.dispose();
  });

  suite('Subscribe and Publish', () => {
    test('should publish and receive feature.created event', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribe('feature.created', handler);

      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(handler.calledOnce);
      assert.deepStrictEqual(handler.firstCall.args[0], event);
    });

    test('should publish and receive feature.updated event', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribe('feature.updated', handler);

      const event: ClaudingEvent = {
        type: 'feature.updated',
        featureName: 'test-feature',
        changes: { status: { type: 'needs-plan', message: 'Create plan' } },
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(handler.calledOnce);
      assert.deepStrictEqual(handler.firstCall.args[0], event);
    });

    test('should publish and receive feature.deleted event', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribe('feature.deleted', handler);

      const event: ClaudingEvent = {
        type: 'feature.deleted',
        featureName: 'test-feature',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(handler.calledOnce);
      assert.deepStrictEqual(handler.firstCall.args[0], event);
    });

    test('should publish and receive agent.started event', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribe('agent.started', handler);

      const event: ClaudingEvent = {
        type: 'agent.started',
        featureName: 'test-feature',
        sessionId: 'session-123',
        command: 'create-plan',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(handler.calledOnce);
      assert.deepStrictEqual(handler.firstCall.args[0], event);
    });

    test('should publish and receive agent.completed event', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribe('agent.completed', handler);

      const event: ClaudingEvent = {
        type: 'agent.completed',
        featureName: 'test-feature',
        sessionId: 'session-123',
        command: 'create-plan',
        outputFile: '/path/to/output.txt',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(handler.calledOnce);
      assert.deepStrictEqual(handler.firstCall.args[0], event);
    });

    test('should publish and receive file.changed event', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribe('file.changed', handler);

      const event: ClaudingEvent = {
        type: 'file.changed',
        featureName: 'test-feature',
        filePath: '/path/to/file.md',
        changeType: 'metadata',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(handler.calledOnce);
      assert.deepStrictEqual(handler.firstCall.args[0], event);
    });

    test('should publish and receive view.changed event', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribe('view.changed', handler);

      const event: ClaudingEvent = {
        type: 'view.changed',
        viewMode: 'active',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(handler.calledOnce);
      assert.deepStrictEqual(handler.firstCall.args[0], event);
    });
  });

  suite('Multiple Subscribers', () => {
    test('should notify all subscribers of same event type', () => {
      // Arrange
      const handler1 = sandbox.stub();
      const handler2 = sandbox.stub();
      const handler3 = sandbox.stub();

      eventBus.subscribe('feature.created', handler1);
      eventBus.subscribe('feature.created', handler2);
      eventBus.subscribe('feature.created', handler3);

      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(handler1.calledOnce);
      assert.ok(handler2.calledOnce);
      assert.ok(handler3.calledOnce);
    });

    test('should only notify subscribers of matching event type', () => {
      // Arrange
      const createdHandler = sandbox.stub();
      const updatedHandler = sandbox.stub();
      const deletedHandler = sandbox.stub();

      eventBus.subscribe('feature.created', createdHandler);
      eventBus.subscribe('feature.updated', updatedHandler);
      eventBus.subscribe('feature.deleted', deletedHandler);

      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(createdHandler.calledOnce);
      assert.ok(updatedHandler.notCalled);
      assert.ok(deletedHandler.notCalled);
    });
  });

  suite('Wildcard Subscription', () => {
    test('should receive all events with wildcard subscription', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribeAll(handler);

      const event1: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        timestamp: new Date()
      };
      const event2: ClaudingEvent = {
        type: 'feature.updated',
        featureName: 'feature2',
        changes: {},
        timestamp: new Date()
      };
      const event3: ClaudingEvent = {
        type: 'agent.started',
        featureName: 'feature3',
        sessionId: 'session-123',
        command: 'create-plan',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event1);
      eventBus.publish(event2);
      eventBus.publish(event3);

      // Assert
      assert.strictEqual(handler.callCount, 3);
      assert.deepStrictEqual(handler.getCall(0).args[0], event1);
      assert.deepStrictEqual(handler.getCall(1).args[0], event2);
      assert.deepStrictEqual(handler.getCall(2).args[0], event3);
    });

    test('should combine wildcard and specific subscriptions', () => {
      // Arrange
      const wildcardHandler = sandbox.stub();
      const specificHandler = sandbox.stub();

      eventBus.subscribeAll(wildcardHandler);
      eventBus.subscribe('feature.created', specificHandler);

      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(wildcardHandler.calledOnce);
      assert.ok(specificHandler.calledOnce);
    });
  });

  suite('Unsubscribe', () => {
    test('should unsubscribe handler', () => {
      // Arrange
      const handler = sandbox.stub();
      const disposable = eventBus.subscribe('feature.created', handler);

      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);
      assert.ok(handler.calledOnce);

      disposable.dispose();
      eventBus.publish(event);

      // Assert
      assert.ok(handler.calledOnce); // Still only called once
    });

    test('should unsubscribe one handler without affecting others', () => {
      // Arrange
      const handler1 = sandbox.stub();
      const handler2 = sandbox.stub();

      const disposable1 = eventBus.subscribe('feature.created', handler1);
      eventBus.subscribe('feature.created', handler2);

      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        timestamp: new Date()
      };

      // Act
      disposable1.dispose();
      eventBus.publish(event);

      // Assert
      assert.ok(handler1.notCalled);
      assert.ok(handler2.calledOnce);
    });

    test('should handle multiple disposes gracefully', () => {
      // Arrange
      const handler = sandbox.stub();
      const disposable = eventBus.subscribe('feature.created', handler);

      // Act & Assert
      assert.doesNotThrow(() => {
        disposable.dispose();
        disposable.dispose();
        disposable.dispose();
      });
    });
  });

  suite('Event Statistics', () => {
    test('should track published events', () => {
      // Arrange
      const event1: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        timestamp: new Date()
      };
      const event2: ClaudingEvent = {
        type: 'feature.updated',
        featureName: 'feature2',
        changes: {},
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event1);
      eventBus.publish(event2);
      const stats = eventBus.getStats();

      // Assert
      assert.strictEqual(stats.totalEvents, 2);
    });

    test('should track events by type', () => {
      // Arrange
      const event1: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        timestamp: new Date()
      };
      const event2: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'feature2',
        worktreePath: '/path/2',
        branchName: 'feature/feature2',
        timestamp: new Date()
      };
      const event3: ClaudingEvent = {
        type: 'feature.updated',
        featureName: 'feature3',
        changes: {},
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event1);
      eventBus.publish(event2);
      eventBus.publish(event3);
      const stats = eventBus.getStats();

      // Assert
      assert.strictEqual(stats.eventsByType.get('feature.created'), 2);
      assert.strictEqual(stats.eventsByType.get('feature.updated'), 1);
    });

    test('should track subscriber count', () => {
      // Arrange
      const handler1 = sandbox.stub();
      const handler2 = sandbox.stub();
      const handler3 = sandbox.stub();

      // Act
      eventBus.subscribe('feature.created', handler1);
      eventBus.subscribe('feature.created', handler2);
      eventBus.subscribe('feature.updated', handler3);
      const stats = eventBus.getStats();

      // Assert
      assert.strictEqual(stats.activeSubscribers, 3);
    });

    test('should reset metrics', () => {
      // Arrange
      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        timestamp: new Date()
      };

      eventBus.publish(event);
      assert.strictEqual(eventBus.getStats().totalEvents, 1);

      // Act
      eventBus.resetMetrics();
      const stats = eventBus.getStats();

      // Assert
      assert.strictEqual(stats.totalEvents, 0);
      assert.strictEqual(stats.eventsByType.size, 0);
    });
  });

  suite('Error Handling', () => {
    test('should handle handler errors gracefully', () => {
      // Arrange
      const errorHandler = sandbox.stub().throws(new Error('Handler error'));
      const goodHandler = sandbox.stub();

      eventBus.subscribe('feature.created', errorHandler);
      eventBus.subscribe('feature.created', goodHandler);

      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        timestamp: new Date()
      };

      // Act & Assert - should not throw
      assert.doesNotThrow(() => {
        eventBus.publish(event);
      });

      // Good handler should still be called
      assert.ok(goodHandler.calledOnce);
    });

    test('should continue publishing to remaining handlers after error', () => {
      // Arrange
      const handler1 = sandbox.stub();
      const errorHandler = sandbox.stub().throws(new Error('Handler error'));
      const handler2 = sandbox.stub();

      eventBus.subscribe('feature.created', handler1);
      eventBus.subscribe('feature.created', errorHandler);
      eventBus.subscribe('feature.created', handler2);

      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event);

      // Assert
      assert.ok(handler1.calledOnce);
      assert.ok(handler2.calledOnce);
    });
  });

  suite('Edge Cases', () => {
    test('should handle publishing when no subscribers', () => {
      // Arrange
      const event: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        timestamp: new Date()
      };

      // Act & Assert
      assert.doesNotThrow(() => {
        eventBus.publish(event);
      });
    });

    test('should handle rapid sequential publishes', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribe('feature.updated', handler);

      // Act
      for (let i = 0; i < 100; i++) {
        const event: ClaudingEvent = {
          type: 'feature.updated',
          featureName: `feature-${i}`,
          changes: {},
          timestamp: new Date()
        };
        eventBus.publish(event);
      }

      // Assert
      assert.strictEqual(handler.callCount, 100);
    });

    test('should handle subscribing during event handling', () => {
      // Arrange
      const handler2 = sandbox.stub();
      const handler1 = sandbox.stub().callsFake(() => {
        // Subscribe during handling
        eventBus.subscribe('feature.created', handler2);
      });

      eventBus.subscribe('feature.created', handler1);

      const event1: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        timestamp: new Date()
      };
      const event2: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'feature2',
        worktreePath: '/path/2',
        branchName: 'feature/feature2',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event1);
      eventBus.publish(event2);

      // Assert
      assert.strictEqual(handler1.callCount, 2);
      assert.strictEqual(handler2.callCount, 1); // Only called for second event
    });

    test('should handle unsubscribing during event handling', () => {
      // Arrange
      const disposableRef = { current: null as any };
      const handler = sandbox.stub().callsFake(() => {
        // Unsubscribe during handling
        if (disposableRef.current) {
          disposableRef.current.dispose();
        }
      });

      disposableRef.current = eventBus.subscribe('feature.created', handler);

      const event1: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        timestamp: new Date()
      };
      const event2: ClaudingEvent = {
        type: 'feature.created',
        featureName: 'feature2',
        worktreePath: '/path/2',
        branchName: 'feature/feature2',
        timestamp: new Date()
      };

      // Act
      eventBus.publish(event1);
      eventBus.publish(event2);

      // Assert
      assert.strictEqual(handler.callCount, 1); // Only called once before unsubscribing
    });

    test('should check if subscribers exist for event type', () => {
      // Arrange
      const handler = sandbox.stub();
      eventBus.subscribe('feature.created', handler);

      // Act & Assert
      assert.strictEqual(eventBus.hasSubscribers('feature.created'), true);
      assert.strictEqual(eventBus.hasSubscribers('feature.updated'), false);
    });

    test('should get subscriber count for event type', () => {
      // Arrange
      const handler1 = sandbox.stub();
      const handler2 = sandbox.stub();
      eventBus.subscribe('feature.created', handler1);
      eventBus.subscribe('feature.created', handler2);

      // Act & Assert
      assert.strictEqual(eventBus.getSubscriberCount('feature.created'), 2);
      assert.strictEqual(eventBus.getSubscriberCount('feature.updated'), 0);
    });
  });
});
