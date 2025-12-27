import * as vscode from 'vscode';
import * as path from 'path';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';

interface OpenCommitDiffMessage {
  command: 'openCommitDiff';
  featureName: string;
  commitHash: string;
}

export class OpenCommitDiffHandler extends MessageHandler<OpenCommitDiffMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly onWebviewUpdate: () => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: OpenCommitDiffMessage): Promise<void> {
    const { featureName, commitHash } = message;

    const feature = this.getFeatureOrShowError(featureName, true);
    if (!feature) {
      return;
    }

    const isArchivedFeature = feature.lifecycleStatus === 'legacy';

    // Get the git extension
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (!gitExtension) {
      this.addMessageToPanel(
        featureName,
        'Git extension not found',
        'error'
      );
      this.onWebviewUpdate();
      return;
    }

    const api = gitExtension.getAPI(1);

    // For archived features, use the project root repository (commits are preserved there)
    // For active features, use the worktree repository
    const repoPath = isArchivedFeature
      ? path.resolve(feature.worktreePath, '../../..')  // Go up to project root
      : feature.worktreePath;

    // Find the repository for this worktree
    const repository = api.repositories.find((repo: { rootUri: vscode.Uri }) =>
      repo.rootUri.fsPath === repoPath
    );

    if (!repository) {
      this.addMessageToPanel(
        featureName,
        `Git repository not found for this feature (looking for: ${repoPath})`,
        'error'
      );
      this.onWebviewUpdate();
      return;
    }

    // For archived features, commits are preserved in the main repo, so use the actual hash
    // For active features, use the commit hash as-is
    console.log(`Opening commit: ${commitHash} (archived: ${isArchivedFeature})`);

    // Open the commit using the repository context
    await vscode.commands.executeCommand('git.viewCommit', repository, commitHash);
  }
}
