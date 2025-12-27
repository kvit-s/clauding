import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/GitService';
import { TimelogService } from '../services/TimelogService';

export async function commitCommand(
  featureName: string,
  worktreePath: string,
  gitService: GitService,
  timelogService: TimelogService
): Promise<void> {
  // Check for changes
  const hasChanges = await gitService.hasUncommittedChanges(worktreePath);
  if (!hasChanges) {
    vscode.window.showInformationMessage('No changes to commit');
    return;
  }

  // Prompt for commit message
  const message = await vscode.window.showInputBox({
    prompt: 'Enter commit message',
    placeHolder: `feat: `,
    value: `feat: `,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Commit message cannot be empty';
      }
      return null;
    }
  });

  if (!message) {
    return; // User cancelled
  }

  try {
    const commitHash = await gitService.stageAndCommit(worktreePath, message);

    // Add timelog entry
    await timelogService.addEntry(
      worktreePath,
      featureName,
      'Commit',
      'Success',
      {
        message
      },
      commitHash
    );

    vscode.window.showInformationMessage(`✓ Changes committed: ${commitHash}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Commit failed: ${(error as Error).message}`);
  }
}
