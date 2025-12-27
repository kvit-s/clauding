import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { getAbsoluteOutputPath, getAbsoluteOutputsDir } from '../utils/featureMetaPaths';
import { MessageService } from './MessageService';
import { TestParser, ParsedTestResult } from './TestParser';
import { GitService } from './GitService';
import { ITerminalProvider, ITerminal, TerminalType } from '../terminals/ITerminalProvider';
import { TmuxBufferCapture } from '../terminals/tmux/TmuxBufferCapture';
import { TmuxTerminal } from '../terminals/tmux/TmuxTerminal';

export interface TestResult {
  exitCode: number;
  output: string;
  outputFile: string;
  timestamp: string;
  parsedResult?: ParsedTestResult;  // Optional parsed test result
}

interface PendingTestRun {
  featureName: string;
  worktreePath: string;
  outputDir: string;
  outputFile: string;
  terminal: ITerminal;
  onComplete?: (result: TestResult) => void;
  bufferCapture?: TmuxBufferCapture; // For tmux terminals
}

export class TestService {
  private testCommand: string;
  private headless: boolean;
  private messageService: MessageService;
  private terminalProvider?: ITerminalProvider;
  private pendingTestRuns: Map<string, PendingTestRun> = new Map();
  private terminalCloseDisposable: vscode.Disposable | undefined;

  constructor(
    testCommand: string,
    headless: boolean = false,
    messageService?: MessageService,
    terminalProvider?: ITerminalProvider
  ) {
    this.testCommand = testCommand;
    this.headless = headless;
    this.messageService = messageService || new MessageService();
    this.terminalProvider = terminalProvider;

    // Set up terminal close listener if provider is available
    if (this.terminalProvider) {
      this.terminalCloseDisposable = this.terminalProvider.onDidCloseTerminal((terminal) => {
        this.handleTerminalClose(terminal);
      });
    }
  }

  /**
   * Run tests in a visible terminal with output capture
   */
  public async runTests(
    worktreePath: string,
    featureName: string,
    onComplete?: (result: TestResult) => void
  ): Promise<void> {
    // Check if we should run in headless mode (no UI interactions)
    const isHeadless = this.headless ||
                       process.env.NODE_ENV === 'test' ||
                       process.env.VSCODE_TEST === '1' ||
                       typeof process.env.MOCHA_COLORS !== 'undefined';

    if (isHeadless) {
      // In headless mode, run synchronously without terminal/UI
      const result = await this.runTestsSynchronous(worktreePath, featureName);
      if (onComplete) {
        onComplete(result);
      }
      return;
    }

    // Normal flow with terminal and user interaction
    const timestamp = this.getTimestamp();

    // Get current commit hash for tracking
    const gitService = new GitService();
    const commitHash = gitService.getCurrentCommitShortSync(worktreePath);
    const commitSuffix = commitHash ? `-${commitHash}` : '';

    const outputFileName = `test-run-${timestamp}${commitSuffix}.txt`;
    const outputFile = getAbsoluteOutputPath(worktreePath, featureName, outputFileName);

    // Ensure outputs directory exists
    const outputsDir = getAbsoluteOutputsDir(worktreePath, featureName);
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }

    // Create a terminal for running tests using the terminal provider
    const terminal = this.terminalProvider
      ? await this.terminalProvider.createTerminal({
          name: `Tests: ${featureName}`,
          type: TerminalType.Test,
          cwd: worktreePath,
          featureName: featureName,
          show: true,
          preserveFocus: true
        })
      : // Fallback to vscode.window.createTerminal if no provider
        vscode.window.createTerminal({
          name: `Tests: ${featureName}`,
          cwd: worktreePath
        }) as unknown as ITerminal; // Type assertion for fallback case

    // Check if terminal supports buffer reading (tmux terminal)
    const useBufferCapture = terminal instanceof TmuxTerminal && this.terminalProvider?.supportsBufferReading();
    let bufferCapture: TmuxBufferCapture | undefined;

