import * as vscode from 'vscode';
import * as path from 'path';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';

interface OpenFileAtCommitMessage {
  command: 'openFileAtCommit';
  featureName: string;
  filePath: string;
  commitHash: string;
}

export class OpenFileAtCommitHandler extends MessageHandler<OpenFileAtCommitMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly onWebviewUpdate: () => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: OpenFileAtCommitMessage): Promise<void> {
    const { featureName, filePath, commitHash } = message;

    console.log('handleOpenFileAtCommit received:', { featureName, filePath, commitHash });

    const feature = this.getFeatureOrShowError(featureName, true);
    if (!feature) {
      console.log('Feature not found:', featureName);
      return;
    }

    const isArchivedFeature = feature.lifecycleStatus === 'legacy';

    // For archived features, files are in .clauding/features/{name}/ but commits reference
    // the original path in .clauding/features/{name}/ (which was committed to git)
    // So we can use the git URI scheme with the archived path
    if (isArchivedFeature) {
      // If no commit hash, just open the current archived file
      if (!commitHash || commitHash === 'HEAD') {
        const archivedFilePath = path.join(feature.worktreePath, filePath);
        console.log('Opening current archived file:', { archivedFilePath });

        try {
          const document = await vscode.workspace.openTextDocument(archivedFilePath);
          await vscode.window.showTextDocument(document);
          console.log('Archived file opened successfully');
        } catch (error) {
          console.error('Error opening archived file:', error);
          this.addMessageToPanel(
            featureName,
            `Error opening archived file: ${error}`,
            'error'
          );
          this.onWebviewUpdate();
        }
        return;
      }

      // For archived features with commit hash, construct the git path
      // Files were committed to .clauding/features/{name}/{file}
      const projectRoot = path.resolve(feature.worktreePath, '../../..');
      const gitPath = path.join(projectRoot, '.clauding', 'features', featureName, filePath);

      console.log('Opening archived file from git:', { gitPath, commitHash });

      try {
        const gitUri = vscode.Uri.file(gitPath).with({
          scheme: 'git',
          query: JSON.stringify({ ref: commitHash, path: gitPath })
        });

        const document = await vscode.workspace.openTextDocument(gitUri);
        await vscode.window.showTextDocument(document);
        console.log('Archived file from git opened successfully');
      } catch (error) {
        console.error('Error opening archived file from git:', error);
        this.addMessageToPanel(
          featureName,
          `Error opening file from commit: ${error}`,
          'error'
        );
        this.onWebviewUpdate();
      }
      return;
    }

    // For active features, use the worktreePath
    const absolutePath = path.join(feature.worktreePath, filePath);
    console.log('Opening file at commit:', { absolutePath, commitHash });

    try {
      // If commitHash is 'HEAD' or not provided, just open the current file
      if (commitHash === 'HEAD' || !commitHash) {
        const document = await vscode.workspace.openTextDocument(absolutePath);
        await vscode.window.showTextDocument(document);
        console.log('File opened successfully (current version)');
      } else {
        // For historical commits, use git URI scheme
        const gitUri = vscode.Uri.file(absolutePath).with({
          scheme: 'git',
          query: JSON.stringify({ ref: commitHash, path: absolutePath })
        });

        const document = await vscode.workspace.openTextDocument(gitUri);
        await vscode.window.showTextDocument(document);
        console.log('File opened successfully (historical version)');
      }
    } catch (error) {
      console.error('Error opening file:', error);
      this.addMessageToPanel(
        featureName,
        `Error opening file: ${error}`,
        'error'
      );
      this.onWebviewUpdate();
    }
  }
}
