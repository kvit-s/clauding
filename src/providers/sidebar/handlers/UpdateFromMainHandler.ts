import * as fs from 'fs';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { MessageService } from '../../../services/MessageService';
import { MergeConflictOrchestrator } from '../MergeConflictOrchestrator';
import { FeatureCommandOrchestrator } from '../FeatureCommandOrchestrator';
import { getAbsoluteMetaPath, META_FILES } from '../../../utils/featureMetaPaths';

interface UpdateFromMainMessage {
  command: 'updateFromMain';
  featureName: string;
}

export class UpdateFromMainHandler extends MessageHandler<UpdateFromMainMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly mergeOrchestrator: MergeConflictOrchestrator,
    private readonly commandOrchestrator: FeatureCommandOrchestrator,
    private readonly onWebviewUpdate: () => void,
    private readonly onFileTreeRefresh: (featureName: string) => void
  ) {
    super(featureService, messageService);
  }

  async handle(message: UpdateFromMainMessage): Promise<void> {
    const { featureName } = message;

    try {
      // Get feature and determine main branch
      const feature = this.getFeatureOrShowError(featureName, true);
      if (!feature) {
        return;
      }

      const mainBranch = this.featureService.getMainBranch();

      // Perform merge from main branch into current feature branch
      const result = await this.featureService.updateFromMain(featureName);

      if (result.hasConflicts) {
        const strategy = await this.mergeOrchestrator.showConflictResolutionDialog(
          featureName,
          result.conflictedFiles
        );

        // Handle agent resolution differently for update from main
        if (strategy === 'agent') {
          this.messageService.addMessage(
            feature.worktreePath,
            featureName,
            'Agent resolution for update from main is not yet implemented.',
            'warning',
            { dismissible: true }
          );
          this.onWebviewUpdate();
          return;
        }

        await this.mergeOrchestrator.resolveConflicts(
          featureName,
          result.conflictedFiles,
          strategy,
          false // isUpdateFromMain
        );
      } else {
        this.messageService.addMessage(
          feature.worktreePath,
          featureName,
          `Updated from ${mainBranch} successfully!`,
          'success',
          { dismissible: true }
        );

        // Auto-trigger Modify Plan if feature is in planning stage
        await this.autoTriggerModifyPlanIfNeeded(featureName, feature.worktreePath);
      }

      this.onWebviewUpdate();
      this.onFileTreeRefresh(featureName);
    } catch (error) {
      this.handleError(error, 'Update from main', featureName);
      this.onWebviewUpdate();
    }
  }

  /**
   * Auto-trigger Modify Plan if feature is in planning stage and plan.md exists
   */
  private async autoTriggerModifyPlanIfNeeded(
    featureName: string,
    worktreePath: string
  ): Promise<void> {
    try {
      // Get updated feature to check lifecycle status
      const feature = this.featureService.getFeature(featureName);
      if (!feature) {
        return;
      }

      // Check if feature is in planning stage
      if (feature.lifecycleStatus !== 'plan') {
        return;
      }

      // Check if plan.md exists
      const planPath = getAbsoluteMetaPath(worktreePath, featureName, META_FILES.PLAN);
      if (!fs.existsSync(planPath)) {
        return;
      }

      // Create/update modify-prompt.md with predefined message
      const modifyPromptPath = getAbsoluteMetaPath(worktreePath, featureName, META_FILES.MODIFY_PROMPT);
      const standardMessage = 'Merged changes in main into this branch. Review if need to update plan.md to reflect these changes.';
      fs.writeFileSync(modifyPromptPath, standardMessage, 'utf-8');

      // Show message that we're auto-updating the plan
      this.messageService.addMessage(
        worktreePath,
        featureName,
        'Auto-updating plan based on merged changes...',
        'info',
        { dismissible: true }
      );
      this.onWebviewUpdate();

      // Trigger Modify Plan agent
      await this.commandOrchestrator.executeAgentCommand(
        featureName,
        'Modify Plan',
        this.onWebviewUpdate,
        this.onFileTreeRefresh
      );
    } catch (error) {
      // Log error but don't fail the main operation
      console.error('Failed to auto-trigger Modify Plan:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.messageService.addMessage(
        worktreePath,
        featureName,
        `Failed to auto-update plan: ${errorMessage}`,
        'warning',
        { dismissible: true }
      );
      this.onWebviewUpdate();
    }
  }
}
