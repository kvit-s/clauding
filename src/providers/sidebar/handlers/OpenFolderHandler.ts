import * as vscode from 'vscode';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';

interface OpenFolderMessage {
  command: 'openfolder';
  featureName: string;
}

export class OpenFolderHandler extends MessageHandler<OpenFolderMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly onWebviewUpdate: () => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: OpenFolderMessage): Promise<void> {
    const { featureName } = message;

    try {
      const feature = this.getFeatureOrShowError(featureName, true);
      if (!feature) {
        return;
      }

      const uri = vscode.Uri.file(feature.worktreePath);

      // Reveal in VS Code Explorer
      await vscode.commands.executeCommand('revealInExplorer', uri);

      this.addMessageToPanel(
        featureName,
        'Worktree folder revealed in Explorer',
        'success'
      );
      this.onWebviewUpdate();
    } catch (error) {
      this.handleError(error, 'Failed to open folder', featureName);
      this.onWebviewUpdate();
    }
  }
}
