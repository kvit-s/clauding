import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { UIUpdateCoordinator } from '../../ui/UIUpdateCoordinator';
import { FeatureStateManager } from '../../state/FeatureStateManager';
import { WebviewUpdater } from '../../providers/sidebar/WebviewUpdater';
import { Feature } from '../../models/Feature';

suite('UIUpdateCoordinator Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let stateManager: FeatureStateManager;
  let webviewUpdater: WebviewUpdater;
  let webview: vscode.Webview;
  let mockLogger: vscode.LogOutputChannel;
  let coordinator: UIUpdateCoordinator;
  let clock: sinon.SinonFakeTimers;

  setup(() => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers();

    const stateLogger = {
      info: sandbox.stub(),
      trace: sandbox.stub(),
      error: sandbox.stub(),
      debug: sandbox.stub(),
      warn: sandbox.stub()
    } as any;
    stateManager = new FeatureStateManager(stateLogger);
    webviewUpdater = {
      sendUpdate: sandbox.stub().resolves()
    } as any;
    webview = {} as vscode.Webview;
    mockLogger = {
      info: sandbox.stub(),
      trace: sandbox.stub(),
      error: sandbox.stub(),
      debug: sandbox.stub(),
      warn: sandbox.stub()
    } as any;

    coordinator = new UIUpdateCoordinator(stateManager, webviewUpdater, webview, mockLogger);
  });

  teardown(() => {
    sandbox.restore();
    coordinator.dispose();
    stateManager.dispose();
  });

  suite('Agent Idle Events', () => {
    test('should send file tree refresh on agent idle', () => {
      // Arrange
      const emitter = new vscode.EventEmitter<string>();
      const mockAgentStatusTracker = { onAgentIdle: emitter.event } as any;
      const sendFileTreeRefreshStub = sandbox.stub();
      const webviewUpdaterWithRefresh = {
        sendUpdate: sandbox.stub().resolves(),
        sendFileTreeRefresh: sendFileTreeRefreshStub
      } as any;
      const coordinatorWithAgent = new UIUpdateCoordinator(
        stateManager,
        webviewUpdaterWithRefresh,
        webview,
        mockLogger,
        mockAgentStatusTracker
      );

      // Act
      const feature = 'test-feature';
      emitter.fire(feature);

      // Assert
      sinon.assert.calledOnceWithExactly(sendFileTreeRefreshStub, webview, feature);
      coordinatorWithAgent.dispose();
    });
  });

  suite('State Change Subscription', () => {
    test('should schedule update when feature is created', () => {
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
      clock.tick(150); // Wait for debounce

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should schedule update when feature is updated', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      stateManager.createFeature(feature);
      clock.tick(150); // Clear initial update

      (webviewUpdater.sendUpdate as sinon.SinonStub).resetHistory();

      // Act
      stateManager.updateFeature('test-feature', {
        status: { type: 'needs-plan', message: 'Create plan' }
      });
      clock.tick(150);

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should schedule update when feature is deleted', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      stateManager.createFeature(feature);
      clock.tick(150); // Clear initial update

      (webviewUpdater.sendUpdate as sinon.SinonStub).resetHistory();

      // Act
      stateManager.deleteFeature('test-feature');
      clock.tick(150);

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should schedule update when state is invalidated', () => {
      // Act
      stateManager.invalidate('test-feature');
      clock.tick(150);

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should schedule update when all state is invalidated', () => {
      // Act
      stateManager.invalidateAll();
      clock.tick(150);

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });
  });

  suite('Debouncing', () => {
    test('should debounce rapid updates', () => {
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
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      const feature3: Feature = {
        name: 'feature3',
        worktreePath: '/path/3',
        branchName: 'feature/feature3',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act
      stateManager.createFeature(feature1);
      clock.tick(50);
      stateManager.createFeature(feature2);
      clock.tick(50);
      stateManager.createFeature(feature3);
      clock.tick(150);

      // Assert - Should only call once after debounce period
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should reset debounce timer on new event', () => {
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
      clock.tick(90); // Almost at debounce threshold

      stateManager.updateFeature('test-feature', {
        status: { type: 'needs-plan', message: 'Create plan' }
      });
      clock.tick(90); // Reset timer

      // Assert - Should not have called yet
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).notCalled);

      // Complete debounce
      clock.tick(20);
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should allow separate updates after debounce completes', () => {
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
      clock.tick(150);

      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);

      // Second update
      stateManager.updateFeature('test-feature', {
        status: { type: 'needs-plan', message: 'Create plan' }
      });
      clock.tick(150);

      // Assert
      assert.strictEqual((webviewUpdater.sendUpdate as sinon.SinonStub).callCount, 2);
    });
  });

  suite('Manual Scheduling', () => {
    test('should schedule update for specific feature', () => {
      // Act
      coordinator.scheduleUpdate('test-feature');
      clock.tick(150);

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should schedule full refresh when no feature specified', () => {
      // Act
      coordinator.scheduleUpdate();
      clock.tick(150);

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should debounce manual updates', () => {
      // Act
      coordinator.scheduleUpdate('feature1');
      clock.tick(50);
      coordinator.scheduleUpdate('feature2');
      clock.tick(50);
      coordinator.scheduleUpdate('feature3');
      clock.tick(150);

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should trigger immediate update with forceUpdate', () => {
      // Act
      coordinator.scheduleUpdate('test-feature');
      coordinator.forceUpdate();

      // Assert - Should be called immediately without waiting for debounce
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });
  });

  suite('Update Queue Management', () => {
    test('should track pending updates', () => {
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
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act
      stateManager.createFeature(feature1);
      stateManager.createFeature(feature2);
      const metrics = coordinator.getMetrics();

      // Assert
      assert.strictEqual(metrics.pendingUpdates, 2);
    });

    test('should clear queue after update', async () => {
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
      await clock.tickAsync(150);

      const metrics = coordinator.getMetrics();

      // Assert
      assert.strictEqual(metrics.pendingUpdates, 0);
    });

    test('should handle full refresh flag', () => {
      // Arrange
      const feature1: Feature = {
        name: 'feature1',
        worktreePath: '/path/1',
        branchName: 'feature/feature1',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act
      stateManager.createFeature(feature1);
      coordinator.scheduleUpdate(); // Full refresh

      const metrics = coordinator.getMetrics();

      // Assert - Full refresh clears specific feature queue
      assert.strictEqual(metrics.pendingUpdates, 0);
      assert.strictEqual(metrics.fullRefreshPending, true);
    });
  });

  suite('Metrics', () => {
    test('should track total updates', async () => {
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
      await clock.tickAsync(150);

      stateManager.updateFeature('test-feature', {
        status: { type: 'needs-plan', message: 'Create plan' }
      });
      await clock.tickAsync(150);

      const metrics = coordinator.getMetrics();

      // Assert
      assert.strictEqual(metrics.totalUpdates, 2);
    });

    test('should track coalesced updates', () => {
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
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };
      const feature3: Feature = {
        name: 'feature3',
        worktreePath: '/path/3',
        branchName: 'feature/feature3',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act - Create 3 features rapidly
      stateManager.createFeature(feature1);
      stateManager.createFeature(feature2);
      stateManager.createFeature(feature3);
      clock.tick(150);

      const metrics = coordinator.getMetrics();

      // Assert - 3 events coalesced into 1 update
      assert.strictEqual(metrics.coalescedUpdates, 2); // 3 - 1 = 2 saved
    });

    test('should track coalescing rate', async () => {
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
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act
      // Create 2 features rapidly - they should be coalesced into 1 update
      stateManager.createFeature(feature1);
      stateManager.createFeature(feature2);
      await clock.tickAsync(150);

      const metrics = coordinator.getMetrics();

      // Assert - 2 state changes, 1 update = 1 coalesced, rate = 1/(1+1) = 0.5
      assert.strictEqual(metrics.totalUpdates, 1);
      assert.strictEqual(metrics.coalescedUpdates, 1);
      assert.strictEqual(metrics.coalescingRate, 0.5);
    });
  });

  suite('Edge Cases', () => {
    test('should handle updates with null webviewUpdater', () => {
      // Arrange
      const coordinatorWithoutUpdater = new UIUpdateCoordinator(
        stateManager,
        null as any,
        webview,
        mockLogger
      );
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act & Assert - Should not throw
      assert.doesNotThrow(() => {
        stateManager.createFeature(feature);
        clock.tick(150);
      });

      coordinatorWithoutUpdater.dispose();
    });

    test('should handle rapid disposal and creation', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act
      coordinator.dispose();
      coordinator = new UIUpdateCoordinator(stateManager, webviewUpdater, webview, mockLogger);

      stateManager.createFeature(feature);
      clock.tick(150);

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).calledOnce);
    });

    test('should not update after disposal', () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      // Act
      coordinator.dispose();
      stateManager.createFeature(feature);
      clock.tick(150);

      // Assert
      assert.ok((webviewUpdater.sendUpdate as sinon.SinonStub).notCalled);
    });

    test('should reset metrics', async () => {
      // Arrange
      const feature: Feature = {
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' },
        lifecycleStatus: 'pre-plan'
      };

      stateManager.createFeature(feature);
      await clock.tickAsync(150);
      assert.strictEqual(coordinator.getMetrics().totalUpdates, 1);

      // Act
      coordinator.resetMetrics();
      const metrics = coordinator.getMetrics();

      // Assert
      assert.strictEqual(metrics.totalUpdates, 0);
      assert.strictEqual(metrics.coalescedUpdates, 0);
      assert.strictEqual(metrics.lastUpdateTime, undefined);
    });
  });
});
