import * as path from 'path';
import * as fs from 'fs';

/**
 * Utility functions for managing feature-specific meta file paths
 *
 * Directory Structure:
 * - Worktree .clauding/: prompt.md, plan.md, modify-prompt.md (committed with feature)
 * - Features folder: All other metadata (never committed)
 *   {projectRoot}/.clauding/features/{feature-name}/
 */

/**
 * Get the project root directory from a worktree path or project root
 * @param worktreePath Absolute path to the feature worktree OR the project root itself
 * @returns Absolute path to project root
 */
export function getProjectRoot(worktreePath: string): string {
    // Check if input is already the project root (doesn't contain worktrees path)
    if (!worktreePath.includes('/.clauding/worktrees/')) {
        // Already project root - return as-is
        return worktreePath;
    }

    // Worktree path format: {projectRoot}/.clauding/worktrees/{feature-name}
    // Go up 3 levels to get to project root
    return path.resolve(worktreePath, '../../..');
}

/**
 * Get the features directory path
 * @param projectRoot Absolute path to project root
 * @returns Absolute path to features directory
 */
export function getFeaturesDir(projectRoot: string): string {
    return path.join(projectRoot, '.clauding', 'features');
}

/**
 * Get the feature-specific folder in the features directory
 * @param projectRoot Absolute path to project root
 * @param featureName The name of the feature
 * @returns Absolute path to feature folder
 */
export function getFeatureFolder(projectRoot: string, featureName: string): string {
    return path.join(getFeaturesDir(projectRoot), featureName);
}

// ===== WORKTREE META PATHS (for .md files that get committed) =====

/**
 * Get the worktree meta directory (relative to worktree root)
 * @returns Relative path: .clauding
 */
export function getWorktreeMetaDir(): string {
    return '.clauding';
}

/**
 * Get the path to a worktree meta file (relative to worktree root)
 * Used for: prompt.md, plan.md, modify-prompt.md
 * @param filename The meta file name
 * @returns Relative path: .clauding/{filename}
 */
export function getWorktreeMetaPath(filename: string): string {
    return path.join('.clauding', filename);
}

/**
 * Get the absolute path to a worktree meta file
 * @param worktreePath The absolute path to the feature worktree
 * @param filename The meta file name
 * @returns Absolute path
 */
export function getAbsoluteWorktreeMetaPath(worktreePath: string, filename: string): string {
    return path.join(worktreePath, getWorktreeMetaPath(filename));
}

// ===== FEATURES FOLDER PATHS (for metadata that never gets committed) =====

/**
 * Get the path to a features folder meta file
 * Used for: messages.json, status.json, timelog.json, classification.json,
 *           pending-command.json, wrap-up.json
 * @param projectRoot Absolute path to project root
 * @param featureName The name of the feature
 * @param filename The meta file name
 * @returns Absolute path
 */
export function getFeaturesMetaPath(projectRoot: string, featureName: string, filename: string): string {
    return path.join(getFeatureFolder(projectRoot, featureName), filename);
}

/**
 * Get the outputs directory path in the features folder
 * @param projectRoot Absolute path to project root
 * @param featureName The name of the feature
 * @returns Absolute path to outputs directory
 */
export function getFeaturesOutputsDir(projectRoot: string, featureName: string): string {
    return path.join(getFeatureFolder(projectRoot, featureName), 'outputs');
}

/**
 * Get the path to a specific output file in the features folder
 * @param projectRoot Absolute path to project root
 * @param featureName The name of the feature
 * @param outputFilename The output file name
 * @returns Absolute path to output file
 */
export function getFeaturesOutputPath(projectRoot: string, featureName: string, outputFilename: string): string {
    return path.join(getFeaturesOutputsDir(projectRoot, featureName), outputFilename);
}

// ===== LEGACY COMPATIBILITY FUNCTIONS =====
// These maintain backward compatibility but delegate to new functions

/**
 * @deprecated Use getWorktreeMetaDir() or getFeaturesMetaPath() depending on file type
 */
export function getFeatureMetaDir(_featureName: string): string {
    return getWorktreeMetaDir();
}

/**
 * @deprecated Use getWorktreeMetaPath() or getFeaturesMetaPath() depending on file type
 */
export function getFeatureMetaPath(_featureName: string, filename: string): string {
    return getWorktreeMetaPath(filename);
}

/**
 * @deprecated Use getFeaturesOutputsDir() instead
 */
export function getFeatureOutputsDir(_featureName: string): string {
    // This returns relative path for backward compatibility
    // Callers should migrate to getFeaturesOutputsDir() which returns absolute path
    return path.join('.clauding', 'outputs');
}

/**
 * @deprecated Use getFeaturesOutputPath() instead
 */
export function getFeatureOutputPath(featureName: string, outputFilename: string): string {
    return path.join(getFeatureOutputsDir(featureName), outputFilename);
}

