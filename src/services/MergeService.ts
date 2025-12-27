import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const defaultExecAsync = promisify(exec);

export interface MergeResult {
  success: boolean;
  hasConflicts: boolean;
  conflictedFiles: string[];
  message: string;
}

export type ConflictResolutionStrategy = 'feature' | 'main' | 'agent' | 'cancel';

export class MergeService {
  private projectRoot: string;
  private mainBranch: string;
  private execAsync: (cmd: string, opts: { cwd: string; [key: string]: unknown }) => Promise<{ stdout: string; stderr: string }>;
  private fsFn: typeof fs;

  constructor(
    projectRoot: string,
    mainBranch: string,
    execFn?: (cmd: string, opts: { cwd: string; [key: string]: unknown }) => Promise<{ stdout: string; stderr: string }>,
    fsOverride?: typeof fs
  ) {
    this.projectRoot = projectRoot;
    this.mainBranch = mainBranch;
    this.execAsync = execFn ?? defaultExecAsync;
    this.fsFn = fsOverride ?? fs;
  }

  /**
   * Check if there are uncommitted changes in a worktree
   */
  public async hasUncommittedChanges(worktreePath: string): Promise<boolean> {
    const result = await this.execAsync('git status --porcelain', { cwd: worktreePath });
    return result.stdout.trim().length > 0;
  }

  /**
   * Merge a feature branch into main
   */
  public async mergeBranch(branchName: string): Promise<MergeResult> {
    // Validate branch name
    if (!branchName || branchName.trim() === '') {
      throw new Error('Branch name cannot be empty');
    }

    // Check if merge is already in progress
    const isMerging = await this.isMergeInProgress();
    if (isMerging) {
      // Check if conflicts are resolved
      const conflictedFiles = await this.getConflictedFiles();

      if (conflictedFiles.length === 0) {
        // No conflicts - try to complete the merge
        try {
          await this.execAsync('git commit --no-edit', { cwd: this.projectRoot });
          return {
            success: true,
            hasConflicts: false,
            conflictedFiles: [],
            message: 'Merge completed'
          };
        } catch (error) {
          // Check if already committed (nothing to commit)
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('nothing to commit')) {
            // Merge already completed somehow
            return {
              success: true,
              hasConflicts: false,
              conflictedFiles: [],
              message: 'Merge already completed'
            };
          }
          throw error;
        }
      }

      // Conflicts still exist - return result to allow retry
      return {
        success: false,
        hasConflicts: true,
        conflictedFiles,
        message: `Merge in progress with conflicts in ${conflictedFiles.length} file(s)`
      };
    }

