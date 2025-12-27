import { MergeService } from './MergeService';
import { WorktreeService } from './WorktreeService';
import { EditorService } from './EditorService';
import { FeatureCommitHelper } from './FeatureCommitHelper';
import { FeatureTerminalManager } from './FeatureTerminalManager';
import { AgentStatusTracker } from './AgentStatusTracker';
import { FeatureMetadataWatcher } from './FeatureMetadataWatcher';
import { GitService } from './GitService';
import { PreMergeCleanupService } from './PreMergeCleanupService';

/**
 * Service responsible for coordinating feature merge operations.
 * Consolidates merge logic and removes duplication in conflict resolution.
 */
export class FeatureMergeCoordinator {
  private mergeService?: MergeService;
  private worktreeService?: WorktreeService;
  private editorService?: EditorService;
  private commitHelper?: FeatureCommitHelper;
  private terminalManager?: FeatureTerminalManager;
  private agentStatusTracker?: AgentStatusTracker;
  private metadataWatcher?: FeatureMetadataWatcher;
  private gitService?: GitService;
  private featureQueryService?: import('./FeatureQueryService').FeatureQueryService;

  public setMergeService(mergeService: MergeService): void {
    this.mergeService = mergeService;
  }

  public setWorktreeService(worktreeService: WorktreeService): void {
    this.worktreeService = worktreeService;
  }

  public setEditorService(editorService: EditorService): void {
    this.editorService = editorService;
  }

  public setCommitHelper(commitHelper: FeatureCommitHelper): void {
    this.commitHelper = commitHelper;
  }

  public setTerminalManager(terminalManager: FeatureTerminalManager): void {
    this.terminalManager = terminalManager;
  }

  public setAgentStatusTracker(agentStatusTracker: AgentStatusTracker): void {
    this.agentStatusTracker = agentStatusTracker;
  }

  public setMetadataWatcher(metadataWatcher: FeatureMetadataWatcher): void {
    this.metadataWatcher = metadataWatcher;
  }

  public setGitService(gitService: GitService): void {
    this.gitService = gitService;
  }

  public setFeatureQueryService(featureQueryService: import('./FeatureQueryService').FeatureQueryService): void {
    this.featureQueryService = featureQueryService;
  }

  /**
   * Check for active editors with unsaved changes
   * Automatically closes editors without unsaved changes
   * @returns Array of editor paths with unsaved changes
   */
  private async checkForActiveEditors(featureName: string, worktreePath: string): Promise<string[]> {
    if (!this.editorService) {
      return [];
    }

    // Get all editors for the feature
    const allEditorPaths = this.editorService.getEditorPaths(worktreePath);

    if (allEditorPaths.length === 0) {
      return [];
    }

    // Check for editors with unsaved changes
    const unsavedEditorPaths = this.editorService.getUnsavedEditorPaths(worktreePath);

    if (unsavedEditorPaths.length > 0) {
      // If there are unsaved editors, return them to trigger the warning dialog
      return unsavedEditorPaths;
    }

    // If all editors are saved, close them automatically
    await this.editorService.closeAllEditorsForFeature(worktreePath);

    return [];
  }

  /**
   * Perform pre-merge checks: automatically close all terminals and editors
   * This method no longer throws errors - it forcefully closes everything
   */
  private async performPreMergeChecks(
    featureName: string,
    worktreePath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    // Check for and close active terminals
    if (this.terminalManager) {
      const activeTerminals = this.terminalManager.checkForActiveTerminals(featureName);
      if (activeTerminals.length > 0) {
        onProgress?.(`Closing ${activeTerminals.length} active terminal(s)...`);
        await this.terminalManager.killAllTerminalsAndCaptureOutput(featureName, worktreePath, onProgress);
        onProgress?.('All terminals closed');
      }
    }

    // Force close all editors (including unsaved changes)
    if (this.editorService) {
      const allEditorPaths = this.editorService.getEditorPaths(worktreePath);
      if (allEditorPaths.length > 0) {
        onProgress?.(`Closing ${allEditorPaths.length} active editor(s)...`);
        await this.editorService.closeAllEditorsForFeature(worktreePath);
        onProgress?.('All editors closed');
      }
    }
  }

  /**
   * Commit any pending output files before merge
   */
  private async commitPendingOutputFiles(
    featureName: string,
    worktreePath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    if (!this.mergeService || !this.commitHelper) {
      return;
    }

    // Check if there are uncommitted changes
    const hasUncommitted = await this.mergeService.hasUncommittedChanges(worktreePath);

    if (hasUncommitted) {
      onProgress?.('Committing pending output files...');
      await this.commitHelper.commitPendingOutputFiles(worktreePath, featureName);
      onProgress?.('Output files committed successfully');
    }
  }

