import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { TestParser } from '../services/TestParser';

suite('TestParser Test Suite', () => {
	let testDir: string;
	let parser: TestParser;

	setup(() => {
		// Create a temporary directory for tests
		testDir = path.join(__dirname, '../../test-temp', `parser-${Date.now()}`);
		fs.mkdirSync(testDir, { recursive: true });

		parser = new TestParser();
	});

	teardown(() => {
		// Clean up test directory
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	suite('parseTestOutput', () => {
		test('should parse passing tests', () => {
			const output = `
  Test Suite Name
    ✔ should pass test 1 (5ms)
    ✔ should pass test 2 (3ms)

  2 passing (100ms)
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.summary.passed, 2);
			assert.strictEqual(result.summary.failed, 0);
			assert.strictEqual(result.summary.total, 2);
			assert.strictEqual(result.exitCode, 0);
		});

		test('should parse failing tests', () => {
			const output = `
  Test Suite Name
    ✔ should pass test 1
    ✖ should fail test 2

  1 passing
  1 failing
`;

			const result = parser.parseTestOutput(output, 1, 'npm test');

			assert.strictEqual(result.summary.passed, 1);
			assert.strictEqual(result.summary.failed, 1);
			assert.strictEqual(result.summary.total, 2);
			assert.strictEqual(result.exitCode, 1);
		});

		test('should extract test duration', () => {
			const output = `
  Test Suite
    ✔ test 1

  1 passing (5s)
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.duration, '5s');
		});

		test('should parse pending/skipped tests', () => {
			const output = `
  Test Suite
    ✔ test 1

  1 passing
  2 pending
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.summary.passed, 1);
			assert.strictEqual(result.summary.skipped, 2);
			assert.strictEqual(result.summary.total, 3);
		});

		test('should parse test suites', () => {
			const output = `
  Suite 1
    ✔ test 1
    ✔ test 2

  Suite 2
    ✔ test 3

  3 passing
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.testSuites.length, 2);
			assert.strictEqual(result.testSuites[0].name, 'Suite 1');
			assert.strictEqual(result.testSuites[0].tests.length, 2);
			assert.strictEqual(result.testSuites[1].name, 'Suite 2');
			assert.strictEqual(result.testSuites[1].tests.length, 1);
		});

		test('should parse test names', () => {
			const output = `
  Suite 1
    ✔ should do something
    ✔ should do something else

  2 passing
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.testSuites[0].tests[0].name, 'should do something');
			assert.strictEqual(result.testSuites[0].tests[1].name, 'should do something else');
		});

		test('should parse test durations', () => {
			const output = `
  Suite 1
    ✔ test 1 (39ms)
    ✔ test 2 (100ms)

  2 passing
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.testSuites[0].tests[0].duration, '39ms');
			assert.strictEqual(result.testSuites[0].tests[1].duration, '100ms');
		});

		test('should extract failed test details', () => {
			const output = `
  Suite 1
    ✖ failing test

      AssertionError: expected 1 to equal 2
        at Context.<anonymous> (test.js:10:5)

  1 failing
`;

			const result = parser.parseTestOutput(output, 1, 'npm test');

			assert.strictEqual(result.testSuites[0].tests[0].status, 'fail');
			assert.ok(result.testSuites[0].tests[0].error);
			assert.ok(result.testSuites[0].tests[0].error?.includes('AssertionError'));
		});

		test('should parse error stack traces', () => {
			const output = `
  Suite 1
    ✖ failing test

      Error: Test failed
        at Context.<anonymous> (test.js:10:5)
        at processImmediate (internal/timers.js:464:21)

  1 failing
`;

			const result = parser.parseTestOutput(output, 1, 'npm test');

			const failedTest = result.testSuites[0].tests[0];
			assert.ok(failedTest.stack);
			assert.ok(failedTest.stack?.includes('at Context.<anonymous>'));
			assert.ok(failedTest.stack?.includes('at processImmediate'));
		});

		test('should handle ANSI color codes', () => {
			const output = `
  \x1B[32mSuite 1\x1B[0m
    \x1B[32m✔\x1B[0m test 1

  \x1B[32m1 passing\x1B[0m
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.summary.passed, 1);
			assert.strictEqual(result.testSuites[0].name, 'Suite 1');
		});

		test('should include timestamp', () => {
			const output = '1 passing';
			const timestamp = '2025-10-28T10:30:00.000Z';

			const result = parser.parseTestOutput(output, 0, 'npm test', timestamp);

			assert.strictEqual(result.timestamp, timestamp);
		});

		test('should use current timestamp if not provided', () => {
			const output = '1 passing';
			const before = new Date().toISOString();
			const result = parser.parseTestOutput(output, 0, 'npm test');
			const after = new Date().toISOString();

			assert.ok(result.timestamp >= before);
			assert.ok(result.timestamp <= after);
		});

		test('should include test command', () => {
			const output = '1 passing';

			const result = parser.parseTestOutput(output, 0, 'npm run test:unit');

			assert.strictEqual(result.testCommand, 'npm run test:unit');
		});

		test('should handle empty output', () => {
			const output = '';

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.summary.total, 0);
			assert.strictEqual(result.testSuites.length, 0);
		});

		test('should count suite pass/fail correctly', () => {
			const output = `
  Suite 1
    ✔ test 1
    ✖ test 2
    ✔ test 3

  2 passing
  1 failing
`;

			const result = parser.parseTestOutput(output, 1, 'npm test');

			assert.strictEqual(result.testSuites[0].passed, 2);
			assert.strictEqual(result.testSuites[0].failed, 1);
		});

		test('should populate failedTests array', () => {
			const output = `
  Suite 1
    ✖ failing test 1

      Error: Test 1 failed

  Suite 2
    ✖ failing test 2

      Error: Test 2 failed

  2 failing
`;

			const result = parser.parseTestOutput(output, 1, 'npm test');

			assert.strictEqual(result.failedTests.length, 2);
			assert.strictEqual(result.failedTests[0].suite, 'Suite 1');
			assert.strictEqual(result.failedTests[0].test, 'failing test 1');
			assert.strictEqual(result.failedTests[1].suite, 'Suite 2');
			assert.strictEqual(result.failedTests[1].test, 'failing test 2');
		});
	});

	suite('parseTestOutputFile', () => {
		test('should parse test output from file', () => {
			const outputFile = path.join(testDir, 'test-run-2025-10-28-025855.txt');
			const content = `
  Suite 1
    ✔ test 1

  1 passing (5s)
`;
			fs.writeFileSync(outputFile, content);

			const result = parser.parseTestOutputFile(outputFile);

			assert.strictEqual(result.summary.passed, 1);
			assert.strictEqual(result.timestamp, '2025-10-28T02:58:55.000Z');
		});

		test('should extract timestamp from filename', () => {
			const outputFile = path.join(testDir, 'test-run-2025-10-28-123456.txt');
			fs.writeFileSync(outputFile, '1 passing');

			const result = parser.parseTestOutputFile(outputFile);

			assert.strictEqual(result.timestamp, '2025-10-28T12:34:56.000Z');
		});

		test('should guess exit code from output', () => {
			const passingFile = path.join(testDir, 'passing.txt');
			fs.writeFileSync(passingFile, '5 passing');

			const passingResult = parser.parseTestOutputFile(passingFile);
			assert.strictEqual(passingResult.exitCode, 0);

			const failingFile = path.join(testDir, 'failing.txt');
			fs.writeFileSync(failingFile, '1 failing');

			const failingResult = parser.parseTestOutputFile(failingFile);
			assert.strictEqual(failingResult.exitCode, 1);
		});

		test('should handle malformed filename timestamps', () => {
			const outputFile = path.join(testDir, 'test-invalid-timestamp.txt');
			fs.writeFileSync(outputFile, '1 passing');

			const result = parser.parseTestOutputFile(outputFile);

			// Should use current timestamp
			assert.ok(result.timestamp);
		});
	});

	suite('edge cases', () => {
		test('should handle output with no test markers', () => {
			const output = `
Running tests...
Test complete.
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.summary.total, 0);
			assert.strictEqual(result.testSuites.length, 0);
		});

		test('should handle multiline error messages', () => {
			const output = `
  Suite 1
    ✖ test 1

      Error: Multi
      line
      error

  1 failing
`;

			const result = parser.parseTestOutput(output, 1, 'npm test');

			const test = result.testSuites[0].tests[0];
			assert.ok(test.error);
			assert.ok(test.error?.includes('Multi'));
		});

		test('should handle tests without durations', () => {
			const output = `
  Suite 1
    ✔ test without duration

  1 passing
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.testSuites[0].tests[0].duration, undefined);
		});

		test('should handle suite with no tests', () => {
			const output = `
  Empty Suite

  0 passing
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			// May create empty suite or skip it
			assert.strictEqual(result.summary.total, 0);
		});

		test('should calculate total from suites if summary missing', () => {
			const output = `
  Suite 1
    ✔ test 1
    ✔ test 2
    ✔ test 3
`;

			const result = parser.parseTestOutput(output, 0, 'npm test');

			// Should calculate total from test cases
			assert.ok(result.summary.total >= 3 || result.testSuites[0].tests.length === 3);
		});

		test('should handle very long output', () => {
			let output = '  Suite 1\n';
			for (let i = 0; i < 1000; i++) {
				output += `    ✔ test ${i}\n`;
			}
			output += '\n  1000 passing\n';

			const result = parser.parseTestOutput(output, 0, 'npm test');

			assert.strictEqual(result.summary.passed, 1000);
		});
	});
});
