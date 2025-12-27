import * as vscode from 'vscode';
import { FeatureService } from '../services/FeatureService';
import { WorktreeService } from '../services/WorktreeService';
import { GitService } from '../services/GitService';

/**
 * Validates that a feature name is valid for use as a git branch name
 */
function isValidFeatureName(name: string): boolean {
  // Basic validation: not empty, no special characters except hyphens, underscores, and slashes
  return /^[a-zA-Z0-9_\-/]+$/.test(name);
}

export async function renameFeatureCommand(
  oldFeatureName: string,
  newFeatureName: string,
  featureService: FeatureService,
  worktreeService: WorktreeService,
  gitService: GitService
): Promise<void> {
  const feature = featureService.getFeature(oldFeatureName);
  if (!feature) {
    vscode.window.showErrorMessage(`Feature "${oldFeatureName}" not found`);
    return;
  }

  try {
    // Validate new feature name
    if (!newFeatureName || newFeatureName.trim() === '') {
      vscode.window.showErrorMessage('Feature name cannot be empty');
      return;
    }

    if (!isValidFeatureName(newFeatureName)) {
      vscode.window.showErrorMessage(
        'Invalid feature name. Use only letters, numbers, hyphens, underscores, and slashes.'
      );
      return;
    }

    // Check if new name conflicts with existing feature
    const existingFeature = featureService.getFeature(newFeatureName);
    if (existingFeature) {
      vscode.window.showErrorMessage(`Feature "${newFeatureName}" already exists`);
      return;
    }

    // Confirm with user
    const choice = await vscode.window.showInformationMessage(
      `Rename feature "${oldFeatureName}" to "${newFeatureName}"?\n\nThis will rename the branch and move the worktree directory.`,
      { modal: true },
      'Rename',
      'Cancel'
    );

    if (choice !== 'Rename') {
      return;
    }

    // Perform rename operations
    // 1. Rename the worktree (this updates git's internal metadata)
    const newWorktreePath = await worktreeService.renameWorktree(oldFeatureName, newFeatureName);

    // 2. Rename the features folder (metadata)
    try {
      worktreeService.renameFeatureFolder(oldFeatureName, newFeatureName);
    } catch (error) {
      // Log error but don't fail the operation - continue to rename branch
      vscode.window.showWarningMessage(
        `Worktree renamed but failed to rename features folder: ${(error as Error).message}`
      );
    }

    // 3. Rename the git branch
    await gitService.renameBranch(oldFeatureName, newFeatureName, newWorktreePath);

    vscode.window.showInformationMessage(
      `Feature renamed from "${oldFeatureName}" to "${newFeatureName}"`
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to rename feature: ${(error as Error).message}`);
  }
}
