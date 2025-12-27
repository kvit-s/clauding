import * as vscode from 'vscode';
import * as path from 'path';

export async function openSettingsCommand(
  workspaceRoot: string
): Promise<void> {
  const settingsPath = path.join(workspaceRoot, '.clauding', 'config', 'settings.json');

  try {
    // Open the settings file
    const document = await vscode.workspace.openTextDocument(settingsPath);
    await vscode.window.showTextDocument(document);

    vscode.window.showInformationMessage(
      'Edit settings and save. Changes will be applied automatically.',
      'Learn More'
    ).then(choice => {
      if (choice === 'Learn More') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/kvit-s/clauding#configuration'));
      }
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open settings: ${(error as Error).message}`);
  }
}
