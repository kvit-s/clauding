import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FeatureService } from '../../services/FeatureService';
import { FileCheckService, FileCheckResult } from '../../services/FileCheckService';
import { MessageService } from '../../services/MessageService';
import { GitService } from '../../services/GitService';
import { LLMService } from '../../services/LLMService';
import { FeatureClassificationService } from '../../services/FeatureClassificationService';
import { AGENT_COMMANDS } from '../../models/AgentCommand';
import { getAbsoluteMetaPath, META_FILES, getProjectRoot, getFeaturesOutputsDir } from '../../utils/featureMetaPaths';

/**
 * Orchestrates feature command execution workflows
 */
export class FeatureCommandOrchestrator {
  constructor(
    private readonly featureService: FeatureService,
    private readonly fileCheckService: FileCheckService,
    private readonly messageService: MessageService,
    private readonly gitService: GitService,
    private readonly worktreesDir: string
  ) {}

  /**
   * Execute an agent command for a feature
   * @param featureName The feature name
   * @param commandName The command to execute
   * @param onWebviewUpdate Callback to update the webview
   * @param onFileTreeRefresh Callback to refresh the file tree
   * @param agentId Optional agent ID to use (if not provided, uses default)
   */
  async executeAgentCommand(
    featureName: string,
    commandName: string,
    onWebviewUpdate: () => void,
    onFileTreeRefresh: (featureName: string) => void,
    agentId?: string  // NEW parameter (optional, at end for backward compatibility)
  ): Promise<void> {
    const feature = this.featureService.getFeature(featureName);
    if (!feature) {
      throw new Error(`Feature not found: ${featureName}`);
    }

    const command = AGENT_COMMANDS[commandName];
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    // Check for missing required files
    const fileCheck = await this.fileCheckService.checkRequiredFiles(command, feature.worktreePath);

    if (!fileCheck.allExist) {
      await this.handleMissingFiles(
        featureName,
        commandName,
        fileCheck,
        feature.worktreePath,
        onWebviewUpdate
      );
      return;
    }

    // Classify feature in background (if not already classified and LLM is configured)
    if ((commandName === 'Create Plan' || commandName === 'Create Lightweight Plan') && !feature.classification) {
      this.classifyFeatureInBackground(featureName, onWebviewUpdate);
    }

    // Update classification metadata with user choice (always record, regardless of classification state)
    if (commandName === 'Create Plan' || commandName === 'Create Lightweight Plan') {
      await this.updateUserChoice(featureName, commandName, feature.worktreePath);
    }

    // Status transitions: Update status based on command
    if (commandName === 'Implement Plan') {
      this.createImplementMarkerFile(featureName, feature.worktreePath);
      this.messageService.addMessage(
        feature.worktreePath,
        featureName,
        'Implementation started',
        'info',
        { dismissible: true }
      );
      // Update UI immediately to show status change before agent execution
      onWebviewUpdate();
    }

    // All files exist - execute the command (no progress popup)
    await this.featureService.executeAgentCommand(
      featureName,
      commandName,
      undefined, // no progress callback needed
      undefined, // terminalService not needed anymore
      agentId    // Pass agent ID
    );

    // Show success in message panel
    this.messageService.addMessage(
      feature.worktreePath,
      featureName,
      `✓ ${commandName} completed`,
      'success',
      { dismissible: true }
    );

    // Open plan.md if Create Plan or Modify Plan command was executed
    if (commandName === 'Create Plan' || commandName === 'Modify Plan' || commandName === 'Create Lightweight Plan') {
      await this.openPlanFile(featureName, feature.worktreePath);
    }

    // After command completes successfully and message is added
    if (commandName === 'Implement Plan') {
      // Delete marker file before transitioning to wrap-up
      this.deleteImplementMarkerFile(featureName, feature.worktreePath);
      // Update status to wrap-up after implementation completes
      this.featureService.updateFeatureStatus(featureName, 'wrap-up');
      this.messageService.addMessage(
        feature.worktreePath,
        featureName,
        'Implementation complete. Ready for testing and merge.',
        'success',
        { dismissible: true }
      );
      onWebviewUpdate(); // Refresh UI to show new status
    }

    // Update UI
    onWebviewUpdate();

    // Refresh file tree to update git status markers
    onFileTreeRefresh(featureName);
  }

