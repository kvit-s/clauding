import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { FileTreeBuilder } from '../../providers/sidebar/FileTreeBuilder';
import { FeatureService } from '../../services/FeatureService';
import { GitService } from '../../services/GitService';
import { GitHistoryService } from '../../services/GitHistoryService';

suite('FileTreeBuilder Test Suite', () => {
  let builder: FileTreeBuilder;
  let featureService: FeatureService;
  let gitService: GitService;
  let gitHistoryService: GitHistoryService;
  let sandbox: sinon.SinonSandbox;
  let mockFs: any;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock objects with the methods that will be stubbed
    featureService = {
      getFeature: () => null
    } as any;
    gitService = {
      getFileStatus: () => null
    } as any;
    gitHistoryService = {
      listFilesInCommit: () => Promise.resolve([]),
      getFileTypeInCommit: () => Promise.resolve(null)
    } as any;

    // Create mock fs object
    mockFs = {
      existsSync: sandbox.stub(),
      readdirSync: sandbox.stub(),
      statSync: sandbox.stub()
    };

    builder = new FileTreeBuilder(featureService, gitService, '/fake/project/root', mockFs);
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('buildFileTree', () => {
    test('should return empty array when feature not found', async () => {
      // Arrange
      sandbox.stub(featureService, 'getFeature').returns(null);

      // Act
      const result = await builder.buildFileTree('nonexistent');

      // Assert
      assert.deepStrictEqual(result, []);
    });

    test('should return empty array when meta path does not exist', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      mockFs.existsSync.returns(false);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.deepStrictEqual(result, []);
    });

    test('should build tree with files', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      mockFs.existsSync.returns(true);
      mockFs.readdirSync.returns(['file1.md', 'file2.md'] as any);
      mockFs.statSync.returns({ isDirectory: () => false } as any);
      sandbox.stub(gitService, 'getFileStatus').resolves('M');

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, 'file1.md');
      assert.strictEqual(result[0].type, 'file');
      assert.strictEqual(result[0].gitStatus, 'M');
    });

    test('should build tree with directories', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);

      mockFs.existsSync.returns(true);
      mockFs.readdirSync.onFirstCall().returns(['dir1'] as any);
      mockFs.readdirSync.onSecondCall().returns(['file1.md'] as any);

      mockFs.statSync.onFirstCall().returns({ isDirectory: () => true } as any);
      mockFs.statSync.onSecondCall().returns({ isDirectory: () => false } as any);

      sandbox.stub(gitService, 'getFileStatus').resolves('A');

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'dir1');
      assert.strictEqual(result[0].type, 'directory');
      assert.ok(result[0].children);
      assert.strictEqual(result[0].children.length, 1);
      assert.strictEqual(result[0].children[0].name, 'file1.md');
    });

    test('should sort directories before files', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      mockFs.existsSync.returns(true);

      // First call to readdirSync returns two items, second call (inside dir) returns empty
      mockFs.readdirSync.onFirstCall().returns(['file.md', 'dir'] as any);
      mockFs.readdirSync.onSecondCall().returns([] as any);

      mockFs.statSync.onFirstCall().returns({ isDirectory: () => false } as any);
      mockFs.statSync.onSecondCall().returns({ isDirectory: () => true } as any);

      sandbox.stub(gitService, 'getFileStatus').resolves(undefined);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result[0].name, 'dir');
      assert.strictEqual(result[0].type, 'directory');
      assert.strictEqual(result[1].name, 'file.md');
      assert.strictEqual(result[1].type, 'file');
    });

    test('should sort alphabetically within type', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      mockFs.existsSync.returns(true);
      mockFs.readdirSync.returns(['zebra.md', 'apple.md'] as any);
      mockFs.statSync.returns({ isDirectory: () => false } as any);
      sandbox.stub(gitService, 'getFileStatus').resolves(undefined);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result[0].name, 'apple.md');
      assert.strictEqual(result[1].name, 'zebra.md');
    });

    test('should include git status for files', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      mockFs.existsSync.returns(true);
      mockFs.readdirSync.returns(['modified.md'] as any);
      mockFs.statSync.returns({ isDirectory: () => false } as any);
      sandbox.stub(gitService, 'getFileStatus').resolves('M');

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result[0].gitStatus, 'M');
    });

    test('should build correct relative paths', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      mockFs.existsSync.returns(true);

      mockFs.readdirSync.onFirstCall().returns(['subdir'] as any);
      mockFs.readdirSync.onSecondCall().returns(['file.md'] as any);

      mockFs.statSync.onFirstCall().returns({ isDirectory: () => true } as any);
      mockFs.statSync.onSecondCall().returns({ isDirectory: () => false } as any);

      sandbox.stub(gitService, 'getFileStatus').resolves(undefined);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result[0].path, 'subdir');
      assert.strictEqual(result[0].children![0].path, path.join('subdir', 'file.md'));
    });

    test('should handle empty directories', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      mockFs.existsSync.returns(true);

      mockFs.readdirSync.onFirstCall().returns(['emptydir'] as any);
      mockFs.readdirSync.onSecondCall().returns([] as any);

      mockFs.statSync.returns({ isDirectory: () => true } as any);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].children!.length, 0);
    });

    test('should pass correct path to getFileStatus', async () => {
      // Arrange
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);
      mockFs.existsSync.returns(true);
      mockFs.readdirSync.returns(['file.md'] as any);
      mockFs.statSync.returns({ isDirectory: () => false } as any);
      const getFileStatusStub = sandbox.stub(gitService, 'getFileStatus').resolves('M');

      // Act
      await builder.buildFileTree('test-feature');

      // Assert
      assert.ok(getFileStatusStub.calledOnce);
      const [worktreePath, filePath] = getFileStatusStub.firstCall.args;
      assert.strictEqual(worktreePath, '/path/to/worktree');
      assert.strictEqual(filePath, path.join('.clauding', 'file.md'));
    });
  });

  suite('buildFileTree - Archived Features', () => {
    test('should build tree from git for archived feature with new structure', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '',
        metadataCommitHash: 'abc123'
      } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);

      const listFilesStub = sandbox.stub(gitHistoryService, 'listFilesInCommit');
      listFilesStub.withArgs('/fake/project/root', 'abc123', '.clauding')
        .resolves([
          { name: 'prompt.md', type: 'file' },
          { name: 'plan.md', type: 'file' }
        ] as any);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, 'plan.md');
      assert.strictEqual(result[0].type, 'file');
      assert.strictEqual(result[1].name, 'prompt.md');
      assert.strictEqual(result[1].type, 'file');
    });

    test('should build tree from git for archived feature with legacy structure', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '',
        metadataCommitHash: 'abc123'
      } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);

      const listFilesStub = sandbox.stub(gitHistoryService, 'listFilesInCommit');
      // New structure returns empty
      listFilesStub.withArgs('/fake/project/root', 'abc123', '.clauding')
        .resolves([]);
      // Legacy structure has files
      listFilesStub.withArgs('/fake/project/root', 'abc123', '.clauding/features/test-feature')
        .resolves([
          { name: 'prompt.md', type: 'file' }
        ] as any);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'prompt.md');
    });

    test('should skip config directory in archived features', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '',
        metadataCommitHash: 'abc123'
      } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);

      const listFilesStub = sandbox.stub(gitHistoryService, 'listFilesInCommit');
      listFilesStub.withArgs('/fake/project/root', 'abc123', '.clauding')
        .resolves([
          { name: 'config', type: 'directory' },
          { name: 'prompt.md', type: 'file' }
        ] as any);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'prompt.md');
    });

    test('should skip .name files in archived features', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '',
        metadataCommitHash: 'abc123'
      } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);

      const listFilesStub = sandbox.stub(gitHistoryService, 'listFilesInCommit');
      listFilesStub.withArgs('/fake/project/root', 'abc123', '.clauding')
        .resolves([
          { name: 'feature.name', type: 'file' },
          { name: 'prompt.md', type: 'file' }
        ] as any);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'prompt.md');
    });

    test('should skip JSON files outside outputs directory in archived features', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '',
        metadataCommitHash: 'abc123'
      } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);

      const listFilesStub = sandbox.stub(gitHistoryService, 'listFilesInCommit');
      listFilesStub.withArgs('/fake/project/root', 'abc123', '.clauding')
        .resolves([
          { name: 'status.json', type: 'file' },
          { name: 'prompt.md', type: 'file' },
          { name: 'outputs', type: 'directory' }
        ] as any);
      listFilesStub.withArgs('/fake/project/root', 'abc123', '.clauding/outputs')
        .resolves([
          { name: 'result.json', type: 'file' }
        ] as any);

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, 'outputs');
      assert.strictEqual(result[0].children!.length, 1);
      assert.strictEqual(result[0].children![0].name, 'result.json');
      assert.strictEqual(result[1].name, 'prompt.md');
    });

    test('should not include git status for archived features', async () => {
      // Arrange
      const feature = {
        name: 'test-feature',
        worktreePath: '',
        metadataCommitHash: 'abc123'
      } as any;
      sandbox.stub(featureService, 'getFeature').returns(feature);

      const listFilesStub = sandbox.stub(gitHistoryService, 'listFilesInCommit');
      listFilesStub.withArgs('/fake/project/root', 'abc123', '.clauding')
        .resolves([
          { name: 'prompt.md', type: 'file' }
        ] as any);

      const getFileStatusStub = sandbox.stub(gitService, 'getFileStatus');

      // Act
      const result = await builder.buildFileTree('test-feature');

      // Assert
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].gitStatus, undefined);
      assert.ok(getFileStatusStub.notCalled);
    });
  });
});
