import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MessageHandler } from '../MessageHandler';
import { FeatureService } from '../../../services/FeatureService';
import { WorktreeService } from '../../../services/WorktreeService';
import { GitService } from '../../../services/GitService';
import { MessageService } from '../../../services/MessageService';
import { ITerminalProvider } from '../../../terminals/ITerminalProvider';
import { getAbsoluteMetaPath, getAbsoluteWorktreeMetaPath, getProjectRoot, getFeatureFolder, META_FILES } from '../../../utils/featureMetaPaths';

interface ReactivateFeatureMessage {
  command: 'reactivateFeature';
  featureName: string;
}

export class ReactivateFeatureHandler extends MessageHandler<ReactivateFeatureMessage> {
  constructor(
    featureService: FeatureService,
    messageService: MessageService,
    private readonly worktreeService: WorktreeService,
    private readonly gitService: GitService,
    private readonly commitMessagePrefix: string,
    private readonly terminalProvider: ITerminalProvider,
    private readonly onFeatureReactivated: (featureName: string) => Promise<void>
  ) {
    super(featureService, messageService);
  }

  async handle(message: ReactivateFeatureMessage): Promise<void> {
    const archivedFeatureName = message.featureName;
    if (!archivedFeatureName) {
      vscode.window.showErrorMessage('Feature name is required');
      return;
    }

    try {
      console.log(`[ReactivateFeatureHandler] Starting reactivation of: ${archivedFeatureName}`);

      // Get a unique name for the new feature
      const newFeatureName = this.featureService.getUniqueFeatureName(archivedFeatureName);
      console.log(`[ReactivateFeatureHandler] Unique name determined: ${newFeatureName}`);

      // Show progress notification
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Reactivating feature "${archivedFeatureName}"...`,
          cancellable: false
        },
        async (progress) => {
          // Step 1: Create new feature worktree (without initial commit)
          progress.report({ message: 'Creating worktree...' });
          console.log(`[ReactivateFeatureHandler] About to create worktree: ${newFeatureName}`);

          const worktreePath = await this.worktreeService.createWorktree(newFeatureName);
          const projectRoot = getProjectRoot(worktreePath);

          // Ensure .clauding directory exists in the new worktree
          const claudingDir = path.join(worktreePath, '.clauding');
          if (!fs.existsSync(claudingDir)) {
            fs.mkdirSync(claudingDir, { recursive: true });
          }

          // Start tracking this feature (agent status, metadata watching, etc.)
          // Note: These will be initialized by FeatureService on next refresh,
          // but we can trigger them here if needed

          // Step 2: Copy files from archived feature's features folder BEFORE any commit
          progress.report({ message: 'Copying files from archived feature...' });

          const archivedFeatureFolder = getFeatureFolder(projectRoot, archivedFeatureName);
          console.log(`[ReactivateFeatureHandler] Copying from: ${archivedFeatureFolder}`);

          // Files to copy from the archived feature's features folder to new worktree's .clauding folder
          const filesToCopy = [META_FILES.PROMPT, META_FILES.PLAN, META_FILES.MODIFY_PROMPT];

          const copiedFiles: string[] = [];

          for (const fileName of filesToCopy) {
            const sourcePath = path.join(archivedFeatureFolder, fileName);
            const destPath = getAbsoluteWorktreeMetaPath(worktreePath, fileName);

            console.log(`[ReactivateFeatureHandler] Checking ${fileName}: ${sourcePath} -> ${destPath}`);

            // Only copy if source file exists
            if (fs.existsSync(sourcePath)) {
              try {
                fs.copyFileSync(sourcePath, destPath);
                copiedFiles.push(fileName);
                console.log(`[ReactivateFeatureHandler] Copied ${fileName}`);
              } catch (error) {
                console.warn(`Failed to copy ${fileName}:`, error);
              }
            } else {
              console.log(`[ReactivateFeatureHandler] Source file does not exist: ${sourcePath}`);
            }
          }

          // If no prompt.md was copied, create an empty one
          const promptPath = getAbsoluteWorktreeMetaPath(worktreePath, META_FILES.PROMPT);
          if (!fs.existsSync(promptPath)) {
            fs.writeFileSync(promptPath, '', 'utf-8');
          }

          // Step 3: Reset lifecycle status to 'plan' by managing features folder files
          // Lifecycle is determined by file presence, so we need to:
          // 1. Remove wrap-up.json (if exists) to exit wrap-up state
          // 2. Rename outputs/ to outputs-{timestamp}/ to preserve history but exit implement state
          // 3. Create new empty outputs/ folder for the reactivated feature

          const featuresDir = path.join(projectRoot, '.clauding', 'features', archivedFeatureName);

          // Remove wrap-up.json if it exists
          const wrapUpPath = path.join(featuresDir, 'wrap-up.json');
          if (fs.existsSync(wrapUpPath)) {
            fs.unlinkSync(wrapUpPath);
            console.log(`[ReactivateFeatureHandler] Removed wrap-up.json`);
          }

          // Rename outputs/ to outputs-{timestamp}/ to preserve history
          const outputsDir = path.join(featuresDir, 'outputs');
          if (fs.existsSync(outputsDir)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: 2025-11-11T02-33-45
            const archivedOutputsDir = path.join(featuresDir, `outputs-${timestamp}`);
            fs.renameSync(outputsDir, archivedOutputsDir);
            console.log(`[ReactivateFeatureHandler] Renamed outputs/ to outputs-${timestamp}/`);
          }

          // Create new empty outputs/ folder
          fs.mkdirSync(outputsDir, { recursive: true });
          console.log(`[ReactivateFeatureHandler] Created new empty outputs/ folder`);

          // Now if newFeatureName differs from archivedFeatureName, we need to create the new features folder
          if (newFeatureName !== archivedFeatureName) {
            const newFeaturesDir = path.join(projectRoot, '.clauding', 'features', newFeatureName);
            if (!fs.existsSync(newFeaturesDir)) {
              fs.mkdirSync(newFeaturesDir, { recursive: true });
            }
            // Create outputs folder for new feature
            const newOutputsDir = path.join(newFeaturesDir, 'outputs');
            fs.mkdirSync(newOutputsDir, { recursive: true });
          }

          // Step 4: Create timelog (with placeholder for commit hash)
          const timelogPath = getAbsoluteMetaPath(worktreePath, newFeatureName, META_FILES.TIMELOG);
          const timelog: {
            entries: Array<{
              timestamp: string;
              action: string;
              result: 'Success' | 'Failed' | 'Warning';
              details?: Record<string, unknown>;
              commitHash?: string;
            }>;
          } = {
            entries: [
              {
                timestamp: new Date().toISOString(),
                action: 'Feature Reactivated',
                result: 'Success',
                details: {
                  originalFeature: archivedFeatureName,
                  copiedFiles: copiedFiles
                }
              }
            ]
          };
          fs.writeFileSync(timelogPath, JSON.stringify(timelog, null, 2), 'utf-8');

          // Step 5: Create single commit with all files
          progress.report({ message: 'Committing reactivated files...' });

          const commitMessage = `${this.commitMessagePrefix}(${newFeatureName}): Reactivate archived feature '${archivedFeatureName}'

Copied files: ${copiedFiles.length > 0 ? copiedFiles.join(', ') : 'none'}
${newFeatureName !== archivedFeatureName ? `New feature name: ${newFeatureName}` : ''}`;

          const commitHash = await this.gitService.stageAndCommit(worktreePath, commitMessage);

          // Update timelog with commit hash
          timelog.entries[0].commitHash = commitHash;
          fs.writeFileSync(timelogPath, JSON.stringify(timelog, null, 2), 'utf-8');

          // Create the feature object for return
          const newFeature = {
            name: newFeatureName,
            worktreePath: worktreePath,
            branchName: `feature/${newFeatureName}`,
            status: { type: 'plan-created' as const, message: 'Feature reactivated' },
            lifecycleStatus: copiedFiles.includes(META_FILES.PLAN) ? 'plan' as const : 'pre-plan' as const
          };

          // Step 4: Show success message
          const successMsg = copiedFiles.length > 0
            ? `Feature "${newFeatureName}" reactivated with ${copiedFiles.length} file(s) from "${archivedFeatureName}".`
            : `Feature "${newFeatureName}" reactivated from "${archivedFeatureName}" (no files found to copy).`;

          this.messageService.addMessage(
            newFeature.worktreePath,
            newFeatureName,
            successMsg,
            'success',
            { dismissible: true }
          );

          vscode.window.showInformationMessage(successMsg);

          // Invalidate cache to ensure UI sees the new feature
          this.featureService.invalidateCache();

          // Notify parent about the new feature (for selection update)
          await this.onFeatureReactivated(newFeatureName);

          // Open the prompt.md file for editing if it was copied
          if (copiedFiles.includes(META_FILES.PROMPT)) {
            const promptPath = getAbsoluteWorktreeMetaPath(newFeature.worktreePath, META_FILES.PROMPT);
            const promptUri = vscode.Uri.file(promptPath);
            await vscode.window.showTextDocument(promptUri);
          }
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to reactivate feature: ${errorMessage}`);
    }
  }
}
