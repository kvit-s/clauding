import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FeatureStateManager } from '../../state/FeatureStateManager';
import { Feature } from '../../models/Feature';

suite('FeatureStateManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let stateManager: FeatureStateManager;
  let mockLogger: vscode.LogOutputChannel;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = {
      info: sandbox.stub(),
      trace: sandbox.stub(),
      error: sandbox.stub(),
      debug: sandbox.stub(),
      warn: sandbox.stub()
    } as any;
    stateManager = new FeatureStateManager(mockLogger);
  });

  teardown(() => {
    sandbox.restore();
    stateManager.dispose();
  });

  suite('CRUD Operations', () => {
    test('should create and retrieve a feature', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act
      stateManager.createFeature(feature);
      const retrieved = stateManager.getFeature('test-feature');

      // Assert
      assert.ok(retrieved !== null);
      assert.strictEqual(retrieved!.name, 'test-feature');
      assert.strictEqual(retrieved!.worktreePath, '/path/to/worktree');
    });

    test('should return null for non-existent feature', () => {
      // Act
      const feature = stateManager.getFeature('nonexistent');

      // Assert
      assert.strictEqual(feature, null);
    });

    test('should get all features', () => {
      // Arrange
      const feature1: Feature = {
        name: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      const feature2: Feature = {
        name: 'feature2',
        worktreePath: '/path/2',
        branchName: 'feature/feature2',
        status: { type: 'needs-plan', message: 'Create plan' },
        lifecycleStatus: 'plan'
      };

      // Act
      stateManager.createFeature(feature1);
      stateManager.createFeature(feature2);
      const features = stateManager.getAllFeatures();

      // Assert
      assert.strictEqual(features.length, 2);
      assert.ok(features.some(f => f.name === 'feature1'));
      assert.ok(features.some(f => f.name === 'feature2'));
    });

    test('should update feature', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      stateManager.createFeature(feature);

      // Act
      stateManager.updateFeature('test-feature', {
        status: { type: 'needs-plan', message: 'Create plan' },
        lifecycleStatus: 'plan'
      });
      const updated = stateManager.getFeature('test-feature');

      // Assert
      assert.ok(updated !== null);
      assert.strictEqual(updated!.status.type, 'needs-plan');
      assert.strictEqual(updated!.status.message, 'Create plan');
    });

    test('should delete feature', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      stateManager.createFeature(feature);

      // Act
      stateManager.deleteFeature('test-feature');
      const deleted = stateManager.getFeature('test-feature');

      // Assert
      assert.strictEqual(deleted, null);
    });

    test('should not throw when deleting non-existent feature', () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        stateManager.deleteFeature('nonexistent');
      });
    });

    test('should not throw when updating non-existent feature', () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        stateManager.updateFeature('nonexistent', {
          status: { type: 'needs-plan', message: 'Create plan' },
        lifecycleStatus: 'plan'
        });
      });
    });
  });

  suite('Event Emission', () => {
    test('should emit create event when feature is created', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      const handler = sandbox.stub();
      stateManager.onStateChanged(handler);

      // Act
      stateManager.createFeature(feature);

      // Assert
      assert.ok(handler.calledOnce);
      const event = handler.firstCall.args[0];
      assert.strictEqual(event.type, 'create');
      assert.strictEqual(event.featureName, 'test-feature');
    });

    test('should emit update event when feature is updated', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      stateManager.createFeature(feature);

      const handler = sandbox.stub();
      stateManager.onStateChanged(handler);

      // Act
      stateManager.updateFeature('test-feature', {
        status: { type: 'needs-plan', message: 'Create plan' },
        lifecycleStatus: 'plan'
      });

      // Assert
      assert.ok(handler.calledOnce);
      const event = handler.firstCall.args[0];
      assert.strictEqual(event.type, 'update');
      assert.strictEqual(event.featureName, 'test-feature');
      assert.ok(event.changes);
      assert.strictEqual(event.changes!.status!.type, 'needs-plan');
    });

    test('should emit delete event when feature is deleted', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      stateManager.createFeature(feature);

      const handler = sandbox.stub();
      stateManager.onStateChanged(handler);

      // Act
      stateManager.deleteFeature('test-feature');

      // Assert
      assert.ok(handler.calledOnce);
      const event = handler.firstCall.args[0];
      assert.strictEqual(event.type, 'delete');
      assert.strictEqual(event.featureName, 'test-feature');
    });

    test('should emit invalidate event', () => {
      // Arrange
      const handler = sandbox.stub();
      stateManager.onStateChanged(handler);

      // Act
      stateManager.invalidate('test-feature');

      // Assert
      assert.ok(handler.calledOnce);
      const event = handler.firstCall.args[0];
      assert.strictEqual(event.type, 'invalidate');
      assert.strictEqual(event.featureName, 'test-feature');
    });

    test('should emit invalidate-all event', () => {
      // Arrange
      const handler = sandbox.stub();
      stateManager.onStateChanged(handler);

      // Act
      stateManager.invalidateAll();

      // Assert
      assert.ok(handler.calledOnce);
      const event = handler.firstCall.args[0];
      assert.strictEqual(event.type, 'invalidate-all');
    });

    test('should support multiple subscribers', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      const handler1 = sandbox.stub();
      const handler2 = sandbox.stub();
      stateManager.onStateChanged(handler1);
      stateManager.onStateChanged(handler2);

      // Act
      stateManager.createFeature(feature);

      // Assert
      assert.ok(handler1.calledOnce);
      assert.ok(handler2.calledOnce);
    });

    test('should allow unsubscribing', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      const handler = sandbox.stub();
      const disposable = stateManager.onStateChanged(handler);

      // Act
      disposable.dispose();
      stateManager.createFeature(feature);

      // Assert
      assert.ok(handler.notCalled);
    });
  });

  suite('Invalidation', () => {
    test('should clear feature from cache on invalidate', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      stateManager.createFeature(feature);

      // Act
      stateManager.invalidate('test-feature');
      const retrieved = stateManager.getFeature('test-feature');

      // Assert
      assert.strictEqual(retrieved, null);
    });

    test('should clear all features on invalidateAll', () => {
      // Arrange
      const feature1: Feature = {
        name: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      const feature2: Feature = {
        name: 'feature2',
        worktreePath: '/path/2',
        branchName: 'feature/feature2',
        status: { type: 'needs-plan', message: 'Create plan' },
        lifecycleStatus: 'plan'
      };
      stateManager.createFeature(feature1);
      stateManager.createFeature(feature2);

      // Act
      stateManager.invalidateAll();
      const features = stateManager.getAllFeatures();

      // Assert
      assert.strictEqual(features.length, 0);
    });
  });

  suite('Feature Count', () => {
    test('should track feature count', () => {
      // Arrange
      const feature1: Feature = {
        name: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      const feature2: Feature = {
        name: 'feature2',
        worktreePath: '/path/2',
        branchName: 'feature/feature2',
        status: { type: 'needs-plan', message: 'Create plan' },
        lifecycleStatus: 'plan'
      };
      stateManager.createFeature(feature1);
      stateManager.createFeature(feature2);

      // Act
      const features = stateManager.getAllFeatures();

      // Assert
      assert.strictEqual(features.length, 2);
    });

    test('should return empty array when no features', () => {
      // Act
      const features = stateManager.getAllFeatures();

      // Assert
      assert.strictEqual(features.length, 0);
    });
  });

  suite('Edge Cases', () => {
    test('should handle creating feature with same name twice', () => {
      // Arrange
      const feature1: Feature = {
        name: 'test-feature',
        worktreePath: '/path/1',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      const feature2: Feature = {
        name: 'test-feature',
        worktreePath: '/path/2',
        branchName: 'feature/test-feature',
        status: { type: 'needs-plan', message: 'Create plan' },
        lifecycleStatus: 'plan'
      };

      // Act
      stateManager.createFeature(feature1);
      stateManager.createFeature(feature2); // Should overwrite

      const retrieved = stateManager.getFeature('test-feature');

      // Assert
      assert.ok(retrieved !== null);
      assert.strictEqual(retrieved!.worktreePath, '/path/2');
      assert.strictEqual(retrieved!.status.type, 'needs-plan');
    });

    test('should handle updating with empty changes object', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      stateManager.createFeature(feature);

      // Act & Assert
      assert.doesNotThrow(() => {
        stateManager.updateFeature('test-feature', {});
      });
    });

    test('should handle rapid consecutive updates', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      stateManager.createFeature(feature);

      const handler = sandbox.stub();
      stateManager.onStateChanged(handler);

      // Act
      for (let i = 0; i < 10; i++) {
        stateManager.updateFeature('test-feature', {
          status: { type: 'needs-plan', message: `Update ${i}` }
        });
      }

      // Assert
      assert.strictEqual(handler.callCount, 10);
    });

    test('should handle feature names with special characters', () => {
      // Arrange
      const feature: Feature = {
        name: 'feature-with-dashes_and_underscores',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act
      stateManager.createFeature(feature);
      const retrieved = stateManager.getFeature('feature-with-dashes_and_underscores');

      // Assert
      assert.ok(retrieved !== null);
      assert.strictEqual(retrieved!.name, 'feature-with-dashes_and_underscores');
    });
  });
});
