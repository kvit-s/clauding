import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { WorktreeService } from '../../../services/WorktreeService';
import { GitService } from '../../../services/GitService';
import { MessageService } from '../../../services/MessageService';

interface RenameFeatureMessage {
  command: 'renameFeature';
  featureName: string;
  newFeatureName: string;
}

export class RenameFeatureHandler extends MessageHandler<RenameFeatureMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly worktreeService: WorktreeService,
    private readonly gitService: GitService,
    private readonly onFeatureRenamed: (oldName: string, newName: string) => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: RenameFeatureMessage): Promise<void> {
    const { featureName, newFeatureName } = message;

    try {
      const { renameFeatureCommand } = await import('../../../commands/renameFeatureCommand');

      await renameFeatureCommand(
        featureName,
        newFeatureName,
        this.featureService,
        this.worktreeService,
        this.gitService
      );

      // Notify parent about rename
      this.onFeatureRenamed(featureName, newFeatureName);
    } catch (error) {
      this.handleError(error, 'Failed to rename feature');
    }
  }
}
