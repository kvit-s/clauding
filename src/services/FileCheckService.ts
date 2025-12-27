import * as fs from 'fs';
import * as path from 'path';
import glob from 'fast-glob';
import { AgentCommand, RequiredFile } from '../models/AgentCommand';
import { getAbsoluteMetaPath, ensureFeatureMetaDirExists } from '../utils/featureMetaPaths';

export interface FileCheckResult {
  allExist: boolean;
  missingFiles: RequiredFile[];  // Only 'exact' type files
  existingFiles: RequiredFile[];
  patternErrors: { file: RequiredFile; error: string }[];  // Pattern files not found
}

export class FileCheckService {
  /**
   * Check if all required files exist for a command
   */
  public async checkRequiredFiles(
    command: AgentCommand,
    worktreePath: string
  ): Promise<FileCheckResult> {
    const featureName = path.basename(worktreePath);
    const missingFiles: RequiredFile[] = [];
    const existingFiles: RequiredFile[] = [];
    const patternErrors: { file: RequiredFile; error: string }[] = [];

    // If no required files, return success
    if (!command.requiredFiles || command.requiredFiles.length === 0) {
      return {
        allExist: true,
        missingFiles: [],
        existingFiles: [],
        patternErrors: []
      };
    }

    for (const requiredFile of command.requiredFiles) {
      if (requiredFile.type === 'exact') {
        const result = await this.checkExactFile(requiredFile, worktreePath, featureName);
        if (result.exists) {
          existingFiles.push(requiredFile);
        } else {
          missingFiles.push(requiredFile);
        }
      } else if (requiredFile.type === 'pattern') {
        const result = await this.checkPatternFile(requiredFile, worktreePath, featureName);
        if (result.found) {
          existingFiles.push(requiredFile);
        } else {
          patternErrors.push({
            file: requiredFile,
            error: result.error || `No files found matching pattern: ${requiredFile.path}`
          });
        }
      }
    }

    return {
      allExist: missingFiles.length === 0 && patternErrors.length === 0,
      missingFiles,
      existingFiles,
      patternErrors
    };
  }

  /**
   * Check if an exact file exists and has content
   */
  private async checkExactFile(
    file: RequiredFile,
    worktreePath: string,
    featureName: string
  ): Promise<{ exists: boolean }> {
    const filePath = getAbsoluteMetaPath(worktreePath, featureName, file.path);

    // For exact files, check if they exist and have content
    if (fs.existsSync(filePath) && this.fileHasContent(filePath)) {
      return { exists: true };
    }

    return { exists: false };
  }

  /**
   * Check if files matching a pattern exist
   */
  private async checkPatternFile(
    file: RequiredFile,
    worktreePath: string,
    featureName: string
  ): Promise<{ found: boolean; error?: string }> {
    try {
      // Build the pattern path
      const metaDir = path.join(worktreePath, '.clauding');
      const pattern = path.join(metaDir, file.path);

      const files = await glob(pattern, { absolute: false });

      if (files.length > 0) {
        return { found: true };
      }

      return {
        found: false,
        error: file.errorMessage || `No files found matching pattern: ${file.path}`
      };
    } catch (error) {
      return {
        found: false,
        error: `Error matching pattern ${file.path}: ${error}`
      };
    }
  }

  /**
   * Create missing files with appropriate content
   */
  public createMissingFiles(
    missingFiles: RequiredFile[],
    worktreePath: string
  ): void {
    const featureName = path.basename(worktreePath);

    // Ensure directory exists before writing
    ensureFeatureMetaDirExists(worktreePath, featureName);

    for (const file of missingFiles) {
      const filePath = getAbsoluteMetaPath(worktreePath, featureName, file.path);
      const content = file.template || '';
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }

  /**
   * Check if file has content
   */
  public fileHasContent(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      return false;
    }
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    return content.length > 0;
  }
}
