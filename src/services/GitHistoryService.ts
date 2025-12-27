import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface MergeCommitInfo {
    commitHash: string;
    featureName: string;
    branchName: string;
    mergeDate: Date;
    metadataCommitHash?: string; // Commit before cleanup
}

export interface FeatureMetadata {
    featureName: string;
    prompt: string;
    plan?: string;
    classification?: unknown;
    timelog?: unknown;
    status?: unknown;
    commitHash: string; // Where this metadata was retrieved from
}

/**
 * Service for reading feature metadata from git history
 */
export class GitHistoryService {
    /**
     * Find all merge commits with pattern: "Merge feature/{feature-name}" or "Merge branch 'feature/{feature-name}'"
     */
    public async findMergeCommits(
        projectRoot: string
    ): Promise<MergeCommitInfo[]> {
        try {
            // Find merge commits that mention "feature/" in the commit message
            const { stdout } = await execAsync(
                'git log --merges --format="%H|%s|%aI" --grep="feature/"',
                { cwd: projectRoot }
            );

            if (!stdout.trim()) {
                return [];
            }

            const lines = stdout.trim().split('\n');
            const mergeCommits: MergeCommitInfo[] = [];

            for (const line of lines) {
                const [commitHash, message, dateStr] = line.split('|');

                // Extract feature name from merge message
                // Handles both "Merge feature/{name}" and "Merge branch 'feature/{name}'"
                const match = message.match(/feature\/([^\s':]+)/);
                if (!match) {
                    continue;
                }

                const featureName = match[1];
                const branchName = `feature/${featureName}`;

                mergeCommits.push({
                    commitHash,
                    featureName,
                    branchName,
                    mergeDate: new Date(dateStr)
                });
            }

            return mergeCommits;
        } catch (error) {
            console.error('Error finding merge commits:', error);
            return [];
        }
    }

    /**
     * Find the commit with metadata (handles both old and new structure)
     * OLD: .clauding/features/{feature-name}/ (before migration)
     * NEW: .clauding/ (after migration, with pre-merge cleanup)
     */
    public async findMetadataCommit(
        projectRoot: string,
        mergeCommitHash: string,
        featureName: string
    ): Promise<string | null> {
        try {
            // 1. Get merge commit parents
            // Merge commits have 2 parents: parent 1 is main branch, parent 2 is feature branch
            const featureBranchParent = await this.getMergeParent(projectRoot, mergeCommitHash, 2);
            if (!featureBranchParent) {
                return null;
            }

            // 2. Check if this commit is a cleanup commit
            const commitMessage = await this.getCommitMessage(projectRoot, featureBranchParent);

            if (commitMessage.includes('pre-merge-cleanup')) {
                // This is the cleanup commit, metadata is in the commit before it
                const metadataCommit = await this.getParentCommit(projectRoot, featureBranchParent);
                return metadataCommit;
            }

            // 3. If no cleanup commit found, check the feature branch parent directly for metadata
            // Try new location: .clauding/prompt.md
            // Try old location: .clauding/features/{feature-name}/prompt.md
            const hasNewStructure = await this.fileExistsInCommit(
                projectRoot,
                featureBranchParent,
                '.clauding/prompt.md'
            );

            const hasOldStructure = await this.fileExistsInCommit(
                projectRoot,
                featureBranchParent,
                `.clauding/features/${featureName}/prompt.md`
            );

            if (hasNewStructure || hasOldStructure) {
                return featureBranchParent;
            }

            return null;
        } catch (error) {
            console.error(`Error finding metadata commit for ${featureName}:`, error);
            return null;
        }
    }

    /**
     * Read feature metadata from specific commit (supports both old and new structure)
     */
    public async readMetadataFromCommit(
        projectRoot: string,
        commitHash: string,
        featureName: string
    ): Promise<FeatureMetadata> {
        // Try new structure first: .clauding/prompt.md
        let prompt = await this.readFileFromCommit(
            projectRoot,
            commitHash,
            '.clauding/prompt.md'
        );

        // If not found, try old structure: .clauding/features/{feature-name}/prompt.md
        if (!prompt) {
            prompt = await this.readFileFromCommit(
                projectRoot,
                commitHash,
                `.clauding/features/${featureName}/prompt.md`
            );
        }

        // Try new structure for plan
        let plan = await this.readFileFromCommit(
            projectRoot,
            commitHash,
            '.clauding/plan.md'
        );

        // Fall back to old structure
        if (!plan) {
            plan = await this.readFileFromCommit(
                projectRoot,
                commitHash,
                `.clauding/features/${featureName}/plan.md`
            );
        }

        // Try new structure for classification
        let classificationStr = await this.readFileFromCommit(
            projectRoot,
            commitHash,
            '.clauding/classification.json'
        );

        // Fall back to old structure
        if (!classificationStr) {
            classificationStr = await this.readFileFromCommit(
                projectRoot,
                commitHash,
                `.clauding/features/${featureName}/classification.json`
            );
        }

        let classification: unknown = undefined;
        if (classificationStr) {
            try {
                classification = JSON.parse(classificationStr);
            } catch {
                // Ignore parse errors
            }
        }

        // Try new structure for timelog
        let timelogStr = await this.readFileFromCommit(
            projectRoot,
            commitHash,
            '.clauding/timelog.json'
        );

        // Fall back to old structure
        if (!timelogStr) {
            timelogStr = await this.readFileFromCommit(
                projectRoot,
                commitHash,
                `.clauding/features/${featureName}/timelog.json`
            );
        }

        let timelog: unknown = undefined;
        if (timelogStr) {
            try {
                timelog = JSON.parse(timelogStr);
            } catch {
                // Ignore parse errors
            }
        }

        // Try new structure for status
        let statusStr = await this.readFileFromCommit(
            projectRoot,
            commitHash,
            '.clauding/status.json'
        );

        // Fall back to old structure
        if (!statusStr) {
            statusStr = await this.readFileFromCommit(
                projectRoot,
                commitHash,
                `.clauding/features/${featureName}/status.json`
            );
        }

        let status: unknown = undefined;
        if (statusStr) {
            try {
                status = JSON.parse(statusStr);
            } catch {
                // Ignore parse errors
            }
        }

        return {
            featureName,
            prompt: prompt || '',
            plan: plan || undefined,
            classification,
            timelog,
            status,
            commitHash
        };
    }

    /**
     * Read a file from a specific commit
     */
    public async readFileFromCommit(
        projectRoot: string,
        commitHash: string,
        filePath: string
    ): Promise<string | null> {
        try {
            const { stdout } = await execAsync(
                `git show ${commitHash}:${filePath}`,
                {
                    cwd: projectRoot,
                    maxBuffer: 200 * 1024 * 1024 // 200MB buffer for large output files
                }
            );
            return stdout;
        } catch {
            // File doesn't exist in this commit
            return null;
        }
    }

    /**
     * Get the commit hash when a file was first added in history
     * (searching backwards from a specific commit)
     * @param projectRoot Path to the git repository
     * @param commitHash The commit to search backwards from
     * @param filePath Path to the file relative to repository root
     * @returns Short commit hash when file was created, or null if not found
     */
    public async getFileCreationCommitInHistory(
        projectRoot: string,
        commitHash: string,
        filePath: string
    ): Promise<string | null> {
        try {
            // Find when this file was added, searching backwards from commitHash
            const { stdout } = await execAsync(
                `git log --diff-filter=A --format=%h --follow ${commitHash} -- "${filePath}" | tail -1`,
                { cwd: projectRoot }
            );
            return stdout.trim() || null;
        } catch {
            return null;
        }
    }

    /**
     * Check if a file exists in a specific commit
     */
    private async fileExistsInCommit(
        projectRoot: string,
        commitHash: string,
        filePath: string
    ): Promise<boolean> {
        try {
            await execAsync(
                `git cat-file -e ${commitHash}:${filePath}`,
                { cwd: projectRoot }
            );
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get a specific parent of a merge commit
     * @param parentNumber 1 for first parent (main), 2 for second parent (feature)
     */
    private async getMergeParent(
        projectRoot: string,
        commitHash: string,
        parentNumber: number
    ): Promise<string | null> {
        try {
            const { stdout } = await execAsync(
                `git rev-parse ${commitHash}^${parentNumber}`,
                { cwd: projectRoot }
            );
            return stdout.trim();
        } catch {
            return null;
        }
    }

    /**
     * Get the commit message for a specific commit
     */
    private async getCommitMessage(
        projectRoot: string,
        commitHash: string
    ): Promise<string> {
        try {
            const { stdout } = await execAsync(
                `git log -1 --format=%s ${commitHash}`,
                { cwd: projectRoot }
            );
            return stdout.trim();
        } catch {
            return '';
        }
    }

    /**
     * Get the parent commit (first parent for regular commits)
     */
    private async getParentCommit(
        projectRoot: string,
        commitHash: string
    ): Promise<string | null> {
        try {
            const { stdout } = await execAsync(
                `git rev-parse ${commitHash}^`,
                { cwd: projectRoot }
            );
            return stdout.trim();
        } catch {
            return null;
        }
    }

    /**
     * List files and directories at a specific path in a commit
     * @param projectRoot The project root directory
     * @param commitHash The commit hash to read from
     * @param dirPath The directory path within the commit (empty string for root)
     * @returns Array of file/directory names at the specified path
     */
    public async listFilesInCommit(
        projectRoot: string,
        commitHash: string,
        dirPath: string
    ): Promise<Array<{ name: string; type: 'file' | 'directory' }>> {
        try {
            // Use git ls-tree to list contents of a directory at a commit
            // -z for null-terminated output (handles special characters)
            // --name-only to get just names
            const treePath = dirPath ? `${commitHash}:${dirPath}` : `${commitHash}:`;
            const { stdout } = await execAsync(
                `git ls-tree -z ${treePath}`,
                {
                    cwd: projectRoot,
                    maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large directories
                }
            );

            if (!stdout.trim()) {
                return [];
            }

            // Parse output: each entry is null-terminated and has format:
            // <mode> SP <type> SP <hash> TAB <name>
            const entries = stdout.split('\0').filter(e => e.trim());
            const results: Array<{ name: string; type: 'file' | 'directory' }> = [];

            for (const entry of entries) {
                // Parse the entry format
                const match = entry.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
                if (!match) {
                    continue;
                }

                const [, , gitType, , name] = match;
                const type = gitType === 'tree' ? 'directory' : 'file';

                results.push({ name, type });
            }

            return results;
        } catch {
            // Directory doesn't exist in commit or other error
            return [];
        }
    }

    /**
     * Check if a path is a file or directory in a commit
     * @param projectRoot The project root directory
     * @param commitHash The commit hash to read from
     * @param filePath The file path to check
     * @returns 'file', 'directory', or null if not found
     */
    public async getFileTypeInCommit(
        projectRoot: string,
        commitHash: string,
        filePath: string
    ): Promise<'file' | 'directory' | null> {
        try {
            // Use git cat-file to check the type
            const { stdout } = await execAsync(
                `git cat-file -t ${commitHash}:${filePath}`,
                { cwd: projectRoot }
            );

            const type = stdout.trim();
            if (type === 'blob') {
                return 'file';
            } else if (type === 'tree') {
                return 'directory';
            }
            return null;
        } catch {
            return null;
        }
    }
}
