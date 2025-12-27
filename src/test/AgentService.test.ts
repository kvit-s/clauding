import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { waitForFileStability } from '../utils/fileStability';

suite('AgentService Test Suite', () => {
  let testDir: string;

  setup(() => {
    // Create a temporary directory for tests
    testDir = path.join(__dirname, '../../test-temp', `agent-${Date.now()}`);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  teardown(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should wait for file stability before reading', async () => {
    const testFile = path.join(testDir, 'test-output.txt');

    // Create a file and simulate gradual writing
    const writeGradually = async () => {
      fs.writeFileSync(testFile, 'Line 1\n');
      await new Promise(resolve => setTimeout(resolve, 150));
      fs.appendFileSync(testFile, 'Line 2\n');
      await new Promise(resolve => setTimeout(resolve, 150));
      fs.appendFileSync(testFile, 'Line 3\n');
    };

    // Start writing in background
    const writePromise = writeGradually();

    // This should wait until the file stops growing
    const startTime = Date.now();
    await waitForFileStability(testFile, {
      checkInterval: 100,
      maxWaitTime: 2000
    });
    const endTime = Date.now();

    // Should have waited at least 300ms (3 writes with delays)
    assert.ok(endTime - startTime >= 300, 'Should wait for file to stabilize');

    await writePromise;

    // File should contain all three lines
    const content = fs.readFileSync(testFile, 'utf-8');
    assert.ok(content.includes('Line 1'), 'Should contain Line 1');
    assert.ok(content.includes('Line 2'), 'Should contain Line 2');
    assert.ok(content.includes('Line 3'), 'Should contain Line 3');
  });

  test('should timeout after max wait time', async () => {
    const testFile = path.join(testDir, 'slow-output.txt');

    // Create a file that keeps growing
    fs.writeFileSync(testFile, 'Initial\n');

    const keepWriting = setInterval(() => {
      if (fs.existsSync(testFile)) {
        fs.appendFileSync(testFile, 'More data\n');
      }
    }, 50);

    try {
      const startTime = Date.now();
      await waitForFileStability(testFile, {
        checkInterval: 100,
        maxWaitTime: 2000
      });
      const endTime = Date.now();

      // Should timeout around maxStabilityWaitTime (2000ms)
      const elapsed = endTime - startTime;
      assert.ok(elapsed >= 2000, 'Should wait at least maxStabilityWaitTime');
      assert.ok(elapsed < 2500, 'Should not wait much longer than maxStabilityWaitTime');
    } finally {
      clearInterval(keepWriting);
    }
  });

  test('should handle non-existent file gracefully', async () => {
    const nonExistentFile = path.join(testDir, 'does-not-exist.txt');

    // Should not throw and should return immediately
    const startTime = Date.now();
    await waitForFileStability(nonExistentFile, {
      checkInterval: 100,
      maxWaitTime: 2000
    });
    const endTime = Date.now();

    // Should return almost immediately (< 100ms)
    assert.ok(endTime - startTime < 100, 'Should return immediately for non-existent file');
  });

  test('should detect stable file quickly', async () => {
    const testFile = path.join(testDir, 'stable-output.txt');

    // Create a file with content
    fs.writeFileSync(testFile, 'Complete content\n');

    const startTime = Date.now();
    await waitForFileStability(testFile, {
      checkInterval: 100,
      maxWaitTime: 2000
    });
    const endTime = Date.now();

    // Should detect stability quickly (2 checks * 100ms interval = ~200ms)
    assert.ok(endTime - startTime < 500, 'Should detect stable file quickly');
    assert.ok(endTime - startTime >= 200, 'Should wait for at least 2 stability checks');
  });
});
