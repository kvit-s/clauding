import * as fs from 'fs';
import * as path from 'path';
import { FeatureService } from '../../services/FeatureService';
import { GitService } from '../../services/GitService';
import { getFeatureFolder } from '../../utils/featureMetaPaths';

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  gitStatus?: string;
  children?: FileTreeNode[];
}

/**
 * Builds file trees for feature metadata directories
 *
 * Directory Structure:
 * - Active features: Read from features folder + worktree .clauding/
 * - Archived features: Read only from features folder
 */
export class FileTreeBuilder {
  private readonly fsFn: typeof fs;

  constructor(
    private readonly featureService: FeatureService,
    private readonly gitService: GitService,
    private readonly projectRoot: string,
    fsOverride?: typeof fs
  ) {
    this.fsFn = fsOverride ?? fs;
  }

  /**
   * Build a file tree for a feature's metadata directory
   * @param featureName The feature name
   * @returns The file tree structure
   */
  async buildFileTree(featureName: string): Promise<FileTreeNode[]> {
    const feature = this.featureService.getFeature(featureName);
    if (!feature) {
      return [];
    }

    // Check if this is an archived feature (legacy lifecycle status)
    const isArchived = feature.lifecycleStatus === 'legacy';

    if (isArchived) {
      // Archived feature - read from features folder only
      return this.buildFileTreeFromFeaturesFolder(featureName);
    }

    // Active feature - read from worktree .clauding/ only
    return this.buildFileTreeForActiveFeature(feature.worktreePath, featureName);
  }

  /**
   * Build file tree for an active feature (only from worktree .clauding/)
   */
  private async buildFileTreeForActiveFeature(
    worktreePath: string,
    featureName: string
  ): Promise<FileTreeNode[]> {
    const tree: FileTreeNode[] = [];

    // Add files from worktree .clauding/ only
    const worktreeMetaPath = path.join(worktreePath, '.clauding');
    if (this.fsFn.existsSync(worktreeMetaPath)) {
      const worktreeFiles = await this.buildFileTreeRecursive(
        worktreeMetaPath,
        worktreePath,
        featureName,
        '',
        true // isWorktree
      );
      tree.push(...worktreeFiles);
    }

    return tree;
  }

  /**
   * Build file tree from features folder for archived feature
   */
  private async buildFileTreeFromFeaturesFolder(
    featureName: string
  ): Promise<FileTreeNode[]> {
    const featureFolder = getFeatureFolder(this.projectRoot, featureName);

    if (!this.fsFn.existsSync(featureFolder)) {
      return [];
    }

    return this.buildFileTreeRecursive(
      featureFolder,
      '', // No worktree for archived features
      featureName,
      '',
      false // isWorktree
    );
  }

  /**
   * Recursively build the file tree from filesystem
   */
  private async buildFileTreeRecursive(
    dirPath: string,
    worktreePath: string,
    featureName: string,
    relativePath: string = '',
    isWorktree: boolean = false
  ): Promise<FileTreeNode[]> {
    const items = this.fsFn.readdirSync(dirPath);
    const tree: FileTreeNode[] = [];

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const itemRelativePath = relativePath ? path.join(relativePath, item) : item;

      // Skip broken symlinks and other stat errors
      let stat;
      try {
        stat = this.fsFn.statSync(fullPath);
      } catch {
        // Skip items that can't be stat'd (broken symlinks, permission errors, etc.)
        continue;
      }

      if (stat.isDirectory()) {
        // Skip config directories
        if (item === 'config') {
          continue;
        }

        const children = await this.buildFileTreeRecursive(
          fullPath,
          worktreePath,
          featureName,
          itemRelativePath,
          isWorktree
        );
        tree.push({
          name: item,
          path: itemRelativePath,
          type: 'directory',
          children: children
        });
      } else {
        // Filter out JSON files unless they're in the outputs directory
        const isJsonFile = item.endsWith('.json');
        const pathParts = relativePath.split(path.sep);
        const isInOutputsDir = pathParts.length > 0 && pathParts[0] === 'outputs';

        if (isJsonFile && !isInOutputsDir) {
          continue; // Skip JSON files outside of outputs directory
        }

        // Skip .name files
        if (item.endsWith('.name')) {
          continue;
        }

        // Only get git status for worktree files
        let gitStatus: string | undefined;
        if (isWorktree && worktreePath) {
          gitStatus = await this.gitService.getFileStatus(
            worktreePath,
            path.join('.clauding', itemRelativePath)
          );
        }

        tree.push({
          name: item,
          path: itemRelativePath,
          type: 'file',
          gitStatus: gitStatus
        });
      }
    }

    // Sort: directories first, then files, both alphabetically
    tree.sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') {
        return -1;
      }
      if (a.type === 'file' && b.type === 'directory') {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

    return tree;
  }

}
