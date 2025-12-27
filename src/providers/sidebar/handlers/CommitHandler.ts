import * as vscode from 'vscode';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { GitService } from '../../../services/GitService';
import { TimelogService } from '../../../services/TimelogService';
import { MessageService } from '../../../services/MessageService';

interface CommitMessage {
  command: 'commit';
  featureName: string;
}

export class CommitHandler extends MessageHandler<CommitMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly gitService: GitService,
    private readonly timelogService: TimelogService,
    private readonly onWebviewUpdate: () => void,
    private readonly onFileTreeRefresh: (featureName: string) => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: CommitMessage): Promise<void> {
    const { featureName } = message;

    try {
      const feature = this.getFeatureOrShowError(featureName, true);
      if (!feature) {
        return;
      }

      // Check for changes
      const hasChanges = await this.gitService.hasUncommittedChanges(feature.worktreePath);
      if (!hasChanges) {
        this.addMessageToPanel(featureName, 'No changes to commit', 'info');
        this.onWebviewUpdate();
        return;
      }

      // Prompt for commit message
      const commitMessage = await vscode.window.showInputBox({
        prompt: 'Enter commit message',
        placeHolder: `feat: `,
        value: `feat: `,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Commit message cannot be empty';
          }
          return null;
        }
      });

      if (!commitMessage) {
        return; // User cancelled
      }

      let commitHash = await this.gitService.stageAndCommit(feature.worktreePath, commitMessage);

      // Add timelog entry
      await this.timelogService.addEntry(
        feature.worktreePath,
        featureName,
        'Commit',
        'Success',
        {
          message: commitMessage
        },
        commitHash
      );

      // Amend the commit to include timelog update
      try {
        commitHash = await this.gitService.stageAndAmend(feature.worktreePath);
      } catch (error) {
        // If amend fails, silently ignore (timelog might not have changed)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('No changes to commit')) {
          console.warn('Failed to amend commit with timelog update:', errorMessage);
        }
      }

      this.addMessageToPanel(
        featureName,
        `✓ Changes committed: ${commitHash}`,
        'success'
      );

      // Update UI
      this.onWebviewUpdate();

      // Refresh file tree to update git status markers
      this.onFileTreeRefresh(featureName);
    } catch (error) {
      this.handleError(error, 'Commit', featureName);
      this.onWebviewUpdate();
    }
  }
}
