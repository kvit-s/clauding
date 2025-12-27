import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';
import { FeatureCommandOrchestrator } from '../FeatureCommandOrchestrator';

interface ExecuteAgentCommandMessage {
  command: 'executeAgentCommand';
  featureName: string;
  commandName: string;
  agentId?: string;  // NEW: Optional agent ID to use (if not provided, uses default)
}

export class ExecuteAgentCommandHandler extends MessageHandler<ExecuteAgentCommandMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly commandOrchestrator: FeatureCommandOrchestrator,
    private readonly onWebviewUpdate: () => void,
    private readonly onFileTreeRefresh: (featureName: string) => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: ExecuteAgentCommandMessage): Promise<void> {
    const { featureName, commandName, agentId } = message;  // Extract agentId

    if (!featureName || !commandName) {
      return;
    }

    try {
      await this.commandOrchestrator.executeAgentCommand(
        featureName,
        commandName,
        this.onWebviewUpdate,
        this.onFileTreeRefresh,
        agentId  // Pass agentId
      );
    } catch (error) {
      this.handleError(error, commandName, featureName);
      this.onWebviewUpdate();
    }
  }
}
