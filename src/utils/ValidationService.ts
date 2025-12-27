import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ValidationService {
  /**
   * Validate feature name
   */
  public static isValidFeatureName(name: string): { valid: boolean; error?: string } {
    // Check if empty
    if (!name) {
      return { valid: false, error: 'Empty feature name' };
    }

    // Check for whitespace-only (before trimming check)
    if (name.trim().length === 0) {
      return { valid: false, error: 'Invalid feature name: whitespace-only names are not allowed' };
    }

    // Check for leading/trailing whitespace
    if (name !== name.trim()) {
      return { valid: false, error: 'Invalid feature name: contains leading or trailing whitespace' };
    }

    // Validate format: lowercase words separated by dashes
    const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!pattern.test(name)) {
      return {
        valid: false,
        error: 'Invalid feature name: must contain only lowercase letters, numbers, and dashes (e.g., my-feature, feature-123)'
      };
    }

    return { valid: true };
  }

  /**
   * Check if git is available
   */
  public static async isGitAvailable(): Promise<boolean> {
    try {
      await execAsync('git --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if directory is a git repository
   */
  public static isGitRepository(dirPath: string): boolean {
    const gitDir = path.join(dirPath, '.git');
    return fs.existsSync(gitDir);
  }

  /**
   * Check if Claude CLI is available
   */
  public static async isClaudeAvailable(executable: string): Promise<boolean> {
    try {
      await execAsync(`${executable} --version`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate workspace setup
   */
  public static async validateWorkspace(workspaceRoot: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check git available
    if (!await this.isGitAvailable()) {
      errors.push('Git is not installed or not in PATH');
    }

    // Check is git repository
    if (!this.isGitRepository(workspaceRoot)) {
      errors.push('Workspace is not a git repository. Run "git init" first.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
