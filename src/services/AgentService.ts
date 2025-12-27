import * as path from 'path';
import * as fs from 'fs';
import { AgentCommand, AgentResult, AGENT_COMMANDS } from '../models/AgentCommand';
import * as vscode from 'vscode';
import { getAbsoluteOutputPath, getAbsoluteOutputsDir, getFeatureOutputPath, getFeaturesMetaPath, ensureFeaturesFolderExists, META_FILES } from '../utils/featureMetaPaths';
import type { MessageService } from './MessageService';
import type { OutputParserService } from './OutputParserService';
import { AgentExecutionStateMachine } from './AgentExecutionStateMachine';
import { waitForFileStability } from '../utils/fileStability';
import { ITerminalProvider, ITerminal } from '../terminals/ITerminalProvider';
import { TerminalType } from '../terminals/ITerminalProvider';
import { TmuxBufferCapture, captureTerminalBuffer } from '../terminals/tmux/TmuxBufferCapture';
import { TmuxTerminal } from '../terminals/tmux/TmuxTerminal';
import { VariableResolver } from './VariableResolver';

export class AgentService {
  private agentExecutable: string;
  private agentFlags: string;
  private processCleanupDelay: number;
  private maxStabilityWaitTime: number;
  private stabilityCheckInterval: number;
  private messageService?: MessageService; // Optional MessageService for adding messages to panel
  private outputParserService?: OutputParserService; // Optional OutputParserService for parsing output files
  private stateMachine?: AgentExecutionStateMachine; // State machine for agent execution
  private logger?: vscode.LogOutputChannel; // Logger for state machine
  private terminalProvider: ITerminalProvider; // Terminal provider for creating terminals
  private variableResolver: VariableResolver; // Variable resolver for prompt templates
  private workspaceRoot: string; // Workspace root from VS Code API

  constructor(
    agentExecutable: string,
    agentFlags: string,
    terminalProvider: ITerminalProvider,
    workspaceRoot: string,
    // Optimized timings based on empirical testing:
    // - Buffered data (~25KB) flushes within 50ms
    // - 100ms is safe with generous margin
    processCleanupDelay: number = 100,  // Was 1000ms
    maxStabilityWaitTime: number = 2000,  // Was 60000ms - 2s is still very generous
    stabilityCheckInterval: number = 50  // Was 200ms - faster feedback
  ) {
    this.agentExecutable = agentExecutable;
    this.agentFlags = agentFlags;
    this.terminalProvider = terminalProvider;
    this.workspaceRoot = workspaceRoot;
    this.processCleanupDelay = processCleanupDelay;
    this.maxStabilityWaitTime = maxStabilityWaitTime;
    this.stabilityCheckInterval = stabilityCheckInterval;
    this.variableResolver = new VariableResolver();
  }

  /**
   * Set MessageService for adding messages to the feature panel
   */
  public setMessageService(messageService: MessageService): void {
    this.messageService = messageService;
  }

  /**
   * Set OutputParserService for parsing agent output files
   */
  public setOutputParserService(outputParserService: OutputParserService): void {
    this.outputParserService = outputParserService;
  }

  /**
   * Set logger for state machine (optional)
   */
  public setLogger(logger: vscode.LogOutputChannel): void {
    this.logger = logger;
    if (logger) {
      this.stateMachine = new AgentExecutionStateMachine(logger);
    }
  }


  /**
   * Handle terminal closure cleanup - waits for output file to be fully written
   * This is the exact same logic used when terminals are closed manually (see executeCommand)
   *
   * This method guarantees file stability before calling parseFile():
   * 1. Waits for process cleanup (processCleanupDelay)
   * 2. Waits for file size to stabilize (3 consecutive checks via shared utility)
   * 3. Only then triggers parsing
   *
   * This ensures OutputParserService receives a complete, stable file.
   */
  private async handleTerminalClosureCleanup(outputFile: string): Promise<void> {
    // Wait for initial cleanup, then wait for file stability
    await new Promise(resolve => setTimeout(resolve, this.processCleanupDelay));
    await waitForFileStability(outputFile, {
      maxWaitTime: this.maxStabilityWaitTime,
      checkInterval: this.stabilityCheckInterval,
      requiredStableChecks: 3
    });

    // Trigger parsing of the output file
    // File stability is guaranteed at this point
    if (this.outputParserService) {
      await this.outputParserService.parseFile(outputFile);
    }
  }

