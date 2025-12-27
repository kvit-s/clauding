import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';

interface MessageActionMessage {
  command: 'messageAction';
  featureName: string;
  action: {
    command: string;
    args?: unknown[];
  };
}

export class MessageActionHandler extends MessageHandler<MessageActionMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly commandHandlers: {
      executeAgentCommand?: (featureName: string, commandName: string) => Promise<void>;
      runTests?: (featureName: string) => Promise<void>;
      merge?: (featureName: string) => Promise<void>;
      saveTestResults?: (featureName: string) => Promise<void>;
    }
  ) {
    super(featureService, messageService);
  }

  async handle(message: MessageActionMessage): Promise<void> {
    const { featureName, action } = message;

    try {
      // Execute the command from the message action
      if (action.command === 'executeAgentCommand' && action.args && action.args[0]) {
        await this.commandHandlers.executeAgentCommand?.(featureName, String(action.args[0]));
      } else if (action.command === 'runTests') {
        await this.commandHandlers.runTests?.(featureName);
      } else if (action.command === 'merge') {
        await this.commandHandlers.merge?.(featureName);
      } else if (action.command === 'saveTestResults') {
        await this.commandHandlers.saveTestResults?.(featureName);
      } else {
        console.warn(`Unknown message action command: ${action.command}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to execute message action: ${errorMessage}`);
    }
  }
}
