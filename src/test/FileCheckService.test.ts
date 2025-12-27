import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileCheckService } from '../services/FileCheckService';
import { AgentCommand, RequiredFile } from '../models/AgentCommand';

suite('FileCheckService Test Suite', () => {
  let testDir: string;
  let fileCheckService: FileCheckService;

  setup(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clauding-filecheck-test-'));
    fileCheckService = new FileCheckService();
  });

  teardown(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should find all existing files', async () => {
    // Create test files in new path structure
    const metaDir = path.join(testDir, '.clauding');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, 'file1.md'), 'content 1');
    fs.writeFileSync(path.join(metaDir, 'file2.md'), 'content 2');

    const command: AgentCommand = {
      name: 'Test Command',
      path: '.',
      prompt: 'Test prompt',
      requiredFiles: [
        { path: 'file1.md', type: 'exact' },
        { path: 'file2.md', type: 'exact' }
      ],
      outputFilePrefix: 'test'
    };

    const result = await fileCheckService.checkRequiredFiles(command, testDir);

    assert.strictEqual(result.allExist, true);
    assert.deepStrictEqual(result.missingFiles, []);
    assert.deepStrictEqual(result.existingFiles, [
      { path: 'file1.md', type: 'exact' },
      { path: 'file2.md', type: 'exact' }
    ]);
  });

  test('should detect missing files', async () => {
    // Create only one file in new path structure
    const metaDir = path.join(testDir, '.clauding');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, 'file1.md'), 'content 1');

    const command: AgentCommand = {
      name: 'Test Command',
      path: '.',
      prompt: 'Test prompt',
      requiredFiles: [
        { path: 'file1.md', type: 'exact' },
        { path: 'file2.md', type: 'exact' },
        { path: 'file3.md', type: 'exact' }
      ],
      outputFilePrefix: 'test'
    };

    const result = await fileCheckService.checkRequiredFiles(command, testDir);

    assert.strictEqual(result.allExist, false);
    assert.deepStrictEqual(result.missingFiles, [
      { path: 'file2.md', type: 'exact' },
      { path: 'file3.md', type: 'exact' }
    ]);
    assert.deepStrictEqual(result.existingFiles, [
      { path: 'file1.md', type: 'exact' }
    ]);
  });

  test('should handle command with no required files', async () => {
    const command: AgentCommand = {
      name: 'Test Command',
      path: '.',
      prompt: 'Test prompt',
      requiredFiles: [],
      outputFilePrefix: 'test'
    };

    const result = await fileCheckService.checkRequiredFiles(command, testDir);

    assert.strictEqual(result.allExist, true);
    assert.deepStrictEqual(result.missingFiles, []);
    assert.deepStrictEqual(result.existingFiles, []);
  });

  test('should detect all files missing', async () => {
    const command: AgentCommand = {
      name: 'Test Command',
      path: '.',
      prompt: 'Test prompt',
      requiredFiles: [
        { path: 'file1.md', type: 'exact' },
        { path: 'file2.md', type: 'exact' }
      ],
      outputFilePrefix: 'test'
    };

    const result = await fileCheckService.checkRequiredFiles(command, testDir);

    assert.strictEqual(result.allExist, false);
    assert.deepStrictEqual(result.missingFiles, [
      { path: 'file1.md', type: 'exact' },
      { path: 'file2.md', type: 'exact' }
    ]);
    assert.deepStrictEqual(result.existingFiles, []);
  });

  test('should create missing files', () => {
    const missingFiles: RequiredFile[] = [
      { path: 'file1.md', type: 'exact' },
      { path: 'file2.md', type: 'exact' }
    ];

    fileCheckService.createMissingFiles(missingFiles, testDir);

    // Verify files were created in new path structure
    const metaDir = path.join(testDir, '.clauding');
    assert.ok(fs.existsSync(path.join(metaDir, 'file1.md')));
    assert.ok(fs.existsSync(path.join(metaDir, 'file2.md')));

    // Verify regular files are empty (not modify-prompt.md)
    const content1 = fs.readFileSync(path.join(metaDir, 'file1.md'), 'utf-8');
    const content2 = fs.readFileSync(path.join(metaDir, 'file2.md'), 'utf-8');
    assert.strictEqual(content1, '');
    assert.strictEqual(content2, '');
  });

  test('should not throw when creating files in existing directory', () => {
    const missingFiles: RequiredFile[] = [
      { path: 'file1.md', type: 'exact' }
    ];

    // Should not throw
    fileCheckService.createMissingFiles(missingFiles, testDir);

    const metaDir = path.join(testDir, '.clauding');
    assert.ok(fs.existsSync(path.join(metaDir, 'file1.md')));
  });

  test('should detect file with content', () => {
    const filePath = path.join(testDir, 'file.md');
    fs.writeFileSync(filePath, 'Some content');

    const hasContent = fileCheckService.fileHasContent(filePath);

    assert.strictEqual(hasContent, true);
  });

  test('should detect empty file has no content', () => {
    const filePath = path.join(testDir, 'file.md');
    fs.writeFileSync(filePath, '');

    const hasContent = fileCheckService.fileHasContent(filePath);

    assert.strictEqual(hasContent, false);
  });

  test('should return false for non-existent file', () => {
    const filePath = path.join(testDir, 'nonexistent.md');

    const hasContent = fileCheckService.fileHasContent(filePath);

    assert.strictEqual(hasContent, false);
  });

  // Consolidated parameterized test for whitespace and content detection
  suite('fileHasContent - whitespace and content variations', () => {
    const testCases = [
      { name: 'whitespace-only file (spaces, newlines, tabs)', content: '   \n\t  \n  ', expected: false },
      { name: 'single character', content: 'x', expected: true },
      { name: 'content with leading/trailing whitespace', content: '  \n  actual content  \n  ', expected: true },
      { name: 'single space', content: ' ', expected: false },
      { name: 'multiple newlines', content: '\n\n\n', expected: false },
      { name: 'tabs only', content: '\t\t\t', expected: false },
      { name: 'mixed whitespace with content', content: '\t\n  text  \n\t', expected: true }
    ];

    for (const testCase of testCases) {
      test(`should handle ${testCase.name}`, () => {
        const filePath = path.join(testDir, 'test-file.md');
        fs.writeFileSync(filePath, testCase.content);

        const hasContent = fileCheckService.fileHasContent(filePath);

        assert.strictEqual(hasContent, testCase.expected);
      });
    }
  });

  test('should check files in subdirectories', async () => {
    // Create subdirectory in new path structure
    const metaDir = path.join(testDir, '.clauding');
    const subDir = path.join(metaDir, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'file.md'), 'content');

    const command: AgentCommand = {
      name: 'Test Command',
      path: '.',
      prompt: 'Test prompt',
      requiredFiles: [
        { path: 'subdir/file.md', type: 'exact' }
      ],
      outputFilePrefix: 'test'
    };

    const result = await fileCheckService.checkRequiredFiles(command, testDir);

    assert.strictEqual(result.allExist, true);
    assert.deepStrictEqual(result.existingFiles, [
      { path: 'subdir/file.md', type: 'exact' }
    ]);
  });

  test('should handle missing subdirectory files', async () => {
    const command: AgentCommand = {
      name: 'Test Command',
      path: '.',
      prompt: 'Test prompt',
      requiredFiles: [
        { path: 'subdir/file.md', type: 'exact' }
      ],
      outputFilePrefix: 'test'
    };

    const result = await fileCheckService.checkRequiredFiles(command, testDir);

    assert.strictEqual(result.allExist, false);
    assert.deepStrictEqual(result.missingFiles, [
      { path: 'subdir/file.md', type: 'exact' }
    ]);
  });

  test('should create modify-prompt.md with template content', () => {
    const missingFiles: RequiredFile[] = [
      { path: 'modify-prompt.md', type: 'exact' }
    ];

    fileCheckService.createMissingFiles(missingFiles, testDir);

    // Verify file was created in new path structure
    const metaDir = path.join(testDir, '.clauding');
    const filePath = path.join(metaDir, 'modify-prompt.md');
    assert.ok(fs.existsSync(filePath));

    // Verify file has template content
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.length > 0);
    assert.ok(content.includes('Plan Modification Instructions'));
    assert.ok(content.includes('Examples:'));
  });

  test('should create other files with empty content', () => {
    const missingFiles: RequiredFile[] = [
      { path: 'some-other-file.md', type: 'exact' }
    ];

    fileCheckService.createMissingFiles(missingFiles, testDir);

    // Verify file was created with empty content
    const metaDir = path.join(testDir, '.clauding');
    const filePath = path.join(metaDir, 'some-other-file.md');
    assert.ok(fs.existsSync(filePath));

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.strictEqual(content, '');
  });

  test('should check modify-prompt.md existence only, not content', async () => {
    // Create modify-prompt.md with just whitespace
    const metaDir = path.join(testDir, '.clauding');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, 'modify-prompt.md'), '   ');

    const command: AgentCommand = {
      name: 'Modify Plan',
      path: '.',
      prompt: 'Test prompt',
      requiredFiles: [
        { path: 'modify-prompt.md', type: 'exact' }
      ],
      outputFilePrefix: 'modify-plan'
    };

    const result = await fileCheckService.checkRequiredFiles(command, testDir);

    // modify-prompt.md should be considered as existing even with just whitespace
    assert.strictEqual(result.allExist, true);
    assert.deepStrictEqual(result.missingFiles, []);
    assert.deepStrictEqual(result.existingFiles, [
      { path: 'modify-prompt.md', type: 'exact' }
    ]);
  });

  test('should check prompt.md content, not just existence', async () => {
    // Create prompt.md with just whitespace
    const metaDir = path.join(testDir, '.clauding');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, 'prompt.md'), '   ');

    const command: AgentCommand = {
      name: 'Create Plan',
      path: '.',
      prompt: 'Test prompt',
      requiredFiles: [
        { path: 'prompt.md', type: 'exact' }
      ],
      outputFilePrefix: 'create-plan'
    };

    const result = await fileCheckService.checkRequiredFiles(command, testDir);

    // prompt.md with just whitespace should be considered missing
    assert.strictEqual(result.allExist, false);
    assert.deepStrictEqual(result.missingFiles, [
      { path: 'prompt.md', type: 'exact' }
    ]);
    assert.deepStrictEqual(result.existingFiles, []);
  });
});
