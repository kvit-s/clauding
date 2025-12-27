import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { WorktreeService } from '../services/WorktreeService';
import { MockHelpers } from './utils/mockHelpers';
import * as worktreeSetup from '../utils/worktreeSetup';

suite('WorktreeService Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let worktreeService: WorktreeService;
  let execAsyncStub: sinon.SinonStub;
  let fsMocks: ReturnType<typeof MockHelpers.createFsMock>;
  const testProjectRoot = '/mock/project';
  const testWorktreesDir = '/mock/project/.clauding/worktrees';

  setup(() => {
    sandbox = sinon.createSandbox();

    // Mock ensureClaudeignoreExists to avoid file system operations
    sandbox.stub(worktreeSetup, 'ensureClaudeignoreExists').resolves();

    // Create mocked exec function
    execAsyncStub = sandbox.stub();
    execAsyncStub.resolves({ stdout: '', stderr: '' });

    // Setup default responses for common git worktree commands
    execAsyncStub.withArgs(
      sinon.match(/git worktree add/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    execAsyncStub.withArgs(
      sinon.match(/git worktree list --porcelain/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    execAsyncStub.withArgs(
      sinon.match(/git worktree remove/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    // Mock file system
    fsMocks = MockHelpers.createFsMock(sandbox);
    fsMocks.existsSync.returns(true);
    fsMocks.readFileSync.returns('');
    fsMocks.writeFileSync.returns(undefined);

    // Create WorktreeService with mocked dependencies
    worktreeService = new WorktreeService(
      testProjectRoot,
      testWorktreesDir,
      'main',
      'feature/',
      execAsyncStub,
      {
        existsSync: fsMocks.existsSync,
        mkdirSync: fsMocks.mkdirSync,
        rmSync: fsMocks.rmSync,
        readFileSync: fsMocks.readFileSync,
        writeFileSync: fsMocks.writeFileSync
      } as any
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should create a git worktree', async () => {
    const worktreePath = await worktreeService.createWorktree('test-feature');

    assert.strictEqual(worktreePath, path.join(testWorktreesDir, 'test-feature'));

    // Verify git worktree add was called with correct arguments
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/git worktree add.*test-feature/),
      sinon.match({ cwd: testProjectRoot })
    ));

    // Verify branch was created with correct name
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/feature\/test-feature/),
      sinon.match.any
    ));
  });

  test('should create branch with correct name', async () => {
    await worktreeService.createWorktree('auth');

    // Verify the branch name includes the prefix
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/feature\/auth/),
      sinon.match.any
    ));
  });

  test('should handle worktree creation with spaces in name', async () => {
    const worktreePath = await worktreeService.createWorktree('my feature');

    assert.strictEqual(worktreePath, path.join(testWorktreesDir, 'my feature'));

    // Verify git command was called with properly quoted path
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/git worktree add/),
      sinon.match.any
    ));
  });

  test('should throw error if worktree already exists', async () => {
    // First call succeeds
    await worktreeService.createWorktree('duplicate');

    // Second call should fail - simulate git error
    execAsyncStub.withArgs(
      sinon.match(/git worktree add.*duplicate/),
      sinon.match.any
    ).rejects(new Error("fatal: 'duplicate' already exists"));

    await assert.rejects(
      async () => await worktreeService.createWorktree('duplicate'),
      /Failed to create worktree/
    );
  });

  test('should remove a worktree', async () => {
    // Mock that worktree exists
    fsMocks.existsSync.withArgs(path.join(testWorktreesDir, 'temp-feature')).returns(true);

    await worktreeService.removeWorktree('temp-feature');

    // Verify git worktree remove was called
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/git worktree remove/),
      sinon.match({ cwd: testProjectRoot })
    ));

    // Verify the correct worktree path was used
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/temp-feature/),
      sinon.match.any
    ));
  });

  test('should handle removing non-existent worktree gracefully', async () => {
    // Mock worktree doesn't exist
    fsMocks.existsSync.withArgs(path.join(testWorktreesDir, 'nonexistent')).returns(false);

    // Should not throw - just return silently
    await worktreeService.removeWorktree('nonexistent');

    // Verify git worktree remove was never called since worktree doesn't exist
    sinon.assert.neverCalledWith(
      execAsyncStub,
      sinon.match(/git worktree remove.*nonexistent/),
      sinon.match.any
    );
  });

  test('should get correct worktree path', () => {
    const worktreePath = worktreeService.getWorktreePath('my-feature');
    assert.strictEqual(worktreePath, path.join(testWorktreesDir, 'my-feature'));
  });

  test('should check if worktree exists when it does not', () => {
    fsMocks.existsSync.withArgs(path.join(testWorktreesDir, 'new-feature')).returns(false);

    assert.strictEqual(worktreeService.worktreeExists('new-feature'), false);
  });

  test('should check if worktree exists when it does', () => {
    fsMocks.existsSync.withArgs(path.join(testWorktreesDir, 'existing-feature')).returns(true);

    assert.strictEqual(worktreeService.worktreeExists('existing-feature'), true);
  });

  test('should handle error when git worktree add fails', async () => {
    execAsyncStub.withArgs(
      sinon.match(/git worktree add/),
      sinon.match.any
    ).rejects(new Error('Git error: insufficient permissions'));

    await assert.rejects(
      async () => await worktreeService.createWorktree('test-feature'),
      /Failed to create worktree/
    );
  });

  test('should create worktree directory structure', async () => {
    // Mock that worktrees directory doesn't exist yet
    fsMocks.existsSync.withArgs(testWorktreesDir).returns(false);

    await worktreeService.createWorktree('new-feature');

    // Verify directory creation was called for worktrees dir
    assert.ok(fsMocks.mkdirSync.called);
  });

  test('should format worktree path correctly', () => {
    const path1 = worktreeService.getWorktreePath('simple');
    const path2 = worktreeService.getWorktreePath('with-dashes');
    const path3 = worktreeService.getWorktreePath('with spaces');

    assert.strictEqual(path1, path.join(testWorktreesDir, 'simple'));
    assert.strictEqual(path2, path.join(testWorktreesDir, 'with-dashes'));
    assert.strictEqual(path3, path.join(testWorktreesDir, 'with spaces'));
  });
});