    try {
      // Ensure we're on main branch
      await this.execAsync(`git checkout ${this.mainBranch}`, { cwd: this.projectRoot });

      // Attempt merge with no-ff
      await this.execAsync(`git merge ${branchName} --no-ff -m "Merge ${branchName}"`, { cwd: this.projectRoot });

      return {
        success: true,
        hasConflicts: false,
        conflictedFiles: [],
        message: 'Merge successful'
      };
    } catch (error) {
      // Check if error is due to conflicts
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for merge conflicts - git returns exit code 1 for conflicts
      // Try to detect conflicts by checking for conflicted files
      const conflictedFiles = await this.getConflictedFiles();
      if (conflictedFiles.length > 0) {
        return {
          success: false,
          hasConflicts: true,
          conflictedFiles: conflictedFiles,
          message: `Merge conflicts in ${conflictedFiles.length} file(s)`
        };
      }

      // If no conflicts found but merge failed, it's a different error
      // Check if error message indicates conflicts
      if (errorMessage.includes('CONFLICT') || errorMessage.includes('Automatic merge failed')) {
        // Edge case: error says conflict but we couldn't find files
        // Still report as conflict
        return {
          success: false,
          hasConflicts: true,
          conflictedFiles: [],
          message: 'Merge conflicts detected'
        };
      }

      // Other merge error
      throw new Error(`Merge failed: ${errorMessage}`);
    }
  }

  /**
   * Get list of files with merge conflicts
   */
  private async getConflictedFiles(): Promise<string[]> {
    try {
      const result = await this.execAsync('git diff --name-only --diff-filter=U', {
        cwd: this.projectRoot
      });
      return result.stdout.trim().split('\n').filter((f: string) => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Resolve conflicts using a strategy
   */
  public async resolveConflicts(
    conflictedFiles: string[],
    strategy: ConflictResolutionStrategy
  ): Promise<void> {
    // Validate strategy
    const validStrategies: ConflictResolutionStrategy[] = ['feature', 'main', 'agent', 'cancel'];
    if (!validStrategies.includes(strategy)) {
      throw new Error(`Invalid conflict resolution strategy: ${strategy}`);
    }

    switch (strategy) {
      case 'feature':
        await this.resolveWithFeatureBranch(conflictedFiles);
        break;
      case 'main':
        await this.resolveWithMainBranch(conflictedFiles);
        break;
      case 'agent':
        // Will be handled by caller (execute agent command)
        break;
      case 'cancel':
        await this.abortMerge();
        break;
    }
  }

  /**
   * Accept all changes from feature branch
   */
  private async resolveWithFeatureBranch(conflictedFiles: string[]): Promise<void> {
    for (const file of conflictedFiles) {
      await this.execAsync(`git checkout --theirs "${file}"`, { cwd: this.projectRoot });
      await this.execAsync(`git add "${file}"`, { cwd: this.projectRoot });
    }
    await this.execAsync(
      'git commit --no-edit -m "Merge: Resolved conflicts by accepting feature branch"',
      { cwd: this.projectRoot }
    );
  }

  /**
   * Accept all changes from main branch
   */
  private async resolveWithMainBranch(conflictedFiles: string[]): Promise<void> {
    for (const file of conflictedFiles) {
      await this.execAsync(`git checkout --ours "${file}"`, { cwd: this.projectRoot });
      await this.execAsync(`git add "${file}"`, { cwd: this.projectRoot });
    }
    await this.execAsync(
      'git commit --no-edit -m "Merge: Resolved conflicts by accepting main branch"',
      { cwd: this.projectRoot }
    );
  }

  /**
   * Abort the merge
   */
  public async abortMerge(): Promise<void> {
    await this.execAsync('git merge --abort', { cwd: this.projectRoot });
  }

  /**
   * Complete merge after agent resolves conflicts
   */
  public async completeMergeAfterAgentResolution(branchName: string): Promise<void> {
    // Check if conflicts still exist
    const conflictedFiles = await this.getConflictedFiles();
    if (conflictedFiles.length > 0) {
      throw new Error('Agent did not resolve all conflicts');
    }

    // Stage all changes
    await this.execAsync('git add -A', { cwd: this.projectRoot });

    // Commit the merge
    await this.execAsync(
      `git commit --no-edit -m "Merge ${branchName}: Resolved conflicts with agent"`,
      { cwd: this.projectRoot }
    );
  }

  /**
   * Check if merge is in progress
   */
  public async isMergeInProgress(): Promise<boolean> {
    // Check for MERGE_HEAD file which indicates a merge in progress
    const mergeHeadPath = path.join(this.projectRoot, '.git', 'MERGE_HEAD');
    return this.fsFn.existsSync(mergeHeadPath);
  }

  /**
   * Merge main branch into the current feature branch (in worktree)
   * This is the reverse of mergeBranch - it updates the feature with changes from main
   */
  public async mergeMainIntoFeature(worktreePath: string): Promise<MergeResult> {
    try {
      // Attempt merge from main into current branch (feature branch in worktree)
      await this.execAsync(`git merge ${this.mainBranch} --no-ff -m "Merge ${this.mainBranch} into feature"`, { cwd: worktreePath });

      return {
        success: true,
        hasConflicts: false,
        conflictedFiles: [],
        message: 'Merge successful'
      };
    } catch (error) {
      // Check if error is due to conflicts
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for merge conflicts - git returns exit code 1 for conflicts
      // Try to detect conflicts by checking for conflicted files
      const conflictedFiles = await this.getConflictedFilesInWorktree(worktreePath);
      if (conflictedFiles.length > 0) {
        return {
          success: false,
          hasConflicts: true,
          conflictedFiles: conflictedFiles,
          message: `Merge conflicts in ${conflictedFiles.length} file(s)`
        };
      }

      // If no conflicts found but merge failed, it's a different error
      // Check if error message indicates conflicts
      if (errorMessage.includes('CONFLICT') || errorMessage.includes('Automatic merge failed')) {
        // Edge case: error says conflict but we couldn't find files
        // Still report as conflict
        return {
          success: false,
          hasConflicts: true,
          conflictedFiles: [],
          message: 'Merge conflicts detected'
        };
      }

      // Other merge error
      throw new Error(`Merge failed: ${errorMessage}`);
    }
  }

  /**
   * Get list of files with merge conflicts in a worktree
   */
  private async getConflictedFilesInWorktree(worktreePath: string): Promise<string[]> {
    try {
      const result = await this.execAsync('git diff --name-only --diff-filter=U', {
        cwd: worktreePath
      });
      return result.stdout.trim().split('\n').filter((f: string) => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Resolve conflicts in worktree using a strategy
   */
  public async resolveConflictsInWorktree(
    worktreePath: string,
    conflictedFiles: string[],
    strategy: ConflictResolutionStrategy
  ): Promise<void> {
    switch (strategy) {
      case 'feature':
        await this.resolveWithCurrentBranch(worktreePath, conflictedFiles);
        break;
      case 'main':
        await this.resolveWithMainInWorktree(worktreePath, conflictedFiles);
        break;
      case 'agent':
        // Will be handled by caller (execute agent command)
        break;
      case 'cancel':
        await this.abortMergeInWorktree(worktreePath);
        break;
    }
  }

  /**
   * Accept all changes from current branch (feature branch in worktree)
   */
  private async resolveWithCurrentBranch(worktreePath: string, conflictedFiles: string[]): Promise<void> {
    for (const file of conflictedFiles) {
      await this.execAsync(`git checkout --ours "${file}"`, { cwd: worktreePath });
      await this.execAsync(`git add "${file}"`, { cwd: worktreePath });
    }
    await this.execAsync(
      'git commit --no-edit -m "Merge: Resolved conflicts by keeping feature branch changes"',
      { cwd: worktreePath }
    );
  }

  /**
   * Accept all changes from main branch in worktree
   */
  private async resolveWithMainInWorktree(worktreePath: string, conflictedFiles: string[]): Promise<void> {
    for (const file of conflictedFiles) {
      await this.execAsync(`git checkout --theirs "${file}"`, { cwd: worktreePath });
      await this.execAsync(`git add "${file}"`, { cwd: worktreePath });
    }
    await this.execAsync(
      'git commit --no-edit -m "Merge: Resolved conflicts by accepting main branch changes"',
      { cwd: worktreePath }
    );
  }

  /**
   * Abort the merge in worktree
   */
  public async abortMergeInWorktree(worktreePath: string): Promise<void> {
    await this.execAsync('git merge --abort', { cwd: worktreePath });
  }
}
