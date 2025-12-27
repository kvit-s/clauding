import * as vscode from 'vscode';
import { FeatureService } from '../../services/FeatureService';
import { GitService } from '../../services/GitService';
import { AgentService } from '../../services/AgentService';
import { MessageService } from '../../services/MessageService';

export type ConflictResolutionStrategy = 'feature' | 'main' | 'agent' | 'cancel';

/**
 * Orchestrates merge conflict resolution workflows
 */
export class MergeConflictOrchestrator {
  constructor(
    private readonly featureService: FeatureService,
    private readonly gitService: GitService,
    private readonly agentService: AgentService,
    private readonly messageService: MessageService
  ) {}

  /**
   * Show conflict resolution dialog and handle user choice
   * @param featureName The feature name
   * @param conflictedFiles List of files with conflicts
   * @returns The chosen strategy
   */
  async showConflictResolutionDialog(
    featureName: string,
    conflictedFiles: string[]
  ): Promise<ConflictResolutionStrategy> {
    const fileList = conflictedFiles.map(f => `  • ${f}`).join('\n');
    const message = `Merge Conflicts Detected\n\nThe following files have conflicts:\n${fileList}\n\nChoose resolution strategy:`;

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      'Accept Feature Branch',
      'Accept Main Branch',
      'Resolve with Agent',
      'Cancel'
    );

    if (!choice) {
      return 'cancel';
    }

