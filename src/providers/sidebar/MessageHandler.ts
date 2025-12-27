import * as vscode from 'vscode';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';

/**
 * Base class for all message handlers
 * Provides common functionality and enforces consistent interface
 */
export abstract class MessageHandler<TMessage = unknown> {
  constructor(
    protected readonly featureService: FeatureService,
    protected readonly messageService: MessageService
  ) {}

  /**
   * Handle the message and perform the required action
   * @param message The message data from the webview
   */
  abstract handle(message: TMessage): Promise<void>;

  /**
   * Helper method to get a feature and show error if not found
   * @param featureName The name of the feature
   * @param usePopup Whether to show error as popup (true) or in message panel (false)
   * @returns The feature or null if not found
   */
  protected getFeatureOrShowError(
    featureName: string,
    usePopup: boolean = false
  ): ReturnType<typeof this.featureService.getFeature> | null {
    const feature = this.featureService.getFeature(featureName);
    if (!feature) {
      const errorMessage = `Feature "${featureName}" not found`;
      if (usePopup) {
        vscode.window.showErrorMessage(errorMessage);
      }
      // Note: Cannot add to message panel if feature doesn't exist
      return null;
    }
    return feature;
  }

  /**
   * Helper method to add message to panel with error handling
   * @param featureName The feature name
   * @param message The message text
   * @param type The message type
   * @param options Message options
   */
  protected addMessageToPanel(
    featureName: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error',
    options: { dismissible: boolean; actions?: Array<{ label: string; command: string; args?: unknown[] }> } = { dismissible: true }
  ): void {
    const feature = this.featureService.getFeature(featureName);
    if (feature) {
      this.messageService.addMessage(feature.worktreePath, featureName, message, type, options);
    }
  }

  /**
   * Helper method to handle errors consistently
   * @param error The error object
   * @param featureName The feature name (optional)
   * @param operationName The name of the operation that failed
   * @param fallbackToPopup Whether to use popup if feature not found
   */
  protected handleError(
    error: unknown,
    operationName: string,
    featureName?: string,
    fallbackToPopup: boolean = true
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = `${operationName} failed: ${errorMessage}`;

    if (featureName) {
      const feature = this.featureService.getFeature(featureName);
      if (feature) {
        this.messageService.addMessage(
          feature.worktreePath,
          featureName,
          fullMessage,
          'error',
          { dismissible: true }
        );
      } else if (fallbackToPopup) {
        vscode.window.showErrorMessage(fullMessage);
      }
    } else if (fallbackToPopup) {
      vscode.window.showErrorMessage(fullMessage);
    }
  }
}
