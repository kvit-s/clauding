import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { WorktreeService } from '../../../services/WorktreeService';
import { GitService } from '../../../services/GitService';
import { TimelogService } from '../../../services/TimelogService';
import { MessageService } from '../../../services/MessageService';

interface DeleteFeatureMessage {
  command: 'deleteFeature';
  featureName: string;
}

export class DeleteFeatureHandler extends MessageHandler<DeleteFeatureMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly worktreeService: WorktreeService,
    private readonly gitService: GitService,
    private readonly timelogService: TimelogService,
    private readonly commitMessagePrefix: string,
    private readonly onFeatureDeleted: (featureName: string) => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: DeleteFeatureMessage): Promise<void> {
    const { featureName } = message;

    try {
      const { deleteFeatureCommand } = await import('../../../commands/deleteFeatureCommand');

      await deleteFeatureCommand(
        featureName,
        this.featureService,
        this.worktreeService,
        this.gitService,
        this.timelogService,
        this.commitMessagePrefix
      );

      // Notify parent about deletion
      this.onFeatureDeleted(featureName);
    } catch (error) {
      this.handleError(error, 'Failed to delete feature');
    }
  }
}
