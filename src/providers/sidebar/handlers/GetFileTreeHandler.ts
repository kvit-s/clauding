import * as vscode from 'vscode';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';

interface GetFileTreeMessage {
  command: 'getFileTree';
  featureName: string;
}

export class GetFileTreeHandler extends MessageHandler<GetFileTreeMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly fileTreeBuilder: {
      buildFileTree(featureName: string): Promise<unknown[]>;
    },
    private readonly webviewProvider: () => vscode.Webview | undefined
  ) {
    super(featureService, messageService);
  }

  async handle(message: GetFileTreeMessage): Promise<void> {
    const { featureName } = message;

    try {
      const feature = this.getFeatureOrShowError(featureName);
      if (!feature) {
        this.webviewProvider()?.postMessage({
          type: 'fileTree',
          error: 'Feature not found'
        });
        return;
      }

      const tree = await this.fileTreeBuilder.buildFileTree(featureName);

      this.webviewProvider()?.postMessage({
        type: 'fileTree',
        tree: tree
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.webviewProvider()?.postMessage({
        type: 'fileTree',
        error: errorMessage
      });
    }
  }
}
