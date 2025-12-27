import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';
import { getAbsoluteMetaPath, getAbsoluteOutputsDir, getFeatureFolder, META_FILES } from '../../../utils/featureMetaPaths';

interface OpenFileMessage {
  command: 'openFile';
  featureName: string;
  fileName: string;
}

export class OpenFileHandler extends MessageHandler<OpenFileMessage> {
  private readonly fsFn: typeof fs;

  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly onWebviewUpdate: () => void,
    private readonly projectRoot: string,
    fsOverride?: typeof fs
  ) {
    super(featureService, messageService);
    this.fsFn = fsOverride ?? fs;
  }

  async handle(message: OpenFileMessage): Promise<void> {
    const { featureName, fileName } = message;
    const feature = this.getFeatureOrShowError(featureName);
    if (!feature) {
      return;
    }

    let filePath: string;

    // Check if this is a legacy file name (for backwards compatibility)
    switch (fileName) {
      case 'Prompt':
        filePath = getAbsoluteMetaPath(feature.worktreePath, featureName, META_FILES.PROMPT);
        break;
      case 'Modify Prompt':
        filePath = getAbsoluteMetaPath(feature.worktreePath, featureName, META_FILES.MODIFY_PROMPT);
        if (!this.fsFn.existsSync(filePath)) {
          this.fsFn.writeFileSync(filePath, '', 'utf-8');
        }
        break;
      case 'Plan':
        filePath = getAbsoluteMetaPath(feature.worktreePath, featureName, META_FILES.PLAN);
        if (!this.fsFn.existsSync(filePath)) {
          this.fsFn.writeFileSync(filePath, '', 'utf-8');
        }
        break;
      case 'Tests':
        {
          const outputsDir = getAbsoluteOutputsDir(feature.worktreePath, featureName);
          if (!this.fsFn.existsSync(outputsDir)) {
            this.addMessageToPanel(
              featureName,
              'No test results available. Run tests first.',
              'info'
            );
            this.onWebviewUpdate();
            return;
          }
          const testFiles = this.fsFn.readdirSync(outputsDir)
            .filter(f => f.startsWith('test-run-'))
            .sort()
            .reverse();
          if (testFiles.length === 0) {
            this.addMessageToPanel(
              featureName,
              'No test results available. Run tests first.',
              'info'
            );
            this.onWebviewUpdate();
            return;
          }
          filePath = path.join(outputsDir, testFiles[0]);
          break;
        }
      default:
        {
          // Handle file path from tree view
          // The fileName is a relative path from the file tree (e.g., "prompt.md", "progress.md")

          const isArchived = feature.lifecycleStatus === 'legacy';

          if (isArchived) {
            // For archived features, all files are in the features folder
            const featureFolder = getFeatureFolder(this.projectRoot, featureName);
            filePath = path.join(featureFolder, fileName);
          } else {
            // For active features, all files are in worktree .clauding/
            filePath = path.join(feature.worktreePath, '.clauding', fileName);
          }

          if (!this.fsFn.existsSync(filePath)) {
            vscode.window.showErrorMessage(`File not found: ${fileName}`);
            return;
          }
          break;
        }
    }

    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
  }
}
