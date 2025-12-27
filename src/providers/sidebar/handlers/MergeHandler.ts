import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';
import { MergeConflictOrchestrator } from '../MergeConflictOrchestrator';
import { SidebarViewState } from '../SidebarViewState';

interface MergeMessage {
  command: 'merge';
  featureName: string;
}

export class MergeHandler extends MessageHandler<MergeMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly mergeOrchestrator: MergeConflictOrchestrator,
    private readonly viewState: SidebarViewState,
    private readonly onWebviewUpdate: () => void,
    private readonly onFileTreeRefresh: (featureName: string) => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: MergeMessage): Promise<void> {
    const { featureName } = message;

    try {
      // Check that feature exists
      const feature = this.featureService.getFeature(featureName);
      if (!feature) {
        throw new Error(`Feature "${featureName}" not found`);
      }

      // Merge without progress popup
      const result = await this.featureService.mergeFeature(featureName, undefined);

      if (result.hasConflicts) {
        // Show conflict resolution dialog
        const strategy = await this.mergeOrchestrator.showConflictResolutionDialog(
          featureName,
          result.conflictedFiles
        );

        // Resolve conflicts based on strategy
        await this.mergeOrchestrator.resolveConflicts(
          featureName,
          result.conflictedFiles,
          strategy,
          true // isMergeToMain
        );
      } else {
        // Success
        const feature = this.featureService.getFeature(featureName);
        if (feature) {
          this.messageService.addMessage(
            feature.worktreePath,
            featureName,
            `Feature "${featureName}" merged successfully!`,
            'success',
            { dismissible: true }
          );
        }
      }

      // Don't clear selected feature here - let WebviewUpdater handle it after worktree is removed
      // The feature should remain selected so user can see the success message
      this.onWebviewUpdate();

      // Refresh file tree to update git status markers
      this.onFileTreeRefresh(featureName);
    } catch (error) {
      // Check for active terminals error
      if (error instanceof Error && error.message === 'ACTIVE_TERMINALS' && 'terminalNames' in error) {
        await this.mergeOrchestrator.handleActiveTerminalsWarning(
          featureName,
          (error as { terminalNames: string[] }).terminalNames,
          'merge',
          async () => {
            // Retry merge
            await this.handle(message);
          }
        );
        return;
      }

      // Check for active editors error
      if (error instanceof Error && error.message === 'ACTIVE_EDITORS' && 'editorPaths' in error) {
        await this.mergeOrchestrator.handleActiveEditorsWarning(
          featureName,
          (error as { editorPaths: string[] }).editorPaths,
          'merge',
          async () => {
            // Retry merge
            await this.handle(message);
          }
        );
        return;
      }

      this.handleError(error, 'Merge', featureName);
      // Don't call onWebviewUpdate() here to prevent focus switch away from failing feature
      // The feature should remain selected so user can see the error message
    }
  }
}
