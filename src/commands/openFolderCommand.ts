import * as vscode from 'vscode';

export async function openFolderCommand(worktreePath: string): Promise<void> {
  const uri = vscode.Uri.file(worktreePath);

  // Reveal in explorer
  await vscode.commands.executeCommand('revealFileInOS', uri);

  vscode.window.showInformationMessage('Worktree folder opened');
}
