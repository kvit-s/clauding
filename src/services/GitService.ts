import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const defaultExecAsync = promisify(exec);

export class GitService {
  private execAsync: (cmd: string, opts: { cwd: string; [key: string]: unknown }) => Promise<{ stdout: string; stderr: string }>;
  private execSyncFn: typeof execSync;

  constructor(
    execFn?: (cmd: string, opts: { cwd: string; [key: string]: unknown }) => Promise<{ stdout: string; stderr: string }>,
    execSyncOverride?: typeof execSync
  ) {
    this.execAsync = execFn ?? defaultExecAsync;
    this.execSyncFn = execSyncOverride ?? execSync;
  }

  /**
   * Stage all changes in a worktree
   */
  public async stageAll(worktreePath: string): Promise<void> {
    await this.execAsync('git add -A', { cwd: worktreePath });
  }

  /**
   * Create a commit with a message
   */
  public async commit(worktreePath: string, message: string): Promise<string> {
    try {
      await this.execAsync(`git commit -m "${message}"`, { cwd: worktreePath });

      // Get commit hash
      const result = await this.execAsync('git rev-parse --short HEAD', { cwd: worktreePath });
      return result.stdout.trim();
    } catch (error) {
      // Check if error is "nothing to commit"
      // execAsync errors include stdout/stderr in the error object
      let errorMessage = '';
      if (error instanceof Error && error.message) {
        errorMessage = error.message;
      }
      // Also check stderr if available (execAsync errors have stdout/stderr properties)
      const execError = error as {stderr?: string; stdout?: string; message?: string};
      if (execError.stderr) {
        errorMessage += ' ' + execError.stderr;
      }
      if (execError.stdout) {
        errorMessage += ' ' + execError.stdout;
      }

      if (errorMessage && (errorMessage.includes('nothing to commit') || errorMessage.includes('nothing added to commit'))) {
        throw new Error('No changes to commit');
      }
      throw error;
    }
  }

  /**
   * Stage and commit in one operation
   */
  public async stageAndCommit(worktreePath: string, message: string): Promise<string> {
    await this.stageAll(worktreePath);
    return await this.commit(worktreePath, message);
  }

  /**
   * Amend the last commit with staged changes
   * Returns the new commit hash
   */
  public async amendCommit(worktreePath: string): Promise<string> {
    try {
      await this.execAsync('git commit --amend --no-edit', { cwd: worktreePath });

      // Get new commit hash
      const result = await this.execAsync('git rev-parse --short HEAD', { cwd: worktreePath });
      return result.stdout.trim();
    } catch (error) {
      // Check if error is "nothing to commit"
      let errorMessage = '';
      if (error instanceof Error && error.message) {
        errorMessage = error.message;
      }
      const execError = error as {stderr?: string; stdout?: string; message?: string};
      if (execError.stderr) {
        errorMessage += ' ' + execError.stderr;
      }
      if (execError.stdout) {
        errorMessage += ' ' + execError.stdout;
      }

      if (errorMessage && (errorMessage.includes('nothing to commit') || errorMessage.includes('nothing added to commit'))) {
        throw new Error('No changes to commit');
      }
      throw error;
    }
  }

  /**
   * Stage changes and amend the last commit
   */
  public async stageAndAmend(worktreePath: string): Promise<string> {
    await this.stageAll(worktreePath);
    return await this.amendCommit(worktreePath);
  }

  /**
   * Ensure clean commit state before starting an agent operation.
   * If there are uncommitted changes, creates an auto-commit.
   * Returns the current commit hash (short version).
   * This ensures agent runs are replicable from a clean commit state.
   */
  public async ensureCleanCommit(worktreePath: string, operationName: string): Promise<string> {
    const hasChanges = await this.hasUncommittedChanges(worktreePath);

    if (hasChanges) {
      // Auto-commit dirty changes before starting agent
      await this.stageAndCommit(
        worktreePath,
        `Auto-commit before ${operationName}\n\nEnsuring clean commit state for replicable agent run.`
      );
    }

    // Return current commit hash (short version for timelog)
    const hash = await this.getCurrentCommitShort(worktreePath);
    return hash;
  }

