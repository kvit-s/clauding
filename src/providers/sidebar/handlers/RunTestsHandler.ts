import * as vscode from 'vscode';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';

interface RunTestsMessage {
  command: 'runTests';
  featureName: string;
}

export class RunTestsHandler extends MessageHandler<RunTestsMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly onWebviewUpdate: () => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: RunTestsMessage): Promise<void> {
    const { featureName } = message;

    try {
      const feature = this.getFeatureOrShowError(featureName, true);
      if (!feature) {
        return;
      }

      // Run tests (non-blocking - will return immediately)
      // Test completion is handled by TestService via terminal close detection
      await this.featureService.runTests(
        featureName,
        undefined,
        async (outputFile: string) => {
          // This callback runs when tests complete (terminal closes)
          // Open test output file
          try {
            const document = await vscode.workspace.openTextDocument(outputFile);
            await vscode.window.showTextDocument(document);
          } catch (error) {
            console.error('Failed to open test output file:', error);
          }

          // Update UI
          this.onWebviewUpdate();
        }
      );

      // Update UI to show that tests are running
      this.onWebviewUpdate();
    } catch (error) {
      this.handleError(error, 'Test execution', featureName);
      this.onWebviewUpdate();
    }
  }
}