    switch (choice) {
      case 'Accept Feature Branch':
        return 'feature';
      case 'Accept Main Branch':
        return 'main';
      case 'Resolve with Agent':
        return 'agent';
      case 'Cancel':
        return 'cancel';
      default:
        return 'cancel';
    }
  }

  /**
   * Resolve merge conflicts using the selected strategy
   * @param featureName The feature name
   * @param conflictedFiles List of files with conflicts
   * @param strategy The resolution strategy
   * @param isMergeToMain True if merging to main, false if updating from main
   */
  async resolveConflicts(
    featureName: string,
    conflictedFiles: string[],
    strategy: ConflictResolutionStrategy,
    isMergeToMain: boolean = true
  ): Promise<void> {
    const feature = this.featureService.getFeature(featureName);
    if (!feature) {
      throw new Error(`Feature not found: ${featureName}`);
    }

    // Progress callback to add messages to panel
    const onProgress = (message: string) => {
      this.messageService.addMessage(
        feature.worktreePath,
        featureName,
        message,
        'info',
        { dismissible: false }
      );
    };

    if (strategy === 'agent') {
      // Add message that agent is starting
      this.messageService.addMessage(
        feature.worktreePath,
        featureName,
        'Starting agent to resolve merge conflicts...',
        'info',
        { dismissible: false }
      );

      try {
        // Execute agent in main workspace (not worktree)
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          this.messageService.addMessage(
            feature.worktreePath,
            featureName,
            'Failed to resolve conflicts: No workspace root found',
            'error',
            { dismissible: true }
          );
          throw new Error('No workspace root found');
        }

        // Get branch information for conflict resolution
        const sourceBranch = `feature/${featureName}`;
        const targetBranch = this.featureService.getMainBranch();

        // Build conflict metadata
        const conflictInfo = {
          sourceBranch,
          targetBranch,
          conflictedFiles,
          featureName
        };

        // Execute agent with the "Resolve Conflicts" command
        await this.agentService.executeCommand(
          'Resolve Conflicts',
          workspaceRoot,
          undefined,
          featureName,
          conflictInfo
        );

        // Complete merge after agent finishes
        if (isMergeToMain) {
          try {
            await this.featureService.completeMergeAfterAgent(featureName, onProgress);
          } catch (error) {
            // Check for active terminals or editors errors - these will be handled by caller
            if (error instanceof Error &&
                (error.message === 'ACTIVE_TERMINALS' || error.message === 'ACTIVE_EDITORS')) {
              throw error;
            }
            // Re-throw other errors
            throw error;
          }
        }

        this.messageService.addMessage(
          feature.worktreePath,
          featureName,
          `Conflicts resolved by agent. Feature "${featureName}" ${isMergeToMain ? 'merged' : 'updated'} successfully!`,
          'success',
          { dismissible: true }
        );
      } catch (error) {
        // Clean up merge state if agent setup fails
        // This allows retry without "Merge already in progress" errors
        this.messageService.addMessage(
          feature.worktreePath,
          featureName,
          `Agent conflict resolution failed: ${error instanceof Error ? error.message : String(error)}`,
          'error',
          { dismissible: true }
        );
        // Re-throw to let caller handle
        throw error;
      }
    } else if (strategy === 'cancel') {
      // Abort merge
      if (isMergeToMain) {
        await this.featureService.resolveMergeConflicts(featureName, conflictedFiles, strategy, onProgress);
      } else {
        await this.featureService.resolveUpdateFromMainConflicts(featureName, conflictedFiles, strategy);
      }
      this.messageService.addMessage(
        feature.worktreePath,
        featureName,
        isMergeToMain ? 'Merge cancelled' : 'Update from main cancelled',
        'info',
        { dismissible: true }
      );
    } else {
      // Resolve with strategy
      try {
        if (isMergeToMain) {
          await this.featureService.resolveMergeConflicts(featureName, conflictedFiles, strategy, onProgress);
        } else {
          await this.featureService.resolveUpdateFromMainConflicts(featureName, conflictedFiles, strategy);
        }
      } catch (error) {
        // Check for active terminals or editors errors - these will be handled by caller
        if (error instanceof Error &&
            (error.message === 'ACTIVE_TERMINALS' || error.message === 'ACTIVE_EDITORS')) {
          throw error;
        }
        // Re-throw other errors
        throw error;
      }

      this.messageService.addMessage(
        feature.worktreePath,
        featureName,
        `Conflicts resolved. Feature "${featureName}" ${isMergeToMain ? 'merged' : 'updated from main'} successfully!`,
        'success',
        { dismissible: true }
      );
    }
  }

  /**
   * Handle active terminals warning
   * @param featureName The feature name
   * @param terminalNames List of active terminal names
   * @param operation The operation being attempted
   * @param retryCallback Callback to retry the operation after killing terminals
   */
  async handleActiveTerminalsWarning(
    featureName: string,
    terminalNames: string[],
    operation: 'merge' | 'resolve-conflicts' | 'complete-merge',
    retryCallback?: () => Promise<void>
  ): Promise<void> {
    const terminalList = terminalNames.map(t => `  • ${t}`).join('\n');
    const operationText = operation === 'merge' ? 'merge' : 'complete merge operation';
    const message = `Active Terminals Detected\n\nCannot ${operationText} while these terminals are running:\n${terminalList}\n\nChoose an action:`;

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      'Close All Terminals',
      'Cancel'
    );

    if (choice === 'Close All Terminals') {
      try {
        const feature = this.featureService.getFeature(featureName);
        if (!feature) {
          vscode.window.showErrorMessage(`Feature "${featureName}" not found`);
          return;
        }

        // Kill terminals and capture output
        await this.featureService.killAllTerminalsAndCaptureOutput(featureName, (msg) => {
          this.messageService.addMessage(feature.worktreePath, featureName, msg, 'info', { dismissible: false });
        });

        this.messageService.addMessage(
          feature.worktreePath,
          featureName,
          'All terminals killed and output captured. Retrying operation...',
          'success',
          { dismissible: true }
        );

        // Retry the operation if callback provided
        if (retryCallback) {
          await retryCallback();
        }
      } catch (killError) {
        const errorMessage = killError instanceof Error ? killError.message : String(killError);
        const feature = this.featureService.getFeature(featureName);
        if (feature) {
          this.messageService.addMessage(
            feature.worktreePath,
            featureName,
            `Failed to kill terminals: ${errorMessage}`,
            'error',
            { dismissible: true }
          );
        }
      }
    }
  }

  /**
   * Handle active editors warning during merge operations
   * Shows dialog and offers to close all editors
   */
  async handleActiveEditorsWarning(
    featureName: string,
    editorPaths: string[],
    operation: 'merge' | 'resolve-conflicts' | 'complete-merge',
    retryCallback?: () => Promise<void>
  ): Promise<void> {
    const editorList = editorPaths.map(p => `  • ${p}`).join('\n');
    const operationText = operation === 'merge' ? 'merge' : 'complete merge operation';
    const message = `Active Editors with Unsaved Changes\n\nCannot ${operationText} while these editors have unsaved changes:\n${editorList}\n\nChoose an action:`;

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      'Close All Editors',
      'Cancel'
    );

    if (choice === 'Close All Editors') {
      try {
        const feature = this.featureService.getFeature(featureName);
        if (!feature) {
          vscode.window.showErrorMessage(`Feature "${featureName}" not found`);
          return;
        }

        // Close all editors
        await this.featureService.closeAllEditorsForFeature(featureName, (msg) => {
          this.messageService.addMessage(feature.worktreePath, featureName, msg, 'info', { dismissible: false });
        });

        this.messageService.addMessage(
          feature.worktreePath,
          featureName,
          'All editors closed. Retrying operation...',
          'success',
          { dismissible: true }
        );

        // Retry the operation if callback provided
        if (retryCallback) {
          await retryCallback();
        }
      } catch (closeError) {
        const errorMessage = closeError instanceof Error ? closeError.message : String(closeError);
        const feature = this.featureService.getFeature(featureName);
        if (feature) {
          this.messageService.addMessage(
            feature.worktreePath,
            featureName,
            `Failed to close editors: ${errorMessage}`,
            'error',
            { dismissible: true }
          );
        }
      }
    }
  }
}
