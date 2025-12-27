import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';
import { DebugConfigurationManager } from '../DebugConfigurationManager';
import { ITerminalProvider, ITerminal, TerminalType } from '../../../terminals/ITerminalProvider';

interface RunMessage {
  command: 'run';
  featureName: string;
}

export class RunHandler extends MessageHandler<RunMessage> {
  private preRunTerminals: ITerminal[] = [];
  private debugSessionListeners: vscode.Disposable[] = [];

  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly debugConfigManager: DebugConfigurationManager,
    private readonly terminalProvider: ITerminalProvider,
    private readonly onWebviewUpdate: () => void
  ) {
    super(featureService, messageService);
  }

  public dispose(): void {
    // Clean up all listeners
    this.debugSessionListeners.forEach(listener => listener.dispose());
    this.debugSessionListeners = [];
  }

  /**
   * Execute a command and wait for it to complete.
   * Shows output in a terminal for visibility while tracking actual completion.
   * @param command The command to execute
   * @param cwd The working directory
   * @param terminal The terminal to show output in
   * @returns Promise that resolves on success (exit code 0) or rejects on failure
   */
  private executeCommand(
    command: string,
    cwd: string,
    terminal: ITerminal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Send command to terminal for visibility
      terminal.sendText(command);
      terminal.show();

      // Parse command into command and args for spawn
      // Use shell to execute the command to handle complex commands with pipes, etc.
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      const shellArg = process.platform === 'win32' ? '/c' : '-c';

      const childProcess = spawn(shell, [shellArg, command], {
        cwd,
        shell: false
      });

      let stderr = '';

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('error', (error) => {
        reject(new Error(`Failed to execute command: ${error.message}`));
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}${stderr ? ': ' + stderr : ''}`));
        }
      });
    });
  }

  async handle(message: RunMessage): Promise<void> {
    const { featureName } = message;

    try {
      const feature = this.getFeatureOrShowError(featureName, true);
      if (!feature) {
        return;
      }

      // Get the root workspace folder
      const rootWorkspace = vscode.workspace.workspaceFolders?.[0];
      if (!rootWorkspace) {
        this.addMessageToPanel(
          featureName,
          'No workspace folder found',
          'error'
        );
        this.onWebviewUpdate();
        return;
      }

      // Read launch.json from root workspace
      const launchConfig = this.debugConfigManager.readLaunchJson(rootWorkspace);
      if (!launchConfig) {
        this.addMessageToPanel(
          featureName,
          'No launch.json found in root workspace. Please create a debug configuration first.',
          'error'
        );
        this.onWebviewUpdate();
        return;
      }

      if (!launchConfig.configurations || launchConfig.configurations.length === 0) {
        this.addMessageToPanel(
          featureName,
          'No debug configurations found in launch.json',
          'error'
        );
        this.onWebviewUpdate();
        return;
      }

      // Use the first configuration as base (automatically, no prompts)
      const baseConfig = launchConfig.configurations[0];

      // Check if preRunCommands are configured
      const config = vscode.workspace.getConfiguration('clauding');
      const preRunCommands = config.get<string[]>('preRunCommands', []);

      // Execute pre-run commands if configured
      if (preRunCommands.length > 0) {
        this.addMessageToPanel(
          featureName,
          `Executing ${preRunCommands.length} pre-run command(s) in feature worktree...`,
          'info'
        );
        this.onWebviewUpdate();

        // Execute commands sequentially, waiting for each to complete
        for (let i = 0; i < preRunCommands.length; i++) {
          const command = preRunCommands[i];

          try {
            // Show progress
            this.addMessageToPanel(
              featureName,
              `Running pre-run command (${i + 1}/${preRunCommands.length}): ${command}`,
              'info'
            );
            this.onWebviewUpdate();

            // Create terminal for visibility
            const terminal = await this.terminalProvider.createTerminal({
              name: `Clauding Pre-Run (${featureName})`,
              type: TerminalType.PreRun,
              cwd: feature.worktreePath,
              featureName: featureName,
              show: false
            });

            // Track this terminal for later cleanup
            this.preRunTerminals.push(terminal);

            // Execute command and wait for completion
            await this.executeCommand(command, feature.worktreePath, terminal);

            this.addMessageToPanel(
              featureName,
              `Completed pre-run command (${i + 1}/${preRunCommands.length}): ${command}`,
              'success'
            );
            this.onWebviewUpdate();
          } catch (error) {
            // Command failed - abort and clean up
            this.addMessageToPanel(
              featureName,
              `Pre-run command failed: ${command}. Error: ${error instanceof Error ? error.message : String(error)}`,
              'error'
            );
            this.onWebviewUpdate();

            // Clean up terminals on failure
            this.preRunTerminals.forEach(terminal => terminal.dispose());
            this.preRunTerminals = [];

            return;
          }
        }

        this.addMessageToPanel(
          featureName,
          'All pre-run commands completed successfully',
          'success'
        );
        this.onWebviewUpdate();
      }

      // Create a dynamic debug configuration rooted in the feature's worktree
      const worktreeConfig = this.debugConfigManager.createWorktreeConfig(
        baseConfig,
        featureName,
        feature.worktreePath
      );

      // Start debugging with the worktree-specific configuration
      const started = await this.debugConfigManager.startDebugSession(
        featureName,
        feature.worktreePath,
        worktreeConfig
      );

      if (started) {
        this.addMessageToPanel(
          featureName,
          `Started debugging in feature "${featureName}"`,
          'success'
        );
        this.onWebviewUpdate();

        // Register listener to clean up terminals when debug session ends
        const autoCloseEnabled = config.get<boolean>('autoCloseRunTerminal', true);
        if (autoCloseEnabled && this.preRunTerminals.length > 0) {
          const terminalsToClose = [...this.preRunTerminals];
          this.preRunTerminals = []; // Clear the array for next run

          const listener = vscode.debug.onDidTerminateDebugSession((session) => {
            // Check if this is our debug session by matching the feature name
            if (session.name.includes(featureName)) {
              // Close all pre-run terminals
              terminalsToClose.forEach(terminal => {
                terminal.dispose();
              });

              // Clean up the listener
              listener.dispose();

              // Remove from our listeners array
              const index = this.debugSessionListeners.indexOf(listener);
              if (index > -1) {
                this.debugSessionListeners.splice(index, 1);
              }
            }
          });

          this.debugSessionListeners.push(listener);
        }
      } else {
        this.addMessageToPanel(
          featureName,
          'Failed to start debugging',
          'error'
        );
        this.onWebviewUpdate();
      }
    } catch (error) {
      this.handleError(error, 'Run', featureName);
      this.onWebviewUpdate();
    }
  }
}
