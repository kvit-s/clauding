import * as vscode from 'vscode';

export interface NotificationOptions {
  modal?: boolean;
  actions?: { label: string; callback: () => void }[];
}

export class NotificationService {
  constructor() {
    // Status bar removed - unused in production code
  }

  /**
   * Show info notification
   */
  public info(message: string, options?: NotificationOptions): void {
    if (options?.modal) {
      this.showModal(message, 'information', options.actions);
    } else {
      this.showMessage(message, 'info', options?.actions);
    }
  }

  /**
   * Show warning notification
   */
  public warning(message: string, options?: NotificationOptions): void {
    if (options?.modal) {
      this.showModal(message, 'warning', options.actions);
    } else {
      this.showMessage(message, 'warning', options?.actions);
    }
  }

  /**
   * Show error notification
   */
  public error(message: string, options?: NotificationOptions): void {
    if (options?.modal) {
      this.showModal(message, 'error', options.actions);
    } else {
      this.showMessage(message, 'error', options?.actions);
    }
  }

  /**
   * Show success notification with checkmark
   */
  public success(message: string, options?: NotificationOptions): void {
    this.info(`✓ ${message}`, options);
  }

  /**
   * Show progress notification
   */
  public async withProgress<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string }>) => Promise<T>
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: title,
        cancellable: false
      },
      task
    );
  }

  private showMessage(
    message: string,
    type: 'info' | 'warning' | 'error',
    actions?: { label: string; callback: () => void }[]
  ): void {
    const actionLabels = actions?.map(a => a.label) || [];

    const showMethod =
      type === 'info' ? vscode.window.showInformationMessage :
      type === 'warning' ? vscode.window.showWarningMessage :
      vscode.window.showErrorMessage;

    showMethod(message, ...actionLabels).then(choice => {
      const action = actions?.find(a => a.label === choice);
      if (action) {
        action.callback();
      }
    });
  }

  private async showModal(
    message: string,
    type: 'information' | 'warning' | 'error',
    actions?: { label: string; callback: () => void }[]
  ): Promise<void> {
    const actionLabels = actions?.map(a => a.label) || [];

    const showMethod =
      type === 'information' ? vscode.window.showInformationMessage :
      type === 'warning' ? vscode.window.showWarningMessage :
      vscode.window.showErrorMessage;

    const choice = await showMethod(message, { modal: true }, ...actionLabels);
    const action = actions?.find(a => a.label === choice);
    if (action) {
      action.callback();
    }
  }

  public dispose(): void {
    // Nothing to dispose since status bar was removed
  }
}