  /**
   * Check if there are uncommitted changes
   */
  public async hasUncommittedChanges(worktreePath: string): Promise<boolean> {
    const result = await this.execAsync('git status --porcelain', { cwd: worktreePath });
    return result.stdout.trim().length > 0;
  }

  /**
   * Check if there are uncommitted changes (synchronous version)
   */
  public hasUncommittedChangesSync(worktreePath: string): boolean {
    try {
      const result = this.execSyncFn('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf-8'
      });
      return result.trim().length > 0;
    } catch {
      // If git command fails, assume there are changes
      return true;
    }
  }

  /**
   * Get current branch name
   */
  public async getCurrentBranch(worktreePath: string): Promise<string> {
    const result = await this.execAsync('git branch --show-current', { cwd: worktreePath });
    const branch = result.stdout.trim();

    // If empty, we're in detached HEAD state
    if (branch === '') {
      return 'HEAD';
    }

    return branch;
  }

  /**
   * Get git status for a specific file
   * Returns: 'M' | 'A' | 'D' | 'R' | 'U' | undefined
   * M = Modified, A = Added, D = Deleted, R = Renamed, U = Untracked
   */
  public async getFileStatus(worktreePath: string, filePath: string): Promise<'M' | 'A' | 'D' | 'R' | 'U' | undefined> {
    try {
      const result = await this.execAsync(`git status --porcelain "${filePath}"`, { cwd: worktreePath });
      const status = result.stdout.trim();

      if (!status) {
        return undefined; // File is unmodified
      }

      const statusCode = status.substring(0, 2);

      // Status codes from git status --porcelain:
      // First character = staged status, second character = unstaged status
      // ' M' = modified (not staged)
      // 'M ' = modified (staged)
      // 'MM' = modified (both staged and unstaged)
      // '??' = untracked
      // 'A ' = added (staged)
      // ' A' = added (not staged, shouldn't happen normally)
      // 'D ' = deleted (staged)
      // ' D' = deleted (not staged)
      // 'R ' = renamed (staged)

      if (statusCode === '??') {
        return 'U'; // Untracked
      } else if (statusCode[0] === 'R' || statusCode[1] === 'R') {
        return 'R'; // Renamed
      } else if (statusCode[0] === 'D' || statusCode[1] === 'D') {
        return 'D'; // Deleted
      } else if (statusCode[0] === 'A' || statusCode[1] === 'A') {
        return 'A'; // Added/new
      } else if (statusCode[0] === 'M' || statusCode[1] === 'M') {
        return 'M'; // Modified
      }

      return undefined;
    } catch {
      // If git command fails, assume unmodified
      return undefined;
    }
  }

  /**
   * Check if a git branch exists
   * @param worktreePath Path to the git repository or worktree
   * @param branchName Name of the branch to check
   * @returns True if the branch exists, false otherwise
   */
  public async branchExists(worktreePath: string, branchName: string): Promise<boolean> {
    try {
      const result = await this.execAsync(`git branch --list "${branchName}"`, { cwd: worktreePath });
      return result.stdout.trim().length > 0;
    } catch {
      // If git command fails, assume branch doesn't exist
      return false;
    }
  }

  /**
   * Delete a git branch
   * @param branchName Name of the branch to delete
   * @throws Error if branch deletion fails
   */
  public async deleteBranch(branchName: string, repositoryPath: string): Promise<void> {
    try {
      // Use -D to force delete (includes both merged and unmerged branches)
      // We use -D because the branch is already merged, but git might not recognize it due to the cleanup commit
      await this.execAsync(`git branch -D "${branchName}"`, { cwd: repositoryPath });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete branch ${branchName}: ${errorMessage}`);
    }
  }

  /**
   * Rename a git branch
   * @param oldName Current name of the branch
   * @param newName New name for the branch
   * @param worktreePath Path to the git repository or worktree
   * @throws Error if branch rename fails
   */
  public async renameBranch(oldName: string, newName: string, worktreePath: string): Promise<void> {
    try {
      // Get the current branch name from the worktree (this will have the full name with prefix)
      const currentBranch = await this.getCurrentBranch(worktreePath);

      // Determine the new branch name - if newName contains a slash, it's already fully qualified
      // Otherwise, extract the prefix from current branch and apply it to the new name
      let newBranchName: string;
      if (newName.includes('/')) {
        newBranchName = newName;
      } else {
        // Extract prefix from current branch (e.g., "feature/" from "feature/old-name")
        const lastSlashIndex = currentBranch.lastIndexOf('/');
        const prefix = lastSlashIndex >= 0 ? currentBranch.substring(0, lastSlashIndex + 1) : '';
        newBranchName = `${prefix}${newName}`;
      }

      // Use git branch -m to rename the branch (only takes the new name, renames current branch)
      await this.execAsync(`git branch -m "${newBranchName}"`, { cwd: worktreePath });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to rename branch from ${oldName} to ${newName}: ${errorMessage}`);
    }
  }

  /**
   * Get the current commit hash (full hash)
   * @param worktreePath Path to the git repository or worktree
   * @returns Full commit hash
   */
  public async getCurrentCommit(worktreePath: string): Promise<string> {
    try {
      const result = await this.execAsync('git rev-parse HEAD', { cwd: worktreePath });
      return result.stdout.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get current commit: ${errorMessage}`);
    }
  }

  /**
   * Get the current commit hash (short hash, 7 characters)
   * @param worktreePath Path to the git repository or worktree
   * @returns Short commit hash (7 characters)
   */
  public async getCurrentCommitShort(worktreePath: string): Promise<string> {
    try {
      const result = await this.execAsync('git rev-parse --short HEAD', { cwd: worktreePath });
      return result.stdout.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get current commit: ${errorMessage}`);
    }
  }

  /**
   * Get the current commit hash synchronously (full hash)
   * @param worktreePath Path to the git repository or worktree
   * @returns Full commit hash, or empty string if failed
   */
  public getCurrentCommitSync(worktreePath: string): string {
    try {
      const result = this.execSyncFn('git rev-parse HEAD', {
        cwd: worktreePath,
        encoding: 'utf-8'
      });
      return result.trim();
    } catch {
      return '';
    }
  }

  /**
   * Get the current commit hash synchronously (short hash, 7 characters)
   * @param worktreePath Path to the git repository or worktree
   * @returns Short commit hash (7 characters), or empty string if failed
   */
  public getCurrentCommitShortSync(worktreePath: string): string {
    try {
      const result = this.execSyncFn('git rev-parse --short HEAD', {
        cwd: worktreePath,
        encoding: 'utf-8'
      });
      return result.trim();
    } catch {
      return '';
    }
  }

  /**
   * Get a file's content from a specific commit
   * @param worktreePath Path to the git repository or worktree
   * @param commitHash The commit hash to read from
   * @param filePath Path to the file relative to repository root (e.g., '.clauding/prompt.md')
   * @returns File content, or null if file doesn't exist in that commit
   */
  public async getFileFromCommit(
    worktreePath: string,
    commitHash: string,
    filePath: string
  ): Promise<string | null> {
    try {
      const result = await this.execAsync(
        `git show ${commitHash}:${filePath}`,
        { cwd: worktreePath }
      );
      return result.stdout;
    } catch (error) {
      // File doesn't exist in that commit
      return null;
    }
  }

  /**
   * Get the commit hash when a file was first added
   * @param worktreePath Path to the git repository or worktree
   * @param filePath Path to the file relative to repository root
   * @returns Short commit hash when file was created, or null if not found
   */
  public async getFileCreationCommit(worktreePath: string, filePath: string): Promise<string | null> {
    try {
      const result = await this.execAsync(
        `git log --diff-filter=A --format=%h --follow -1 -- "${filePath}"`,
        { cwd: worktreePath }
      );
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
