import { GitService } from './GitService';
import { TimelogService } from './TimelogService';

export class AutoCommitService {
  private gitService: GitService;
  private timelogService: TimelogService;
  private commitMessagePrefix: string;

  constructor(
    gitService: GitService,
    timelogService: TimelogService,
    commitMessagePrefix: string
  ) {
    this.gitService = gitService;
    this.timelogService = timelogService;
    this.commitMessagePrefix = commitMessagePrefix;
  }

  /**
   * Auto-commit changes after an agent command
   */
  public async commitAfterAgent(
    worktreePath: string,
    featureName: string,
    commandName: string,
    outputFile: string,
    startCommitHash?: string,
    startTimestamp?: string
  ): Promise<string | null> {
    // Check if there are changes
    const hasChanges = await this.gitService.hasUncommittedChanges(worktreePath);
    if (!hasChanges) {
      return null; // No changes to commit
    }

    // Build commit message
    const description = this.getCommandDescription(commandName);
    const outputFileName = outputFile.split('/').pop();

    const message =
      `${this.commitMessagePrefix}: ${description}\n\n` +
      `Agent command: ${commandName}\n` +
      `Output: outputs/${outputFileName}`;

    // Stage all changes
    await this.gitService.stageAll(worktreePath);

    // Commit the changes
    let commitHash = await this.gitService.commit(worktreePath, message);

    // Add timelog entry with start timestamp and commit hash from before agent started
    await this.timelogService.addEntry(
      worktreePath,
      featureName,
      commandName,
      'Success',
      {
        commitHash: commitHash,
        outputFile: `outputs/${outputFileName}`
      },
      startCommitHash,
      startTimestamp
    );

    // Amend the commit to include timelog update
    try {
      commitHash = await this.gitService.stageAndAmend(worktreePath);
    } catch (error) {
      // If amend fails, fall back to second commit pattern
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('No changes to commit')) {
        console.warn('Failed to amend commit, falling back to second commit:', errorMessage);
        try {
          await this.gitService.stageAndCommit(
            worktreePath,
            `${this.commitMessagePrefix}(${featureName}): Update timelog`
          );
        } catch (secondError) {
          // Ignore "nothing to commit" error
          const secondErrorMessage = secondError instanceof Error ? secondError.message : String(secondError);
          if (!secondErrorMessage.includes('No changes to commit')) {
            throw secondError;
          }
        }
      }
    }

    return commitHash;
  }

  /**
   * Auto-commit changes after running tests
   */
  public async commitAfterTests(
    worktreePath: string,
    featureName: string,
    outputFile: string
  ): Promise<string | null> {
    // Check if there are changes
    const hasChanges = await this.gitService.hasUncommittedChanges(worktreePath);
    if (!hasChanges) {
      return null; // No changes to commit
    }

    // Build commit message
    const outputFileName = outputFile.split('/').pop();

    const message =
      `${this.commitMessagePrefix}: Run tests\n\n` +
      `Output: outputs/${outputFileName}`;

    // Commit the changes
    let commitHash = await this.gitService.stageAndCommit(worktreePath, message);

    // Add timelog entry AFTER commit with actual commit hash
    await this.timelogService.addEntry(
      worktreePath,
      featureName,
      'Run Tests',
      'Success',
      {
        outputFile: `outputs/${outputFileName}`
      },
      commitHash
    );

    // Amend the commit to include timelog update
    try {
      commitHash = await this.gitService.stageAndAmend(worktreePath);
    } catch (error) {
      // If amend fails, fall back to second commit pattern
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('No changes to commit')) {
        console.warn('Failed to amend commit, falling back to second commit:', errorMessage);
        try {
          await this.gitService.stageAndCommit(
            worktreePath,
            `${this.commitMessagePrefix}(${featureName}): Update timelog`
          );
        } catch (secondError) {
          // Ignore "nothing to commit" error
          const secondErrorMessage = secondError instanceof Error ? secondError.message : String(secondError);
          if (!secondErrorMessage.includes('No changes to commit')) {
            throw secondError;
          }
        }
      }
    }

    return commitHash;
  }

  /**
   * Get human-readable description for command
   */
  private getCommandDescription(commandName: string): string {
    const descriptions: Record<string, string> = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Create Plan': 'Create implementation plan',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Modify Plan': 'Modify implementation plan',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Implement Plan': 'Implement plan',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Fix All Tests': 'Fix failing tests',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Generic Agent': 'Agent session'
    };
    return descriptions[commandName] || commandName;
  }
}
