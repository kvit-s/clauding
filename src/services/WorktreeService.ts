import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ensureClaudeignoreExists } from '../utils/worktreeSetup';
import {
  ensureWorktreeMetaDirExists,
  ensureFeaturesFolderExists,
  getProjectRoot,
  getFeaturesDir,
  getFeatureFolder
} from '../utils/featureMetaPaths';

const defaultExecAsync = promisify(exec);

export class WorktreeService {
  private worktreesDir: string;
  private projectRoot: string;
  private mainBranch: string;
  private branchPrefix: string;
  private execAsync: (cmd: string, opts: { cwd: string; [key: string]: unknown }) => Promise<{ stdout: string; stderr: string }>;
  private fsFn: typeof fs;

  constructor(
    projectRoot: string,
    worktreesDir: string,
    mainBranch: string,
    branchPrefix: string,
    execFn?: (cmd: string, opts: { cwd: string; [key: string]: unknown }) => Promise<{ stdout: string; stderr: string }>,
    fsOverride?: typeof fs
  ) {
    this.projectRoot = projectRoot;
    this.worktreesDir = worktreesDir;
    this.mainBranch = mainBranch;
    this.branchPrefix = branchPrefix;
    this.execAsync = execFn ?? defaultExecAsync;
    this.fsFn = fsOverride ?? fs;
  }

  /**
   * Create a git worktree for a feature
   */
  public async createWorktree(featureName: string): Promise<string> {
    const worktreePath = path.join(this.worktreesDir, featureName);
    // Sanitize branch name: replace spaces and other invalid characters with hyphens
    const sanitizedFeatureName = featureName.replace(/\s+/g, '-');
    const branchName = `${this.branchPrefix}${sanitizedFeatureName}`;

    try {
      // Ensure the worktrees directory exists
      if (!this.fsFn.existsSync(this.worktreesDir)) {
        this.fsFn.mkdirSync(this.worktreesDir, { recursive: true });
      }

      await this.execAsync(
        `git worktree add "${worktreePath}" -b "${branchName}"`,
        { cwd: this.projectRoot }
      );

      // Create .claudeignore to prevent watching too many files
      await ensureClaudeignoreExists(worktreePath);

      // Create worktree .clauding/ directory (for prompt.md, plan.md, modify-prompt.md)
      ensureWorktreeMetaDirExists(worktreePath);

      // Create features folder (for all other metadata)
      ensureFeaturesFolderExists(this.projectRoot, featureName);

      return worktreePath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create worktree: ${errorMessage}`);
    }
  }

  /**
   * Remove a git worktree
   */
  public async removeWorktree(featureName: string): Promise<void> {
    const worktreePath = path.join(this.worktreesDir, featureName);

    try {
      // Check if worktree actually exists first
      if (!this.fsFn.existsSync(worktreePath)) {
        // Worktree doesn't exist, nothing to do
        return;
      }

      // Use --force to remove worktree even if it has uncommitted changes
      await this.execAsync(
        `git worktree remove "${worktreePath}" --force`,
        { cwd: this.projectRoot }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to remove worktree: ${errorMessage}`);
    }
  }

  /**
   * Rename a git worktree by moving it to a new location
   * @param oldFeatureName Current name of the feature
   * @param newFeatureName New name for the feature
   * @returns The new worktree path
   * @throws Error if worktree rename fails
   */
  public async renameWorktree(oldFeatureName: string, newFeatureName: string): Promise<string> {
    const oldWorktreePath = path.join(this.worktreesDir, oldFeatureName);
    const newWorktreePath = path.join(this.worktreesDir, newFeatureName);

    try {
      // Check if old worktree exists
      if (!this.fsFn.existsSync(oldWorktreePath)) {
        throw new Error(`Worktree for feature "${oldFeatureName}" does not exist`);
      }

      // Check if new worktree path already exists
      if (this.fsFn.existsSync(newWorktreePath)) {
        throw new Error(`Worktree path for feature "${newFeatureName}" already exists`);
      }

      // Use git worktree move command (requires Git 2.17+)
      await this.execAsync(
        `git worktree move "${oldWorktreePath}" "${newWorktreePath}"`,
        { cwd: this.projectRoot }
      );

      return newWorktreePath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to rename worktree: ${errorMessage}`);
    }
  }

  /**
   * Get the absolute path to a feature's worktree
   */
  public getWorktreePath(featureName: string): string {
    return path.join(this.worktreesDir, featureName);
  }

  /**
   * Check if a worktree exists
   */
  public worktreeExists(featureName: string): boolean {
    const worktreePath = this.getWorktreePath(featureName);
    return this.fsFn.existsSync(worktreePath);
  }

  /**
   * Rename a feature folder (in .clauding/features/)
   * @param oldFeatureName Current name of the feature
   * @param newFeatureName New name for the feature
   * @throws Error if feature folder rename fails
   */
  public renameFeatureFolder(oldFeatureName: string, newFeatureName: string): void {
    const oldFeatureFolder = getFeatureFolder(this.projectRoot, oldFeatureName);
    const newFeatureFolder = getFeatureFolder(this.projectRoot, newFeatureName);

    try {
      // Check if old feature folder exists
      if (this.fsFn.existsSync(oldFeatureFolder)) {
        // Check if new feature folder already exists
        if (this.fsFn.existsSync(newFeatureFolder)) {
          throw new Error(`Feature folder for "${newFeatureName}" already exists`);
        }

        // Rename the folder
        this.fsFn.renameSync(oldFeatureFolder, newFeatureFolder);
      }
      // If old folder doesn't exist, no need to rename
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to rename feature folder: ${errorMessage}`);
    }
  }

  /**
   * Remove a feature folder (in .clauding/features/)
   * @param featureName The name of the feature
   */
  public removeFeatureFolder(featureName: string): void {
    const featureFolder = getFeatureFolder(this.projectRoot, featureName);

    try {
      if (this.fsFn.existsSync(featureFolder)) {
        this.fsFn.rmSync(featureFolder, { recursive: true, force: true });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to remove feature folder: ${errorMessage}`);
    }
  }

  /**
   * Get the features directory path
   */
  public getFeaturesDir(): string {
    return getFeaturesDir(this.projectRoot);
  }

  /**
   * Get the path to a specific feature folder
   */
  public getFeatureFolder(featureName: string): string {
    return getFeatureFolder(this.projectRoot, featureName);
  }
}