  /**
   * Kill all terminals associated with a feature and wait for output files to be written
   * This ensures output is captured just like when terminals are closed manually
   */
  public async killAllTerminalsForFeature(
    featureName: string,
    worktreePath: string
  ): Promise<void> {
    const terminals = this.terminalProvider.getTerminalsByFeature(featureName);

    if (terminals.length === 0) {
      return;
    }

    // Get the outputs directory for this feature
    const outputsDir = getAbsoluteOutputsDir(worktreePath, featureName);

    // Get current output files before killing terminals
    let existingOutputFiles: string[] = [];
    if (fs.existsSync(outputsDir)) {
      existingOutputFiles = fs.readdirSync(outputsDir)
        .map(f => path.join(outputsDir, f))
        .filter(f => fs.statSync(f).isFile());
    }

    // Capture buffers BEFORE disposing terminals
    for (const terminal of terminals) {
      const outputFilePath = (terminal as any).__outputFilePath;
      if (outputFilePath && terminal instanceof TmuxTerminal) {
        try {
          const buffer = await terminal.getBuffer();
          fs.writeFileSync(outputFilePath, buffer, 'utf8');
          console.log(`Successfully captured buffer to ${outputFilePath}`);
        } catch (error) {
          console.error('Failed to capture buffer:', error);
          // Continue with disposal even if capture fails
        }
      }
    }

    // Dispose all terminals (same as manual close)
    terminals.forEach(terminal => terminal.dispose());

    // Wait for terminals to fully close (verify they're removed from provider)
    // This ensures the dispose() calls have completed
    const { timedOut, remainingTerminals } = await this.waitForTerminalsToClose(featureName, 10000);
    if (timedOut && remainingTerminals.length > 0) {
      console.warn(`Warning: ${remainingTerminals.length} terminal(s) did not close within timeout:`, remainingTerminals);
    }

    // Update agent status files to SessionEnd
    // DO NOT delete immediately - let AgentStatusTracker detect the final state first
    // The AgentStatusTracker will clean up old status files on its cleanup interval
    if (fs.existsSync(outputsDir)) {
      const statusFiles = fs.readdirSync(outputsDir)
        .filter(f => f.startsWith('.agent-status-'))
        .map(f => path.join(outputsDir, f));

      for (const statusFile of statusFiles) {
        try {
          // Read the status file to get session info
          const content = fs.readFileSync(statusFile, 'utf-8');
          const status = JSON.parse(content);

          // Update status to 'stopped' - keep file for detection
          const stoppedStatus = {
            eventType: 'SessionEnd',
            featureName: status.featureName || featureName,
            sessionId: status.sessionId,
            timestamp: new Date().toISOString(),
            pid: process.pid
          };
          fs.writeFileSync(statusFile, JSON.stringify(stoppedStatus, null, 2), 'utf-8');
          // Status file will be cleaned up by AgentStatusTracker's cleanup interval
        } catch (error) {
          console.error('Failed to update status file:', error);
          // Continue with other files
        }
      }
    }

    // Use the same cleanup logic as manual terminal closure
    for (const outputFile of existingOutputFiles) {
      if (fs.existsSync(outputFile)) {
        await this.handleTerminalClosureCleanup(outputFile);
      }
    }
  }

