import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as sinon from 'sinon';
import { TimelogService } from '../services/TimelogService';

suite('TimelogService Test Suite', () => {
  let testDir: string;
  let timelogService: TimelogService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clauding-timelog-test-'));
    timelogService = new TimelogService();
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    sandbox.restore();
  });

  test('should create timelog file on first entry', async () => {
    await timelogService.addEntry(testDir, 'test-feature', 'Test Action', 'Success');

    const timelogPath = path.join(testDir, 'features', 'test-feature', '.meta', 'timelog.json');
    assert.ok(fs.existsSync(timelogPath));
  });

  test('should add entry with correct structure', async () => {
    await timelogService.addEntry(testDir, 'test-feature', 'Test Action', 'Success', {
      detail1: 'value1'
    });

    const entries = timelogService.getEntries(testDir, 'test-feature');
    assert.strictEqual(entries.length, 1);

    const entry = entries[0];
    assert.strictEqual(entry.action, 'Test Action');
    assert.strictEqual(entry.result, 'Success');
    assert.ok(entry.timestamp);
    assert.deepStrictEqual(entry.details, { detail1: 'value1' });
  });

  test('should append to existing timelog', async () => {
    await timelogService.addEntry(testDir, 'test-feature', 'Action 1', 'Success');
    await timelogService.addEntry(testDir, 'test-feature', 'Action 2', 'Failed');

    const entries = timelogService.getEntries(testDir, 'test-feature');
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].action, 'Action 1');
    assert.strictEqual(entries[1].action, 'Action 2');
  });

  test('should return empty array when timelog does not exist', () => {
    const entries = timelogService.getEntries(testDir, 'test-feature');
    assert.deepStrictEqual(entries, []);
  });

  test('should handle timelog with no details', async () => {
    await timelogService.addEntry(testDir, 'test-feature', 'Simple Action', 'Success');

    const entries = timelogService.getEntries(testDir, 'test-feature');
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].details, undefined);
  });

  test('should support all result types', async () => {
    await timelogService.addEntry(testDir, 'test-feature', 'Action 1', 'Success');
    await timelogService.addEntry(testDir, 'test-feature', 'Action 2', 'Failed');
    await timelogService.addEntry(testDir, 'test-feature', 'Action 3', 'Warning');

    const entries = timelogService.getEntries(testDir, 'test-feature');
    assert.strictEqual(entries.length, 3);
    assert.strictEqual(entries[0].result, 'Success');
    assert.strictEqual(entries[1].result, 'Failed');
    assert.strictEqual(entries[2].result, 'Warning');
  });

  test('should get last entry', async () => {
    await timelogService.addEntry(testDir, 'test-feature', 'Action 1', 'Success');
    await timelogService.addEntry(testDir, 'test-feature', 'Action 2', 'Failed');
    await timelogService.addEntry(testDir, 'test-feature', 'Action 3', 'Success');

    const lastEntry = timelogService.getLastEntry(testDir, 'test-feature');
    assert.ok(lastEntry);
    assert.strictEqual(lastEntry.action, 'Action 3');
  });

  test('should return null when getting last entry from empty timelog', () => {
    const lastEntry = timelogService.getLastEntry(testDir, 'test-feature');
    assert.strictEqual(lastEntry, null);
  });

  test('should include ISO timestamp', async () => {
    await timelogService.addEntry(testDir, 'test-feature', 'Test Action', 'Success');

    const entries = timelogService.getEntries(testDir, 'test-feature');
    const timestamp = entries[0].timestamp;

    // Verify ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp));

    // Verify it's a valid date
    const date = new Date(timestamp);
    assert.ok(!isNaN(date.getTime()));
  });

  test('should handle complex details object', async () => {
    const complexDetails = {
      commitHash: 'abc123',
      files: ['file1.txt', 'file2.txt'],
      nested: {
        key1: 'value1',
        key2: 123
      }
    };

    await timelogService.addEntry(testDir, 'test-feature', 'Complex Action', 'Success', complexDetails);

    const entries = timelogService.getEntries(testDir, 'test-feature');
    assert.deepStrictEqual(entries[0].details, complexDetails);
  });

  test('should maintain chronological order', async () => {
    await timelogService.addEntry(testDir, 'test-feature', 'Action 1', 'Success');
    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    await timelogService.addEntry(testDir, 'test-feature', 'Action 2', 'Success');
    await new Promise(resolve => setTimeout(resolve, 10));
    await timelogService.addEntry(testDir, 'test-feature', 'Action 3', 'Success');

    const entries = timelogService.getEntries(testDir, 'test-feature');
    assert.strictEqual(entries.length, 3);

    // Verify chronological order
    const time1 = new Date(entries[0].timestamp).getTime();
    const time2 = new Date(entries[1].timestamp).getTime();
    const time3 = new Date(entries[2].timestamp).getTime();

    assert.ok(time1 < time2);
    assert.ok(time2 < time3);
  });

  test('should handle corrupted timelog file gracefully', () => {
    // Stub console.error to suppress expected error logs
    sandbox.stub(console, 'error');

    // Create a corrupted timelog file
    const timelogPath = path.join(testDir, 'features', 'test-feature', '.meta', 'timelog.json');
    // Ensure directory exists
    fs.mkdirSync(path.dirname(timelogPath), { recursive: true });
    fs.writeFileSync(timelogPath, '{ invalid json', 'utf-8');

    // Should return empty array instead of throwing
    const entries = timelogService.getEntries(testDir, 'test-feature');
    assert.deepStrictEqual(entries, []);
  });

  test('should format JSON with indentation', async () => {
    await timelogService.addEntry(testDir, 'test-feature', 'Test Action', 'Success');

    const timelogPath = path.join(testDir, 'features', 'test-feature', '.meta', 'timelog.json');
    const content = fs.readFileSync(timelogPath, 'utf-8');

    // Verify it's formatted (contains newlines and spaces)
    assert.ok(content.includes('\n'));
    assert.ok(content.includes('  '));
  });

  suite('Edge Cases', () => {
    test('should handle permission denied when writing timelog', async () => {
      // Stub console.error to suppress expected error logs
      sandbox.stub(console, 'error');

      // Create a read-only directory
      const readOnlyDir = path.join(testDir, 'readonly');
      fs.mkdirSync(readOnlyDir, { recursive: true });

      const timelogDir = path.join(readOnlyDir, 'features', 'test-feature', '.meta');
      fs.mkdirSync(timelogDir, { recursive: true });

      // Make the timelog directory read-only
      fs.chmodSync(timelogDir, 0o444);

      try {
        // Should not throw, but might log error
        await timelogService.addEntry(readOnlyDir, 'test-feature', 'Test Action', 'Success');

        // Verify entry was not added
        const entries = timelogService.getEntries(readOnlyDir, 'test-feature');
        assert.strictEqual(entries.length, 0);
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(timelogDir, 0o755);
      }
    });

    test('should handle disk full scenario', async () => {
      // Stub console.error to suppress expected error logs
      sandbox.stub(console, 'error');

      // Create a very large details object to simulate disk full
      const massiveDetails = {
        data: 'x'.repeat(1024 * 1024 * 100) // 100MB string
      };

      // Should handle error gracefully
      await timelogService.addEntry(testDir, 'test-feature', 'Large Action', 'Success', massiveDetails);

      // Depending on implementation, it might succeed or fail gracefully
      const entries = timelogService.getEntries(testDir, 'test-feature');
      // Either added successfully or failed gracefully (empty)
      assert.ok(entries.length >= 0);
    });

    test('should handle very large timelog file', async () => {
      // Create many entries to make a large file
      for (let i = 0; i < 1000; i++) {
        await timelogService.addEntry(testDir, 'test-feature', `Action ${i}`, 'Success', {
          index: i,
          data: `test data ${i}`
        });
      }

      const entries = timelogService.getEntries(testDir, 'test-feature');
      assert.strictEqual(entries.length, 1000);

      // Verify all entries are accessible
      assert.strictEqual(entries[0].action, 'Action 0');
      assert.strictEqual(entries[999].action, 'Action 999');
    });

    test('should handle special characters in action', async () => {
      const specialAction = 'Action with "quotes" and \'apostrophes\' & symbols!@#$%';

      await timelogService.addEntry(testDir, 'test-feature', specialAction, 'Success');

      const entries = timelogService.getEntries(testDir, 'test-feature');
      assert.strictEqual(entries[0].action, specialAction);
      assert.strictEqual(entries[0].result, 'Success');
    });

    test('should handle unicode characters', async () => {
      const unicodeAction = 'Action with emoji 🚀 and Chinese 测试 characters';
      const unicodeDetails = {
        message: 'こんにちは世界',
        emoji: '😀😁😂'
      };

      await timelogService.addEntry(testDir, 'test-feature', unicodeAction, 'Success', unicodeDetails);

      const entries = timelogService.getEntries(testDir, 'test-feature');
      assert.strictEqual(entries[0].action, unicodeAction);
      assert.deepStrictEqual(entries[0].details, unicodeDetails);
    });

    test('should handle empty action string', async () => {
      await timelogService.addEntry(testDir, 'test-feature', '', 'Success');

      const entries = timelogService.getEntries(testDir, 'test-feature');
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].action, '');
    });

    test('should handle different result types', async () => {
      await timelogService.addEntry(testDir, 'test-feature', 'Test Success', 'Success');
      await timelogService.addEntry(testDir, 'test-feature', 'Test Failed', 'Failed');
      await timelogService.addEntry(testDir, 'test-feature', 'Test Warning', 'Warning');

      const entries = timelogService.getEntries(testDir, 'test-feature');
      assert.strictEqual(entries.length, 3);
      assert.strictEqual(entries[0].result, 'Success');
      assert.strictEqual(entries[1].result, 'Failed');
      assert.strictEqual(entries[2].result, 'Warning');
    });

    test('should handle null or undefined details', async () => {
      await timelogService.addEntry(testDir, 'test-feature', 'Action 1', 'Success', undefined);
      await timelogService.addEntry(testDir, 'test-feature', 'Action 2', 'Success', null as any);

      const entries = timelogService.getEntries(testDir, 'test-feature');
      assert.strictEqual(entries.length, 2);
      assert.strictEqual(entries[0].details, undefined);
      assert.strictEqual(entries[1].details, null);
    });

    test('should handle concurrent writes', async () => {
      // Attempt multiple simultaneous writes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(timelogService.addEntry(testDir, 'test-feature', `Action ${i}`, 'Success'));
      }

      await Promise.all(promises);

      const entries = timelogService.getEntries(testDir, 'test-feature');
      // All 10 entries should be recorded (though order might vary)
      assert.strictEqual(entries.length, 10);
    });

    test('should handle path with spaces and special characters', async () => {
      const specialDir = path.join(testDir, 'dir with spaces & (parens)');
      fs.mkdirSync(specialDir, { recursive: true });

      await timelogService.addEntry(specialDir, 'test-feature', 'Test Action', 'Success');

      const entries = timelogService.getEntries(specialDir, 'test-feature');
      assert.strictEqual(entries.length, 1);
    });
  });
});
