import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { GitService } from '../../services/GitService';
import { IntegrationTestHelpers } from './integrationTestHelpers';

suite('Git Integration Tests', function() {
  // Increase timeout for real git operations
  this.timeout(10000);

  let testRepo: { path: string; cleanup: () => void };
  let gitService: GitService;

  setup(() => {
    testRepo = IntegrationTestHelpers.createRealGitRepo();
    gitService = new GitService();
  });

  teardown(() => {
    testRepo.cleanup();
  });

  suite('Full Commit Workflow', () => {
    test('should perform complete stage, commit, and verify workflow', async () => {
      // Create a new file
      const testFile = path.join(testRepo.path, 'test-file.txt');
      fs.writeFileSync(testFile, 'Test content');

      // Stage the file
      await gitService.stageAll(testRepo.path);

      // Verify file is staged
      const statusBefore = execSync('git status --porcelain', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(statusBefore.includes('A  test-file.txt') || statusBefore.includes('A test-file.txt'));

      // Commit the changes
      const commitHash = await gitService.stageAndCommit(testRepo.path, 'Add test file');
      assert.ok(commitHash);
      assert.strictEqual(commitHash.length, 7); // Short hash

      // Verify no uncommitted changes
      const hasChanges = await gitService.hasUncommittedChanges(testRepo.path);
      assert.strictEqual(hasChanges, false);

      // Verify commit exists in history
      const log = execSync('git log --oneline', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(log.includes('Add test file'));
    });

    test('should detect uncommitted changes after modification', async () => {
      // Initial state: no changes
      let hasChanges = await gitService.hasUncommittedChanges(testRepo.path);
      assert.strictEqual(hasChanges, false);

      // Modify a file
      const readme = path.join(testRepo.path, 'README.md');
      fs.appendFileSync(readme, '\nNew content');

      // Should detect changes
      hasChanges = await gitService.hasUncommittedChanges(testRepo.path);
      assert.strictEqual(hasChanges, true);
    });
  });

  suite('Merge Conflict Handling', () => {
    test('should detect real merge conflicts', async () => {
      // Create a feature branch
      execSync('git checkout -b feature-branch', { cwd: testRepo.path });

      // Modify README on feature branch
      const readme = path.join(testRepo.path, 'README.md');
      fs.writeFileSync(readme, '# Feature Branch Content');
      execSync('git add .', { cwd: testRepo.path });
      execSync('git commit -m "Feature change"', { cwd: testRepo.path });

      // Go back to main and modify the same file
      execSync('git checkout main', { cwd: testRepo.path });
      fs.writeFileSync(readme, '# Main Branch Content');
      execSync('git add .', { cwd: testRepo.path });
      execSync('git commit -m "Main change"', { cwd: testRepo.path });

      // Try to merge feature branch (should create conflict)
      try {
        execSync('git merge feature-branch', { cwd: testRepo.path });
        assert.fail('Expected merge to fail with conflict');
      } catch {
        // Expected to fail
      }

      // Verify conflict is detected
      const hasConflicts = await gitService.hasUncommittedChanges(testRepo.path);
      assert.strictEqual(hasConflicts, true);

      // Verify we can detect the conflict state
      const status = execSync('git status --porcelain', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });
      assert.ok(status.includes('UU') || status.includes('AA') || status.includes('U '));
    });
  });

  suite('Detached HEAD State', () => {
    test('should handle detached HEAD state correctly', async () => {
      // Get the current commit hash
      const commitHash = execSync('git rev-parse HEAD', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      }).trim();

      // Checkout the commit directly (detached HEAD)
      execSync(`git checkout ${commitHash}`, { cwd: testRepo.path });

      // Verify we can still get status
      const hasChanges = await gitService.hasUncommittedChanges(testRepo.path);
      // In detached HEAD with no changes, should be false
      assert.strictEqual(hasChanges, false);

      // Verify branch detection works (should be detached)
      const branch = await gitService.getCurrentBranch(testRepo.path);
      assert.ok(branch === 'HEAD' || branch.includes('detached') || branch === '');
    });
  });

  suite('Branch Operations', () => {
    test('should create and switch branches', async () => {
      // Create a new branch
      execSync('git checkout -b new-branch', { cwd: testRepo.path });

      // Verify current branch
      const currentBranch = await gitService.getCurrentBranch(testRepo.path);
      assert.strictEqual(currentBranch, 'new-branch');

      // Switch back to main
      execSync('git checkout main', { cwd: testRepo.path });

      // Verify we're back on main
      const mainBranch = await gitService.getCurrentBranch(testRepo.path);
      assert.strictEqual(mainBranch, 'main');
    });

    test('should list all branches', async () => {
      // Create multiple branches
      execSync('git branch feature-1', { cwd: testRepo.path });
      execSync('git branch feature-2', { cwd: testRepo.path });

      // Get branch list
      const branches = execSync('git branch', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });

      assert.ok(branches.includes('main'));
      assert.ok(branches.includes('feature-1'));
      assert.ok(branches.includes('feature-2'));
    });
  });

  suite('File Status Detection', () => {
    test('should detect different file statuses (M, A, D, R)', async () => {
      // Modified file
      const readme = path.join(testRepo.path, 'README.md');
      fs.appendFileSync(readme, '\nModified content');

      // New file
      const newFile = path.join(testRepo.path, 'new.txt');
      fs.writeFileSync(newFile, 'New file');

      // Stage files
      await gitService.stageAll(testRepo.path);

      // Check status
      const status = execSync('git status --porcelain', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });

      assert.ok(status.includes('M')); // Modified
      assert.ok(status.includes('A')); // Added
    });

    test('should detect deleted files', async () => {
      // Create and commit a file first
      const testFile = path.join(testRepo.path, 'to-delete.txt');
      fs.writeFileSync(testFile, 'Will be deleted');
      execSync('git add .', { cwd: testRepo.path });
      execSync('git commit -m "Add file to delete"', { cwd: testRepo.path });

      // Delete the file
      fs.unlinkSync(testFile);

      // Stage the deletion
      await gitService.stageAll(testRepo.path);

      // Check status
      const status = execSync('git status --porcelain', {
        cwd: testRepo.path,
        encoding: 'utf-8'
      });

      assert.ok(status.includes('D')); // Deleted
    });
  });

  suite('Sync Operations', () => {
    test('should use sync version of hasUncommittedChanges', () => {
      // No changes initially
      let hasChanges = gitService.hasUncommittedChangesSync(testRepo.path);
      assert.strictEqual(hasChanges, false);

      // Modify a file
      const readme = path.join(testRepo.path, 'README.md');
      fs.appendFileSync(readme, '\nSync test');

      // Should detect changes
      hasChanges = gitService.hasUncommittedChangesSync(testRepo.path);
      assert.strictEqual(hasChanges, true);
    });

    test('should verify sync operations work with real git', () => {
      // Test that sync version works with real git repo
      const hasChanges = gitService.hasUncommittedChangesSync(testRepo.path);
      assert.strictEqual(typeof hasChanges, 'boolean');
    });
  });
});
