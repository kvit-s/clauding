import * as vscode from 'vscode';

export enum ErrorSeverity {
  info = 'info',
  warning = 'warning',
  error = 'error'
}

export interface ErrorContext {
  operation: string;
  feature?: string;
  details?: Record<string, unknown>;
}

export class ErrorHandler {
  /**
   * Handle an error with appropriate user feedback
   */
  public static handle(error: Error, context: ErrorContext, severity: ErrorSeverity = ErrorSeverity.error): void {
    console.error(`[${context.operation}] Error:`, error);

    const message = this.formatErrorMessage(error, context);

    switch (severity) {
      case ErrorSeverity.info:
        vscode.window.showInformationMessage(message);
        break;
      case ErrorSeverity.warning:
        vscode.window.showWarningMessage(message);
        break;
      case ErrorSeverity.error:
        vscode.window.showErrorMessage(message, 'Show Details').then(choice => {
          if (choice === 'Show Details') {
            this.showErrorDetails(error, context);
          }
        });
        break;
    }
  }

  /**
   * Format error message for user display
   */
  private static formatErrorMessage(error: Error, context: ErrorContext): string {
    const featureInfo = context.feature ? ` for feature "${context.feature}"` : '';

    // Handle null/undefined errors
    if (!error || !error.message) {
      return `Failed to ${context.operation}${featureInfo}: Unknown error`;
    }

    // Handle known error types
    if (error.message.includes('ENOENT')) {
      return `File not found during ${context.operation}${featureInfo}`;
    }
    if (error.message.includes('EACCES')) {
      return `Permission denied during ${context.operation}${featureInfo}`;
    }
    if (error.message.includes('git')) {
      return `Git error during ${context.operation}${featureInfo}: ${error.message}`;
    }

    // Generic error
    return `Failed to ${context.operation}${featureInfo}: ${error.message}`;
  }

  /**
   * Show detailed error information in output channel
   */
  private static showErrorDetails(error: Error, context: ErrorContext): void {
    const outputChannel = vscode.window.createOutputChannel('Clauding Errors');
    outputChannel.clear();
    outputChannel.appendLine(`Error in ${context.operation}`);
    outputChannel.appendLine(`Time: ${new Date().toISOString()}`);
    if (context.feature) {
      outputChannel.appendLine(`Feature: ${context.feature}`);
    }
    outputChannel.appendLine(`\nError Message:`);
    outputChannel.appendLine(error.message);
    outputChannel.appendLine(`\nStack Trace:`);
    outputChannel.appendLine(error.stack || 'No stack trace available');
    if (context.details) {
      outputChannel.appendLine(`\nAdditional Context:`);
      outputChannel.appendLine(JSON.stringify(context.details, null, 2));
    }
    outputChannel.show();
  }

  /**
   * Show a success notification with optional actions
   */
  public static showSuccess(message: string, actions?: { label: string; callback: () => void }[]): void {
    if (actions && actions.length > 0) {
      vscode.window.showInformationMessage(message, ...actions.map(a => a.label)).then(choice => {
        const action = actions.find(a => a.label === choice);
        if (action) {
          action.callback();
        }
      });
    } else {
      vscode.window.showInformationMessage(message);
    }
  }

  /**
   * Wrap an async operation with error handling
   */
  public static async wrapAsync<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      console.error(`[${context.operation}] Error:`, error);
      this.handle(error as Error, context);
      return null;
    }
  }
}
