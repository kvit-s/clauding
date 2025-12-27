import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';

interface DismissMessageMessage {
  command: 'dismissMessage';
  featureName: string;
  messageId: string;
}

export class DismissMessageHandler extends MessageHandler<DismissMessageMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly onWebviewUpdate: () => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: DismissMessageMessage): Promise<void> {
    const { featureName, messageId } = message;

    try {
      const feature = this.getFeatureOrShowError(featureName);
      if (!feature) {
        throw new Error(`Feature not found: ${featureName}`);
      }

      this.messageService.dismissMessage(feature.worktreePath, featureName, messageId);
      this.featureService.invalidateCache();
      this.onWebviewUpdate();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to dismiss message: ${errorMessage}`);
    }
  }
}
