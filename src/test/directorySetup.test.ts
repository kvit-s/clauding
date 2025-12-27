import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureClaudingDirectories } from '../utils/directorySetup';

suite('DirectorySetup Test Suite', () => {
  let testDir: string;

  setup(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clauding-test-'));
  });

  teardown(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should create .clauding directory structure', () => {
    const dirs = ensureClaudingDirectories(testDir);

    assert.ok(fs.existsSync(dirs.root));
    assert.ok(fs.existsSync(dirs.config));
    assert.ok(fs.existsSync(dirs.worktrees));
  });

  test('should return correct directory paths', () => {
    const dirs = ensureClaudingDirectories(testDir);

    assert.strictEqual(dirs.root, path.join(testDir, '.clauding'));
    assert.strictEqual(dirs.config, path.join(testDir, '.clauding', 'config'));
    assert.strictEqual(dirs.worktrees, path.join(testDir, '.clauding', 'worktrees'));
  });

  test('should not fail if directories already exist', () => {
    // Create directories first
    ensureClaudingDirectories(testDir);

    // Call again - should not throw
    const dirs = ensureClaudingDirectories(testDir);

    assert.ok(fs.existsSync(dirs.root));
    assert.ok(fs.existsSync(dirs.config));
    assert.ok(fs.existsSync(dirs.worktrees));
  });

  test('should create nested directories if parent does not exist', () => {
    const nestedTestDir = path.join(testDir, 'nested', 'path');
    const dirs = ensureClaudingDirectories(nestedTestDir);

    assert.ok(fs.existsSync(dirs.root));
    assert.ok(fs.existsSync(dirs.config));
    assert.ok(fs.existsSync(dirs.worktrees));
  });

  test('should add .clauding to .gitignore when initializing', () => {
    ensureClaudingDirectories(testDir);

    const gitignorePath = path.join(testDir, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore should be created');

    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    assert.ok(gitignoreContent.includes('.clauding'), '.gitignore should contain .clauding');
  });

  test('should not duplicate .clauding entry in .gitignore', () => {
    // Initialize once
    ensureClaudingDirectories(testDir);

    // Remove the worktrees directory to force re-creation
    const worktreesDir = path.join(testDir, '.clauding', 'worktrees');
    fs.rmSync(worktreesDir, { recursive: true, force: true });

    // Initialize again
    ensureClaudingDirectories(testDir);

    const gitignorePath = path.join(testDir, '.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');

    const occurrences = (gitignoreContent.match(/\.clauding/g) || []).length;
    assert.strictEqual(occurrences, 1, 'Should only have one occurrence of .clauding');
  });

  test('should append to existing .gitignore', () => {
    // Create a .gitignore with existing content
    const gitignorePath = path.join(testDir, '.gitignore');
    const existingContent = 'node_modules/\n*.log\n';
    fs.writeFileSync(gitignorePath, existingContent, 'utf-8');

    ensureClaudingDirectories(testDir);

    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    assert.ok(gitignoreContent.includes('node_modules/'), 'Should preserve existing content');
    assert.ok(gitignoreContent.includes('*.log'), 'Should preserve existing content');
    assert.ok(gitignoreContent.includes('.clauding'), 'Should add new entry');
  });

  test('should not add entry if .clauding already exists in .gitignore', () => {
    // Create a .gitignore with the entry already present
    const gitignorePath = path.join(testDir, '.gitignore');
    const existingContent = 'node_modules/\n.clauding\n*.log\n';
    fs.writeFileSync(gitignorePath, existingContent, 'utf-8');

    ensureClaudingDirectories(testDir);

    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    const occurrences = (gitignoreContent.match(/\.clauding/g) || []).length;
    assert.strictEqual(occurrences, 1, 'Should not duplicate existing entry');
  });
});