  /**
   * Wait for all terminals associated with a feature to close
   * Returns a promise that resolves when all terminals are closed or timeout is reached
   */
  public async waitForTerminalsToClose(
    featureName: string,
    timeoutMs: number = 60000
  ): Promise<{ timedOut: boolean; remainingTerminals: string[] }> {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second

    while (Date.now() - startTime < timeoutMs) {
      const activeTerminals = this.terminalProvider.getTerminalsByFeature(featureName);

      if (activeTerminals.length === 0) {
        // All terminals closed, wait a bit for file stability
        await new Promise(resolve => setTimeout(resolve, this.processCleanupDelay));
        return { timedOut: false, remainingTerminals: [] };
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // Timeout reached, return remaining terminals
    const remainingTerminals = this.terminalProvider.getTerminalsByFeature(featureName)
      .map(t => t.name);

    return { timedOut: true, remainingTerminals };
  }

  /**
   * Execute an agent command in a worktree using VSCode terminal
   */
  public async executeCommand(
    commandName: string,
    worktreePath: string,
    terminalService?: unknown,
    featureName?: string,
    conflictInfo?: {
      sourceBranch: string;
      targetBranch: string;
      conflictedFiles: string[];
      featureName: string;
    },
    agentOverride?: { id: string; executable: string; flags: string }  // NEW: Optional agent override with agent ID for prompt overrides
  ): Promise<AgentResult> {
    // Use override if provided, otherwise use instance defaults
    // IMPORTANT: Use nullish coalescing (??) instead of logical OR (||)
    // because empty string flags ("") are valid and should not fall back to defaults
    const agentExecutable = agentOverride?.executable ?? this.agentExecutable;
    const agentFlags = agentOverride?.flags ?? this.agentFlags;
    const command = AGENT_COMMANDS[commandName];
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    // Extract feature name and generate output file path
    const featureNameFromPath = featureName || path.basename(worktreePath);
    const timestamp = this.getTimestamp();

    // Get current commit hash for tracking
    const { GitService } = await import('./GitService');
    const gitService = new GitService();
    const commitHash = gitService.getCurrentCommitShortSync(worktreePath);
    const commitSuffix = commitHash ? `-${commitHash}` : '';

    const outputFileName = `${command.outputFilePrefix}-${timestamp}${commitSuffix}.txt`;
    const outputFile = getAbsoluteOutputPath(worktreePath, featureNameFromPath, outputFileName);

    // Ensure outputs directory exists
    const outputsDir = getAbsoluteOutputsDir(worktreePath, featureNameFromPath);
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }

    // Build the full script command
    let scriptCommand: string;
    let actualPrompt: string | null = null;
    if (command.prompt) {
      // Prompted command - apply per-agent system prompt overrides if configured
      let promptTemplate = command.prompt;
      const systemPrompt = agentOverride?.id && command.prompts?.[agentOverride.id]
        ? command.prompts[agentOverride.id]
        : command.defaultPrompt;
      if (systemPrompt) {
        promptTemplate = `${systemPrompt}\n\n${promptTemplate}`;
      }
      // Prompted command - use VariableResolver
      const rootPath = this.workspaceRoot;

      // Special handling for Fix All Tests: inject test results file path
      if (commandName === 'Fix All Tests') {
        const testResultsFile = this.getMostRecentTestFile(worktreePath, featureNameFromPath);
        if (testResultsFile) {
          actualPrompt = `The tests are failing. Read test results from ${testResultsFile} and fix all failing tests. Make necessary code changes. You are working in an isolated git worktree at ${worktreePath} which contains the full codebase. ALL operations (reading files, searching, exploration, editing) MUST be performed within this worktree directory ONLY. When using the Task tool or any search tools, you MUST specify this path to ensure agents search in the correct location.`;
        } else {
          actualPrompt = promptTemplate;
        }
      }
      // Special handling for Resolve Conflicts: build dynamic prompt with conflict details
      else if (commandName === 'Resolve Conflicts' && conflictInfo) {
        const planPath = `.clauding/features/${conflictInfo.featureName}/plan.md`;
        const fileList = conflictInfo.conflictedFiles.map(file => `  • ${file}`).join('\n');
        actualPrompt = `Merging from branch ${conflictInfo.sourceBranch} to ${conflictInfo.targetBranch}.

This branch implements the feature described in ${planPath}.

There are merge conflicts in the following files:
${fileList}

Read the plan to understand the feature context, examine the conflicted files, and intelligently resolve all conflicts based on the feature goals.`;
      } else {
        // Standard variable resolution
        actualPrompt = await this.variableResolver.resolve(promptTemplate, {
          featureName: featureNameFromPath,
          worktreePath: worktreePath,
          rootPath: rootPath,
          workingDirectory: worktreePath
        });
      }

      const escapedPrompt = actualPrompt.replace(/'/g, "'\\''");
      scriptCommand = `script -q -c "${agentExecutable} ${agentFlags} '${escapedPrompt}'" "${outputFile}"`;
    } else {
      // Interactive command (Generic Agent)
      scriptCommand = `script -q -c "${agentExecutable} ${agentFlags}" "${outputFile}"`;
    }

    // Create terminal name
    const terminalName = `clauding: ${featureName || 'agent'}-${commandName}`;

    // Add environment variables for hooks
    // These are passed to the terminal and will be available to Claude CLI
    // which will then make them available to hook scripts
    const env = {
      ...process.env,
      CLAUDING_FEATURE_NAME: featureNameFromPath,
      CLAUDING_WORKTREE_PATH: worktreePath,
      CLAUDING_SESSION_ID: `${featureNameFromPath}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      CLAUDING_COMMAND: commandName
    };

    // Generate session ID for temp script file (use same as environment)
    const sessionId = env.CLAUDING_SESSION_ID;

    // Check for duplicate terminal
    const existingTerminals = this.terminalProvider.getActiveTerminals();
    const duplicateTerminal = existingTerminals.find(t => t.name === terminalName);

    if (duplicateTerminal) {
      const isIdle = await this.checkIfTerminalIsIdle(duplicateTerminal);

      if (!isIdle) {
        throw new Error(
          `Cannot create terminal "${commandName}" - another instance is already running. ` +
          `Please wait for it to complete or close it manually.`
        );
      }

      // Terminal is idle - close it and proceed
      duplicateTerminal.dispose();
    }

    // Create terminal using the terminal provider
    const terminal = await this.terminalProvider.createTerminal({
      name: terminalName,
      type: TerminalType.Agent,
      cwd: worktreePath,
      env: env,
      message: `Agent: ${commandName} | Feature: ${featureName || 'unknown'} | Working directory: ${worktreePath}\n`,
      featureName: featureNameFromPath,
      commandName: commandName,
      show: false // We'll show it manually below
    });

    // Check if terminal supports buffer reading (tmux terminal)
    const useBufferCapture = terminal instanceof TmuxTerminal && this.terminalProvider.supportsBufferReading();
    let fullCommand: string;

    if (useBufferCapture) {
      // Use buffer-based capture for tmux terminals
      // Build the command directly (no script wrapper needed)
      if (actualPrompt) {
        const escapedPrompt = actualPrompt.replace(/'/g, "'\\''");
        fullCommand = `${agentExecutable} ${agentFlags} '${escapedPrompt}'`;
      } else {
        fullCommand = `${agentExecutable} ${agentFlags}`;
      }

      // Store metadata on terminal for later buffer capture during close
      (terminal as any).__outputFilePath = outputFile;
      (terminal as any).__featureName = featureNameFromPath;
    } else {
      // Use file-based capture for VS Code terminals (fallback)
      // Create temporary script file in outputs directory
      const scriptFilePath = this.createAgentScript(scriptCommand, outputsDir, sessionId);

      // The command we actually send to the terminal - just runs the script file
      fullCommand = `bash "${scriptFilePath}"`;
    }

    // IMPORTANT: Create agent status file IMMEDIATELY to show spinner in UI
    // This must happen BEFORE showing the terminal, so the spinner appears instantly
    const statusFilePath = path.join(outputsDir, `.agent-status-${sessionId}`);
    try {
      const initialStatus = {
        eventType: 'SessionStart',
        featureName: featureNameFromPath,
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        pid: process.pid
      };
      fs.writeFileSync(statusFilePath, JSON.stringify(initialStatus, null, 2), 'utf-8');
    } catch (error) {
      // Don't fail the whole operation if status file creation fails
      console.error('Failed to create initial status file:', error);
    }

    // Show terminal
    terminal.show();

    // Send command to terminal - this will display and execute it
    terminal.sendText(fullCommand, true);

    // Add message to feature panel
    if (this.messageService) {
      this.messageService.addMessage(
        worktreePath,
        featureNameFromPath,
        `Agent "${commandName}" is running in terminal. Close the terminal when complete.`,
        'info',
        { dismissible: false }
      );
    }

    // NO POPUP - terminal monitoring only

    // Wait for the command to complete by monitoring terminal closure
    // Using event-based detection instead of polling for better reliability and performance
    return new Promise((resolve) => {
      // Subscribe to terminal close event from the provider
      const disposable = this.terminalProvider.onDidCloseTerminal(async (closedTerminal) => {
        // Check if this is our terminal
        if (closedTerminal.id === terminal.id) {
          // Terminal was closed - dispose the event listener
          disposable.dispose();

          // Use the same cleanup logic (extracted method)
          (async () => {
            // Clean up temporary script file (only for file-based capture)
            if (!useBufferCapture) {
              const scriptFilePath = this.createAgentScript(scriptCommand, outputsDir, sessionId);
              try {
                if (fs.existsSync(scriptFilePath)) {
                  fs.unlinkSync(scriptFilePath);
                  console.log(`Cleaned up temporary script file: ${scriptFilePath}`);
                }
              } catch (error) {
                console.error(`Failed to delete temporary script file ${scriptFilePath}:`, error);
                // Non-critical error, continue with output handling
              }
            }

            await this.handleTerminalClosureCleanup(outputFile);

            let output = '';
            if (fs.existsSync(outputFile)) {
              output = fs.readFileSync(outputFile, 'utf-8');
            }

            // Update agent status file to SessionEnd
            // DO NOT delete immediately - let AgentStatusTracker detect the final state first
            // The AgentStatusTracker will clean up old status files on its cleanup interval
            try {
              const statusFilePath = path.join(outputsDir, `.agent-status-${sessionId}`);
              if (fs.existsSync(statusFilePath)) {
                // Update status to 'stopped' - keep file for detection
                const stoppedStatus = {
                  eventType: 'SessionEnd',
                  featureName: featureNameFromPath,
                  sessionId: sessionId,
                  timestamp: new Date().toISOString(),
                  pid: process.pid
                };
                fs.writeFileSync(statusFilePath, JSON.stringify(stoppedStatus, null, 2), 'utf-8');
                // Status file will be cleaned up by AgentStatusTracker's cleanup interval
              }
            } catch (error) {
              console.error('Failed to update status file:', error);
              // Don't fail the whole operation
            }

            // If this was an "Implement Plan" command, create wrap-up.json to trigger stage transition
            if (commandName === 'Implement Plan' && featureName) {
              try {
                const wrapUpPath = getFeaturesMetaPath(this.workspaceRoot, featureName, META_FILES.WRAP_UP);
                const wrapUpData = {
                  triggeredAt: new Date().toISOString(),
                  triggeredBy: 'terminal-close'
                };
                ensureFeaturesFolderExists(this.workspaceRoot, featureName);
                fs.writeFileSync(wrapUpPath, JSON.stringify(wrapUpData, null, 2), 'utf-8');
              } catch (error) {
                console.error('Failed to create wrap-up.json:', error);
                // Don't fail the whole operation if wrap-up creation fails
              }
            }

            // Add completion message to feature panel
            if (this.messageService) {
              this.messageService.addMessage(
                worktreePath,
                featureNameFromPath,
                `Agent "${commandName}" completed. Output saved to: ${path.basename(outputFile)}`,
                'success',
                { dismissible: true }
              );
            }

            resolve({
              success: true,
              output: output,
              outputFile: outputFile,
              exitCode: 0
            });
          })();
        }
      });
    });
  }

  /**
   * Get the command configuration
   */
  public getCommand(commandName: string): AgentCommand | undefined {
    return AGENT_COMMANDS[commandName];
  }

  /**
   * Generate timestamp for output files
   */
  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString()
      .replace(/:/g, '')
      .replace(/\..+/, '')
      .replace('T', '-');
  }

  /**
   * Get the most recent test results file
   */
  private getMostRecentTestFile(worktreePath: string, featureName: string): string | null {
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

    // Return relative path from worktree root
    return getFeatureOutputPath(featureName, testFiles[0]);
  }

  /**
   * REMOVED: waitForFileStability method
   *
   * This method has been removed in favor of the shared utility function
   * from src/utils/fileStability.ts. The shared implementation provides:
   * - Consistent stability checking across all services
   * - Better configurability
   * - Improved logging
   * - Single source of truth for stability parameters
   *
   * Use: import { waitForFileStability } from '../utils/fileStability';
   */

  /**
   * Creates a temporary shell script file that executes the agent command
   * This allows us to show a short command in the terminal while running the full script command
   * @param scriptCommand The full script command to execute
   * @param outputsDir The directory where the script file should be created
   * @param sessionId Unique session identifier for the script file name
   * @returns Path to the created script file
   */
  private createAgentScript(scriptCommand: string, outputsDir: string, sessionId: string): string {
    // Create script file with unique name based on session ID
    const scriptFileName = `.agent-run-${sessionId}.sh`;
    const scriptFilePath = path.join(outputsDir, scriptFileName);

    // Script content: uses exec to replace the shell process with the script command
    // This is cleaner than running script as a child process
    const scriptContent = `#!/bin/bash
# Temporary agent execution script
# Auto-generated by clauding AgentService
exec ${scriptCommand}
`;

    // Write script file
    fs.writeFileSync(scriptFilePath, scriptContent, { mode: 0o755 });

    return scriptFilePath;
  }

  /**
   * Check if a terminal is idle (not actively running a command)
   * @param terminal Terminal instance to check
   * @returns True if terminal is idle, false if active
   */
  private async checkIfTerminalIsIdle(terminal: ITerminal): Promise<boolean> {
    // For tmux terminals with isIdle method
    if (terminal.isIdle) {
      return await terminal.isIdle();
    }

    // For terminals with synchronous activity state
    if (terminal.getActivityState) {
      const state = terminal.getActivityState();
      return state === 'idle';
    }

    // Default to active (safer - prevents accidental closure)
    return false;
  }
}
