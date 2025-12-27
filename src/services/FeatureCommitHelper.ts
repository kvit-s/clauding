import * as path from 'path';
import { GitService } from './GitService';
import { TimelogService } from './TimelogService';

/**
 * Helper service for common commit operations in features.
 * Reduces code duplication by centralizing repeated commit patterns.
 */
export class FeatureCommitHelper {
  private gitService: GitService;
  private timelogService: TimelogService;

  constructor(gitService: GitService, timelogService: TimelogService) {
    this.gitService = gitService;
    this.timelogService = timelogService;
  }

  /**
   * Commit with a message and update timelog
   * @param worktreePath Path to the feature worktree
   * @param commitMessage Git commit message
   * @param timelogAction Action name for timelog entry
   * @param timelogDetails Additional details for timelog
   */
  public async commitWithTimelog(
    worktreePath: string,
    commitMessage: string,
    timelogAction: string,
    timelogDetails?: Record<string, unknown>
  ): Promise<string> {
    // Commit changes
    const commitHash = await this.gitService.stageAndCommit(worktreePath, commitMessage);

    // Add timelog entry
    const featureName = path.basename(worktreePath);
    await this.timelogService.addEntry(
      worktreePath,
      featureName,
      timelogAction,
      'Success',
      timelogDetails,
      commitHash
    );

    // Amend commit to include timelog changes
    try {
      await this.gitService.stageAndAmend(worktreePath);
    } catch (error) {
      // If amend fails, create a second commit
      const errorMessage = error instanceof Error && error.message ? error.message : String(error);
      if (errorMessage && !errorMessage.includes('No changes to commit')) {
        console.warn('Failed to amend commit, falling back to second commit:', errorMessage);
        try {
          await this.gitService.stageAndCommit(
            worktreePath,
            `chore: Update timelog`
          );
        } catch (secondError) {
          const secondErrorMessage = secondError instanceof Error && secondError.message ? secondError.message : String(secondError);
          if (secondErrorMessage && !secondErrorMessage.includes('No changes to commit')) {
            throw secondError;
          }
        }
      }
    }

    return commitHash;
  }

  /**
   * Add timelog entry and commit it
   * @param worktreePath Path to the feature worktree
   * @param action Action name for timelog entry
   * @param result Result status ('Success', 'Failed', 'Warning')
   * @param details Additional details for timelog
   * @param commitHash Optional commit hash to record (from before operation started)
   * @param timestamp Optional timestamp to record (from when operation started)
   */
  public async addTimelogAndCommit(
    worktreePath: string,
    action: string,
    result: 'Success' | 'Failed' | 'Warning',
    details?: Record<string, unknown>,
    commitHash?: string,
    timestamp?: string
  ): Promise<void> {
    // Add timelog entry
    const featureName = path.basename(worktreePath);
    await this.timelogService.addEntry(worktreePath, featureName, action, result, details, commitHash, timestamp);

    // Try to amend the previous commit
    try {
      await this.gitService.stageAndAmend(worktreePath);
    } catch (error) {
      // If amend fails, fall back to a new commit
      const errorMessage = error instanceof Error && error.message ? error.message : String(error);
      if (errorMessage && !errorMessage.includes('No changes to commit')) {
        console.warn('Failed to amend commit, falling back to new commit:', errorMessage);
        try {
          await this.gitService.stageAndCommit(
            worktreePath,
            `chore: Update timelog`
          );
        } catch (secondError) {
          const secondErrorMessage = secondError instanceof Error && secondError.message ? secondError.message : String(secondError);
          if (secondErrorMessage && !secondErrorMessage.includes('No changes to commit')) {
            throw secondError;
          }
        }
      }
    }
  }

  /**
   * Commit pending output files with a standard message
   * @param worktreePath Path to the feature worktree
   * @param featureName Name of the feature
   */
  public async commitPendingOutputFiles(
    worktreePath: string,
    featureName: string
  ): Promise<void> {
    try {
      await this.gitService.stageAndCommit(
        worktreePath,
        `feat(${featureName}): Commit pending output files`
      );
    } catch (error) {
      // Ignore "nothing to commit" error
      const errorMessage = error instanceof Error && error.message ? error.message : String(error);
      if (errorMessage && !errorMessage.includes('No changes to commit')) {
        throw error;
      }
    }
  }

  /**
   * Safely stage and commit changes, ignoring "nothing to commit" errors
   * @param worktreePath Path to the feature worktree
   * @param commitMessage Git commit message
   */
  public async safeCommit(
    worktreePath: string,
    commitMessage: string
  ): Promise<void> {
    try {
      await this.gitService.stageAndCommit(worktreePath, commitMessage);
    } catch (error) {
      // Ignore "nothing to commit" error
      const errorMessage = error instanceof Error && error.message ? error.message : String(error);
      if (errorMessage && !errorMessage.includes('No changes to commit')) {
        throw error;
      }
    }
  }

  /**
   * Safely amend the previous commit, falling back to a new commit if needed
   * @param worktreePath Path to the feature worktree
   * @param fallbackMessage Commit message to use if amend fails
   */
  public async safeAmend(
    worktreePath: string,
    fallbackMessage: string = 'chore: Update timelog'
  ): Promise<void> {
    try {
      await this.gitService.stageAndAmend(worktreePath);
    } catch (error) {
      const errorMessage = error instanceof Error && error.message ? error.message : String(error);
      if (errorMessage && !errorMessage.includes('No changes to commit')) {
        console.warn('Failed to amend commit, falling back to new commit:', errorMessage);
        try {
          await this.gitService.stageAndCommit(worktreePath, fallbackMessage);
        } catch (secondError) {
          const secondErrorMessage = secondError instanceof Error && secondError.message ? secondError.message : String(secondError);
          if (secondErrorMessage && !secondErrorMessage.includes('No changes to commit')) {
            throw secondError;
          }
        }
      }
    }
  }
}