  /**
   * Merge a feature into main branch
   */
  public async mergeFeature(
    featureName: string,
    branchName: string,
    worktreePath: string,
    onProgress?: (message: string) => void
  ): Promise<{ success: boolean; hasConflicts: boolean; conflictedFiles: string[] }> {
    if (!this.mergeService || !this.worktreeService || !this.commitHelper || !this.gitService) {
      throw new Error('Required services not initialized');
    }

    // Perform pre-merge checks
    await this.performPreMergeChecks(featureName, worktreePath, onProgress);

    // Commit any pending output files
    await this.commitPendingOutputFiles(featureName, worktreePath, onProgress);

    // Check for uncommitted changes
    const hasUncommitted = await this.mergeService.hasUncommittedChanges(worktreePath);
    if (hasUncommitted) {
      throw new Error('Feature has uncommitted changes. Please commit first.');
    }

    // Record start timestamp and get current commit hash BEFORE merge
    const startTimestamp = new Date().toISOString();
    const commitHash = await this.gitService.getCurrentCommitShort(worktreePath);

    // Add timelog entry BEFORE merge with start timestamp and commit hash
    // Note: addTimelogAndCommit already handles "No changes to commit" gracefully
    await this.commitHelper.addTimelogAndCommit(
      worktreePath,
      'Finalize',
      'Success',
      { message: 'Merged without conflicts' },
      commitHash,
      startTimestamp
    );

    // BEFORE merge: Cleanup metadata on feature branch
    onProgress?.('Cleaning up metadata on feature branch...');

    const cleanupService = new PreMergeCleanupService();
    // cleanupBeforeMerge is now idempotent - it checks if cleanup is already done
    // and returns the current commit hash without creating a new commit if so
    const cleanupCommitHash = await cleanupService.cleanupBeforeMerge(
      worktreePath,
      featureName,
      this.gitService
    );

    onProgress?.(`Cleaned metadata on feature branch (commit: ${cleanupCommitHash.substring(0, 8)})`);

    onProgress?.('Merging feature branch...');

    const result = await this.mergeService.mergeBranch(branchName);

    if (result.success) {
      // Merge succeeded without conflicts
      onProgress?.('Merge successful. Cleaning up...');

      // Close all editors for the feature before cleanup
      try {
        await this.closeAllEditorsForFeature(featureName, worktreePath, onProgress);
      } catch (error) {
        // Log error but don't block merge completion
        console.error(`Failed to close editors for feature ${featureName}:`, error);
      }

      // Stop tracking this feature
      if (this.agentStatusTracker) {
        this.agentStatusTracker.stopTracking(featureName);
      }

      // Stop watching this feature's metadata
      if (this.metadataWatcher) {
        this.metadataWatcher.stopWatching(featureName);
      }

      // Remove worktree
      await this.worktreeService.removeWorktree(featureName);

      // Get project root before deleting branch (need to get project root)
      // The worktreePath is in the feature worktree, we need the main branch path
      const projectRoot = worktreePath.substring(0, worktreePath.indexOf('/.clauding/worktrees/'));

      // Delete feature branch after successful merge
      onProgress?.('Deleting feature branch...');
      try {
        await this.gitService.deleteBranch(branchName, projectRoot);
        onProgress?.('Feature branch deleted (history preserved in git)');
      } catch (error) {
        // Log error but don't fail the merge - branch deletion is not critical
        console.error(`Failed to delete feature branch ${branchName}:`, error);
        onProgress?.('Warning: Failed to delete feature branch. You may need to delete it manually.');
      }

      // Get merge commit hash from main branch
      try {
        const mergeCommitHash = await this.gitService.getCurrentCommit(projectRoot);

        // Update archived features cache
        if (this.featureQueryService) {
          onProgress?.('Updating archived features cache...');
          await this.featureQueryService.addToArchivedCache(featureName, mergeCommitHash);
        }
      } catch (error) {
        // Log error but don't fail - cache update is not critical
        console.error('Failed to update archived features cache:', error);
      }

      onProgress?.('Cleanup complete');
    }

    return result;
  }

  /**
   * Update feature branch from main (merge main into feature)
   */
  public async updateFromMain(
    featureName: string,
    worktreePath: string,
    onProgress?: (message: string) => void
  ): Promise<{ success: boolean; hasConflicts: boolean; conflictedFiles: string[] }> {
    if (!this.mergeService || !this.commitHelper || !this.gitService) {
      throw new Error('Required services not initialized');
    }

    // Check for uncommitted changes
    const hasUncommitted = await this.mergeService.hasUncommittedChanges(worktreePath);
    if (hasUncommitted) {
      throw new Error('Feature has uncommitted changes. Please commit first.');
    }

    // Record start timestamp and get current commit hash BEFORE merge
    const startTimestamp = new Date().toISOString();
    const commitHash = await this.gitService.getCurrentCommitShort(worktreePath);

    onProgress?.('Merging main branch into feature...');

    const result = await this.mergeService.mergeMainIntoFeature(worktreePath);

    if (result.success) {
      // Merge succeeded without conflicts
      onProgress?.('Merge successful. Feature updated from main.');

      // Add timelog entry and commit with start timestamp and commit hash
      await this.commitHelper.addTimelogAndCommit(
        worktreePath,
        'Update from Main',
        'Success',
        { message: 'Updated feature from main branch' },
        commitHash,
        startTimestamp
      );
    }

    return result;
  }

