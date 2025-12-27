import * as assert from 'assert';
import * as sinon from 'sinon';
import { GitService } from '../services/GitService';

suite('GitService Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let gitService: GitService;
  let execAsyncStub: sinon.SinonStub;
  let execSyncStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create mock exec functions
    execAsyncStub = sandbox.stub();
    execSyncStub = sandbox.stub();

    // Default successful responses
    execAsyncStub.resolves({ stdout: '', stderr: '' });
    execSyncStub.returns('');

    gitService = new GitService(execAsyncStub, execSyncStub);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should stage all changes', async () => {
    await gitService.stageAll('/mock/repo');

    assert.ok(execAsyncStub.calledWith('git add -A', { cwd: '/mock/repo' }));
  });

  test('should commit staged changes', async () => {
    execAsyncStub.withArgs('git rev-parse --short HEAD', sinon.match.any).resolves({ stdout: 'abc1234\n', stderr: '' });

    const commitHash = await gitService.commit('/mock/repo', 'Test commit');

    assert.strictEqual(commitHash, 'abc1234');
    assert.ok(execAsyncStub.calledWith('git commit -m "Test commit"', { cwd: '/mock/repo' }));
    assert.ok(execAsyncStub.calledWith('git rev-parse --short HEAD', { cwd: '/mock/repo' }));
  });

  test('should throw error when committing with no changes', async () => {
    const error: any = new Error('Command failed');
    error.message = 'nothing to commit, working tree clean';
    error.stderr = '';
    execAsyncStub.withArgs(sinon.match(/git commit/), sinon.match.any).rejects(error);

    await assert.rejects(
      async () => await gitService.commit('/mock/repo', 'Empty commit'),
      {
        message: 'No changes to commit'
      }
    );
  });

  test('should stage and commit in one operation', async () => {
    execAsyncStub.withArgs('git rev-parse --short HEAD', sinon.match.any).resolves({ stdout: 'abc1234\n', stderr: '' });

    const commitHash = await gitService.stageAndCommit('/mock/repo', 'Combined commit');

    assert.strictEqual(commitHash, 'abc1234');
    assert.ok(execAsyncStub.calledWith('git add -A', { cwd: '/mock/repo' }));
    assert.ok(execAsyncStub.calledWith('git commit -m "Combined commit"', { cwd: '/mock/repo' }));
  });

  test('should detect uncommitted changes', async () => {
    execAsyncStub.withArgs('git status --porcelain', sinon.match.any).resolves({
      stdout: 'M  test.txt\n',
      stderr: ''
    });

    const hasChanges = await gitService.hasUncommittedChanges('/mock/repo');

    assert.strictEqual(hasChanges, true);
  });

  test('should return false when there are no uncommitted changes', async () => {
    execAsyncStub.withArgs('git status --porcelain', sinon.match.any).resolves({
      stdout: '',
      stderr: ''
    });

    const hasChanges = await gitService.hasUncommittedChanges('/mock/repo');

    assert.strictEqual(hasChanges, false);
  });

  test('should detect staged but uncommitted changes', async () => {
    execAsyncStub.withArgs('git status --porcelain', sinon.match.any).resolves({
      stdout: 'A  test.txt\n',
      stderr: ''
    });

    const hasChanges = await gitService.hasUncommittedChanges('/mock/repo');

    assert.strictEqual(hasChanges, true);
  });

  test('should get current branch name', async () => {
    execAsyncStub.withArgs('git branch --show-current', sinon.match.any).resolves({
      stdout: 'main\n',
      stderr: ''
    });

    const branchName = await gitService.getCurrentBranch('/mock/repo');

    assert.strictEqual(branchName, 'main');
  });

  test('should get branch name after creating new branch', async () => {
    execAsyncStub.withArgs('git branch --show-current', sinon.match.any).resolves({
      stdout: 'feature/test\n',
      stderr: ''
    });

    const branchName = await gitService.getCurrentBranch('/mock/repo');

    assert.strictEqual(branchName, 'feature/test');
  });

  test('should handle commit message with quotes', async () => {
    execAsyncStub.withArgs('git rev-parse --short HEAD', sinon.match.any).resolves({ stdout: 'abc1234\n', stderr: '' });

    const commitHash = await gitService.commit('/mock/repo', 'Commit with "quotes"');

    assert.ok(commitHash.length > 0);
    assert.ok(execAsyncStub.calledWith('git commit -m "Commit with "quotes""', { cwd: '/mock/repo' }));
  });

  test('should return short commit hash', async () => {
    execAsyncStub.withArgs('git rev-parse --short HEAD', sinon.match.any).resolves({
      stdout: 'abc1234\n',
      stderr: ''
    });

    const commitHash = await gitService.stageAndCommit('/mock/repo', 'Test commit');

    // Short hash should be 7 characters
    assert.strictEqual(commitHash.length, 7);
  });

  test('should stage multiple files', async () => {
    await gitService.stageAll('/mock/repo');

    assert.ok(execAsyncStub.calledWith('git add -A', { cwd: '/mock/repo' }));
  });

  test('should handle modified files', async () => {
    execAsyncStub.withArgs('git status --porcelain', sinon.match.any).resolves({
      stdout: 'M  README.md\n',
      stderr: ''
    });
    execAsyncStub.withArgs('git rev-parse --short HEAD', sinon.match.any).resolves({
      stdout: 'def5678\n',
      stderr: ''
    });

    const hasChanges = await gitService.hasUncommittedChanges('/mock/repo');
    assert.strictEqual(hasChanges, true);

    const commitHash = await gitService.stageAndCommit('/mock/repo', 'Update README');
    assert.ok(commitHash.length > 0);

    // Mock no more changes after commit
    execAsyncStub.withArgs('git status --porcelain', sinon.match.any).resolves({
      stdout: '',
      stderr: ''
    });

    const hasChangesAfter = await gitService.hasUncommittedChanges('/mock/repo');
    assert.strictEqual(hasChangesAfter, false);
  });

  test('should detect uncommitted changes (sync version)', () => {
    execSyncStub.withArgs('git status --porcelain', sinon.match.any).returns('M  test.txt\n');

    const hasChanges = gitService.hasUncommittedChangesSync('/mock/repo');

    assert.strictEqual(hasChanges, true);
  });

  test('should return false when there are no uncommitted changes (sync)', () => {
    execSyncStub.withArgs('git status --porcelain', sinon.match.any).returns('');

    const hasChanges = gitService.hasUncommittedChangesSync('/mock/repo');

    assert.strictEqual(hasChanges, false);
  });

  test('should get file status for modified file', async () => {
    execAsyncStub.withArgs(sinon.match(/git status --porcelain "test.txt"/), sinon.match.any).resolves({
      stdout: ' M test.txt\n',
      stderr: ''
    });

    const status = await gitService.getFileStatus('/mock/repo', 'test.txt');

    assert.strictEqual(status, 'M');
  });

  test('should get file status for added file', async () => {
    execAsyncStub.withArgs(sinon.match(/git status --porcelain/), sinon.match.any).resolves({
      stdout: 'A  new.txt\n',
      stderr: ''
    });

    const status = await gitService.getFileStatus('/mock/repo', 'new.txt');

    assert.strictEqual(status, 'A');
  });

  test('should get file status for deleted file', async () => {
    execAsyncStub.withArgs(sinon.match(/git status --porcelain/), sinon.match.any).resolves({
      stdout: ' D deleted.txt\n',
      stderr: ''
    });

    const status = await gitService.getFileStatus('/mock/repo', 'deleted.txt');

    assert.strictEqual(status, 'D');
  });

  test('should get file status for untracked file', async () => {
    execAsyncStub.withArgs(sinon.match(/git status --porcelain/), sinon.match.any).resolves({
      stdout: '?? untracked.txt\n',
      stderr: ''
    });

    const status = await gitService.getFileStatus('/mock/repo', 'untracked.txt');

    assert.strictEqual(status, 'U');
  });

  test('should return undefined for unmodified file', async () => {
    execAsyncStub.withArgs(sinon.match(/git status --porcelain/), sinon.match.any).resolves({
      stdout: '',
      stderr: ''
    });

    const status = await gitService.getFileStatus('/mock/repo', 'unchanged.txt');

    assert.strictEqual(status, undefined);
  });

  suite('Edge Cases', () => {
    test('should handle non-existent repository path', async () => {
      const error: any = new Error('fatal: not a git repository');
      execAsyncStub.rejects(error);

      await assert.rejects(
        async () => await gitService.getCurrentBranch('/non/existent/path'),
        /fatal: not a git repository/
      );
    });

    test('should handle detached HEAD state', async () => {
      // Mock branch --show-current returning empty (detached HEAD)
      execAsyncStub.withArgs('git branch --show-current', sinon.match.any).resolves({
        stdout: '',
        stderr: ''
      });

      const branchName = await gitService.getCurrentBranch('/mock/repo');

      // Should return 'HEAD' when in detached HEAD state
      assert.strictEqual(branchName, 'HEAD');
    });

    test('should handle merge conflicts detection', async () => {
      execAsyncStub.withArgs('git status --porcelain', sinon.match.any).resolves({
        stdout: 'UU conflict.txt\n',
        stderr: ''
      });

      const hasChanges = await gitService.hasUncommittedChanges('/mock/repo');

      assert.strictEqual(hasChanges, true);
    });

    test('should handle empty commit message', async () => {
      const error: any = new Error('Aborting commit due to empty commit message');
      error.stderr = 'Aborting commit due to empty commit message';
      execAsyncStub.withArgs(sinon.match(/git commit/), sinon.match.any).rejects(error);

      await assert.rejects(
        async () => await gitService.commit('/mock/repo', ''),
        /Aborting commit/
      );
    });

    test('should handle sync version throwing error', () => {
      execSyncStub.throws(new Error('git command failed'));

      // Should return true when git command fails (assume there are changes)
      const hasChanges = gitService.hasUncommittedChangesSync('/mock/repo');

      assert.strictEqual(hasChanges, true);
    });

    test('should handle nothing added to commit error', async () => {
      const error: any = new Error('Command failed');
      error.message = 'nothing added to commit but untracked files present';
      error.stderr = '';
      execAsyncStub.withArgs(sinon.match(/git commit/), sinon.match.any).rejects(error);

      await assert.rejects(
        async () => await gitService.commit('/mock/repo', 'Test commit'),
        {
          message: 'No changes to commit'
        }
      );
    });

    test('should handle getFileStatus error gracefully', async () => {
      execAsyncStub.withArgs(sinon.match(/git status --porcelain/), sinon.match.any).rejects(new Error('git error'));

      const status = await gitService.getFileStatus('/mock/repo', 'error.txt');

      // Should return undefined when error occurs
      assert.strictEqual(status, undefined);
    });

    test('should handle renamed file status', async () => {
      execAsyncStub.withArgs(sinon.match(/git status --porcelain/), sinon.match.any).resolves({
        stdout: 'R  old.txt -> new.txt\n',
        stderr: ''
      });

      const status = await gitService.getFileStatus('/mock/repo', 'new.txt');

      assert.strictEqual(status, 'R');
    });
  });
});
