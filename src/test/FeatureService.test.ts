import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import * as vscode from 'vscode';
import { FeatureService } from '../services/FeatureService';
import { WorktreeService } from '../services/WorktreeService';
import { GitService } from '../services/GitService';
import { FeatureStateManager } from '../state/FeatureStateManager';

suite('FeatureService Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let featureService: FeatureService;
  let stateManager: FeatureStateManager;
  let mockLogger: vscode.LogOutputChannel;
  let mockWorktreeService: sinon.SinonStubbedInstance<WorktreeService>;
  let mockGitService: sinon.SinonStubbedInstance<GitService>;
  let existsSyncStub: sinon.SinonStub;
  let readFileSyncStub: sinon.SinonStub;
  let writeFileSyncStub: sinon.SinonStub;
  let mkdirSyncStub: sinon.SinonStub;
  let statSyncStub: sinon.SinonStub;
  let readdirSyncStub: sinon.SinonStub;
  let unlinkSyncStub: sinon.SinonStub;
  const testWorktreesDir = '/mock/project/.clauding/worktrees';
  const commitMessagePrefix = 'feat';

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create mock logger
    mockLogger = {
      info: sandbox.stub(),
      trace: sandbox.stub(),
      error: sandbox.stub(),
      debug: sandbox.stub(),
      warn: sandbox.stub()
    } as any;

    // Create stub functions for fs operations (not attached to fs module)
    existsSyncStub = sinon.stub();
    existsSyncStub.returns(false); // Default: features don't exist

    readFileSyncStub = sinon.stub();
    readFileSyncStub.returns('');

    writeFileSyncStub = sinon.stub();

    mkdirSyncStub = sinon.stub();

    statSyncStub = sinon.stub();
    statSyncStub.returns({ isDirectory: () => true } as any);

    readdirSyncStub = sinon.stub();
    readdirSyncStub.returns([]);

    unlinkSyncStub = sinon.stub();

    // Mock WorktreeService
    mockWorktreeService = {
      createWorktree: sandbox.stub().resolves('/mock/worktree/path'),
      removeWorktree: sandbox.stub().resolves(),
      getWorktreePath: sandbox.stub().callsFake((name: string) => path.join(testWorktreesDir, name)),
      worktreeExists: sandbox.stub().returns(false)
    } as any;

    // Mock GitService
    mockGitService = {
      stageAndCommit: sandbox.stub().resolves('abc1234'),
      branchExists: sandbox.stub().resolves(false)
    } as any;

    // Initialize state manager
    stateManager = new FeatureStateManager(mockLogger);

    featureService = new FeatureService(testWorktreesDir, 'main', 'feature/', {
      existsSync: existsSyncStub,
      readFileSync: readFileSyncStub,
      writeFileSync: writeFileSyncStub,
      mkdirSync: mkdirSyncStub,
      statSync: statSyncStub,
      readdirSync: readdirSyncStub,
      unlinkSync: unlinkSyncStub
    } as any);

    // Set state manager on feature service
    featureService.setStateManager(stateManager);
  });

  teardown(() => {
    sandbox.restore();
    stateManager.dispose();
  });

  test('should return empty array when no features exist', () => {
    // Mock empty directory
    existsSyncStub.withArgs(testWorktreesDir).returns(true);
    readdirSyncStub.withArgs(testWorktreesDir, sinon.match.any).returns([] as any);

    const features = featureService.getFeatures();
    assert.strictEqual(features.length, 0);
  });

  test('should get all features from worktrees directory', () => {
    // Mock directory with two features
    existsSyncStub.withArgs(testWorktreesDir).returns(true);
    readdirSyncStub.withArgs(testWorktreesDir, sinon.match.any).returns([
      { name: 'feature1', isDirectory: () => true } as any,
      { name: 'feature2', isDirectory: () => true } as any
    ]);

    existsSyncStub.withArgs(path.join(testWorktreesDir, 'feature1')).returns(true);
    existsSyncStub.withArgs(path.join(testWorktreesDir, 'feature2')).returns(true);
    statSyncStub.withArgs(path.join(testWorktreesDir, 'feature1')).returns({ isDirectory: () => true } as any);
    statSyncStub.withArgs(path.join(testWorktreesDir, 'feature2')).returns({ isDirectory: () => true } as any);

    const features = featureService.getFeatures();

    assert.strictEqual(features.length, 2);
    assert.ok(features.some(f => f.name === 'feature1'));
    assert.ok(features.some(f => f.name === 'feature2'));
  });

  test('should get a specific feature by name', () => {
    const featureName = 'auth';
    const worktreePath = path.join(testWorktreesDir, featureName);

    existsSyncStub.withArgs(worktreePath).returns(true);
    statSyncStub.withArgs(worktreePath).returns({ isDirectory: () => true } as any);

    const feature = featureService.getFeature(featureName);

    assert.ok(feature !== null);
    assert.strictEqual(feature!.name, featureName);
    assert.strictEqual(feature!.branchName, 'feature/auth');
    assert.strictEqual(feature!.worktreePath, worktreePath);
  });

  test('should return null for non-existent feature', () => {
    existsSyncStub.returns(false);

    const feature = featureService.getFeature('nonexistent');
    assert.strictEqual(feature, null);
  });

  test('should create feature with all required files', async () => {
    const featureName = 'new-feature';
    const worktreePath = path.join(testWorktreesDir, featureName);

    mockWorktreeService.createWorktree.withArgs(featureName).resolves(worktreePath);
    mockWorktreeService.getWorktreePath.withArgs(featureName).returns(worktreePath);

    // Mock that worktree path doesn't exist initially, then exists after creation
    existsSyncStub.withArgs(worktreePath).onFirstCall().returns(false).returns(true);

    const feature = await featureService.createFeature(
      featureName,
      mockWorktreeService as any,
      mockGitService as any,
      commitMessagePrefix
    );

    assert.strictEqual(feature.name, featureName);

    // Verify files were created
    const promptPath = path.join(worktreePath, '.clauding', 'prompt.md');
    const timelogPath = path.join(worktreePath, '.clauding', 'timelog.json');

    assert.ok(writeFileSyncStub.calledWith(promptPath, ''));
    assert.ok(writeFileSyncStub.calledWith(timelogPath, sinon.match.string));
  });

  test('should create empty prompt.md file', async () => {
    const featureName = 'empty-prompt';
    const worktreePath = path.join(testWorktreesDir, featureName);

    mockWorktreeService.createWorktree.withArgs(featureName).resolves(worktreePath);
    mockWorktreeService.getWorktreePath.withArgs(featureName).returns(worktreePath);

    await featureService.createFeature(featureName, mockWorktreeService as any, mockGitService as any, commitMessagePrefix);

    const promptPath = path.join(worktreePath, '.clauding', 'prompt.md');
    assert.ok(writeFileSyncStub.calledWith(promptPath, ''));
  });

  test('should create timelog with initial entry', async () => {
    const featureName = 'timelog-test';
    const worktreePath = path.join(testWorktreesDir, featureName);

    mockWorktreeService.createWorktree.withArgs(featureName).resolves(worktreePath);
    mockWorktreeService.getWorktreePath.withArgs(featureName).returns(worktreePath);
    mockGitService.stageAndCommit.resolves('abc1234');

    // Mock that worktree path doesn't exist initially, then exists after creation
    existsSyncStub.withArgs(worktreePath).onFirstCall().returns(false).returns(true);

    await featureService.createFeature(featureName, mockWorktreeService as any, mockGitService as any, commitMessagePrefix);

    const timelogPath = path.join(worktreePath, '.clauding', 'timelog.json');

    // Find the LAST call to writeFileSync for timelog (after commit hash is added)
    const timelogCalls = writeFileSyncStub.getCalls().filter(call => call.args[0] === timelogPath);
    assert.ok(timelogCalls.length > 0, 'Timelog should be written');

    const lastTimelogCall = timelogCalls[timelogCalls.length - 1];
    const content = JSON.parse(lastTimelogCall.args[1] as string);
    assert.ok(content.entries);
    assert.strictEqual(content.entries.length, 1);
    assert.strictEqual(content.entries[0].action, 'Feature Created');
    assert.strictEqual(content.entries[0].result, 'Success');
    assert.ok(content.entries[0].timestamp);
    assert.ok(content.entries[0].details);
    assert.strictEqual(content.entries[0].details.commitHash, 'abc1234');
    assert.strictEqual(content.entries[0].details.file, 'prompt.md');
  });

  test('should throw error when creating duplicate feature', async () => {
    const featureName = 'duplicate';

    // First call succeeds
    const worktreePath = path.join(testWorktreesDir, featureName);
    mockWorktreeService.createWorktree.withArgs(featureName).resolves(worktreePath);
    mockWorktreeService.getWorktreePath.withArgs(featureName).returns(worktreePath);

    await featureService.createFeature(featureName, mockWorktreeService as any, mockGitService as any, commitMessagePrefix);

    // Second call should fail
    mockWorktreeService.worktreeExists.withArgs(featureName).returns(true);
    existsSyncStub.withArgs(worktreePath).returns(true);

    await assert.rejects(
      async () => await featureService.createFeature(featureName, mockWorktreeService as any, mockGitService as any, commitMessagePrefix),
      /Active feature "duplicate" already exists/
    );
  });

  test('should throw error when git branch already exists', async () => {
    const featureName = 'existing-branch';
    const branchName = 'feature/existing-branch';

    // Mock that branch exists
    mockGitService.branchExists.withArgs(sinon.match.any, branchName).resolves(true);

    await assert.rejects(
      async () => await featureService.createFeature(featureName, mockWorktreeService as any, mockGitService as any, commitMessagePrefix),
      /Git branch "feature\/existing-branch" already exists/
    );

    // Verify branchExists was called
    assert.ok(mockGitService.branchExists.called);
  });

  // Removed: Test was for a validation that no longer exists in the code
  // The code only checks for active features and git branches, not for existing folders

  test('should throw error when both branch and folder exist', async () => {
    const featureName = 'both-exist';
    const branchName = 'feature/both-exist';
    // Match the path calculation in FeatureService.createFeature
    const projectRoot = path.dirname(path.dirname(testWorktreesDir));
    const featureMetaDir = path.join(projectRoot, '.clauding');

    // Mock that both exist - branch check comes first
    mockGitService.branchExists.withArgs(sinon.match.any, branchName).resolves(true);
    existsSyncStub.withArgs(featureMetaDir).returns(true);

    // Should fail on branch check first
    await assert.rejects(
      async () => await featureService.createFeature(featureName, mockWorktreeService as any, mockGitService as any, commitMessagePrefix),
      /Git branch "feature\/both-exist" already exists/
    );
  });

  test('should succeed when neither branch nor folder exists', async () => {
    const featureName = 'fresh-feature';
    const worktreePath = path.join(testWorktreesDir, featureName);
    const projectRoot = path.dirname(testWorktreesDir);
    const featureMetaDir = path.join(projectRoot, '.clauding');

    // Mock that neither exists
    mockGitService.branchExists.resolves(false);
    existsSyncStub.withArgs(featureMetaDir).returns(false);
    mockWorktreeService.createWorktree.withArgs(featureName).resolves(worktreePath);
    mockWorktreeService.getWorktreePath.withArgs(featureName).returns(worktreePath);

    // Mock that worktree path doesn't exist initially, then exists after creation
    existsSyncStub.withArgs(worktreePath).onFirstCall().returns(false).returns(true);

    const feature = await featureService.createFeature(
      featureName,
      mockWorktreeService as any,
      mockGitService as any,
      commitMessagePrefix
    );

    assert.strictEqual(feature.name, featureName);
    assert.ok(mockGitService.branchExists.called);
  });

  test('should determine status as just-created for empty prompt', async () => {
    const featureName = 'just-created';
    const worktreePath = path.join(testWorktreesDir, featureName);

    mockWorktreeService.createWorktree.withArgs(featureName).resolves(worktreePath);
    mockWorktreeService.getWorktreePath.withArgs(featureName).returns(worktreePath);

    // Mock that worktree path doesn't exist initially, then exists after creation
    existsSyncStub.withArgs(worktreePath).onFirstCall().returns(false).returns(true);

    const feature = await featureService.createFeature(
      featureName,
      mockWorktreeService as any,
      mockGitService as any,
      commitMessagePrefix
    );

    assert.strictEqual(feature.status.type, 'just-created');
    assert.ok(feature.status.message.includes('Edit feature prompt'));
  });

  test('should determine status as needs-plan for non-empty prompt without plan', () => {
    const featureName = 'needs-plan';
    const worktreePath = path.join(testWorktreesDir, featureName);
    const promptPath = path.join(worktreePath, '.clauding', 'prompt.md');
    const planPath = path.join(worktreePath, '.clauding', 'plan.md');

    existsSyncStub.withArgs(worktreePath).returns(true);
    existsSyncStub.withArgs(promptPath).returns(true);
    existsSyncStub.withArgs(planPath).returns(false);
    readFileSyncStub.withArgs(promptPath, 'utf-8').returns('Add authentication feature');
    statSyncStub.withArgs(worktreePath).returns({ isDirectory: () => true } as any);

    const feature = featureService.getFeature(featureName);

    assert.ok(feature !== null);
    assert.strictEqual(feature!.status.type, 'needs-plan');
    assert.ok(feature!.status.message.includes('Create Plan'));
  });

  test('should determine status as plan-created when plan exists', () => {
    const featureName = 'has-plan';
    const worktreePath = path.join(testWorktreesDir, featureName);
    const promptPath = path.join(worktreePath, '.clauding', 'prompt.md');
    const planPath = path.join(worktreePath, '.clauding', 'plan.md');

    existsSyncStub.withArgs(worktreePath).returns(true);
    existsSyncStub.withArgs(promptPath).returns(true);
    existsSyncStub.withArgs(planPath).returns(true);
    readFileSyncStub.withArgs(promptPath, 'utf-8').returns('Add dark mode');
    readFileSyncStub.withArgs(planPath, 'utf-8').returns('# Plan\n\n1. Add CSS variables');
    statSyncStub.withArgs(worktreePath).returns({ isDirectory: () => true } as any);

    const feature = featureService.getFeature(featureName);

    assert.ok(feature !== null);
    assert.strictEqual(feature!.status.type, 'plan-created');
    assert.ok(feature!.status.message.includes('Review plan'));
  });

  suite('Edge Cases', () => {
    test('should handle feature creation failure due to worktree error', async () => {
      const mockFailingWorktreeService = {
        createWorktree: sandbox.stub().rejects(new Error('ENOENT: no such file or directory'))
      } as any;

      await assert.rejects(
        async () => await featureService.createFeature('test-feature', mockFailingWorktreeService, mockGitService as any, commitMessagePrefix),
        /ENOENT|no such file or directory/i
      );
    });

    test('should handle invalid feature names with special characters', async () => {
      const invalidNames = ['feature/name', 'feature\\name', 'feature:name', 'feature*name'];

      for (const name of invalidNames) {
        await assert.rejects(
          async () => await featureService.createFeature(name, mockWorktreeService as any, mockGitService as any, commitMessagePrefix),
          /invalid.*name|special.*character/i
        );
      }
    });

    test('should handle very long feature names', async () => {
      const longName = 'a'.repeat(256);

      await assert.rejects(
        async () => await featureService.createFeature(longName, mockWorktreeService as any, mockGitService as any, commitMessagePrefix),
        /name.*too.*long|exceeds.*limit/i
      );
    });

    test('should handle race condition when creating same feature simultaneously', async () => {
      const featureName = 'race-condition';
      const worktreePath = path.join(testWorktreesDir, featureName);

      // Simulate directory already exists
      existsSyncStub.withArgs(worktreePath).returns(true);

      await assert.rejects(
        async () => await featureService.createFeature(featureName, mockWorktreeService as any, mockGitService as any, commitMessagePrefix),
        /already exists|EEXIST/i
      );
    });

    test('should handle empty feature name', async () => {
      await assert.rejects(
        async () => await featureService.createFeature('', mockWorktreeService as any, mockGitService as any, commitMessagePrefix),
        /empty.*name|name.*required/i
      );
    });

    test('should handle whitespace-only feature name', async () => {
      await assert.rejects(
        async () => await featureService.createFeature('   ', mockWorktreeService as any, mockGitService as any, commitMessagePrefix),
        /invalid.*name|whitespace/i
      );
    });

    test('should handle corrupted timelog.json file', () => {
      const featureName = 'corrupted-timelog';
      const worktreePath = path.join(testWorktreesDir, featureName);
      const timelogPath = path.join(worktreePath, '.clauding', 'timelog.json');

      existsSyncStub.withArgs(worktreePath).returns(true);
      existsSyncStub.withArgs(timelogPath).returns(true);
      readFileSyncStub.withArgs(timelogPath, 'utf-8').returns('{ invalid json content }');
      statSyncStub.withArgs(worktreePath).returns({ isDirectory: () => true } as any);

      // Getting the feature should handle the error gracefully
      const retrievedFeature = featureService.getFeature(featureName);
      assert.ok(retrievedFeature !== null);
    });

    test('should handle missing .clauding directory during feature retrieval', () => {
      const featureName = 'missing-clauding';
      const worktreePath = path.join(testWorktreesDir, featureName);

      existsSyncStub.withArgs(worktreePath).returns(true);
      existsSyncStub.withArgs(path.join(worktreePath, '.clauding')).returns(false);
      statSyncStub.withArgs(worktreePath).returns({ isDirectory: () => true } as any);

      const feature = featureService.getFeature(featureName);

      // Should still return a feature object but with appropriate defaults
      assert.ok(feature !== null);
      assert.strictEqual(feature!.name, featureName);
    });

    test('should handle feature names with leading/trailing whitespace', async () => {
      await assert.rejects(
        async () => await featureService.createFeature('  feature-name  ', mockWorktreeService as any, mockGitService as any, commitMessagePrefix),
        /invalid.*name|whitespace/i
      );
    });

    test('should handle feature with very large timelog file', () => {
      const featureName = 'large-timelog';
      const worktreePath = path.join(testWorktreesDir, featureName);
      const timelogPath = path.join(worktreePath, '.clauding', 'timelog.json');

      // Create a large timelog with many entries
      const largeTimelog = {
        entries: Array.from({ length: 10000 }, (_, i) => ({
          action: `Action ${i}`,
          result: 'Success',
          timestamp: new Date().toISOString(),
          details: { index: i }
        }))
      };

      existsSyncStub.withArgs(worktreePath).returns(true);
      existsSyncStub.withArgs(timelogPath).returns(true);
      readFileSyncStub.withArgs(timelogPath, 'utf-8').returns(JSON.stringify(largeTimelog));
      statSyncStub.withArgs(worktreePath).returns({ isDirectory: () => true } as any);

      // Should still be able to get the feature without performance issues
      const retrievedFeature = featureService.getFeature(featureName);
      assert.ok(retrievedFeature !== null);
    });
  });
});