  /**
   * Create marker file to trigger "implement" state
   */
  private createImplementMarkerFile(featureName: string, worktreePath: string): void {
    const projectRoot = getProjectRoot(worktreePath);
    const outputsDir = getFeaturesOutputsDir(projectRoot, featureName);
    fs.mkdirSync(outputsDir, { recursive: true });
    const markerPath = path.join(outputsDir, 'implement-plan-in-progress.txt');
    fs.writeFileSync(markerPath, '', 'utf-8');
  }

  /**
   * Delete marker file when transitioning to wrap-up
   */
  private deleteImplementMarkerFile(featureName: string, worktreePath: string): void {
    const projectRoot = getProjectRoot(worktreePath);
    const outputsDir = getFeaturesOutputsDir(projectRoot, featureName);
    const markerPath = path.join(outputsDir, 'implement-plan-in-progress.txt');
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  }

  /**
   * Handle missing required files
   */
  private async handleMissingFiles(
    featureName: string,
    commandName: string,
    fileCheck: FileCheckResult,
    worktreePath: string,
    onWebviewUpdate: () => void
  ): Promise<void> {
    // If there are pattern errors, show error messages and don't create files
    if (fileCheck.patternErrors.length > 0) {
      const errorMessages = fileCheck.patternErrors.map(e => e.error).join(', ');
      this.messageService.addMessage(
        worktreePath,
        featureName,
        `Cannot execute ${commandName}: ${errorMessages}`,
        'error',
        { dismissible: true }
      );
      onWebviewUpdate();
      return;
    }

    // Only handle exact files (create them)
    if (fileCheck.missingFiles.length === 0) {
      return;
    }

    // Create missing exact files
    this.fileCheckService.createMissingFiles(fileCheck.missingFiles, worktreePath);

    // Special handling for Modify Plan when modify-prompt.md doesn't exist
    const hasModifyPrompt = fileCheck.missingFiles.some(f => f.path === 'modify-prompt.md');
    if (commandName === 'Modify Plan' && hasModifyPrompt) {
      // Open modify-prompt.md for editing
      const modifyPromptPath = getAbsoluteMetaPath(worktreePath, featureName, 'modify-prompt.md');
      const document = await vscode.workspace.openTextDocument(modifyPromptPath);
      await vscode.window.showTextDocument(document);

      // Show message without mentioning [Apply] button
      this.messageService.addMessage(
        worktreePath,
        featureName,
        `Created modify-prompt.md with template. Edit it to describe your desired changes, then click Modify Plan again.`,
        'info',
        { dismissible: true }
      );

      // Update UI but DO NOT save pending command state
      onWebviewUpdate();
      return;
    }

    // Standard flow for other commands: save pending state and show [Apply] button
    const missingFileNames = fileCheck.missingFiles.map(f => f.path);
    this.featureService.savePendingCommand(worktreePath, commandName, missingFileNames);

    // Open missing files for editing
    for (const file of fileCheck.missingFiles) {
      const filePath = getAbsoluteMetaPath(worktreePath, featureName, file.path);
      const document = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(document);
    }

    // Show message about pending command workflow
    this.messageService.addMessage(
      worktreePath,
      featureName,
      `Edit ${missingFileNames.join(', ')}, save, and click [Apply] to run ${commandName}`,
      'info',
      { dismissible: false }
    );

    // Update UI to reflect pending command state
    onWebviewUpdate();
  }

  /**
   * Classify feature in background
   */
  private classifyFeatureInBackground(
    featureName: string,
    onWebviewUpdate: () => void
  ): void {
    // Check if LLM feature classification is enabled (experimental, disabled by default)
    const config = vscode.workspace.getConfiguration('clauding');
    if (!config.get<boolean>('llm.enabled', false)) {
      return;
    }

    const llmService = new LLMService();
    if (!llmService.isConfigured()) {
      return;
    }

    // Fire and forget - run classification in background
    this.featureService.classifyAndStoreFeature(featureName, true)
      .then(() => {
        // Update webview with classification when it completes
        this.updateWebviewWithClassification(featureName, onWebviewUpdate);
        // Merge any user choice that was recorded before classification completed
        this.mergeUserChoiceIfNeeded(featureName);
      })
      .catch(error => {
        // Classification failed - show in message panel (not popup)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const feature = this.featureService.getFeature(featureName);
        if (feature) {
          this.messageService.addMessage(
            feature.worktreePath,
            featureName,
            `Classification failed: ${errorMessage}`,
            'warning',
            { dismissible: true }
          );
          onWebviewUpdate();
        }
      });
  }

