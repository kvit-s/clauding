import * as vscode from 'vscode';
import { Feature } from '../models/Feature';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export class FeatureSearchService {
  private searchHistory: string[] = [];
  private readonly MAX_HISTORY = 10;
  private readonly HISTORY_STORAGE_KEY = 'clauding.searchHistory';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly worktreesDir: string,
    private readonly featuresDir: string
  ) {
    this.loadSearchHistory();
  }

  /**
   * Search through features using grep for file content and pattern matching for names
   * @param query Search query (supports wildcards like "popup-not*")
   * @param features Features to search through (active or archived)
   * @param isArchived Whether searching in archived features
   * @returns Filtered features that match the query
   */
  async searchFeatures(query: string, features: Feature[], isArchived: boolean): Promise<Feature[]> {
    if (!query || query.trim() === '') {
      return features;
    }

    const trimmedQuery = query.trim();
    const matchedFeatureNames = new Set<string>();

    // 1. Search by feature name using wildcard pattern matching
    for (const feature of features) {
      if (this.matchFeatureName(feature.name, trimmedQuery)) {
        matchedFeatureNames.add(feature.name);
      }
    }

    // 2. Search in file contents using grep
    const grepMatches = isArchived
      ? await this.grepArchivedFeatures(trimmedQuery)
      : await this.grepActiveFeatures(trimmedQuery);

    // Combine grep results
    for (const featureName of grepMatches) {
      matchedFeatureNames.add(featureName);
    }

    const filtered = features.filter(feature => matchedFeatureNames.has(feature.name));
    return filtered;
  }

  /**
   * Search feature names using wildcard pattern matching
   */
  private matchFeatureName(featureName: string, pattern: string): boolean {
    // Convert wildcard pattern to regex
    // Escape regex special characters except *
    const escapedPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(escapedPattern, 'i'); // case-insensitive
    return regex.test(featureName);
  }

  /**
   * Use grep to search in active feature worktrees
   * Searches in all feature worktree .clauding directories for prompt.md, plan.md, modify-prompt.md
   */
  private async grepActiveFeatures(query: string): Promise<Set<string>> {
    const matchedFeatures = new Set<string>();

    try {
      // Escape single quotes in query for shell
      const escapedQuery = query.replace(/'/g, "'\\''");

      // Build grep command for active features
      // Search in all worktree .clauding directories
      const grepCommand = `grep -l -i -F '${escapedQuery}' "${this.worktreesDir}"/*/.clauding/{prompt,plan,modify-prompt}.md 2>/dev/null || true`;

      const { stdout } = await execAsync(grepCommand);

      if (stdout) {
        const filePaths = stdout.trim().split('\n').filter(p => p);
        for (const filePath of filePaths) {
          const featureName = this.extractFeatureName(filePath, false);
          if (featureName) {
            matchedFeatures.add(featureName);
          }
        }
      }
    } catch (error) {
      // Silently handle errors (e.g., directory doesn't exist)
      console.error('Error searching active features:', error);
    }

    return matchedFeatures;
  }

  /**
   * Use grep to search in archived features
   * Searches in all archived feature directories for prompt.md, plan.md, modify-prompt.md
   */
  private async grepArchivedFeatures(query: string): Promise<Set<string>> {
    const matchedFeatures = new Set<string>();

    try {
      // Escape single quotes in query for shell
      const escapedQuery = query.replace(/'/g, "'\\''");

      // Build grep command for archived features
      const grepCommand = `grep -l -i -F '${escapedQuery}' "${this.featuresDir}"/*/{prompt,plan,modify-prompt}.md 2>/dev/null || true`;

      const { stdout } = await execAsync(grepCommand);

      if (stdout) {
        const filePaths = stdout.trim().split('\n').filter(p => p);
        for (const filePath of filePaths) {
          const featureName = this.extractFeatureName(filePath, true);
          if (featureName) {
            matchedFeatures.add(featureName);
          }
        }
      }
    } catch (error) {
      // Silently handle errors (e.g., directory doesn't exist)
      console.error('Error searching archived features:', error);
    }

    return matchedFeatures;
  }

  /**
   * Extract feature name from file path
   * For active: {worktreesDir}/{name}/.clauding/prompt.md → name
   * For archived: {featuresDir}/{name}/prompt.md → name
   */
  private extractFeatureName(filePath: string, isArchived: boolean): string | null {
    try {
      if (isArchived) {
        // Extract from: /path/to/.clauding/features/{name}/prompt.md
        const relativePath = path.relative(this.featuresDir, filePath);
        const parts = relativePath.split(path.sep);
        return parts[0] || null;
      } else {
        // Extract from: /path/to/.clauding/worktrees/{name}/.clauding/prompt.md
        const relativePath = path.relative(this.worktreesDir, filePath);
        const parts = relativePath.split(path.sep);
        return parts[0] || null;
      }
    } catch (error) {
      console.error('Error extracting feature name from path:', filePath, error);
      return null;
    }
  }

  /**
   * Add to search history
   */
  addToHistory(query: string): void {
    // Remove if already exists (to avoid duplicates)
    this.searchHistory = this.searchHistory.filter(item => item !== query);

    // Add to beginning
    this.searchHistory.unshift(query);

    // Keep only last MAX_HISTORY items
    if (this.searchHistory.length > this.MAX_HISTORY) {
      this.searchHistory = this.searchHistory.slice(0, this.MAX_HISTORY);
    }

    this.saveSearchHistory();
  }

  /**
   * Get search history
   */
  getHistory(): string[] {
    return [...this.searchHistory];
  }

  /**
   * Clear search history
   */
  clearHistory(): void {
    this.searchHistory = [];
    this.saveSearchHistory();
  }

  /**
   * Load search history from extension storage
   */
  private loadSearchHistory(): void {
    try {
      const stored = this.context.globalState.get<string[]>(this.HISTORY_STORAGE_KEY);
      if (stored && Array.isArray(stored)) {
        this.searchHistory = stored;
      }
    } catch (error) {
      console.error('Error loading search history:', error);
      this.searchHistory = [];
    }
  }

  /**
   * Save search history to extension storage
   */
  private saveSearchHistory(): void {
    try {
      this.context.globalState.update(this.HISTORY_STORAGE_KEY, this.searchHistory);
    } catch (error) {
      console.error('Error saving search history:', error);
    }
  }
}