/**
 * @deprecated Use getAbsoluteWorktreeMetaPath() or getFeaturesMetaPath() depending on file type
 */
export function getAbsoluteMetaPath(worktreePath: string, featureName: string, filename: string): string {
    // For backward compatibility, check if it's a worktree file
    if (isWorktreeMetaFile(filename)) {
        return getAbsoluteWorktreeMetaPath(worktreePath, filename);
    }
    // Otherwise use features folder
    const projectRoot = getProjectRoot(worktreePath);
    return getFeaturesMetaPath(projectRoot, featureName, filename);
}

/**
 * @deprecated Use getFeaturesOutputsDir() instead
 */
export function getAbsoluteOutputsDir(worktreePath: string, featureName: string): string {
    const projectRoot = getProjectRoot(worktreePath);
    return getFeaturesOutputsDir(projectRoot, featureName);
}

/**
 * @deprecated Use getFeaturesOutputPath() instead
 */
export function getAbsoluteOutputPath(worktreePath: string, featureName: string, outputFilename: string): string {
    const projectRoot = getProjectRoot(worktreePath);
    return getFeaturesOutputPath(projectRoot, featureName, outputFilename);
}

// ===== DIRECTORY CREATION =====

/**
 * Ensure the worktree meta directory structure exists
 * Creates .clauding/ in the worktree
 * @param worktreePath The absolute path to the feature worktree
 */
export function ensureWorktreeMetaDirExists(worktreePath: string): void {
    const metaDir = path.join(worktreePath, '.clauding');

    try {
        if (!fs.existsSync(metaDir)) {
            fs.mkdirSync(metaDir, { recursive: true });
        }
    } catch (error) {
        console.error('Failed to create worktree meta directory:', error);
        // Don't throw - handle gracefully
    }
}

/**
 * Ensure the features folder structure exists
 * Creates {projectRoot}/.clauding/features/{feature-name}/ and outputs subdirectory
 * @param projectRoot The absolute path to the project root
 * @param featureName The name of the feature
 */
export function ensureFeaturesFolderExists(projectRoot: string, featureName: string): void {
    const featureFolder = getFeatureFolder(projectRoot, featureName);
    const outputsDir = getFeaturesOutputsDir(projectRoot, featureName);

    try {
        if (!fs.existsSync(featureFolder)) {
            fs.mkdirSync(featureFolder, { recursive: true });
        }

        if (!fs.existsSync(outputsDir)) {
            fs.mkdirSync(outputsDir, { recursive: true });
        }
    } catch (error) {
        console.error('Failed to create features folder:', error);
        // Don't throw - handle gracefully
    }
}

/**
 * @deprecated Use ensureWorktreeMetaDirExists() and ensureFeaturesFolderExists() instead
 */
export function ensureFeatureMetaDirExists(worktreePath: string, featureName: string): void {
    ensureWorktreeMetaDirExists(worktreePath);
    const projectRoot = getProjectRoot(worktreePath);
    ensureFeaturesFolderExists(projectRoot, featureName);
}

/**
 * @deprecated Feature name marker files are no longer used
 */
export function getFeatureNameFilePath(featureName: string): string {
    return path.join('.clauding', `${featureName}.name`);
}

// ===== HELPER FUNCTIONS =====

/**
 * Check if a filename should be stored in the worktree .clauding/ directory
 * @param filename The meta file name
 * @returns True if file belongs in worktree
 */
export function isWorktreeMetaFile(filename: string): boolean {
    const worktreeFiles = [
        META_FILES.PROMPT,
        META_FILES.PLAN,
        META_FILES.MODIFY_PROMPT
    ];
    return (worktreeFiles as readonly string[]).includes(filename);
}

/**
 * Check if a filename should be stored in the features folder
 * @param filename The meta file name
 * @returns True if file belongs in features folder
 */
export function isFeaturesMetaFile(filename: string): boolean {
    const featuresFiles = [
        META_FILES.MESSAGES,
        META_FILES.STATUS,
        META_FILES.TIMELOG,
        META_FILES.CLASSIFICATION,
        META_FILES.PENDING_COMMAND,
        META_FILES.WRAP_UP
    ];
    return (featuresFiles as readonly string[]).includes(filename);
}

/**
 * Common meta file names
 */
/* eslint-disable @typescript-eslint/naming-convention */
export const META_FILES = {
    // Worktree files (committed)
    PROMPT: 'prompt.md',
    PLAN: 'plan.md',
    MODIFY_PROMPT: 'modify-prompt.md',

    // Features folder files (never committed)
    MESSAGES: 'messages.json',
    STATUS: 'status.json',
    TIMELOG: 'timelog.json',
    CLASSIFICATION: 'classification.json',
    PENDING_COMMAND: 'pending-command.json',
    WRAP_UP: 'wrap-up.json'
} as const;
/* eslint-enable @typescript-eslint/naming-convention */
