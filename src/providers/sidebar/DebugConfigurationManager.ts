import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Manages debug configuration parsing and variable replacement
 */
export class DebugConfigurationManager {
  /**
   * Read and parse launch.json from workspace
   * @param workspaceFolder The workspace folder
   * @returns The parsed launch configuration or null if not found
   */
  readLaunchJson(workspaceFolder: vscode.WorkspaceFolder): { configurations: vscode.DebugConfiguration[] } | null {
    const launchJsonPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'launch.json');
    if (!fs.existsSync(launchJsonPath)) {
      return null;
    }

    try {
      // Parse launch.json
      const launchJsonContent = fs.readFileSync(launchJsonPath, 'utf-8');
      // Remove comments from JSON (VS Code allows comments in launch.json)
      const cleanedContent = launchJsonContent
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      return JSON.parse(cleanedContent);
    } catch (error) {
      console.error('Failed to parse launch.json:', error);
      return null;
    }
  }

  /**
   * Create a debug configuration for a feature's worktree
   * @param baseConfig The base configuration from launch.json
   * @param featureName The feature name
   * @param worktreePath The worktree path
   * @returns The debug configuration for the feature
   */
  createWorktreeConfig(
    baseConfig: vscode.DebugConfiguration,
    featureName: string,
    worktreePath: string
  ): vscode.DebugConfiguration {
    // Create a dynamic debug configuration rooted in the feature's worktree
    const worktreeConfig: vscode.DebugConfiguration = {
      ...baseConfig,
      name: `${baseConfig.name} (${featureName})`,
      type: baseConfig.type || 'extensionHost',
      request: baseConfig.request || 'launch'
    };

    // Replace workspace folder variables with the actual worktree path
    const replaceVariables = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return value
          .replace(/\$\{workspaceFolder\}/g, worktreePath)
          .replace(/\$\{input:selectWorktree\}/g, featureName);
      } else if (Array.isArray(value)) {
        return value.map(replaceVariables);
      } else if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const key in value) {
          result[key] = replaceVariables((value as Record<string, unknown>)[key]);
        }
        return result;
      }
      return value;
    };

    // Apply variable replacement to all config properties
    for (const key in baseConfig) {
      if (key !== 'name' && key !== 'type' && key !== 'request') {
        worktreeConfig[key] = replaceVariables(baseConfig[key]);
      }
    }

    return worktreeConfig;
  }

  /**
   * Start a debug session for a feature
   * @param featureName The feature name
   * @param worktreePath The worktree path
   * @param config The debug configuration
   * @returns True if the debug session started successfully
   */
  async startDebugSession(
    featureName: string,
    worktreePath: string,
    config: vscode.DebugConfiguration
  ): Promise<boolean> {
    // Create a WorkspaceFolder for the feature's worktree
    const worktreeFolder: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(worktreePath),
      name: featureName,
      index: 1
    };

    // Start debugging with the worktree-specific configuration
    return vscode.debug.startDebugging(worktreeFolder, config);
  }
}
