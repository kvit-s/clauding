import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { MergeService } from '../services/MergeService';
import { MockHelpers } from './utils/mockHelpers';

suite('MergeService Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mergeService: MergeService;
  let execAsyncStub: sinon.SinonStub;
  let fsMocks: ReturnType<typeof MockHelpers.createFsMock>;
  const testProjectRoot = '/mock/project';
  const mainBranch = 'main';

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create mocked exec function
    execAsyncStub = sandbox.stub();
    execAsyncStub.resolves({ stdout: '', stderr: '' });

    // Mock file system
    fsMocks = MockHelpers.createFsMock(sandbox);

    // Default: no merge in progress (MERGE_HEAD doesn't exist)
    const mergeHeadPath = path.join(testProjectRoot, '.git', 'MERGE_HEAD');
    fsMocks.existsSync.withArgs(mergeHeadPath).returns(false);

    // Setup default git command responses
    execAsyncStub.withArgs(
      sinon.match(/git status --porcelain/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    execAsyncStub.withArgs(
      sinon.match(/git merge/),
      sinon.match.any
    ).resolves({ stdout: 'Merge successful', stderr: '' });

    // Initialize merge service with mocked dependencies
    mergeService = new MergeService(testProjectRoot, mainBranch, execAsyncStub, {
      existsSync: fsMocks.existsSync
    } as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should detect uncommitted changes', async () => {
    // Mock git status showing changes
    execAsyncStub.withArgs(
      sinon.match(/git status --porcelain/),
      sinon.match({ cwd: testProjectRoot })
    ).resolves({ stdout: 'M test.txt\n', stderr: '' });

    const hasUncommitted = await mergeService.hasUncommittedChanges(testProjectRoot);
    assert.strictEqual(hasUncommitted, true);
  });

  test('should return false when no uncommitted changes', async () => {
    // Mock git status showing clean working directory
    execAsyncStub.withArgs(
      sinon.match(/git status --porcelain/),
      sinon.match({ cwd: testProjectRoot })
    ).resolves({ stdout: '', stderr: '' });

    const hasUncommitted = await mergeService.hasUncommittedChanges(testProjectRoot);
    assert.strictEqual(hasUncommitted, false);
  });

  test('should merge branch without conflicts', async () => {
    // Mock successful merge
    execAsyncStub.withArgs(
      sinon.match(/git merge feature\/test/),
      sinon.match.any
    ).resolves({ stdout: 'Merge made by the \'recursive\' strategy', stderr: '' });

    execAsyncStub.withArgs(
      sinon.match(/git diff --name-only --diff-filter=U/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    const result = await mergeService.mergeBranch('feature/test');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.hasConflicts, false);
    assert.strictEqual(result.conflictedFiles.length, 0);
  });

  test('should detect merge conflicts', async () => {
    // Mock merge with conflicts
    execAsyncStub.withArgs(
      sinon.match(/git merge feature\/conflict/),
      sinon.match.any
    ).rejects(Object.assign(new Error('CONFLICT'), {
      stdout: 'Auto-merging conflict.txt\nCONFLICT (content): Merge conflict in conflict.txt',
      stderr: ''
    }));

    execAsyncStub.withArgs(
      sinon.match(/git diff --name-only --diff-filter=U/),
      sinon.match.any
    ).resolves({ stdout: 'conflict.txt\n', stderr: '' });

    const result = await mergeService.mergeBranch('feature/conflict');

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.hasConflicts, true);
    assert.ok(result.conflictedFiles.includes('conflict.txt'));
  });

  test('should resolve conflicts by accepting feature branch', async () => {
    const filePath = path.join(testProjectRoot, 'conflict.txt');

    // Mock file content with conflict markers
    fsMocks.readFileSync.withArgs(filePath, 'utf-8').returns(
      '<<<<<<< HEAD\nMain version\n=======\nFeature version\n>>>>>>> feature/resolve-feature'
    );

    // Mock checkout to feature version
    execAsyncStub.withArgs(
      sinon.match(/git checkout --theirs/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    execAsyncStub.withArgs(
      sinon.match(/git add/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    execAsyncStub.withArgs(
      sinon.match(/git commit/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    await mergeService.resolveConflicts(['conflict.txt'], 'feature');

    // Verify git checkout --theirs was called
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/git checkout --theirs/),
      sinon.match.any
    ));

    // Verify files were staged
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/git add/),
      sinon.match.any
    ));

    // Verify merge was committed
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/git commit/),
      sinon.match.any
    ));
  });

  test('should resolve conflicts by accepting main branch', async () => {
    const filePath = path.join(testProjectRoot, 'conflict.txt');

    // Mock file content with conflict markers
    fsMocks.readFileSync.withArgs(filePath, 'utf-8').returns(
      '<<<<<<< HEAD\nMain version\n=======\nFeature version\n>>>>>>> feature/resolve-main'
    );

    // Mock checkout to main version
    execAsyncStub.withArgs(
      sinon.match(/git checkout --ours/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    await mergeService.resolveConflicts(['conflict.txt'], 'main');

    // Verify git checkout --ours was called
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/git checkout --ours/),
      sinon.match.any
    ));
  });

  test('should abort merge', async () => {
    // Mock merge abort
    execAsyncStub.withArgs(
      sinon.match(/git merge --abort/),
      sinon.match.any
    ).resolves({ stdout: '', stderr: '' });

    await mergeService.abortMerge();

    // Verify abort was called
    assert.ok(execAsyncStub.calledWith(
      sinon.match(/git merge --abort/),
      sinon.match.any
    ));
  });

  test('should detect merge in progress', async () => {
    // Mock MERGE_HEAD file exists
    const mergeHeadPath = path.join(testProjectRoot, '.git', 'MERGE_HEAD');
    fsMocks.existsSync.withArgs(mergeHeadPath).returns(true);

    const isMerging = await mergeService.isMergeInProgress();
    assert.strictEqual(isMerging, true);
  });

  test('should detect no merge in progress', async () => {
    // Mock MERGE_HEAD file doesn't exist
    const mergeHeadPath = path.join(testProjectRoot, '.git', 'MERGE_HEAD');
    fsMocks.existsSync.withArgs(mergeHeadPath).returns(false);

    const isMerging = await mergeService.isMergeInProgress();
    assert.strictEqual(isMerging, false);
  });

  suite('Edge Cases', () => {
    test('should handle binary file conflicts', async () => {
      // Mock merge with binary conflict
      execAsyncStub.withArgs(
        sinon.match(/git merge feature\/binary/),
        sinon.match.any
      ).rejects(Object.assign(new Error('CONFLICT'), {
        stdout: 'warning: Cannot merge binary files: image.bin',
        stderr: ''
      }));

      execAsyncStub.withArgs(
        sinon.match(/git diff --name-only --diff-filter=U/),
        sinon.match.any
      ).resolves({ stdout: 'image.bin\n', stderr: '' });

      const result = await mergeService.mergeBranch('feature/binary');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.hasConflicts, true);
      assert.ok(result.conflictedFiles.includes('image.bin'));
    });

    test('should handle multiple file conflicts', async () => {
      // Mock merge with multiple conflicts
      execAsyncStub.withArgs(
        sinon.match(/git merge feature\/multiple/),
        sinon.match.any
      ).rejects(Object.assign(new Error('CONFLICT'), {
        stdout: 'CONFLICT (content): Merge conflict in file1.txt\nCONFLICT (content): Merge conflict in file2.txt\nCONFLICT (content): Merge conflict in file3.txt',
        stderr: ''
      }));

      execAsyncStub.withArgs(
        sinon.match(/git diff --name-only --diff-filter=U/),
        sinon.match.any
      ).resolves({ stdout: 'file1.txt\nfile2.txt\nfile3.txt\n', stderr: '' });

      const result = await mergeService.mergeBranch('feature/multiple');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.hasConflicts, true);
      assert.strictEqual(result.conflictedFiles.length, 3);
    });

    test('should handle invalid branch name', async () => {
      // Mock git error for non-existent branch
      execAsyncStub.withArgs(
        sinon.match(/git merge non-existent-branch/),
        sinon.match.any
      ).rejects(new Error("fatal: 'non-existent-branch' does not exist"));

      await assert.rejects(
        async () => await mergeService.mergeBranch('non-existent-branch'),
        /error|fatal|does not exist/i
      );
    });

    test('should handle deleted files', async () => {
      // Mock merge with modify/delete conflict
      execAsyncStub.withArgs(
        sinon.match(/git merge feature\/modify-deleted/),
        sinon.match.any
      ).rejects(Object.assign(new Error('CONFLICT'), {
        stdout: 'CONFLICT (modify/delete): to-delete.txt deleted in HEAD and modified in feature/modify-deleted',
        stderr: ''
      }));

      execAsyncStub.withArgs(
        sinon.match(/git diff --name-only --diff-filter=U/),
        sinon.match.any
      ).resolves({ stdout: 'to-delete.txt\n', stderr: '' });

      const result = await mergeService.mergeBranch('feature/modify-deleted');

      assert.strictEqual(result.hasConflicts, true);
    });

    test('should handle merge with empty branch name', async () => {
      await assert.rejects(
        async () => await mergeService.mergeBranch(''),
        /branch|name|empty/i
      );
    });

    test('should complete merge when in progress with no conflicts', async () => {
      // Mock that merge is in progress
      const mergeHeadPath = path.join(testProjectRoot, '.git', 'MERGE_HEAD');
      fsMocks.existsSync.withArgs(mergeHeadPath).returns(true);

      // Mock no conflicted files
      execAsyncStub.withArgs(
        sinon.match(/git diff --name-only --diff-filter=U/),
        sinon.match.any
      ).resolves({ stdout: '', stderr: '' });

      // Mock successful commit
      execAsyncStub.withArgs(
        sinon.match(/git commit --no-edit/),
        sinon.match.any
      ).resolves({ stdout: '[main abc123] Merge completed', stderr: '' });

      const result = await mergeService.mergeBranch('feature/test');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.hasConflicts, false);
      assert.strictEqual(result.message, 'Merge completed');

      // Verify git commit --no-edit was called
      assert.ok(execAsyncStub.calledWith(
        sinon.match(/git commit --no-edit/),
        sinon.match.any
      ));
    });

    test('should handle merge already completed case', async () => {
      // Mock that merge is in progress
      const mergeHeadPath = path.join(testProjectRoot, '.git', 'MERGE_HEAD');
      fsMocks.existsSync.withArgs(mergeHeadPath).returns(true);

      // Mock no conflicted files
      execAsyncStub.withArgs(
        sinon.match(/git diff --name-only --diff-filter=U/),
        sinon.match.any
      ).resolves({ stdout: '', stderr: '' });

      // Mock commit failing because nothing to commit
      execAsyncStub.withArgs(
        sinon.match(/git commit --no-edit/),
        sinon.match.any
      ).rejects(new Error('nothing to commit, working tree clean'));

      const result = await mergeService.mergeBranch('feature/test');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.hasConflicts, false);
      assert.strictEqual(result.message, 'Merge already completed');
    });

    test('should throw error when merge in progress with unresolved conflicts', async () => {
      // Mock that merge is in progress
      const mergeHeadPath = path.join(testProjectRoot, '.git', 'MERGE_HEAD');
      fsMocks.existsSync.withArgs(mergeHeadPath).returns(true);

      // Mock conflicted files still exist
      execAsyncStub.withArgs(
        sinon.match(/git diff --name-only --diff-filter=U/),
        sinon.match.any
      ).resolves({ stdout: 'conflict.txt\n', stderr: '' });

      await assert.rejects(
        async () => await mergeService.mergeBranch('feature/test'),
        /merge.*progress.*unresolved|unresolved.*conflicts/i
      );
    });

    test('should handle special characters in file names during conflict', async () => {
      const specialFileName = 'file with spaces & special (chars).txt';

      // Mock merge with special filename conflict
      execAsyncStub.withArgs(
        sinon.match(/git merge feature\/special-chars/),
        sinon.match.any
      ).rejects(Object.assign(new Error('CONFLICT'), {
        stdout: `CONFLICT (content): Merge conflict in ${specialFileName}`,
        stderr: ''
      }));

      execAsyncStub.withArgs(
        sinon.match(/git diff --name-only --diff-filter=U/),
        sinon.match.any
      ).resolves({ stdout: `${specialFileName}\n`, stderr: '' });

      const result = await mergeService.mergeBranch('feature/special-chars');

      assert.strictEqual(result.hasConflicts, true);
      assert.ok(result.conflictedFiles.includes(specialFileName));
    });

    test('should handle git merge errors gracefully', async () => {
      // Mock unexpected git error
      execAsyncStub.withArgs(
        sinon.match(/git merge/),
        sinon.match.any
      ).rejects(new Error('fatal: unable to access repository'));

      await assert.rejects(
        async () => await mergeService.mergeBranch('feature/test'),
        /unable to access/i
      );
    });

    test('should handle resolve conflicts with invalid strategy', async () => {
      await assert.rejects(
        async () => await mergeService.resolveConflicts(['file.txt'], 'invalid' as any),
        /invalid.*strategy|unknown.*option/i
      );
    });

    test('should handle empty conflicted files list', async () => {
      // Should complete without errors
      await mergeService.resolveConflicts([], 'feature');

      // Verify commit was still called
      assert.ok(execAsyncStub.calledWith(
        sinon.match(/git commit/),
        sinon.match.any
      ));
    });

    test('should handle conflicted files that no longer exist', async () => {
      // Mock file doesn't exist
      fsMocks.existsSync.withArgs(path.join(testProjectRoot, 'missing.txt')).returns(false);

      await mergeService.resolveConflicts(['missing.txt'], 'feature');

      // Should handle gracefully and continue
      assert.ok(execAsyncStub.calledWith(
        sinon.match(/git commit/),
        sinon.match.any
      ));
    });
  });
});
