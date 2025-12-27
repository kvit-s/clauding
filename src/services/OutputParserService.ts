import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseTUISessionToBoth } from '../utils/tuiParser';

/**
 * Service to automatically parse agent output files into readable formats
 *
 * Watches for new output files and converts them to markdown and JSON
 * when they are complete (stable file size).
 */
export class OutputParserService {
  private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
  // Removed processingFiles - no longer needed as file watcher handlers are disabled
  // Removed stability check configuration - now using shared utility from src/utils/fileStability.ts

  constructor(private worktreesDir: string) {
    console.log('[OutputParserService] Initialized with worktrees dir:', worktreesDir);
  }

  /**
   * Start watching a feature's output directory for new files
   */
  public startWatching(featureName: string): void {
    // Don't create duplicate watchers
    if (this.watchers.has(featureName)) {
      console.log(`[OutputParserService] Already watching feature: ${featureName}`);
      return;
    }

    const outputsDir = path.join(
      this.worktreesDir,
      featureName,
      '.clauding',
      'features',
      featureName,
      'outputs'
    );

    // Check if outputs directory exists
    if (!fs.existsSync(outputsDir)) {
      console.log(`[OutputParserService] Outputs directory does not exist: ${outputsDir}`);
      return;
    }

    console.log(`[OutputParserService] Starting to watch: ${outputsDir}`);

    // Create file watcher but don't attach handlers
    // Manual trigger mode: Parsing is triggered by AgentService after terminal closure
    // This prevents premature parsing of incomplete files and eliminates race conditions
    const pattern = new vscode.RelativePattern(outputsDir, '*.txt');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // File watcher handlers intentionally not attached:
    // - Prevents parsing before file is complete
    // - Eliminates redundant stability checks
    // - Avoids race conditions between watcher and AgentService
    // AgentService.handleTerminalClosureCleanup() triggers parsing after
    // verifying file stability (3 consecutive checks)

    this.watchers.set(featureName, watcher);
  }

  /**
   * Stop watching a feature's output directory
   */
  public stopWatching(featureName: string): void {
    const watcher = this.watchers.get(featureName);
    if (watcher) {
      console.log(`[OutputParserService] Stopping watch for feature: ${featureName}`);
      watcher.dispose();
      this.watchers.delete(featureName);
    }
  }

  /**
   * Handle a new or modified output file
   *
   * REMOVED: This method is no longer used because file watcher handlers are disabled.
   * Parsing is now triggered manually by AgentService after terminal closure
   * and file stability verification, which prevents premature parsing.
   *
   * If automatic parsing via file watcher is needed in the future, this method
   * should be reimplemented with proper coordination with AgentService to avoid
   * duplicate parsing and race conditions.
   */

  /**
   * Check if a filename is an agent output file
   */
  private isAgentOutputFile(filename: string): boolean {
    // Match patterns like: implement-plan-*.txt, explore-*.txt, etc.
    // But NOT the .md or .json parsed versions
    return filename.endsWith('.txt') &&
      !filename.endsWith('.md') &&
      !filename.endsWith('.json');
  }

  /**
   * REMOVED: waitForFileStability method
   *
   * This method has been removed in favor of the shared utility function
   * from src/utils/fileStability.ts. The shared implementation provides:
   * - Consistent stability checking across all services
   * - Better configurability (customizable intervals, timeouts, check counts)
   * - Improved logging with consistent format
   * - Single source of truth for stability parameters
   *
   * Use: import { waitForFileStability } from '../utils/fileStability';
   */

  /**
   * Parse an output file to markdown and JSON formats
   */
  private async parseOutputFile(filePath: string): Promise<void> {
    try {
      // Read the file content
      const content = fs.readFileSync(filePath, 'utf-8');

      if (!content || content.trim().length === 0) {
        console.log(`[OutputParserService] File is empty, skipping: ${path.basename(filePath)}`);
        return;
      }

      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);

      // Parse once and generate both formats efficiently
      const { markdown, json } = parseTUISessionToBoth(content);

      // Write markdown
      const mdPath = path.join(dir, `${base}.md`);
      fs.writeFileSync(mdPath, markdown, 'utf-8');
      console.log(`[OutputParserService] Generated markdown: ${path.basename(mdPath)}`);

      // Write JSON
      const jsonPath = path.join(dir, `${base}.json`);
      fs.writeFileSync(jsonPath, json, 'utf-8');
      console.log(`[OutputParserService] Generated JSON: ${path.basename(jsonPath)}`);
    } catch (error) {
      console.error(`[OutputParserService] Error parsing file ${path.basename(filePath)}:`, error);
      throw error;
    }
  }

  /**
   * Manually trigger parsing for a specific output file
   * Used by AgentService after output completion
   *
   * PRECONDITION: File must already be stable (verified by caller)
   * The caller (AgentService) is responsible for waiting for file stability
   * before calling this method to avoid redundant stability checks.
   */
  public async parseFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      console.log(`[OutputParserService] File does not exist: ${filePath}`);
      return;
    }

    const filename = path.basename(filePath);
    if (!this.isAgentOutputFile(filename)) {
      console.log(`[OutputParserService] Not an agent output file: ${filename}`);
      return;
    }

    console.log(`[OutputParserService] Manually parsing: ${filename}`);

    try {
      // File stability already verified by AgentService.waitForFileStability()
      // Removed redundant stability check to improve performance (~1500ms average savings)
      await this.parseOutputFile(filePath);
    } catch (error) {
      console.error(`[OutputParserService] Error parsing ${filename}:`, error);
    }
  }

  /**
   * Dispose all watchers
   */
  public dispose(): void {
    console.log('[OutputParserService] Disposing all watchers');
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
    // Removed processingFiles.clear() - no longer needed
  }
}
