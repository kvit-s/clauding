import * as vscode from 'vscode';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';
import { ITerminalProvider, TerminalType } from '../../../terminals/ITerminalProvider';

interface OpenConsoleMessage {
  command: 'openconsole';
  featureName: string;
}

export class OpenConsoleHandler extends MessageHandler<OpenConsoleMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly terminalProvider: ITerminalProvider,
    private readonly onWebviewUpdate: () => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: OpenConsoleMessage): Promise<void> {
    const { featureName } = message;

    try {
      const feature = this.getFeatureOrShowError(featureName, true);
      if (!feature) {
        return;
      }

      const terminal = await this.terminalProvider.createTerminal({
        name: `Clauding: ${featureName}`,
        type: TerminalType.Console,
        cwd: feature.worktreePath,
        featureName: featureName,
        show: true
      });

      this.addMessageToPanel(
        featureName,
        `Console opened for feature "${featureName}"`,
        'success'
      );
      this.onWebviewUpdate();
    } catch (error) {
      this.handleError(error, 'Failed to open console', featureName);
      this.onWebviewUpdate();
    }
  }
}
