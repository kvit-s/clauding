import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';
import { ITerminalProvider } from '../../../terminals/ITerminalProvider';

interface ActivateTerminalMessage {
  command: 'activateTerminal';
  terminalName: string;
}

export class ActivateTerminalHandler extends MessageHandler<ActivateTerminalMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly terminalProvider: ITerminalProvider
  ) {
    super(featureService, messageService);
  }

  async handle(message: ActivateTerminalMessage): Promise<void> {
    const { terminalName } = message;

    // Get all terminals and find the one with matching name
    const terminals = this.terminalProvider.getActiveTerminals();
    const terminal = terminals.find(t => t.name === terminalName);

    if (terminal) {
      terminal.show();
    }
  }
}
