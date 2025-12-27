import * as vscode from 'vscode';

export async function openConsoleCommand(worktreePath: string, featureName: string): Promise<void> {
  const terminal = vscode.window.createTerminal({
    name: `Clauding: ${featureName}`,
    cwd: worktreePath
  });

  terminal.show();

  vscode.window.showInformationMessage(
    `Console opened for feature "${featureName}"`
  );
}
