import * as vscode from 'vscode';
import * as fs from 'fs';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';
import { ITerminalProvider } from '../../../terminals/ITerminalProvider';
import { TmuxTerminal } from '../../../terminals/tmux/TmuxTerminal';

interface CloseTerminalMessage {
  command: 'closeTerminal';
  terminalName: string;
}

export class CloseTerminalHandler extends MessageHandler<CloseTerminalMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly terminalProvider: ITerminalProvider
  ) {
    super(featureService, messageService);
  }

  async handle(message: CloseTerminalMessage): Promise<void> {
    const { terminalName } = message;

    // Get all terminals and find the one with matching name
    const terminals = this.terminalProvider.getActiveTerminals();
    const terminal = terminals.find(t => t.name === terminalName);

    if (terminal) {
      // Check if this terminal needs buffer capture before disposal
      const outputFilePath = (terminal as any).__outputFilePath;
      if (outputFilePath && terminal instanceof TmuxTerminal) {
        try {
          // Capture buffer BEFORE disposing the terminal
          const buffer = await terminal.getBuffer();
          fs.writeFileSync(outputFilePath, buffer, 'utf8');
          console.log(`Successfully captured buffer to ${outputFilePath}`);
        } catch (error) {
          console.error('Failed to capture buffer:', error);
          // Continue with disposal even if capture fails
        }
      }

      // Now dispose the terminal
      terminal.dispose();
    } else {
      vscode.window.showWarningMessage(`Terminal "${terminalName}" not found`);
    }
  }
}
