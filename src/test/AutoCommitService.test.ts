import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { AutoCommitService } from '../services/AutoCommitService';
import { GitService } from '../services/GitService';
import { TimelogService } from '../services/TimelogService';

suite('AutoCommitService Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let autoCommitService: AutoCommitService;
  let mockGitService: sinon.SinonStubbedInstance<GitService>;
  let mockTimelogService: sinon.SinonStubbedInstance<TimelogService>;
  const testRepo = '/mock/repo';

  setup(() => {
    sandbox = sinon.createSandbox();

    // Mock GitService
    mockGitService = {
      hasUncommittedChanges: sandbox.stub().resolves(true),
      stageAll: sandbox.stub().resolves(),
      stageAndCommit: sandbox.stub().resolves('abc1234'),
      commit: sandbox.stub().resolves('abc1234')
    } as any;

    // Mock TimelogService
    mockTimelogService = {
      addEntry: sandbox.stub().resolves(),
      getEntries: sandbox.stub().returns([
        {
          action: 'Create Plan',
          result: 'Success',
          timestamp: '2024-01-15T12:00:00Z',
          details: {
            commitHash: 'abc1234',
            outputFile: 'outputs/create-plan-20240115-120000.txt'
          }
        }
      ])
    } as any;

    autoCommitService = new AutoCommitService(
      mockGitService as any,
      mockTimelogService as any,
      'feat'
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should commit changes after agent command', async () => {
    const outputFile = path.join(testRepo, 'outputs', 'create-plan-20240115-120000.txt');

    const commitHash = await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Create Plan',
      outputFile
    );

    assert.ok(commitHash);
    assert.strictEqual(commitHash, 'abc1234');

    // Verify git operations were called
    assert.ok(mockGitService.hasUncommittedChanges.calledWith(testRepo));
    assert.ok(mockGitService.stageAll.called);
    assert.ok(mockGitService.commit.called);

    // Verify commit message
    const commitCall = mockGitService.commit.getCall(0);
    assert.ok(commitCall.args[1].includes('feat: Create implementation plan'));

    // Verify timelog entry was added
    assert.ok(mockTimelogService.addEntry.called);
  });

  test('should return null when no changes to commit', async () => {
    // Mock no uncommitted changes
    mockGitService.hasUncommittedChanges.resolves(false);

    const outputFile = path.join(testRepo, 'outputs', 'create-plan-20240115-120000.txt');

    const commitHash = await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Create Plan',
      outputFile
    );

    assert.strictEqual(commitHash, null);

    // Verify no commit was made
    assert.ok(mockGitService.commit.notCalled);
  });

  test('should add timelog entry after commit', async () => {
    const outputFile = path.join(testRepo, 'outputs', 'create-plan-20240115-120000.txt');

    await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Create Plan',
      outputFile
    );

    // Verify timelog entry was added with correct details
    const addEntryCall = mockTimelogService.addEntry.getCall(0);
    assert.strictEqual(addEntryCall.args[0], testRepo);
    assert.strictEqual(addEntryCall.args[1], 'Create Plan');
    assert.strictEqual(addEntryCall.args[2], 'Success');
    assert.ok(addEntryCall.args[3]);
    const details = addEntryCall.args[3] as any;
    assert.ok(details.commitHash);
    assert.ok(details.outputFile.includes('outputs/create-plan-20240115-120000.txt'));
  });

  test('should use correct commit message format', async () => {
    const outputFile = path.join(testRepo, 'outputs', 'implement-plan-20240115-120000.txt');

    await autoCommitService.commitAfterAgent(
      testRepo,
      'auth-feature',
      'Implement Plan',
      outputFile
    );

    // Verify commit message format
    const commitCall = mockGitService.commit.getCall(0);
    const message = commitCall.args[1];

    assert.ok(message.includes('feat: Implement plan'));
    assert.ok(message.includes('Agent command: Implement Plan'));
    assert.ok(message.includes('Output: outputs/implement-plan-20240115-120000.txt'));
  });

  test('should handle Modify Plan command', async () => {
    const outputFile = path.join(testRepo, 'outputs', 'modify-plan-20240115-120000.txt');

    await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Modify Plan',
      outputFile
    );

    const commitCall = mockGitService.commit.getCall(0);
    assert.ok(commitCall.args[1].includes('Modify implementation plan'));
  });

  test('should handle Fix All Tests command', async () => {
    const outputFile = path.join(testRepo, 'outputs', 'fix-tests-20240115-120000.txt');

    await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Fix All Tests',
      outputFile
    );

    const commitCall = mockGitService.commit.getCall(0);
    assert.ok(commitCall.args[1].includes('Fix failing tests'));
  });

  test('should handle Generic Agent command', async () => {
    const outputFile = path.join(testRepo, 'outputs', 'agent-session-20240115-120000.txt');

    await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Generic Agent',
      outputFile
    );

    const commitCall = mockGitService.commit.getCall(0);
    assert.ok(commitCall.args[1].includes('Agent session'));
  });

  test('should use custom commit message prefix', async () => {
    // Create service with custom prefix
    const customService = new AutoCommitService(
      mockGitService as any,
      mockTimelogService as any,
      'custom'
    );

    const outputFile = path.join(testRepo, 'outputs', 'create-plan-20240115-120000.txt');

    await customService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Create Plan',
      outputFile
    );

    const commitCall = mockGitService.commit.getCall(0);
    assert.ok(commitCall.args[1].includes('custom:'));
  });

  test('should handle feature names with special characters', async () => {
    const outputFile = path.join(testRepo, 'outputs', 'create-plan-20240115-120000.txt');

    await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature-v2',
      'Create Plan',
      outputFile
    );

    const commitCall = mockGitService.commit.getCall(0);
    assert.ok(commitCall.args[1].includes('feat:'));
  });

  test('should extract output filename from full path', async () => {
    const outputFile = '/full/path/to/outputs/create-plan-20240115-120000.txt';

    await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Create Plan',
      outputFile
    );

    const commitCall = mockGitService.commit.getCall(0);
    const message = commitCall.args[1];

    assert.ok(message.includes('Output: outputs/create-plan-20240115-120000.txt'));
  });

  test('should handle unknown command names', async () => {
    const outputFile = path.join(testRepo, 'outputs', 'unknown-20240115-120000.txt');

    await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Unknown Command',
      outputFile
    );

    // Should use command name as-is
    const commitCall = mockGitService.commit.getCall(0);
    assert.ok(commitCall.args[1].includes('Unknown Command'));
  });

  test('should commit multiple files', async () => {
    const outputFile = path.join(testRepo, 'outputs', 'implement-plan-20240115-120000.txt');

    await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Implement Plan',
      outputFile
    );

    // Verify stageAll was called to stage all changes
    assert.ok(mockGitService.stageAll.calledWith(testRepo));
  });

  test('should handle commit errors gracefully', async () => {
    mockGitService.commit.rejects(new Error('Commit failed'));

    const outputFile = path.join(testRepo, 'outputs', 'create-plan-20240115-120000.txt');

    await assert.rejects(
      async () => await autoCommitService.commitAfterAgent(
        testRepo,
        'my-feature',
        'Create Plan',
        outputFile
      ),
      /Commit failed/
    );
  });

  test('should handle timelog service errors', async () => {
    mockTimelogService.addEntry.rejects(new Error('Timelog write failed'));

    const outputFile = path.join(testRepo, 'outputs', 'create-plan-20240115-120000.txt');

    // Should still complete commit even if timelog fails
    await assert.rejects(
      async () => await autoCommitService.commitAfterAgent(
        testRepo,
        'my-feature',
        'Create Plan',
        outputFile
      ),
      /Timelog write failed/
    );
  });

  test('should format output file path correctly', async () => {
    const outputFile = testRepo + '/outputs/create-plan-20240115-120000.txt';

    await autoCommitService.commitAfterAgent(
      testRepo,
      'my-feature',
      'Create Plan',
      outputFile
    );

    const addEntryCall = mockTimelogService.addEntry.getCall(0);
    assert.ok(addEntryCall.args[3]);
    const details = addEntryCall.args[3] as any;
    assert.ok(details.outputFile.includes('outputs/create-plan-20240115-120000.txt'));
  });
});
