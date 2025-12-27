import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { TestService } from '../services/TestService';
import * as os from 'os';

suite('TestService Test Suite', () => {
  let testService: TestService;
  let testProjectRoot: string;
  let outputsDir: string;

  setup(() => {
    // Create a temporary test directory
    testProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'test-service-'));
    outputsDir = path.join(testProjectRoot, '.clauding', 'outputs');
    fs.mkdirSync(outputsDir, { recursive: true });

    // Initialize test service
    testService = new TestService('npm test');
  });

  teardown(() => {
    // Clean up
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });

  test('should run tests and capture output', async () => {
    // Create a simple test script
    const testScript = path.join(testProjectRoot, 'test.sh');
    fs.writeFileSync(testScript, '#!/bin/bash\necho "Test output"\nexit 0', { mode: 0o755 });

    // Create test service with the script (headless mode for testing)
    const service = new TestService(`bash ${testScript}`, true);

    // Use callback to get result in headless mode
    let result: any;
    await service.runTests(testProjectRoot, "test-feature", (r) => {
      result = r;
    });

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.output.includes('Test output'));
    assert.ok(fs.existsSync(result.outputFile));
    assert.ok(result.timestamp);
  });

  test('should capture failing test exit code', async () => {
    // Create a failing test script
    const testScript = path.join(testProjectRoot, 'test.sh');
    fs.writeFileSync(testScript, '#!/bin/bash\necho "Test failed"\nexit 1', { mode: 0o755 });

    const service = new TestService(`bash ${testScript}`, true);

    // Use callback to get result in headless mode
    let result: any;
    await service.runTests(testProjectRoot, "test-feature", (r) => {
      result = r;
    });

    assert.strictEqual(result.exitCode, 1);
    assert.ok(result.output.includes('Test failed'));
  });

  test('should get most recent test result', () => {
    // Create multiple test result files
    const file1 = path.join(outputsDir, 'test-run-20250101-120000.txt');
    const file2 = path.join(outputsDir, 'test-run-20250101-130000.txt');
    const file3 = path.join(outputsDir, 'test-run-20250101-140000.txt');

    fs.writeFileSync(file1, 'Test output 1');
    fs.writeFileSync(file2, 'Test output 2');
    fs.writeFileSync(file3, 'Test output 3');

    const result = testService.getMostRecentTestResult(testProjectRoot);

    assert.ok(result);
    assert.ok(result!.output.includes('Test output 3'));
    assert.ok(result!.outputFile.includes('test-run-20250101-140000.txt'));
  });

  test('should return null when no test results exist', () => {
    const result = testService.getMostRecentTestResult(testProjectRoot);
    assert.strictEqual(result, null);
  });

  test('should detect failing tests', () => {
    const outputFile = path.join(outputsDir, 'test-run-20250101-120000.txt');
    fs.writeFileSync(outputFile, 'Tests: 5 passed, 2 failed, 7 total');

    const hasFailingTests = testService.hasFailingTests(testProjectRoot);
    assert.strictEqual(hasFailingTests, true);
  });

  test('should not detect failing tests when none exist', () => {
    const outputFile = path.join(outputsDir, 'test-run-20250101-120000.txt');
    fs.writeFileSync(outputFile, 'Tests: 7 passed, 7 total');

    const hasFailingTests = testService.hasFailingTests(testProjectRoot);
    assert.strictEqual(hasFailingTests, false);
  });

  test('should handle test command not found', async () => {
    const service = new TestService('non-existent-command', true);

    // Use callback to get result in headless mode
    let result: any;
    await service.runTests(testProjectRoot, "test-feature", (r) => {
      result = r;
    });

    // Exit code 127 indicates command not found in shell
    assert.strictEqual(result.exitCode, 127);
    assert.ok(result.output.includes('not found') || result.output.includes('command not found'));
  });
});
