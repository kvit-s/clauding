import * as vscode from 'vscode';

/**
 * Builds the HTML content for the webview
 */
export class WebviewHtmlBuilder {
  constructor(private readonly extensionUri: vscode.Uri) {}

  /**
   * Generate the HTML for the webview
   * @param webview The webview instance
   * @returns The HTML string
   */
  getHtmlForWebview(webview: vscode.Webview): string {
    // Get path to the webview bundle
    const scriptPath = vscode.Uri.joinPath(
      this.extensionUri,
      'webview',
      'dist',
      'webview.js'
    );
    const scriptUri = webview.asWebviewUri(scriptPath);

    // Get path to codicon font
    const codiconCssPath = vscode.Uri.joinPath(
      this.extensionUri,
      'node_modules',
      '@vscode/codicons',
      'dist',
      'codicon.css'
    );
    const codiconCssUri = webview.asWebviewUri(codiconCssPath);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource};">
      <link rel="stylesheet" href="${codiconCssUri}">
      <title>Clauding</title>
      ${this.getStyles()}
    </head>
    <body>
      <div id="root"></div>
      <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }

  /**
   * Get the CSS styles for the webview
   * @returns The style tag with CSS
   */
  private getStyles(): string {
    return `<style>
        body {
          padding: 0;
          margin: 0;
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          color: var(--vscode-foreground);
          background-color: var(--vscode-sideBar-background);
        }
        .app {
          display: flex;
          flex-direction: column;
          height: 100vh;
        }
        .feature-list {
          border-bottom: 1px solid var(--vscode-panel-border);
          padding: 0;
        }
        .search-active-indicator {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 8px;
          background: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          font-size: 12px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .search-text {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .search-reset-button {
          background: transparent;
          border: none;
          color: var(--vscode-badge-foreground);
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
          padding: 0 4px;
          margin-left: 8px;
          opacity: 0.8;
          flex-shrink: 0;
          transition: opacity 0.15s ease;
        }
        .search-reset-button:hover {
          opacity: 1;
        }
        .search-reset-button:active {
          opacity: 0.6;
        }
        .feature-items {
          max-height: 27vh;
          overflow-y: auto;
          position: relative;
        }
        .feature-item {
          padding: 0 4px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          line-height: 22px;
          height: 22px;
        }
        .feature-item:hover {
          background: var(--vscode-list-hoverBackground);
        }
        .feature-item.selected {
          background: var(--vscode-list-activeSelectionBackground);
          color: var(--vscode-list-activeSelectionForeground);
        }
        .feature-item-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .feature-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .feature-item-icons {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: 8px;
          flex-shrink: 0;
        }
        .feature-status-icon {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          line-height: 1;
          cursor: pointer;
        }
        .resize-splitter {
          height: 4px;
          background: var(--vscode-panel-border);
          cursor: ns-resize;
          position: relative;
          z-index: 10;
        }
        .resize-splitter:hover {
          background: var(--vscode-focusBorder);
        }
        .feature-panel {
          padding: 10px;
          flex: 1;
          overflow-y: auto;
        }
        .feature-header {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }
        .feature-header h3 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
        }
        .status-icon {
          margin-left: 8px;
          font-size: 16px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
        }
        .status-message {
          padding: 8px;
          margin: 10px 0;
          border-radius: 3px;
          border-left: 3px solid;
        }
        .status-info { border-color: var(--vscode-notificationsInfoIcon-foreground); }
        .status-working { border-color: var(--vscode-charts-blue); }
        .status-error { border-color: var(--vscode-notificationsErrorIcon-foreground); }
        .status-success { border-color: var(--vscode-testing-iconPassed); }
        .status-waiting { border-color: var(--vscode-charts-orange); }

        /* Message Panel Styles */
        .message-panel {
          height: 90px;
          overflow-y: auto;
          margin: 10px 0;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 3px;
          background: var(--vscode-editor-background);
        }
        .message {
          padding: 4px;
          margin: 2px 0;
          font-size: 12px;
          line-height: 1.5;
        }
        .message-time {
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
        }
        .message-separator {
          color: var(--vscode-descriptionForeground);
        }
        .message-text {
          font-size: 12px;
          color: var(--vscode-foreground);
        }
        .message-dismiss {
          background: none;
          border: none;
          color: var(--vscode-foreground);
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 0 4px;
          opacity: 0.6;
          margin-left: 4px;
        }
        .message-dismiss:hover {
          opacity: 1;
        }
        .message-action-link {
          color: var(--vscode-textLink-foreground);
          cursor: pointer;
          text-decoration: none;
          font-size: 12px;
        }
        .message-action-link:hover {
          color: var(--vscode-textLink-activeForeground);
          text-decoration: underline;
        }

        .files-list, .commands-panel, .timelog-panel {
          margin: 15px 0;
        }
        .file-item, .command-button, .timelog-link {
          cursor: pointer;
          color: var(--vscode-textLink-foreground);
        }
        .file-item:hover, .timelog-link:hover {
          text-decoration: underline;
        }
        .command-button {
          display: block;
          width: 100%;
          margin: 5px 0;
          padding: 6px 8px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: none;
          text-align: left;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
        }
        .command-button:hover:not(:disabled) {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .command-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        /* Agent command row - button + selector */
        .agent-command-row {
          display: flex;
          gap: 4px;
          align-items: center;
          width: 100%;
          margin: 5px 0;
        }
        .agent-command-row .command-button {
          width: auto;
          flex: 1 1 auto;
          min-width: 0;
          margin: 0;
          max-width: 100%;
        }
        .agent-selector {
          flex: 0 0 70px;
          width: 70px;
          padding: 4px 6px;
          font-size: 11px;
          background-color: var(--vscode-dropdown-background);
          color: var(--vscode-dropdown-foreground);
          border: 1px solid var(--vscode-dropdown-border);
          border-radius: 2px;
          cursor: pointer;
          text-align: right;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .agent-selector:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .agent-selector:hover:not(:disabled) {
          background-color: var(--vscode-dropdown-listBackground);
        }
        .agent-selector option {
          background-color: var(--vscode-dropdown-background);
          color: var(--vscode-dropdown-foreground);
        }
        .apply-button {
          display: block;
          width: 100%;
          margin: 10px 0;
          padding: 8px;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          font-weight: bold;
          cursor: pointer;
        }
        .apply-button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        .timelog-header {
          cursor: pointer;
          font-weight: bold;
          padding: 5px 0;
        }
        .timelog-entry {
          font-size: 12px;
          padding: 4px 0;
          color: var(--vscode-descriptionForeground);
        }
        .empty-message {
          color: var(--vscode-descriptionForeground);
          font-style: italic;
          padding: 10px 0;
        }
        .file-tree {
          margin-top: 8px;
        }
        .tree-node {
          padding: 4px 0;
          cursor: pointer;
          user-select: none;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .tree-node:hover {
          background: var(--vscode-list-hoverBackground);
        }
        .tree-icon {
          font-size: 12px;
          flex-shrink: 0;
          width: 16px;
          display: inline-block;
        }
        .tree-label {
          flex: 1;
        }
        .directory-node {
          font-weight: 500;
        }
        .file-node {
          cursor: pointer;
        }
        .git-status-marker {
          font-size: 11px;
          margin-left: auto;
          font-weight: 600;
        }
        .loading-message {
          color: var(--vscode-descriptionForeground);
          font-style: italic;
          padding: 8px 0;
        }

        /* Activity Icon Styles */
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .activity-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          cursor: pointer;
          opacity: 0.7;
          font-size: 14px;
        }

        .activity-icon:hover {
          opacity: 1;
        }

        .activity-icon.spinning {
          animation: spin 1s linear infinite;
        }

        .activity-icon.pulsing {
          animation: pulse 2s ease-in-out infinite;
        }

        /* Codicon spin animation */
        .codicon-modifier-spin {
          animation: spin 1s linear infinite;
        }

        .activity-indicator {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .tool-badge {
          background: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          margin-left: 4px;
        }

        .activity-tooltip {
          position: fixed;
          background: var(--vscode-editorHoverWidget-background);
          border: 1px solid var(--vscode-editorHoverWidget-border);
          padding: 8px;
          border-radius: 4px;
          font-size: 12px;
          z-index: 1000;
          max-width: 300px;
          word-wrap: break-word;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          pointer-events: none;
        }

        .terminal-list {
          list-style: none;
          padding: 0;
          margin: 4px 0 0 0;
        }

        .terminal-list-item {
          padding: 2px 4px;
          cursor: pointer;
          border-radius: 2px;
        }

        .terminal-list-item:hover {
          background: var(--vscode-list-hoverBackground);
        }

        /* Feature Prompt Tooltip Styles */
        .feature-prompt-tooltip {
          position: fixed;
          background: var(--vscode-editorHoverWidget-background);
          border: 1px solid var(--vscode-editorHoverWidget-border);
          padding: 8px;
          border-radius: 4px;
          font-size: 12px;
          z-index: 1000;
          max-width: 400px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          pointer-events: none;
        }

        .feature-prompt-tooltip-header {
          font-weight: bold;
          margin-bottom: 4px;
        }

        .feature-prompt-tooltip-content {
          white-space: pre-wrap;
          word-wrap: break-word;
          max-height: 200px;
          overflow-y: auto;
        }

        /* Feature Status Tooltip Styles */
        .feature-status-tooltip {
          position: fixed;
          background: var(--vscode-editorHoverWidget-background);
          border: 1px solid var(--vscode-editorHoverWidget-border);
          padding: 8px;
          border-radius: 4px;
          font-size: 12px;
          z-index: 1000;
          max-width: 250px;
          word-wrap: break-word;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          pointer-events: none;
        }

        /* Feature Prompt Section Styles */
        .feature-prompt-section {
          margin-bottom: 16px;
          padding: 8px;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }

        .feature-prompt-header {
          font-weight: bold;
          margin-bottom: 6px;
          color: var(--vscode-foreground);
        }

        .feature-prompt-content {
          font-family: var(--vscode-editor-font-family);
          font-size: 12px;
          white-space: pre-wrap;
          word-wrap: break-word;
          max-height: 150px;
          overflow-y: auto;
          color: var(--vscode-editor-foreground);
        }

        /* Feature Panel Toolbar Styles */
        .feature-panel-toolbar {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          padding: 8px;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }
        .toolbar-rename-button {
          flex: 1;
          padding: 6px 12px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        }
        .toolbar-rename-button:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .toolbar-delete-button {
          flex: 1;
          padding: 6px 12px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-errorForeground);
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s, color 0.2s;
        }
        .toolbar-delete-button:hover {
          background: var(--vscode-button-secondaryHoverBackground);
          color: var(--vscode-notificationsErrorIcon-foreground);
        }

        /* Archived features styling */
        .feature-item.archived {
          opacity: 0.85;
        }
        .feature-item.archived .feature-name {
          font-style: italic;
        }

        /* Archived feature info message */
        .archived-info-message {
          padding: 8px 12px;
          margin: 8px 0;
          background: var(--vscode-textBlockQuote-background);
          border-left: 3px solid var(--vscode-textBlockQuote-border);
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
        }

        .feature-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }

        .feature-header h3 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Terminal Section Styles */
        .terminals-section {
          margin: 12px 0;
          padding: 8px 12px;
          background: var(--vscode-editor-background);
          border-radius: 4px;
        }

        .terminals-section .section-header {
          font-weight: bold;
          margin-bottom: 8px;
          color: var(--vscode-foreground);
        }

        .terminals-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .terminal-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 8px;
          background: var(--vscode-list-inactiveSelectionBackground);
          border-radius: 3px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .terminal-item:hover {
          background: var(--vscode-list-hoverBackground);
        }

        .terminal-item-main {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }

        .terminal-type-icon {
          display: flex;
          align-items: center;
          opacity: 0.8;
        }

        .terminal-name {
          font-family: var(--vscode-editor-font-family);
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }

        .terminal-activity-indicator {
          font-size: 14px;
          margin-left: 4px;
        }

        .terminal-close-button {
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--vscode-foreground);
          cursor: pointer;
          opacity: 0.6;
          padding: 2px 4px;
          border-radius: 3px;
          transition: opacity 0.15s ease, background 0.15s ease;
        }

        .terminal-close-button:hover {
          opacity: 1;
          background: var(--vscode-toolbar-hoverBackground);
        }

        .terminal-close-button:active {
          background: var(--vscode-toolbar-activeBackground);
        }
      </style>`;
  }
}
