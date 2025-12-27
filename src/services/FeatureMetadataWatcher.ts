import * as vscode from 'vscode';
import * as fs from 'fs';
import { FeatureStateManager } from '../state/FeatureStateManager';

/**
 * Service that watches feature metadata files for changes and invalidates
 * the state manager cache. This enables automatic UI updates when feature
 * lifecycle status changes (e.g., when plan.md is created).
 *
 * Files watched:
 * - plan.md - Indicates transition from pre-plan to plan
 * - status.json - Explicit lifecycle status changes
 * - prompt.md - Initial feature creation
 * - modify-prompt.md - Plan modification requests
 * - outputs/implement-plan*.txt - Implementation output files
 * - outputs/wrap-up.json - Wrap-up completion marker
 */
export class FeatureMetadataWatcher implements vscode.Disposable {
  private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private stateManager?: FeatureStateManager;

  /**
   * Set the state manager for cache invalidation
   */
  public setStateManager(stateManager: FeatureStateManager): void {
    this.stateManager = stateManager;
  }

  /**
   * Start watching metadata files for a specific feature
   * @param featureName The name of the feature to watch
   * @param metaDir The absolute path to the feature's metadata directory
   */
  public startWatching(featureName: string, metaDir: string): void {
    // Prevent duplicate watchers
    if (this.watchers.has(featureName)) {
      console.log(`[FeatureMetadataWatcher] Already watching feature: ${featureName}`);
      return;
    }

    try {
      // Ensure directory exists (might not exist for new features yet)
      if (!fs.existsSync(metaDir)) {
        console.log(`[FeatureMetadataWatcher] Meta directory does not exist yet: ${metaDir}`);
        // Still create the watcher - it will work once the directory is created
      }

      // Watch for the metadata files: {plan.md,status.json,prompt.md,modify-prompt.md,outputs/implement-plan*.txt,outputs/wrap-up.json}
      const pattern = new vscode.RelativePattern(
        metaDir,
        '{plan.md,status.json,prompt.md,modify-prompt.md,outputs/implement-plan*.txt,outputs/wrap-up.json}'
      );

      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      // Subscribe to both create and change events
      watcher.onDidCreate((uri) => this.handleMetadataChange(featureName, uri, 'created'));
      watcher.onDidChange((uri) => this.handleMetadataChange(featureName, uri, 'changed'));
      watcher.onDidDelete((uri) => this.handleMetadataChange(featureName, uri, 'deleted'));

      this.watchers.set(featureName, watcher);
      console.log(`[FeatureMetadataWatcher] Started watching feature: ${featureName}`);
    } catch (error) {
      console.error(`[FeatureMetadataWatcher] Failed to watch feature: ${featureName}`, error);
    }
  }

  /**
   * Stop watching a specific feature
   * @param featureName The name of the feature to stop watching
   */
  public stopWatching(featureName: string): void {
    const watcher = this.watchers.get(featureName);
    if (watcher) {
      watcher.dispose();
      this.watchers.delete(featureName);
      console.log(`[FeatureMetadataWatcher] Stopped watching feature: ${featureName}`);
    }

    // Clear any pending debounce timer
    const timer = this.debounceTimers.get(featureName);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(featureName);
    }
  }

  /**
   * Handle metadata file change events
   * Debounces rapid changes to prevent excessive UI updates
   * @param featureName The feature name
   * @param uri The URI of the changed file
   * @param changeType The type of change (created, changed, deleted)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleMetadataChange(featureName: string, _uri: vscode.Uri, _changeType: string): void {
    // Debounce the change event to handle rapid successive changes
    this.emitChangeDebounced(featureName);
  }

  /**
   * Invalidate state manager cache with debouncing
   * Multiple changes within 100ms are collapsed into a single invalidation
   * @param featureName The feature name
   */
  private emitChangeDebounced(featureName: string): void {
    // Clear existing timer if present
    const existingTimer = this.debounceTimers.get(featureName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      if (this.stateManager) {
        this.stateManager.invalidate(featureName);
      }
      this.debounceTimers.delete(featureName);
    }, 100); // 100ms debounce

    this.debounceTimers.set(featureName, timer);
  }

  /**
   * Dispose all watchers and clean up resources
   */
  public dispose(): void {
    // Dispose all watchers
    for (const [featureName, watcher] of this.watchers) {
      watcher.dispose();
      console.log(`[FeatureMetadataWatcher] Disposed watcher for feature: ${featureName}`);
    }
    this.watchers.clear();

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