  /**
   * Merge user choice if it was recorded before classification completed
   */
  private async mergeUserChoiceIfNeeded(featureName: string): Promise<void> {
    try {
      const feature = this.featureService.getFeature(featureName);
      if (!feature) {
        return;
      }

      const classificationService = new FeatureClassificationService(feature.worktreePath);
      await classificationService.mergeUserChoiceWithClassification(featureName);
    } catch (error) {
      console.error('Failed to merge user choice:', error);
    }
  }

  /**
   * Update user choice in classification metadata
   */
  private async updateUserChoice(
    featureName: string,
    commandName: string,
    worktreePath: string
  ): Promise<void> {
    try {
      const feature = this.featureService.getFeature(featureName);
      if (!feature) {
        return;
      }

      const classificationService = new FeatureClassificationService(worktreePath);
      await classificationService.updateUserChoice(featureName, commandName);

      // Commit the updated metadata
      try {
        const commitMessage = feature.classification
          ? `feat: Record user choice for plan type

User chose: ${commandName}
LLM suggested: ${feature.classification.result}

Timestamp: ${new Date().toISOString()}`
          : `feat: Record user choice for plan type

User chose: ${commandName}
(LLM classification pending)

Timestamp: ${new Date().toISOString()}`;

        await this.gitService.stageAndCommit(worktreePath, commitMessage);
      } catch (error) {
        // Ignore commit errors (e.g., nothing to commit)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('No changes to commit')) {
          console.error('Failed to commit user choice:', error);
        }
      }
    } catch (error) {
      console.error('Failed to update user choice:', error);
    }
  }

  /**
   * Update webview with classification
   */
  private updateWebviewWithClassification(
    featureName: string,
    onWebviewUpdate: () => void
  ): void {
    const feature = this.featureService.getFeature(featureName);
    if (!feature || !feature.classification) {
      return;
    }

    // Show classification result in message panel
    this.messageService.addMessage(
      feature.worktreePath,
      featureName,
      `Feature classified as: ${feature.classification.result}`,
      'info',
      { dismissible: true }
    );

    // Update webview to show classification
    onWebviewUpdate();
  }

  /**
   * Open plan file
   */
  private async openPlanFile(featureName: string, worktreePath: string): Promise<void> {
    const planPath = getAbsoluteMetaPath(worktreePath, featureName, META_FILES.PLAN);
    try {
      const document = await vscode.workspace.openTextDocument(planPath);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      // Silently fail if plan.md doesn't exist yet
      console.error('Failed to open plan.md:', error);
    }
  }

  /**
   * Apply pending command
   */
  async applyPendingCommand(
    featureName: string,
    onWebviewUpdate: () => void,
    onFileTreeRefresh: (featureName: string) => void
  ): Promise<void> {
    const feature = this.featureService.getFeature(featureName);
    if (!feature || !feature.pendingCommand) {
      if (feature) {
        this.messageService.addMessage(
          feature.worktreePath,
          featureName,
          'No pending command found',
          'error',
          { dismissible: true }
        );
        onWebviewUpdate();
      } else {
        vscode.window.showErrorMessage('No pending command found');
      }
      return;
    }

    const commandName = feature.pendingCommand.command;
    const command = AGENT_COMMANDS[commandName];

    // Save all dirty (unsaved) files before checking
    await vscode.workspace.saveAll(false);

    // Check if files now have content
    const fileCheck = await this.fileCheckService.checkRequiredFiles(command, feature.worktreePath);
    if (!fileCheck.allExist) {
      const missingFileNames = fileCheck.missingFiles.map(f => f.path);
      this.messageService.addMessage(
        feature.worktreePath,
        featureName,
        `No changes detected. Please edit ${missingFileNames.join(', ')} and save before clicking Apply.`,
        'error',
        { dismissible: true }
      );
      onWebviewUpdate();
      return; // Keep pending command state
    }

    // Clear the pending command state
    this.featureService.clearPendingCommand(feature.worktreePath);

    // Update UI immediately to hide [Apply] button
    onWebviewUpdate();

    // Execute the command (this will now succeed because files have been edited)
    await this.executeAgentCommand(featureName, commandName, onWebviewUpdate, onFileTreeRefresh);
  }
}
