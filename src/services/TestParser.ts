import * as fs from 'fs';

/**
 * Parsed test result structure
 */
export interface ParsedTestResult {
  timestamp: string;           // ISO 8601 timestamp
  testCommand: string;          // e.g., "npm test"
  exitCode: number;             // Exit code from test run
  duration?: string;            // Total execution time (e.g., "5s")
  summary: {
    total: number;              // Total test count
    passed: number;             // Passed test count
    failed: number;             // Failed test count
    skipped?: number;           // Skipped test count (if available)
  };
  testSuites: TestSuite[];      // Detailed suite information
  failedTests: FailedTest[];    // Quick access to failures
}

/**
 * Test suite information
 */
export interface TestSuite {
  name: string;                 // Suite name (describe block)
  passed: number;               // Pass count for this suite
  failed: number;               // Fail count for this suite
  tests: TestCase[];            // Individual test cases
}

/**
 * Individual test case
 */
export interface TestCase {
  name: string;                 // Test name (it block)
  status: 'pass' | 'fail';      // Test status
  duration?: string;            // Execution time (e.g., "39ms")
  error?: string;               // Error message (for failures)
  stack?: string;               // Stack trace (for failures)
}

/**
 * Failed test information
 */
export interface FailedTest {
  suite: string;                // Parent suite name
  test: string;                 // Test name
  error: string;                // Error message
  stack: string;                // Full stack trace
}

/**
 * Parser for Mocha test output
 */
export class TestParser {
  // ANSI escape code pattern
  // eslint-disable-next-line @typescript-eslint/naming-convention, no-control-regex
  private readonly ANSI_REGEX = /\x1B\[[0-9;]*m/g;

  // Summary line patterns
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly SUMMARY_PASSING_REGEX = /(\d+)\s+passing(?:\s+\(([^)]+)\))?/;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly SUMMARY_FAILING_REGEX = /(\d+)\s+failing/;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly SUMMARY_PENDING_REGEX = /(\d+)\s+pending/;

  // Test case patterns
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly PASS_MARKER = '✔';
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly FAIL_MARKER = '✖';

  // Error patterns
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly ERROR_START = /^[A-Za-z]+Error:/;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly ERROR_AT = /^\s+at\s/;

  /**
   * Parse raw Mocha test output file into structured JSON
   * @param outputFilePath Path to the raw test output file
   * @returns Parsed test result
   */
  public parseTestOutputFile(outputFilePath: string): ParsedTestResult {
    const rawOutput = fs.readFileSync(outputFilePath, 'utf8');

    // Extract timestamp from filename (e.g., test-run-2025-10-28-025855.txt)
    const timestampMatch = outputFilePath.match(/test-run-(.+)\.txt$/);
    const timestamp = timestampMatch
      ? this.parseTimestampFromFilename(timestampMatch[1])
      : new Date().toISOString();

    // Default test command (can be overridden)
    const testCommand = 'npm test';

    // Default exit code (0 for success, 1 for failure)
    const exitCode = this.guessExitCode(rawOutput);

    return this.parseTestOutput(rawOutput, exitCode, testCommand, timestamp);
  }

  /**
   * Parse raw Mocha test output string into structured JSON
   * @param rawOutput Raw test output string
   * @param exitCode Test execution exit code
   * @param testCommand Command that was run (e.g., "npm test")
   * @param timestamp Optional timestamp (defaults to current time)
   * @returns Parsed test result
   */
  public parseTestOutput(
    rawOutput: string,
    exitCode: number,
    testCommand: string,
    timestamp?: string
  ): ParsedTestResult {
    // Strip ANSI codes for clean parsing
    const cleanOutput = this.stripAnsiCodes(rawOutput);

    // Extract summary information
    const summary = this.extractSummary(cleanOutput);

    // Parse test suites and individual tests
    const testSuites = this.parseTestSuites(cleanOutput);

    // Extract failed tests with error details
    const failedTests = this.extractFailedTests(cleanOutput, testSuites);

    // Calculate total if not available from summary
    if (summary.total === 0 && testSuites.length > 0) {
      summary.total = this.calculateTotalTests(testSuites);
    }

    return {
      timestamp: timestamp || new Date().toISOString(),
      testCommand,
      exitCode,
      duration: this.extractDuration(cleanOutput),
      summary,
      testSuites,
      failedTests
    };
  }

