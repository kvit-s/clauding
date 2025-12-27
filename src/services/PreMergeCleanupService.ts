import * as fs from 'fs';
import * as path from 'path';
import { GitService } from './GitService';
import { getProjectRoot, getFeaturesMetaPath, META_FILES, ensureFeaturesFolderExists } from '../utils/featureMetaPaths';

/**
 * Service to handle cleaning up .clauding directory on feature branch before merge
 */
export class PreMergeCleanupService {
    /**
     * Check if cleanup has already been performed
     * @param worktreePath The absolute path to the feature worktree
     * @param featureName The name of the feature being merged
     * @returns true if all metadata files are already in the features folder and .clauding is cleaned
     */
    private isCleanupAlreadyDone(worktreePath: string, _featureName: string): boolean {
        const claudingDir = path.join(worktreePath, '.clauding');

        // Check if .clauding directory exists - if not, cleanup is done
        if (!fs.existsSync(claudingDir)) {
            return true;
        }

        // Check if any of the .md files still exist in .clauding directory
        const mdFiles = [META_FILES.PROMPT, META_FILES.PLAN, META_FILES.MODIFY_PROMPT];
        for (const mdFile of mdFiles) {
            const sourcePath = path.join(claudingDir, mdFile);
            if (fs.existsSync(sourcePath)) {
                // File still exists in .clauding, cleanup not done
                return false;
            }
        }

        // All files have been moved, cleanup is done
        return true;
    }

    /**
     * Moves .md files to features folder and cleans up .clauding directory before merge
     * This runs on feature branch, not main branch
     * @param worktreePath The absolute path to the feature worktree
     * @param featureName The name of the feature being merged
     * @param gitService Git service instance for committing changes
     * @returns commit hash of the cleanup commit, or empty string if cleanup already done
     */
    public async cleanupBeforeMerge(
        worktreePath: string,
        featureName: string,
        gitService: GitService
    ): Promise<string> {
        // Check if cleanup is already done (idempotency check)
        if (this.isCleanupAlreadyDone(worktreePath, featureName)) {
            // Return the current commit hash since no new commit was created
            const currentCommit = await gitService.getCurrentCommit(worktreePath);
            return currentCommit;
        }

        // This runs on feature branch before merge happens
        const claudingDir = path.join(worktreePath, '.clauding');

        // 1. Verify .clauding directory exists
        if (!fs.existsSync(claudingDir)) {
            throw new Error('No .clauding directory found to clean up');
        }

        // 2. Get project root and ensure features folder exists
        const projectRoot = getProjectRoot(worktreePath);
        ensureFeaturesFolderExists(projectRoot, featureName);

        // 3. Move .md files to features folder
        const mdFiles = [META_FILES.PROMPT, META_FILES.PLAN, META_FILES.MODIFY_PROMPT];
        const movedFiles: string[] = [];

        for (const mdFile of mdFiles) {
            const sourcePath = path.join(claudingDir, mdFile);
            if (fs.existsSync(sourcePath)) {
                const destPath = getFeaturesMetaPath(projectRoot, featureName, mdFile);
                await fs.promises.copyFile(sourcePath, destPath);
                movedFiles.push(mdFile);
            }
        }

        // 4. Remove all contents of .clauding/ (except config/)
        const entries = await fs.promises.readdir(claudingDir);
        for (const entry of entries) {
            if (entry === 'config') {
                continue; // Keep config directory
            }
            const entryPath = path.join(claudingDir, entry);
            await fs.promises.rm(entryPath, { recursive: true, force: true });
        }

        // 5. Commit cleanup on feature branch
        const commitMessage = `feat: pre-merge-cleanup - moved ${movedFiles.join(', ')} to features folder`;
        const commitHash = await gitService.stageAndCommit(worktreePath, commitMessage);

        return commitHash;
    }
}
