import * as vscode from 'vscode';
import { FeatureService } from '../services/FeatureService';
import { WorktreeService } from '../services/WorktreeService';
import { GitService } from '../services/GitService';
import { TimelogService } from '../services/TimelogService';

export async function deleteFeatureCommand(
  featureName: string,
  featureService: FeatureService,
  worktreeService: WorktreeService,
  gitService: GitService,
  timelogService: TimelogService,
  commitMessagePrefix: string
): Promise<void> {
  const feature = featureService.getFeature(featureName);
  if (!feature) {
    vscode.window.showErrorMessage(`Feature "${featureName}" not found`);
    return;
  }

  try {
    // Check for uncommitted changes
    const hasChanges = await gitService.hasUncommittedChanges(feature.worktreePath);

    if (hasChanges) {
      // Prompt user about uncommitted changes
      const commitChoice = await vscode.window.showWarningMessage(
        `Feature "${featureName}" has uncommitted changes.\n\nCommit them before deleting?`,
        { modal: true },
        'Commit & Delete',
        'Delete Without Committing',
        'Cancel'
      );

      if (commitChoice === 'Cancel' || !commitChoice) {
        return;
      }

      if (commitChoice === 'Commit & Delete') {
        // Auto-commit changes
        const message = `${commitMessagePrefix}: Auto-commit before deletion`;
        const commitHash = await gitService.stageAndCommit(feature.worktreePath, message);

        // Add timelog entry
        await timelogService.addEntry(
          feature.worktreePath,
          featureName,
          'Commit',
          'Success',
          {
            message,
            reason: 'auto-commit before deletion'
          },
          commitHash
        );

        vscode.window.showInformationMessage(`Changes committed: ${commitHash.substring(0, 7)}`);
      }
    } else {
      // No changes, just confirm deletion
      const choice = await vscode.window.showWarningMessage(
        `Delete feature "${featureName}"?\n\nThis will permanently delete the branch and worktree.`,
        { modal: true },
        'Delete',
        'Cancel'
      );

      if (choice !== 'Delete') {
        return;
      }
    }

    // Get branch name and project root before removing worktree
    const branchName = feature.name;
    const projectRoot = feature.worktreePath.substring(0, feature.worktreePath.indexOf('/.clauding/worktrees/'));

    // Remove worktree
    await worktreeService.removeWorktree(featureName);

    // Remove features folder (metadata)
    try {
      worktreeService.removeFeatureFolder(featureName);
    } catch (error) {
      // Log error but don't fail the operation - continue to delete branch
      vscode.window.showWarningMessage(
        `Worktree removed but failed to delete features folder: ${(error as Error).message}`
      );
    }

    // Delete the branch
    try {
      await gitService.deleteBranch(branchName, projectRoot);
    } catch (error) {
      // Log error but don't fail the operation - worktree is already removed
      vscode.window.showWarningMessage(
        `Worktree removed but failed to delete branch: ${(error as Error).message}`
      );
      return;
    }

    vscode.window.showInformationMessage(
      `Feature "${featureName}" deleted. Branch, worktree, and metadata removed.`
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to delete feature: ${(error as Error).message}`);
  }
}
