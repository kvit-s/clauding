import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Helper class for creating and managing test Git repositories
 */
export class GitTestHelper {
	/**
	 * Creates a new Git repository at the specified path
	 * @param repoPath Path where the repository should be created
	 */
	static async createTestRepo(repoPath: string): Promise<void> {
		// Create directory if it doesn't exist
		if (!fs.existsSync(repoPath)) {
			fs.mkdirSync(repoPath, { recursive: true });
		}

		// Initialize git repo
		execSync('git init', { cwd: repoPath, stdio: 'ignore' });

		// Configure git user for the test repo
		execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'ignore' });
		execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'ignore' });

		// Create initial commit
		const readmePath = path.join(repoPath, 'README.md');
		fs.writeFileSync(readmePath, '# Test Repository\n');
		execSync('git add README.md', { cwd: repoPath, stdio: 'ignore' });
		execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'ignore' });
	}

	/**
	 * Adds a file and creates a commit in the repository
	 * @param repoPath Path to the repository
	 * @param fileName Name of the file to create
	 * @param content Content of the file
	 * @param message Commit message
	 */
	static async addCommit(
		repoPath: string,
		fileName: string,
		content: string,
		message: string
	): Promise<void> {
		const filePath = path.join(repoPath, fileName);

		// Ensure directory exists
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		// Write file
		fs.writeFileSync(filePath, content);

		// Add and commit
		execSync(`git add "${fileName}"`, { cwd: repoPath, stdio: 'ignore' });
		execSync(`git commit -m "${message}"`, { cwd: repoPath, stdio: 'ignore' });
	}

	/**
	 * Creates and checks out a new branch
	 * @param repoPath Path to the repository
	 * @param branchName Name of the branch to create
	 */
	static async createBranch(repoPath: string, branchName: string): Promise<void> {
		execSync(`git checkout -b "${branchName}"`, { cwd: repoPath, stdio: 'ignore' });
	}

	/**
	 * Checks out an existing branch
	 * @param repoPath Path to the repository
	 * @param branchName Name of the branch to checkout
	 */
	static async checkoutBranch(repoPath: string, branchName: string): Promise<void> {
		execSync(`git checkout "${branchName}"`, { cwd: repoPath, stdio: 'ignore' });
	}

	/**
	 * Creates a merge conflict scenario
	 * @param repoPath Path to the repository
	 * @param fileName File to create conflict in
	 * @returns The name of the feature branch
	 */
	static async createMergeConflict(repoPath: string, fileName: string): Promise<string> {
		// Create and commit on main
		await this.addCommit(repoPath, fileName, 'content from main\n', 'Add file on main');

		// Create feature branch
		const featureBranch = 'feature/conflict-test';
		await this.createBranch(repoPath, featureBranch);
		await this.addCommit(repoPath, fileName, 'content from feature\n', 'Modify file on feature');

		// Go back to main and modify the same file
		await this.checkoutBranch(repoPath, 'main');
		await this.addCommit(repoPath, fileName, 'different content from main\n', 'Modify file on main again');

		return featureBranch;
	}

	/**
	 * Gets the current branch name
	 * @param repoPath Path to the repository
	 * @returns Current branch name
	 */
	static getCurrentBranch(repoPath: string): string {
		return execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath })
			.toString()
			.trim();
	}

	/**
	 * Gets the commit count
	 * @param repoPath Path to the repository
	 * @returns Number of commits
	 */
	static getCommitCount(repoPath: string): number {
		const output = execSync('git rev-list --count HEAD', { cwd: repoPath })
			.toString()
			.trim();
		return parseInt(output, 10);
	}

	/**
	 * Checks if the working directory is clean
	 * @param repoPath Path to the repository
	 * @returns True if working directory is clean
	 */
	static isWorkingDirectoryClean(repoPath: string): boolean {
		const output = execSync('git status --porcelain', { cwd: repoPath })
			.toString()
			.trim();
		return output === '';
	}

	/**
	 * Creates a tag at the current commit
	 * @param repoPath Path to the repository
	 * @param tagName Name of the tag
	 */
	static createTag(repoPath: string, tagName: string): void {
		execSync(`git tag "${tagName}"`, { cwd: repoPath, stdio: 'ignore' });
	}

	/**
	 * Gets the list of all branches
	 * @param repoPath Path to the repository
	 * @returns Array of branch names
	 */
	static getBranches(repoPath: string): string[] {
		const output = execSync('git branch --format="%(refname:short)"', { cwd: repoPath })
			.toString()
			.trim();
		return output.split('\n').filter(b => b.length > 0);
	}
}
