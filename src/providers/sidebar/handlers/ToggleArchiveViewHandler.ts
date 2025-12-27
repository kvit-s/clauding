import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';

interface ToggleArchiveViewMessage {
  command: 'toggleArchiveView';
}

export class ToggleArchiveViewHandler extends MessageHandler<ToggleArchiveViewMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly onToggleView: () => Promise<void>
  ) {
    super(featureService, messageService);
  }

  async handle(): Promise<void> {
    // Delegate to the toggle handler
    await this.onToggleView();
  }
}