  /**
   * Resolve merge conflicts from updating from main
   */
  public async resolveUpdateFromMainConflicts(
    featureName: string,
    worktreePath: string,
    conflictedFiles: string[],
    strategy: 'feature' | 'main' | 'agent' | 'cancel'
  ): Promise<void> {
    if (!this.mergeService || !this.commitHelper) {
      throw new Error('Required services not initialized');
    }

    if (strategy === 'cancel') {
      await this.mergeService.abortMergeInWorktree(worktreePath);
      await this.commitHelper.addTimelogAndCommit(
        worktreePath,
        'Update from Main',
        'Warning',
        { message: 'Update from main aborted by user' }
      );
      return;
    }

    if (strategy === 'agent') {
      // Agent resolution will be handled by caller
      return;
    }

    // Resolve with feature or main strategy
    await this.mergeService.resolveConflictsInWorktree(worktreePath, conflictedFiles, strategy);

    // Add timelog entry and commit
    await this.commitHelper.addTimelogAndCommit(
      worktreePath,
      'Update from Main',
      'Success',
      { message: `Updated from main, resolved conflicts by accepting ${strategy} branch` }
    );
  }

  /**
   * Resolve merge conflicts with a strategy
   */
  public async resolveMergeConflicts(
    featureName: string,
    branchName: string,
    worktreePath: string,
    conflictedFiles: string[],
    strategy: 'feature' | 'main' | 'agent' | 'cancel',
    onProgress?: (message: string) => void
  ): Promise<void> {
    if (!this.mergeService || !this.worktreeService || !this.commitHelper) {
      throw new Error('Required services not initialized');
    }

    if (strategy === 'cancel') {
      await this.mergeService.abortMerge();
      await this.commitHelper.addTimelogAndCommit(
        worktreePath,
        'Finalize',
        'Warning',
        { message: 'Merge aborted by user' }
      );
      return;
    }

    if (strategy === 'agent') {
      // Agent resolution will be handled by caller
      // They should call completeMergeAfterAgent after agent finishes
      return;
    }

    // Perform pre-merge checks
    await this.performPreMergeChecks(featureName, worktreePath, onProgress);

    // Commit any pending output files
    await this.commitPendingOutputFiles(featureName, worktreePath, onProgress);

    // Add timelog entry BEFORE resolving conflicts
    await this.commitHelper.addTimelogAndCommit(
      worktreePath,
      'Finalize',
      'Success',
      { message: `Resolved conflicts by accepting ${strategy} branch` }
    );

    // Resolve with feature or main strategy
    await this.mergeService.resolveConflicts(conflictedFiles, strategy);

    // Close all editors for the feature before cleanup
    try {
      await this.closeAllEditorsForFeature(featureName, worktreePath, onProgress);
    } catch (error) {
      // Log error but don't block merge completion
      console.error(`Failed to close editors for feature ${featureName}:`, error);
    }

    // Stop tracking this feature
    if (this.agentStatusTracker) {
      this.agentStatusTracker.stopTracking(featureName);
    }

    // Remove worktree
    await this.worktreeService.removeWorktree(featureName);
  }

  /**
   * Complete merge after agent resolves conflicts
   */
  public async completeMergeAfterAgent(
    featureName: string,
    branchName: string,
    worktreePath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    if (!this.mergeService || !this.worktreeService || !this.commitHelper) {
      throw new Error('Required services not initialized');
    }

    // Perform pre-merge checks
    await this.performPreMergeChecks(featureName, worktreePath, onProgress);

    // Commit any pending output files
    await this.commitPendingOutputFiles(featureName, worktreePath, onProgress);

    // Add timelog entry BEFORE completing merge
    await this.commitHelper.addTimelogAndCommit(
      worktreePath,
      'Finalize',
      'Success',
      { message: 'Resolved conflicts with agent' }
    );

    await this.mergeService.completeMergeAfterAgentResolution(branchName);

    // Close all editors for the feature before cleanup
    try {
      await this.closeAllEditorsForFeature(featureName, worktreePath, onProgress);
    } catch (error) {
      // Log error but don't block merge completion
      console.error(`Failed to close editors for feature ${featureName}:`, error);
    }

    // Stop tracking this feature
    if (this.agentStatusTracker) {
      this.agentStatusTracker.stopTracking(featureName);
    }

    // Remove worktree
    await this.worktreeService.removeWorktree(featureName);
  }

  /**
   * Close all active editors for a feature
   */
  public async closeAllEditorsForFeature(
    _featureName: string,
    worktreePath: string,
    _onProgress?: (message: string) => void
  ): Promise<void> {
    if (!this.editorService) {
      return;
    }

    const editorPaths = this.editorService.getEditorPaths(worktreePath);
    if (editorPaths.length === 0) {
      return;
    }

    _onProgress?.(`Closing ${editorPaths.length} editor(s)...`);

    // Close all editors for the feature
    await this.editorService.closeAllEditorsForFeature(worktreePath);

    _onProgress?.('All editors closed');
  }
}
