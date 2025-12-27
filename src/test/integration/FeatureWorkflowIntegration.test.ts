import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { FeatureService } from '../../services/FeatureService';
import { WorktreeService } from '../../services/WorktreeService';
import { GitService } from '../../services/GitService';
import { IntegrationTestHelpers } from './integrationTestHelpers';

suite('Feature Workflow Integration Tests', function() {
  // Increase timeout for real git operations
  this.timeout(15000);

  let testRepo: { path: string; cleanup: () => void };
  let worktreesDir: string;
  let worktreeService: WorktreeService;
  let gitService: GitService;

  setup(() => {
    testRepo = IntegrationTestHelpers.createRealGitRepo();
    worktreesDir = path.join(testRepo.path, '.clauding', 'worktrees');
    fs.mkdirSync(worktreesDir, { recursive: true });

    worktreeService = new WorktreeService(testRepo.path, worktreesDir, 'main', 'feature/');
    gitService = new GitService();
  });

  teardown(() => {
    testRepo.cleanup();
  });

  suite('Complete Feature Lifecycle', () => {
    test('should create feature with all metadata files', async () => {
      const featureName = 'complete-feature';
      // Create fresh FeatureService for this test
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Create feature (this will also create the worktree)
      const feature = await testFeatureService.createFeature(
        featureName,
        worktreeService,
        gitService,
        'feat'
      );

      // Verify feature object
      assert.strictEqual(feature.name, featureName);
      assert.strictEqual(feature.worktreePath, path.join(worktreesDir, featureName));
      assert.strictEqual(feature.branchName, 'feature/complete-feature');

      // Verify metadata files exist
      const metadataPath = path.join(feature.worktreePath, '.clauding');
      assert.ok(fs.existsSync(metadataPath));

      const promptPath = path.join(metadataPath, 'prompt.md');
      const timelogPath = path.join(metadataPath, 'timelog.json');

      assert.ok(fs.existsSync(promptPath));
      // Note: plan.md is not automatically created by createFeature
      // assert.ok(fs.existsSync(planPath));
      assert.ok(fs.existsSync(timelogPath));

      // Verify prompt file exists (empty is ok)
      const promptContent = fs.readFileSync(promptPath, 'utf-8');
      assert.ok(promptContent !== null);

      // Verify timelog is valid JSON
      const timelogContent = fs.readFileSync(timelogPath, 'utf-8');
      const timelog = JSON.parse(timelogContent);
      assert.ok(timelog.entries);
      assert.ok(Array.isArray(timelog.entries));
    });

    test('should perform full feature workflow: create -> commit -> merge', async () => {
      const featureName = 'workflow-test';
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Step 1: Create feature
      const feature = await testFeatureService.createFeature(
        featureName,
        worktreeService,
        gitService,
        'feat'
      );

      const worktreePath = feature.worktreePath;
      assert.ok(feature);
      assert.ok(fs.existsSync(worktreePath));

      // Step 2: Make changes in the feature worktree
      const newFile = path.join(worktreePath, 'feature-file.txt');
      fs.writeFileSync(newFile, 'Feature implementation');

      // Step 3: Commit changes
      const commitHash = await gitService.stageAndCommit(
        worktreePath,
        'feat: Add feature implementation'
      );

      assert.ok(commitHash);
      assert.strictEqual(commitHash.length, 7);

      // Verify commit exists
      const log = execSync('git log --oneline', {
        cwd: worktreePath,
        encoding: 'utf-8'
      });
      assert.ok(log.includes('Add feature implementation'));

      // Step 4: Switch to main and merge
      execSync('git checkout main', { cwd: testRepo.path });

      // Merge the feature branch
      execSync(`git merge feature/${featureName} --no-ff -m "Merge feature ${featureName}"`, {
        cwd: testRepo.path
      });

      // Verify the file exists in main now
      const mainFilePath = path.join(testRepo.path, 'feature-file.txt');
      assert.ok(fs.existsSync(mainFilePath));

      // Verify merge commit exists
      const mainLog = execSync('git log --oneline', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(mainLog.includes('Merge feature'));

      // Step 5: Clean up worktree
      await worktreeService.removeWorktree(featureName);

      // Verify cleanup
      assert.ok(!fs.existsSync(worktreePath));
    });

    test('should handle feature with multiple commits', async () => {
      const featureName = 'multi-commit';
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Create feature
      const feature = await testFeatureService.createFeature(featureName, worktreeService, gitService, 'feat');
      const worktreePath = feature.worktreePath;

      // Make multiple commits
      const commits = [];

      // First commit
      fs.writeFileSync(path.join(worktreePath, 'file1.txt'), 'Content 1');
      commits.push(await gitService.stageAndCommit(worktreePath, 'feat: Add file 1'));

      // Second commit
      fs.writeFileSync(path.join(worktreePath, 'file2.txt'), 'Content 2');
      commits.push(await gitService.stageAndCommit(worktreePath, 'feat: Add file 2'));

      // Third commit
      fs.writeFileSync(path.join(worktreePath, 'file3.txt'), 'Content 3');
      commits.push(await gitService.stageAndCommit(worktreePath, 'feat: Add file 3'));

      // Verify all commits exist
      assert.strictEqual(commits.length, 3);
      commits.forEach(hash => assert.ok(hash && hash.length === 7));

      // Verify commit history
      const log = execSync('git log --oneline', {
        cwd: worktreePath,
        encoding: 'utf-8'
      });

      assert.ok(log.includes('Add file 1'));
      assert.ok(log.includes('Add file 2'));
      assert.ok(log.includes('Add file 3'));
    });
  });

  suite('Feature Status Management', () => {
    test('should track feature lifecycle status transitions', async () => {
      const featureName = 'status-test';
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Create feature
      const feature = await testFeatureService.createFeature(featureName, worktreeService, gitService, 'feat');

      // Initial status should be pre-plan
      assert.strictEqual(feature.lifecycleStatus, 'pre-plan');

      // Transition to 'plan' by creating plan.md
      const planPath = path.join(feature.worktreePath, '.clauding', 'plan.md');
      fs.writeFileSync(planPath, '# Plan\nThis is a test plan', 'utf-8');
      testFeatureService.invalidateCache();
      const planFeature = testFeatureService.getFeature(featureName);
      assert.strictEqual(planFeature?.lifecycleStatus, 'plan');

      // Transition to 'implement' by creating implement-plan output file
      const outputsDir = path.join(feature.worktreePath, '.clauding', 'outputs');
      fs.mkdirSync(outputsDir, { recursive: true });
      const implementPath = path.join(outputsDir, 'implement-plan-test.txt');
      fs.writeFileSync(implementPath, 'Implementation output', 'utf-8');
      testFeatureService.invalidateCache();
      const updatedFeature1 = testFeatureService.getFeature(featureName);
      assert.strictEqual(updatedFeature1?.lifecycleStatus, 'implement');

      // Transition to 'wrap-up' by creating wrap-up.json
      const wrapUpPath = path.join(outputsDir, 'wrap-up.json');
      fs.writeFileSync(wrapUpPath, JSON.stringify({ status: 'wrap-up' }), 'utf-8');
      testFeatureService.invalidateCache();
      const updatedFeature2 = testFeatureService.getFeature(featureName);
      assert.strictEqual(updatedFeature2?.lifecycleStatus, 'wrap-up');
    });

    test('should persist feature status across service instances', async () => {
      const featureName = 'persist-test';
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Create feature with first service instance
      const feature = await testFeatureService.createFeature(featureName, worktreeService, gitService, 'feat');

      // Transition to 'implement' by creating required files
      const planPath = path.join(feature.worktreePath, '.clauding', 'plan.md');
      fs.writeFileSync(planPath, '# Plan\nTest plan', 'utf-8');

      const outputsDir = path.join(feature.worktreePath, '.clauding', 'outputs');
      fs.mkdirSync(outputsDir, { recursive: true });
      const implementPath = path.join(outputsDir, 'implement-plan-test.txt');
      fs.writeFileSync(implementPath, 'Implementation output', 'utf-8');

      // Create new service instance
      const newFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Load feature - status should be persisted (file-based detection)
      const loadedFeature = newFeatureService.getFeature(featureName);

      // Status should be 'implement' based on the files we created
      assert.strictEqual(loadedFeature?.lifecycleStatus, 'implement');
    });
  });

  suite('Feature Validation', () => {
    test('should validate required metadata files exist', async () => {
      const featureName = 'validation-test';
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Create feature
      const feature = await testFeatureService.createFeature(featureName, worktreeService, gitService, 'feat');
      const worktreePath = feature.worktreePath;

      // All required files should exist
      const metadataPath = path.join(worktreePath, '.clauding');

      const requiredFiles = ['prompt.md', 'timelog.json'];

      for (const file of requiredFiles) {
        const filePath = path.join(metadataPath, file);
        assert.ok(fs.existsSync(filePath), `${file} should exist`);

        // Verify file exists and is readable
        const content = fs.readFileSync(filePath, 'utf-8');
        // prompt.md can be empty, timelog.json should have content
        if (file === 'timelog.json') {
          assert.ok(content.length > 0, `${file} should not be empty`);
          // Verify it's valid JSON
          JSON.parse(content);
        }
      }
    });

    test('should handle missing worktree directory gracefully', () => {
      const featureName = 'missing-worktree';
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Try to get feature from non-existent path
      const feature = testFeatureService.getFeature(featureName);

      // Should return null or handle gracefully
      assert.ok(feature === null || feature === undefined);
    });

    // Removed: Test was for a validation that no longer exists in the code
    // FeatureService only checks for active features and git branches, not leftover folders
  });

  suite('Concurrent Feature Development', () => {
    test('should support multiple features in development simultaneously', async () => {
      const features = ['feature-a', 'feature-b', 'feature-c'];
      const worktrees: string[] = [];
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Create multiple features
      for (const featureName of features) {
        const feature = await testFeatureService.createFeature(featureName, worktreeService, gitService, 'feat');
        worktrees.push(feature.worktreePath);
      }

      // Verify all features exist
      for (let i = 0; i < features.length; i++) {
        const feature = testFeatureService.getFeature(features[i]);
        assert.ok(feature);
        assert.strictEqual(feature?.name, features[i]);
        assert.ok(fs.existsSync(worktrees[i]));
      }

      // Make changes in each feature independently
      for (let i = 0; i < features.length; i++) {
        const filePath = path.join(worktrees[i], `${features[i]}.txt`);
        fs.writeFileSync(filePath, `Content for ${features[i]}`);

        await gitService.stageAndCommit(
          worktrees[i],
          `feat: Add ${features[i]} file`
        );
      }

      // Verify each feature has its own commits
      for (let i = 0; i < features.length; i++) {
        const log = execSync('git log --oneline', {
          cwd: worktrees[i],
          encoding: 'utf-8'
        });
        assert.ok(log.includes(`Add ${features[i]} file`));
      }

      // Verify features are isolated (file from one doesn't appear in another)
      for (let i = 0; i < features.length; i++) {
        for (let j = 0; j < features.length; j++) {
          if (i !== j) {
            const fileFromOther = path.join(worktrees[i], `${features[j]}.txt`);
            assert.ok(!fs.existsSync(fileFromOther),
              `${features[j]}.txt should not exist in ${features[i]} worktree`);
          }
        }
      }
    });
  });

  suite('Edge Cases', () => {
    test('should handle feature name with special characters', async () => {
      const featureName = 'feature-with-dashes';
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      const feature = await testFeatureService.createFeature(featureName, worktreeService, gitService, 'feat');

      assert.ok(feature);
      assert.strictEqual(feature.name, featureName);
      assert.ok(fs.existsSync(feature.worktreePath));
    });

    test('should handle very long feature names', async () => {
      const featureName = 'very-long-feature-name-that-tests-the-limits-of-filesystem-naming';
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      const feature = await testFeatureService.createFeature(featureName, worktreeService, gitService, 'feat');

      assert.ok(feature);
      assert.ok(fs.existsSync(feature.worktreePath));
    });

    test('should handle rapid feature creation and deletion', async () => {
      const featureName = 'rapid-test';
      const testFeatureService = new FeatureService(worktreesDir, 'main', 'feature/');

      // Create
      const feature = await testFeatureService.createFeature(featureName, worktreeService, gitService, 'feat');
      assert.ok(fs.existsSync(feature.worktreePath));

      // Delete worktree (branch remains)
      await worktreeService.removeWorktree(featureName);
      assert.ok(!fs.existsSync(feature.worktreePath));

      // Manually delete the branch to allow re-creation with same name
      execSync(`git branch -D feature/${featureName}`, { cwd: testRepo.path });

      // Create again with same name (need new service for fresh state)
      const testFeatureService2 = new FeatureService(worktreesDir, 'main', 'feature/');
      const feature2 = await testFeatureService2.createFeature(featureName, worktreeService, gitService, 'feat');
      assert.ok(fs.existsSync(feature2.worktreePath));
    });
  });
});