  /**
   * Remove ANSI color codes from string
   */
  private stripAnsiCodes(text: string): string {
    return text.replace(this.ANSI_REGEX, '');
  }

  /**
   * Extract summary line (e.g., "158 passing (5s)")
   */
  private extractSummary(output: string): ParsedTestResult['summary'] {
    const summary = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    };

    // Extract passing count
    const passingMatch = output.match(this.SUMMARY_PASSING_REGEX);
    if (passingMatch) {
      summary.passed = parseInt(passingMatch[1], 10);
    }

    // Extract failing count
    const failingMatch = output.match(this.SUMMARY_FAILING_REGEX);
    if (failingMatch) {
      summary.failed = parseInt(failingMatch[1], 10);
    }

    // Extract pending/skipped count
    const pendingMatch = output.match(this.SUMMARY_PENDING_REGEX);
    if (pendingMatch) {
      summary.skipped = parseInt(pendingMatch[1], 10);
    }

    // Calculate total
    summary.total = summary.passed + summary.failed + (summary.skipped || 0);

    return summary;
  }

  /**
   * Extract test duration from summary line
   */
  private extractDuration(output: string): string | undefined {
    const passingMatch = output.match(this.SUMMARY_PASSING_REGEX);
    if (passingMatch && passingMatch[2]) {
      return passingMatch[2]; // e.g., "5s"
    }
    return undefined;
  }

  /**
   * Parse test suites and individual test cases
   */
  private parseTestSuites(output: string): TestSuite[] {
    const lines = output.split('\n');
    const suites: TestSuite[] = [];
    let currentSuite: TestSuite | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines
      if (!line.trim()) {
        continue;
      }

      // Check if this is a test suite name (2-space indent or no indent, no marker)
      // Suite names typically have 2-4 spaces of indentation
      if (this.isSuiteLine(line)) {
        const suiteName = line.trim();
        currentSuite = {
          name: suiteName,
          passed: 0,
          failed: 0,
          tests: []
        };
        suites.push(currentSuite);
        continue;
      }

      // Check if this is a test case (contains ✔ or ✖)
      if (this.isTestLine(line) && currentSuite) {
        const testCase = this.parseTestCase(line, lines, i);
        if (testCase) {
          currentSuite.tests.push(testCase);
          if (testCase.status === 'pass') {
            currentSuite.passed++;
          } else {
            currentSuite.failed++;
          }
        }
      }
    }

    return suites;
  }

  /**
   * Check if a line is a test suite name
   */
  private isSuiteLine(line: string): boolean {
    // Suite lines have indentation but no test markers
    // They typically start with 2-4 spaces followed by text (not a marker)
    const trimmed = line.trim();
    const hasIndent = line.startsWith('  ') && !line.startsWith('    ');
    const noMarker = !line.includes(this.PASS_MARKER) && !line.includes(this.FAIL_MARKER);
    const notError = !this.ERROR_START.test(trimmed) && !this.ERROR_AT.test(line);
    const notSummary = !/^\d+\s+(passing|failing|pending)/.test(trimmed);

    return trimmed.length > 0 && hasIndent && noMarker && notError && notSummary;
  }

  /**
   * Check if a line is a test case
   */
  private isTestLine(line: string): boolean {
    return line.includes(this.PASS_MARKER) || line.includes(this.FAIL_MARKER);
  }

  /**
   * Parse a test case from a line
   */
  private parseTestCase(line: string, lines: string[], lineIndex: number): TestCase | null {
    const isPassing = line.includes(this.PASS_MARKER);
    const isFailing = line.includes(this.FAIL_MARKER);

    if (!isPassing && !isFailing) {
      return null;
    }

    // Extract test name (remove marker and indentation)
    const marker = isPassing ? this.PASS_MARKER : this.FAIL_MARKER;
    const parts = line.split(marker);
    if (parts.length < 2) {
      return null;
    }

    let testName = parts[1].trim();

    // Extract duration if present (e.g., "(39ms)")
    let duration: string | undefined;
    const durationMatch = testName.match(/\((\d+ms)\)$/);
    if (durationMatch) {
      duration = durationMatch[1];
      testName = testName.replace(/\s*\(\d+ms\)$/, '').trim();
    }

    const testCase: TestCase = {
      name: testName,
      status: isPassing ? 'pass' : 'fail',
      duration
    };

    // For failed tests, extract error details
    if (isFailing) {
      const errorDetails = this.extractErrorDetailsForTest(lines, lineIndex);
      if (errorDetails) {
        testCase.error = errorDetails.error;
        testCase.stack = errorDetails.stack;
      }
    }

    return testCase;
  }

  /**
   * Extract failed test details with error messages
   */
  private extractFailedTests(output: string, testSuites: TestSuite[]): FailedTest[] {
    const failedTests: FailedTest[] = [];

    for (const suite of testSuites) {
      for (const test of suite.tests) {
        if (test.status === 'fail' && test.error) {
          failedTests.push({
            suite: suite.name,
            test: test.name,
            error: test.error,
            stack: test.stack || ''
          });
        }
      }
    }

    return failedTests;
  }

  /**
   * Extract error message and stack trace for a failed test
   * Looks ahead from the test line to find error details
   */
  private extractErrorDetailsForTest(
    lines: string[],
    testLineIndex: number
  ): { error: string; stack: string } | null {
    const errorLines: string[] = [];
    let foundError = false;

    // Look ahead to find error details
    for (let i = testLineIndex + 1; i < lines.length && i < testLineIndex + 50; i++) {
      const line = lines[i];

      // Stop if we hit another test or suite
      if (this.isTestLine(line) || this.isSuiteLine(line)) {
        break;
      }

      // Stop if we hit a summary line
      if (/^\d+\s+(passing|failing|pending)/.test(line.trim())) {
        break;
      }

      // Check if this is an error line
      const trimmed = line.trim();
      if (this.ERROR_START.test(trimmed) || trimmed.startsWith('Error:')) {
        foundError = true;
        errorLines.push(line);
        continue;
      }

      // If we found an error, collect stack trace lines
      if (foundError) {
        // Stack trace lines typically start with "at " or have indentation
        if (this.ERROR_AT.test(line) || line.startsWith('    ')) {
          errorLines.push(line);
        } else if (trimmed.length > 0) {
          // Non-empty line that's not part of stack trace
          errorLines.push(line);
        } else {
          // Empty line might indicate end of error
          if (errorLines.length > 0) {
            break;
          }
        }
      } else if (trimmed.length > 0) {
        // Before finding error marker, collect relevant lines
        errorLines.push(line);
      }
    }

    if (errorLines.length === 0) {
      return null;
    }

    // Join all error lines
    const fullError = errorLines.map(l => l.trimEnd()).join('\n').trim();

    // Try to extract just the error message (first line)
    let errorMessage = fullError.split('\n')[0].trim();

    // If error message is too short, use more lines
    if (errorMessage.length < 10 && fullError.split('\n').length > 1) {
      errorMessage = fullError.split('\n').slice(0, 2).join(' ').trim();
    }

    return {
      error: errorMessage,
      stack: fullError
    };
  }

  /**
   * Determine total test count from suites
   */
  private calculateTotalTests(suites: TestSuite[]): number {
    return suites.reduce((total, suite) => total + suite.tests.length, 0);
  }

  /**
   * Parse timestamp from filename format (e.g., "2025-10-28-025855")
   */
  private parseTimestampFromFilename(timestamp: string): string {
    // Format: YYYY-MM-DD-HHMMSS
    // Convert to: YYYY-MM-DDTHH:MM:SS.000Z
    const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
    }
    return new Date().toISOString();
  }

  /**
   * Guess exit code from output if not provided
   */
  private guessExitCode(output: string): number {
    const cleanOutput = this.stripAnsiCodes(output);
    const failingMatch = cleanOutput.match(this.SUMMARY_FAILING_REGEX);
    return failingMatch ? 1 : 0;
  }
}
