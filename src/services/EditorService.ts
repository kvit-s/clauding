import * as vscode from 'vscode';

export class EditorService {
  /**
   * Get all active editors for a specific feature worktree
   * Returns editors whose document URI path starts with the feature's worktree path
   */
  public getActiveEditorsForFeature(worktreePath: string): vscode.TextEditor[] {
    const activeEditors: vscode.TextEditor[] = [];

    for (const editor of vscode.window.visibleTextEditors) {
      const documentPath = editor.document.uri.fsPath;

      // Check if the document is within the feature's worktree
      if (documentPath.startsWith(worktreePath)) {
        activeEditors.push(editor);
      }
    }

    return activeEditors;
  }

  /**
   * Get information about active editors including whether they have unsaved changes
   */
  public getEditorActivity(worktreePath: string): Array<{document: string; isDirty: boolean}> {
    const editors = this.getActiveEditorsForFeature(worktreePath);

    return editors.map(editor => ({
      document: editor.document.uri.fsPath,
      isDirty: editor.document.isDirty
    }));
  }

  /**
   * Check if there are any editors with unsaved changes for a feature
   */
  public hasUnsavedEditors(worktreePath: string): boolean {
    const editors = this.getActiveEditorsForFeature(worktreePath);
    return editors.some(editor => editor.document.isDirty);
  }

  /**
   * Close all editors associated with a feature worktree
   */
  public async closeAllEditorsForFeature(worktreePath: string): Promise<void> {
    // Get all tabs across all editor groups
    const allTabs = vscode.window.tabGroups.all
      .map(group => group.tabs)
      .flat();

    // Filter tabs that belong to this feature's worktree
    const tabsToClose = allTabs.filter(tab => {
      // Check if tab is a text editor tab
      if (!(tab.input instanceof vscode.TabInputText)) {
        return false;
      }

      // Check if the document path is within the feature's worktree
      const documentPath = tab.input.uri.fsPath;
      return documentPath.startsWith(worktreePath);
    });

    if (tabsToClose.length === 0) {
      return;
    }

    try {
      // Close all matching tabs in one operation
      await vscode.window.tabGroups.close(tabsToClose);

      // Add a small delay to allow VSCode to process the close operation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify that tabs were actually closed
      const remainingTabs = vscode.window.tabGroups.all
        .map(group => group.tabs)
        .flat()
        .filter(tab =>
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.fsPath.startsWith(worktreePath)
        );

      if (remainingTabs.length > 0) {
        const paths = remainingTabs
          .map(tab => (tab.input as vscode.TabInputText).uri.fsPath)
          .join(', ');
        console.warn(
          `${remainingTabs.length} tab(s) could not be closed for worktree ${worktreePath}: ${paths}`
        );
      }
    } catch (error) {
      console.error(`Failed to close tabs for worktree ${worktreePath}:`, error);
      throw error;
    }
  }

  /**
   * Get the display paths of editors for a feature (for showing in dialogs)
   */
  public getEditorPaths(worktreePath: string): string[] {
    const editors = this.getActiveEditorsForFeature(worktreePath);
    return editors.map(editor => {
      const fullPath = editor.document.uri.fsPath;
      // Return relative path from worktree for better readability
      return fullPath.startsWith(worktreePath)
        ? fullPath.substring(worktreePath.length + 1)
        : fullPath;
    });
  }

  /**
   * Get the display paths of editors with unsaved changes (for warnings)
   */
  public getUnsavedEditorPaths(worktreePath: string): string[] {
    const editors = this.getActiveEditorsForFeature(worktreePath);
    const unsavedEditors = editors.filter(editor => editor.document.isDirty);

    return unsavedEditors.map(editor => {
      const fullPath = editor.document.uri.fsPath;
      // Return relative path from worktree for better readability
      return fullPath.startsWith(worktreePath)
        ? fullPath.substring(worktreePath.length + 1)
        : fullPath;
    });
  }
}
