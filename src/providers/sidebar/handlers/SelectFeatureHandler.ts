import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';

interface SelectFeatureMessage {
  command: 'selectFeature';
  name: string;
}

export class SelectFeatureHandler extends MessageHandler<SelectFeatureMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly onFeatureSelected: (featureName: string, skipViewSync: boolean) => Promise<void>
  ) {
    super(featureService, messageService);
  }

  async handle(message: SelectFeatureMessage): Promise<void> {
    // Delegate to the selection handler with view sync enabled
    await this.onFeatureSelected(message.name, false);
  }
}