    if (useBufferCapture) {
      // Use buffer-based capture for tmux terminals
      bufferCapture = new TmuxBufferCapture(terminal as TmuxTerminal, {
        captureInterval: 1000,
        includeHistory: true,
        saveToFile: true,
        outputFilePath: outputFile,
        appendToFile: false // Overwrite mode for tests
      });

      // Start capturing
      await bufferCapture.startCapture();

      // Run the test command directly (no tee needed)
      terminal.sendText(this.testCommand, true);
    } else {
      // Use file-based capture for VS Code terminals (fallback)
      // Build command with tee to both display in terminal AND save to file
      // 2>&1 captures both stdout and stderr
      const commandWithCapture = `${this.testCommand} 2>&1 | tee "${outputFile}"`;

      // Run command
      if (!this.terminalProvider) {
        // If using fallback, show terminal manually
        (terminal as any).show(true);
      }
      terminal.sendText(commandWithCapture, true);
    }

    // Store pending test run for terminal close detection
    this.pendingTestRuns.set(featureName, {
      featureName,
      worktreePath,
      outputDir: outputsDir,
      outputFile,
      terminal,
      onComplete,
      bufferCapture
    });

    // Add message to message panel (instead of popup)
    this.messageService.addMessage(
      worktreePath,
      featureName,
      '🧪 Tests running in terminal. Press Ctrl+C to stop if needed.',
      'info',
      {
        dismissible: true,
        actions: [
          { label: 'Tests Done - Save Results', command: 'saveTestResults', args: [] }
        ]
      }
    );
  }

  /**
   * Run tests synchronously for test environment (no terminal UI)
   */
  private async runTestsSynchronous(worktreePath: string, featureName: string): Promise<TestResult> {
    const timestamp = this.getTimestamp();

    // Get current commit hash for tracking
    const gitService = new GitService();
    const commitHash = gitService.getCurrentCommitShortSync(worktreePath);
    const commitSuffix = commitHash ? `-${commitHash}` : '';

    const outputFileName = `test-run-${timestamp}${commitSuffix}.txt`;
    const outputFile = getAbsoluteOutputPath(worktreePath, featureName, outputFileName);

    // Ensure outputs directory exists
    const outputsDir = getAbsoluteOutputsDir(worktreePath, featureName);
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }

    return new Promise((resolve) => {

      // Run command and capture output
      // Use shell to execute the command string properly
      const process = spawn('/bin/sh', ['-c', this.testCommand], {
        cwd: worktreePath
      });

      let stdoutData = '';
      let stderrData = '';

      process.stdout?.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });

      process.stderr?.on('data', (data: Buffer) => {
        stderrData += data.toString();
      });

      process.on('close', (code: number) => {
        const output = stdoutData + stderrData;

        // Write to output file
        fs.writeFileSync(outputFile, output, 'utf-8');

        // Parse test output and save JSON
        let parsedResult: ParsedTestResult | undefined;
        try {
          const parser = new TestParser();
          parsedResult = parser.parseTestOutput(
            output,
            code || 0,
            this.testCommand,
            new Date().toISOString()
          );

          // Save parsed JSON output
          const jsonOutputPath = outputFile.replace('.txt', '.json');
          fs.writeFileSync(
            jsonOutputPath,
            JSON.stringify(parsedResult, null, 2),
            'utf8'
          );
        } catch (parseError) {
          // Don't fail if parsing fails - just log and continue
          console.error('Failed to parse test output:', parseError);
        }

        resolve({
          exitCode: code || 0,
          output: output,
          outputFile: outputFile,
          timestamp: new Date().toISOString(),
          parsedResult
        });
      });

      process.on('error', (error: Error) => {
        const errorOutput = `Test command failed: ${error.message}`;
        fs.writeFileSync(outputFile, errorOutput, 'utf-8');

        resolve({
          exitCode: 1,
          output: errorOutput,
          outputFile: outputFile,
          timestamp: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Get most recent test result for a feature
   */
  public getMostRecentTestResult(worktreePath: string): TestResult | null {
    const featureName = path.basename(worktreePath);
    const outputsDir = getAbsoluteOutputsDir(worktreePath, featureName);
    if (!fs.existsSync(outputsDir)) {
      return null;
    }

    const testFiles = fs.readdirSync(outputsDir)
      .filter(f => f.startsWith('test-run-'))
      .sort()
      .reverse();

    if (testFiles.length === 0) {
      return null;
    }

    const filePath = path.join(outputsDir, testFiles[0]);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse filename for timestamp
    const timestamp = testFiles[0].replace('test-run-', '').replace('.txt', '');

    return {
      exitCode: 0, // Unknown from file
      output: content,
      outputFile: filePath,
      timestamp: timestamp
    };
  }

  /**
   * Check if tests are currently failing
   */
  public hasFailingTests(worktreePath: string): boolean {
    const result = this.getMostRecentTestResult(worktreePath);
    if (!result) {
      return false;
    }

    // Check for parsed JSON file first (more accurate)
    const jsonPath = result.outputFile.replace('.txt', '.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const jsonContent = fs.readFileSync(jsonPath, 'utf8');
        const parsed: ParsedTestResult = JSON.parse(jsonContent);
        return parsed.summary.failed > 0;
      } catch (e) {
        // Fall back to old method if JSON parsing fails
        console.error('Failed to parse JSON test result:', e);
      }
    }

    // Fallback: Check if "failed" or "failing" appears in output
    return result.output.toLowerCase().includes('fail');
  }

  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString()
      .replace(/:/g, '')
      .replace(/\..+/, '')
      .replace('T', '-');
  }

  /**
   * Handle terminal close event - saves test results automatically
   */
  private async handleTerminalClose(terminal: ITerminal): Promise<void> {
    // Check if this is a test terminal
    if (!terminal.name.startsWith('Tests: ')) {
      return;
    }

    // Extract feature name from terminal name
    const featureName = terminal.name.replace('Tests: ', '');

    // Check if we have a pending test run for this feature
    const testRun = this.pendingTestRuns.get(featureName);
    if (!testRun) {
      return;
    }

    // Stop buffer capture if it was running
    if (testRun.bufferCapture) {
      testRun.bufferCapture.stopCapture();
      // Do a final capture to ensure we have all output
      await testRun.bufferCapture.captureOnce();
      testRun.bufferCapture.dispose();
    } else {
      // Wait a moment for output file to be written (file-based capture)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Read output file
    let output = '';
    try {
      output = fs.readFileSync(testRun.outputFile, 'utf-8');
    } catch (error) {
      output = `Error reading test output: ${error}`;
    }

    // Parse test output and save JSON
    let parsedResult: ParsedTestResult | undefined;
    try {
      const parser = new TestParser();
      parsedResult = parser.parseTestOutput(
        output,
        0, // We don't know the actual exit code from terminal
        this.testCommand,
        new Date().toISOString()
      );

      // Save parsed JSON output
      const jsonOutputPath = testRun.outputFile.replace('.txt', '.json');
      fs.writeFileSync(
        jsonOutputPath,
        JSON.stringify(parsedResult, null, 2),
        'utf8'
      );
    } catch (parseError) {
      // Don't fail if parsing fails - just log and continue
      console.error('Failed to parse test output:', parseError);
    }

    // Create test result
    const result: TestResult = {
      exitCode: 0, // Can't reliably detect from terminal close
      output: output,
      outputFile: testRun.outputFile,
      timestamp: new Date().toISOString(),
      parsedResult
    };

    // Call the completion callback
    if (testRun.onComplete) {
      testRun.onComplete(result);
    }

    // Clean up
    this.pendingTestRuns.delete(featureName);

    // Update message panel
    this.messageService.addMessage(
      testRun.worktreePath,
      featureName,
      '✅ Tests completed. Results saved.',
      'success',
      { dismissible: true }
    );
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.terminalCloseDisposable?.dispose();
  }
}
