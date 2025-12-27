import * as fs from 'fs';
import * as path from 'path';
import glob from 'fast-glob';

export interface VariableContext {
  featureName: string;
  worktreePath: string;
  rootPath: string;
  workingDirectory: string;
}

export class VariableResolver {
  private cache: Map<string, string> = new Map();
  private readonly MAX_FILE_SIZE = 100 * 1024; // 100KB limit for file injection

  /**
   * Resolves all variables in a template string
   * @param template The template string with variables
   * @param context The variable context
   * @returns The resolved string
   */
  async resolve(template: string, context: VariableContext): Promise<string> {
    let result = template;

    // First, resolve simple variables
    result = this.resolveSimpleVariables(result, context);

    // Then resolve pattern variables (e.g., {test-run-last})
    result = await this.resolvePatternVariables(result, context);

    // Finally resolve file variables (e.g., {file:path/to/file})
    result = await this.resolveFileVariables(result, context);

    return result;
  }

  /**
   * Resolves simple static variables
   */
  private resolveSimpleVariables(template: string, context: VariableContext): string {
    let result = template;

    // Replace all occurrences of each variable
    result = result.replace(/\{feature-name\}/g, context.featureName);
    result = result.replace(/\{working-directory\}/g, context.workingDirectory);
    result = result.replace(/\{worktree\}/g, context.worktreePath);
    result = result.replace(/\{root\}/g, context.rootPath);

    return result;
  }

  /**
   * Resolves file content variables (e.g., {file:path/to/file.txt})
   */
  private async resolveFileVariables(template: string, context: VariableContext): Promise<string> {
    const filePattern = /\{file:([^}]+)\}/g;
    let result = template;
    const matches = Array.from(template.matchAll(filePattern));

    for (const match of matches) {
      const filePath = match[1];
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(context.workingDirectory, filePath);

      try {
        const content = await this.readFileWithCache(fullPath);
        result = result.replace(match[0], content);
      } catch (error) {
        console.error(`Failed to read file ${fullPath}:`, error);
        // Replace with empty string or error message
        result = result.replace(match[0], `[Error: Could not read file ${filePath}]`);
      }
    }

    return result;
  }

  /**
   * Resolves pattern-based variables (e.g., {test-run-last})
   */
  private async resolvePatternVariables(template: string, context: VariableContext): Promise<string> {
    let result = template;

    // Handle {test-run-last} pattern - finds the most recent test-run-*.txt file
    const testRunPattern = /\{test-run-last\}/g;
    if (testRunPattern.test(template)) {
      const lastTestFile = await this.findLastTestRunFile(context.workingDirectory);
      result = result.replace(testRunPattern, lastTestFile || '[Error: No test run files found]');
    }

    return result;
  }

  /**
   * Finds the most recent test run file
   */
  private async findLastTestRunFile(workingDir: string): Promise<string | null> {
    const cacheKey = `test-run-last:${workingDir}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      const pattern = path.join(workingDir, '.clauding', 'test-run-*.txt');
      const files = await glob(pattern, { absolute: false });

      if (files.length === 0) {
        return null;
      }

      // Sort by modification time (most recent first)
      const sortedFiles = files
        .map((file: string) => ({
          path: file,
          mtime: fs.statSync(file).mtime.getTime()
        }))
        .sort((a: { path: string; mtime: number }, b: { path: string; mtime: number }) => b.mtime - a.mtime);

      const result = sortedFiles[0].path;
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Failed to find test run files:', error);
      return null;
    }
  }

  /**
   * Reads a file with caching and size limits
   */
  private async readFileWithCache(filePath: string): Promise<string> {
    const cacheKey = `file:${filePath}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    return new Promise((resolve, reject) => {
      fs.stat(filePath, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        if (stats.size > this.MAX_FILE_SIZE) {
          reject(new Error(`File ${filePath} exceeds maximum size of ${this.MAX_FILE_SIZE} bytes`));
          return;
        }

        fs.readFile(filePath, 'utf-8', (err, content) => {
          if (err) {
            reject(err);
          } else {
            this.cache.set(cacheKey, content);
            resolve(content);
          }
        });
      });
    });
  }

  /**
   * Clears the variable cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
