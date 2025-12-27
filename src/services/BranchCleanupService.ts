import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const defaultExecAsync = promisify(exec);

export interface BranchCleanupResult {
  deleted: string[];
  skipped: string[];
  errors: Array<{ branch: string; error: string }>;
}

export class BranchCleanupService {
  private execAsync: (
    cmd: string,
    opts: { cwd: string; [key: string]: unknown }
  ) => Promise<{ stdout: string; stderr: string }>;
  private projectRoot: string;

  constructor(
    projectRoot: string,
    execFn?: (
      cmd: string,
      opts: { cwd: string; [key: string]: unknown }
    ) => Promise<{ stdout: string; stderr: string }>
  ) {
    this.projectRoot = projectRoot;
    this.execAsync = execFn ?? defaultExecAsync;
  }

  /**
   * Create a backup of the .git directory
   * @returns Path to the backup directory
   */
  public async backupGitDirectory(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('Z')[0];
    const backupDir = path.join(this.projectRoot, `.git.backup-${timestamp}`);

    try {
      // Create backup using cp -r
      await this.execAsync(`cp -r .git "${backupDir}"`, { cwd: this.projectRoot });

      // Verify backup exists
      if (!fs.existsSync(backupDir)) {
        throw new Error('Backup directory was not created');
      }

      return backupDir;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create backup: ${errorMessage}`);
    }
  }

  /**
   * Get list of branches that have been fully merged into the base branch
   * @param baseBranch Base branch to check merges against (default: 'main')
   * @returns Array of merged branch names
   */
  public async getMergedBranches(baseBranch: string = 'main'): Promise<string[]> {
    try {
      // Get all branches merged into base branch
      const result = await this.execAsync(`git branch --merged ${baseBranch}`, {
        cwd: this.projectRoot,
      });

      // Parse output, filter out main/master branches and current branch indicator
      const branches = result.stdout
        .split('\n')
        .map((line) => line.trim().replace(/^\*?\s*/, ''))
        .filter(
          (branch) =>
            branch &&
            !branch.includes('main') &&
            !branch.includes('master') &&
            branch !== baseBranch
        );

      return branches;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get merged branches: ${errorMessage}`);
    }
  }

  /**
   * Check if a branch has an active worktree
   * @param branchName Branch name to check
   * @returns True if the branch has a worktree
   */
  public async hasWorktree(branchName: string): Promise<boolean> {
    try {
      const result = await this.execAsync('git worktree list --porcelain', {
        cwd: this.projectRoot,
      });

      // Parse worktree list to find branches
      const worktrees = result.stdout;
      return worktrees.includes(`branch refs/heads/${branchName}`);
    } catch (error) {
      // If command fails, assume no worktree
      return false;
    }
  }

  /**
   * Get the current branch name
   * @returns Current branch name
   */
  public async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.execAsync('git branch --show-current', {
        cwd: this.projectRoot,
      });
      return result.stdout.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get current branch: ${errorMessage}`);
    }
  }

  /**
   * Delete merged branches
   * @param baseBranch Base branch to check merges against (default: 'main')
   * @param dryRun If true, only show what would be deleted without actually deleting (default: true)
   * @returns Object containing deleted, skipped, and error arrays
   */
  public async deleteMergedBranches(
    baseBranch: string = 'main',
    dryRun: boolean = true
  ): Promise<BranchCleanupResult> {
    const result: BranchCleanupResult = {
      deleted: [],
      skipped: [],
      errors: [],
    };

    try {
      // Get merged branches
      const mergedBranches = await this.getMergedBranches(baseBranch);

      // Get current branch
      const currentBranch = await this.getCurrentBranch();

      for (const branch of mergedBranches) {
        try {
          // Skip current branch
          if (branch === currentBranch) {
            result.skipped.push(branch);
            continue;
          }

          // Check if branch has worktree
          const hasWorktree = await this.hasWorktree(branch);
          if (hasWorktree) {
            result.skipped.push(branch);
            continue;
          }

          if (dryRun) {
            // Dry run - just log what would be deleted
            result.deleted.push(branch);
          } else {
            // Use -d for safe delete (only merged branches)
            // This will fail if the branch is not fully merged, providing an extra safety check
            await this.execAsync(`git branch -d "${branch}"`, {
              cwd: this.projectRoot,
            });
            result.deleted.push(branch);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push({ branch, error: errorMessage });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete merged branches: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Get statistics about merged branches
   * @param baseBranch Base branch to check merges against (default: 'main')
   * @returns Object with counts and branch lists
   */
  public async getBranchStatistics(baseBranch: string = 'main'): Promise<{
    total: number;
    merged: number;
    mergedBranches: string[];
    active: number;
  }> {
    try {
      // Get all branches
      const allBranchesResult = await this.execAsync('git branch', {
        cwd: this.projectRoot,
      });
      const allBranches = allBranchesResult.stdout
        .split('\n')
        .map((line) => line.trim().replace(/^\*?\s*/, ''))
        .filter((branch) => branch && !branch.includes('main') && !branch.includes('master'));

      // Get merged branches
      const mergedBranches = await this.getMergedBranches(baseBranch);

      return {
        total: allBranches.length,
        merged: mergedBranches.length,
        mergedBranches,
        active: allBranches.length - mergedBranches.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get branch statistics: ${errorMessage}`);
    }
  }
}
