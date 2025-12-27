import * as vscode from 'vscode';
import { BranchCleanupService } from '../services/BranchCleanupService';

export async function cleanupBranchesCommand(workspaceRoot: string): Promise<void> {
  try {
    const cleanupService = new BranchCleanupService(workspaceRoot);

    // Get branch statistics first
    const stats = await cleanupService.getBranchStatistics('main');

    if (stats.merged === 0) {
      vscode.window.showInformationMessage('No merged branches found to clean up.');
      return;
    }

    // Show initial information
    const proceedChoice = await vscode.window.showInformationMessage(
      `Found ${stats.merged} merged branch(es) that can be cleaned up.\n\n` +
        `Total branches: ${stats.total}\n` +
        `Merged: ${stats.merged}\n` +
        `Active: ${stats.active}\n\n` +
        'Would you like to preview which branches will be deleted?',
      { modal: true },
      'Preview',
      'Cancel'
    );

    if (proceedChoice !== 'Preview') {
      return;
    }

    // Run dry-run to show what would be deleted
    const dryRunResult = await cleanupService.deleteMergedBranches('main', true);

    if (dryRunResult.deleted.length === 0) {
      vscode.window.showInformationMessage(
        'No branches can be deleted at this time.\n\n' +
          `Skipped: ${dryRunResult.skipped.length} branch(es) (active worktrees or current branch)`
      );
      return;
    }

    // Build preview message
    const branchList = dryRunResult.deleted.slice(0, 10).join('\n  • ');
    const additionalCount = dryRunResult.deleted.length > 10 ? dryRunResult.deleted.length - 10 : 0;
    const additionalText = additionalCount > 0 ? `\n  ... and ${additionalCount} more` : '';

    const previewMessage =
      `The following ${dryRunResult.deleted.length} branch(es) will be deleted:\n\n` +
      `  • ${branchList}${additionalText}\n\n` +
      `Skipped: ${dryRunResult.skipped.length} branch(es) (active worktrees or current branch)\n\n` +
      '⚠️ This action cannot be undone (except via git reflog).\n\n' +
      'Create a backup before proceeding?';

    const backupChoice = await vscode.window.showWarningMessage(
      previewMessage,
      { modal: true },
      'Create Backup & Delete',
      'Delete Without Backup',
      'Cancel'
    );

    if (!backupChoice || backupChoice === 'Cancel') {
      return;
    }

    // Create backup if requested
    let backupPath: string | undefined;
    if (backupChoice === 'Create Backup & Delete') {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Creating .git backup...',
          cancellable: false,
        },
        async () => {
          backupPath = await cleanupService.backupGitDirectory();
        }
      );

      if (backupPath) {
        vscode.window.showInformationMessage(`Backup created: ${backupPath}`);
      }
    }

    // Final confirmation
    const finalConfirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete ${dryRunResult.deleted.length} merged branch(es)?`,
      { modal: true },
      'Delete',
      'Cancel'
    );

    if (finalConfirm !== 'Delete') {
      return;
    }

    // Perform actual deletion
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Deleting ${dryRunResult.deleted.length} merged branch(es)...`,
        cancellable: false,
      },
      async () => {
        return await cleanupService.deleteMergedBranches('main', false);
      }
    );

    // Show results
    const successCount = result.deleted.length;
    const errorCount = result.errors.length;

    let resultMessage = `✅ Successfully deleted ${successCount} branch(es)`;
    if (errorCount > 0) {
      resultMessage += `\n❌ Failed to delete ${errorCount} branch(es)`;
      // Show first few errors
      const errorList = result.errors
        .slice(0, 3)
        .map((e) => `  • ${e.branch}: ${e.error}`)
        .join('\n');
      resultMessage += `\n\n${errorList}`;
      if (errorCount > 3) {
        resultMessage += `\n  ... and ${errorCount - 3} more errors`;
      }
    }

    if (backupPath) {
      resultMessage += `\n\n💾 Backup saved to: ${backupPath}`;
      resultMessage += '\n   To restore: cp -r <backup-path> .git';
    }

    if (successCount > 0) {
      vscode.window.showInformationMessage(resultMessage);
    } else {
      vscode.window.showErrorMessage(resultMessage);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to cleanup branches: ${errorMessage}`);
  }
}
