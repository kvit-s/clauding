import * as sinon from 'sinon';
import { execSync } from 'child_process';
import * as fs from 'fs';

export class MockHelpers {
  /**
   * Create a mock execSync that handles common git commands
   */
  static createGitExecSyncMock(sandbox: sinon.SinonSandbox): sinon.SinonStub {
    const stub = sandbox.stub({ execSync }, 'execSync');

    // Default behaviors for common commands
    stub.withArgs(sinon.match(/git init/)).returns('');
    stub.withArgs(sinon.match(/git config/)).returns('');
    stub.withArgs(sinon.match(/git add/)).returns('');
    stub.withArgs(sinon.match(/git commit/), sinon.match.any).returns('');
    stub.withArgs(sinon.match(/git rev-parse --short HEAD/)).returns('abc1234');
    stub.withArgs(sinon.match(/git status --porcelain/)).returns('');
    stub.withArgs(sinon.match(/git branch/)).returns('* main');
    stub.withArgs(sinon.match(/git worktree list/)).returns('');

    return stub;
  }

  /**
   * Create a mock for exec (promisified version)
   */
  static createGitExecAsyncMock(): sinon.SinonStub {
    const stub = sinon.stub();

    // Default success responses
    stub.resolves({ stdout: '', stderr: '' });
    stub.withArgs(sinon.match(/git rev-parse --short HEAD/)).resolves({ stdout: 'abc1234\n', stderr: '' });
    stub.withArgs(sinon.match(/git status --porcelain/)).resolves({ stdout: '', stderr: '' });

    return stub;
  }

  /**
   * Create mock file system
   * Creates independent stub functions that can be passed to services
   * These stubs don't affect the actual fs module, avoiding conflicts between tests
   */
  static createFsMock(sandbox: sinon.SinonSandbox) {
    const existsSyncStub = sandbox.stub();
    existsSyncStub.returns(true);

    const readFileSyncStub = sandbox.stub();
    readFileSyncStub.returns('');

    const writeFileSyncStub = sandbox.stub();

    const mkdirSyncStub = sandbox.stub();

    const rmSyncStub = sandbox.stub();

    const mkdtempSyncStub = sandbox.stub();
    mkdtempSyncStub.returns('/tmp/mock-temp');

    const statSyncStub = sandbox.stub();
    statSyncStub.returns({ isDirectory: () => true } as fs.Stats);

    return {
      existsSync: existsSyncStub,
      readFileSync: readFileSyncStub,
      writeFileSync: writeFileSyncStub,
      mkdirSync: mkdirSyncStub,
      rmSync: rmSyncStub,
      mkdtempSync: mkdtempSyncStub,
      statSync: statSyncStub
    };
  }

  /**
   * Create a mock git repository state
   */
  static mockGitRepo(options: {
    hasChanges?: boolean;
    stagedFiles?: string[];
    branch?: string;
  } = {}) {
    const state = {
      hasChanges: options.hasChanges ?? false,
      stagedFiles: options.stagedFiles ?? [],
      branch: options.branch ?? 'main'
    };

    return {
      getStatusOutput: () => state.stagedFiles.map(f => `M  ${f}`).join('\n'),
      getBranchOutput: () => `* ${state.branch}`,
      hasUncommittedChanges: () => state.hasChanges
    };
  }
}
