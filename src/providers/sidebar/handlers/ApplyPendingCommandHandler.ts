import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';
import { FeatureCommandOrchestrator } from '../FeatureCommandOrchestrator';

interface ApplyPendingCommandMessage {
  command: 'applyPendingCommand';
  featureName: string;
}

export class ApplyPendingCommandHandler extends MessageHandler<ApplyPendingCommandMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly commandOrchestrator: FeatureCommandOrchestrator,
    private readonly onWebviewUpdate: () => void,
    private readonly onFileTreeRefresh: (featureName: string) => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: ApplyPendingCommandMessage): Promise<void> {
    const { featureName } = message;

    try {
      await this.commandOrchestrator.applyPendingCommand(
        featureName,
        this.onWebviewUpdate,
        this.onFileTreeRefresh
      );
    } catch (error) {
      this.handleError(error, 'Apply', featureName);
      this.onWebviewUpdate();
    }
  }
}
