import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { WorktreeService } from '../../services/WorktreeService';
import { IntegrationTestHelpers } from './integrationTestHelpers';

suite('Worktree Integration Tests', function() {
  // Increase timeout for real git operations
  this.timeout(10000);

  let testRepo: { path: string; cleanup: () => void };
  let worktreesDir: string;
  let worktreeService: WorktreeService;

  setup(() => {
    testRepo = IntegrationTestHelpers.createRealGitRepo();
    worktreesDir = path.join(testRepo.path, '.worktrees');
    fs.mkdirSync(worktreesDir, { recursive: true });
    worktreeService = new WorktreeService(
      testRepo.path,
      worktreesDir,
      'main',
      'feature/'
    );
  });

  teardown(() => {
    testRepo.cleanup();
  });

  suite('Create Real Worktree', () => {
    test('should create a real worktree with branch', async () => {
      const featureName = 'test-feature';
      const expectedPath = path.join(worktreesDir, featureName);

      // Create worktree
      const worktreePath = await worktreeService.createWorktree(featureName);

      // Verify path is correct
      assert.strictEqual(worktreePath, expectedPath);

      // Verify directory exists
      assert.ok(fs.existsSync(worktreePath));

      // Verify it's a git repository
      assert.ok(fs.existsSync(path.join(worktreePath, '.git')));

      // Verify the branch was created
      const branches = execSync('git branch', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(branches.includes('feature/test-feature'));

      // Verify we're on the correct branch in the worktree
      const currentBranch = execSync('git branch --show-current', {
        cwd: worktreePath,
        encoding: 'utf-8'
      }).trim();
      assert.strictEqual(currentBranch, 'feature/test-feature');
    });

    test('should create worktree with proper directory structure', async () => {
      const featureName = 'structured-feature';
      const worktreePath = await worktreeService.createWorktree(featureName);

      // Verify the worktree has the same files as main
      const mainFiles = fs.readdirSync(testRepo.path).filter(f => !f.startsWith('.'));
      const worktreeFiles = fs.readdirSync(worktreePath).filter(f => !f.startsWith('.'));

      // Should have at least the README.md from initial commit
      assert.ok(worktreeFiles.includes('README.md'));
      assert.ok(worktreeFiles.length >= mainFiles.length - 1); // -1 for .worktrees dir
    });

    test('should handle multiple worktrees', async () => {
      // Create multiple worktrees
      const worktree1 = await worktreeService.createWorktree('feature-1');
      const worktree2 = await worktreeService.createWorktree('feature-2');
      const worktree3 = await worktreeService.createWorktree('feature-3');

      // Verify all exist
      assert.ok(fs.existsSync(worktree1));
      assert.ok(fs.existsSync(worktree2));
      assert.ok(fs.existsSync(worktree3));

      // Verify all branches exist
      const branches = execSync('git branch', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(branches.includes('feature/feature-1'));
      assert.ok(branches.includes('feature/feature-2'));
      assert.ok(branches.includes('feature/feature-3'));

      // List worktrees
      const worktreeList = execSync('git worktree list', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(worktreeList.includes('feature-1'));
      assert.ok(worktreeList.includes('feature-2'));
      assert.ok(worktreeList.includes('feature-3'));
    });
  });

  suite('Remove Worktree and Cleanup', () => {
    test('should remove worktree but keep branch', async () => {
      const featureName = 'to-remove';

      // Create worktree
      const worktreePath = await worktreeService.createWorktree(featureName);
      assert.ok(fs.existsSync(worktreePath));

      // Remove worktree
      await worktreeService.removeWorktree(featureName);

      // Verify directory is removed
      assert.ok(!fs.existsSync(worktreePath));

      // Verify branch still exists (not deleted)
      const branches = execSync('git branch', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(branches.includes('feature/to-remove'));

      // Verify worktree is removed from git's list
      const worktreeList = execSync('git worktree list', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(!worktreeList.includes('to-remove'));
    });

    test('should handle removing non-existent worktree gracefully', async () => {
      // Try to remove a worktree that doesn't exist
      // Should not throw an error
      await worktreeService.removeWorktree('non-existent-feature');

      // Verify no branches were created/deleted
      const branches = execSync('git branch', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(!branches.includes('feature/non-existent-feature'));
    });

    test('should clean up worktree even if branch was manually deleted', async () => {
      const featureName = 'manual-delete';

      // Create worktree
      const worktreePath = await worktreeService.createWorktree(featureName);
      assert.ok(fs.existsSync(worktreePath));

      // Manually delete the branch (simulating edge case)
      execSync('git worktree remove --force ' + path.basename(worktreePath), {
        cwd: testRepo.path
      });

      // Try to remove through service (should handle gracefully)
      await worktreeService.removeWorktree(featureName);

      // Verify everything is cleaned up
      assert.ok(!fs.existsSync(worktreePath));
    });
  });

  suite('List Worktrees', () => {
    test('should list all active worktrees', async () => {
      // Create some worktrees
      await worktreeService.createWorktree('feature-1');
      await worktreeService.createWorktree('feature-2');

      // List worktrees using git directly
      const worktreeList = execSync('git worktree list', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });

      assert.ok(worktreeList.includes('feature-1'));
      assert.ok(worktreeList.includes('feature-2'));
      assert.ok(worktreeList.includes('main')); // Main branch
    });

    test('should handle empty worktree list', () => {
      // Just the main worktree should exist
      const worktreeList = execSync('git worktree list', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });

      // Should contain the main repo path
      assert.ok(worktreeList.includes(testRepo.path));
    });
  });

  suite('Worktree Path Validation', () => {
    test('should create worktrees in correct directory structure', async () => {
      const featureName = 'path-test';
      const expectedPath = path.join(worktreesDir, featureName);

      const actualPath = await worktreeService.createWorktree(featureName);

      assert.strictEqual(actualPath, expectedPath);
      assert.ok(fs.existsSync(actualPath));
      assert.ok(fs.statSync(actualPath).isDirectory());
    });

    test('should normalize feature names in paths', async () => {
      // Test with various feature name formats
      const features = ['simple', 'with-dashes', 'with_underscores'];

      for (const feature of features) {
        const worktreePath = await worktreeService.createWorktree(feature);
        assert.ok(fs.existsSync(worktreePath));
        assert.ok(worktreePath.includes(feature));
      }
    });
  });

  suite('Branch Creation and Tracking', () => {
    test('should create branch with correct prefix', async () => {
      const featureName = 'prefixed';
      await worktreeService.createWorktree(featureName);

      const branches = execSync('git branch', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });

      // Should have the feature/ prefix
      assert.ok(branches.includes('feature/prefixed'));
    });

    test('should branch from main branch', async () => {
      // Create a commit on main first
      const testFile = path.join(testRepo.path, 'main-file.txt');
      fs.writeFileSync(testFile, 'Main content');
      execSync('git add .', { cwd: testRepo.path });
      execSync('git commit -m "Add main file"', { cwd: testRepo.path });

      // Create worktree
      const worktreePath = await worktreeService.createWorktree('from-main');

      // Verify the file exists in the worktree (branched from main)
      assert.ok(fs.existsSync(path.join(worktreePath, 'main-file.txt')));

      // Verify commit history includes main's commits
      const log = execSync('git log --oneline', {
        cwd: worktreePath,
        encoding: 'utf-8'
      });
      assert.ok(log.includes('Add main file'));
    });
  });
});
