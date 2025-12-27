import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { setupWorktreeHooks, checkWorktreeHookConfiguration } from '../utils/hookConfiguration';

/**
 * Command to configure agent status tracking hooks for all worktrees
 */
export async function configureAgentHooksCommand(
  context: vscode.ExtensionContext,
  worktreesDir: string
): Promise<void> {
  try {
    // Get all worktree directories
    if (!fs.existsSync(worktreesDir)) {
      vscode.window.showErrorMessage('Worktrees directory not found');
      return;
    }

    const worktrees = fs.readdirSync(worktreesDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    if (worktrees.length === 0) {
      vscode.window.showInformationMessage('No worktrees found to configure');
      return;
    }

    // Ask user if they want to configure all or select specific ones
    const choice = await vscode.window.showQuickPick(
      ['Configure all worktrees', 'Select specific worktrees'],
      { placeHolder: 'How would you like to configure hooks?' }
    );

    if (!choice) {
      return;
    }

    let selectedWorktrees: string[] = [];

    if (choice === 'Configure all worktrees') {
      selectedWorktrees = worktrees;
    } else {
      // Let user select specific worktrees
      interface WorktreeItem extends vscode.QuickPickItem {
        label: string;
      }
      const items: WorktreeItem[] = worktrees.map((wt: string) => ({ label: wt, picked: true }));
      const selected = await vscode.window.showQuickPick(
        items,
        {
          placeHolder: 'Select worktrees to configure',
          canPickMany: true
        }
      );

      if (!selected || selected.length === 0) {
        return;
      }

      selectedWorktrees = selected.map(s => s.label);
    }

    // Configure hooks for selected worktrees
    let configured = 0;
    let skipped = 0;
    let errors = 0;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Configuring agent status hooks',
      cancellable: false
    }, async (progress) => {
      for (let i = 0; i < selectedWorktrees.length; i++) {
        const featureName = selectedWorktrees[i];
        const worktreePath = path.join(worktreesDir, featureName);

        progress.report({
          message: `${featureName} (${i + 1}/${selectedWorktrees.length})`,
          increment: (100 / selectedWorktrees.length)
        });

        try {
          // Check if already configured
          const { configured: isConfigured } = await checkWorktreeHookConfiguration(worktreePath);

          if (isConfigured) {
            skipped++;
            continue;
          }

          // Setup hooks
          await setupWorktreeHooks(worktreePath, featureName, context);
          configured++;
        } catch (error) {
          console.error(`Failed to configure hooks for ${featureName}:`, error);
          errors++;
        }
      }
    });

    // Show summary
    const message = [
      `Hook configuration complete:`,
      `✓ Configured: ${configured}`,
      `⊘ Already configured: ${skipped}`,
      errors > 0 ? `✗ Errors: ${errors}` : null
    ].filter(Boolean).join('\n');

    if (errors > 0) {
      vscode.window.showWarningMessage(message);
    } else {
      vscode.window.showInformationMessage(message);
    }

  } catch (error) {
    vscode.window.showErrorMessage(`Failed to configure hooks: ${error}`);
  }
}

/**
 * Command to configure hooks for a specific worktree
 */
export async function configureWorktreeHooksCommand(
  context: vscode.ExtensionContext,
  featureName: string,
  worktreePath: string
): Promise<boolean> {
  try {
    // Check if already configured
    const { configured } = await checkWorktreeHookConfiguration(worktreePath);

    if (configured) {
      // Ask if user wants to reconfigure
      const choice = await vscode.window.showQuickPick(
        ['Yes, reconfigure', 'No, keep existing'],
        {
          placeHolder: `Hooks already configured for ${featureName}. Reconfigure?`
        }
      );

      if (choice !== 'Yes, reconfigure') {
        return true; // Already configured, user chose to keep
      }
    }

    // Setup hooks
    await setupWorktreeHooks(worktreePath, featureName, context);
    return true;
  } catch (error) {
    console.error(`Failed to configure hooks for ${featureName}:`, error);
    return false;
  }
}
