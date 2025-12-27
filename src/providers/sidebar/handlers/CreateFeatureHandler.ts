import * as vscode from 'vscode';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { WorktreeService } from '../../../services/WorktreeService';
import { GitService } from '../../../services/GitService';
import { MessageService } from '../../../services/MessageService';
import { ITerminalProvider } from '../../../terminals/ITerminalProvider';
import { getAbsoluteMetaPath, META_FILES } from '../../../utils/featureMetaPaths';

interface CreateFeatureMessage {
  command: 'createFeature';
  name: string;
}

export class CreateFeatureHandler extends MessageHandler<CreateFeatureMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly worktreeService: WorktreeService,
    private readonly gitService: GitService,
    private readonly commitMessagePrefix: string,
    private readonly terminalProvider: ITerminalProvider,
    private readonly onFeatureCreated: (featureName: string) => Promise<void>
  ) {
    super(featureService, messageService);
  }

  async handle(message: CreateFeatureMessage): Promise<void> {
    const name = message.name;
    if (!name) {
      vscode.window.showErrorMessage('Feature name is required');
      return;
    }

    try {
      const feature = await this.featureService.createFeature(
        name,
        this.worktreeService,
        this.gitService,
        this.commitMessagePrefix
      );

      // Show success message in message panel
      this.messageService.addMessage(
        feature.worktreePath,
        name,
        `Feature "${name}" created. Edit prompt.md to describe your feature.`,
        'success',
        { dismissible: true }
      );

      // Notify parent about the new feature (for selection update)
      await this.onFeatureCreated(name);

      // Open the prompt.md file for editing
      const promptPath = getAbsoluteMetaPath(feature.worktreePath, name, META_FILES.PROMPT);
      const promptUri = vscode.Uri.file(promptPath);
      await vscode.window.showTextDocument(promptUri);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Note: Can't add to message panel here since feature may not exist yet
      vscode.window.showErrorMessage(`Failed to create feature: ${errorMessage}`);
    }
  }
}
