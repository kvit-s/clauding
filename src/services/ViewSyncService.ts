import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ClaudingSidebarProvider } from '../providers/ClaudingSidebarProvider';
import { FeatureService } from './FeatureService';
import { WorktreeService } from './WorktreeService';
import { AgentService } from './AgentService';
import { getAbsoluteMetaPath, META_FILES } from '../utils/featureMetaPaths';
import { ITerminalProvider, TerminalType } from '../terminals/ITerminalProvider';

/**
 * ViewSyncService orchestrates bidirectional synchronization between VS Code views
 * (editor, terminal) and the CLAUDING: FEATURES panel.
 *
 * Synchronization flows:
 * 1. Editor → Feature: Opening a file in a feature worktree selects that feature and reveals its terminal
 * 2. Terminal → Feature: Selecting a feature terminal selects that feature and opens plan/prompt
 * 3. Feature → Views: Manually selecting a feature reveals its terminal and opens plan/prompt
 */
export class ViewSyncService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private editorChangeTimeout?: NodeJS.Timeout;
  private terminalChangeTimeout?: NodeJS.Timeout;
  private isHandlingProgrammaticChange = false;
  private isIgnoringNextTerminalChange = false;
  private mainTerminal?: vscode.Terminal;

  // Track the most recently active terminal ID per feature
  private lastActiveTerminalByFeature: Map<string, string> = new Map();

  constructor(
    private sidebarProvider: ClaudingSidebarProvider,
    private featureService: FeatureService,
    private worktreeService: WorktreeService,
    private agentService: AgentService,
    private terminalProvider?: ITerminalProvider
  ) {
    // Register terminal close event listener - use provider if available
    if (terminalProvider) {
      this.disposables.push(
        terminalProvider.onDidCloseTerminal(async terminal => {
          // Convert ITerminal to vscode.Terminal for backward compatibility
          // Find matching VS Code terminal by name
          const vsTerminal = vscode.window.terminals.find(t => t.name === terminal.name);
          if (vsTerminal) {
            await this.handleTerminalClose(vsTerminal);
          }
        })
      );

      // Track terminal activity to remember most recently active terminal per feature
      this.disposables.push(
        terminalProvider.onDidChangeActiveTerminal(terminal => {
          if (terminal && terminal.featureName) {
            // Update the last active terminal for this feature
            this.lastActiveTerminalByFeature.set(terminal.featureName, terminal.id);
          }
        })
      );
    } else {
      // Fallback to VS Code terminal events
      this.disposables.push(
        vscode.window.onDidCloseTerminal(async terminal => {
          await this.handleTerminalClose(terminal);
        })
      );
    }
  }

  /**
   * Handle editor change event - syncs feature selection and reveals terminal
   * Debounced to prevent excessive updates during rapid file switching
   */
  public async handleEditorChange(editor: vscode.TextEditor | undefined): Promise<void> {
    // Clear existing timeout
    if (this.editorChangeTimeout) {
      clearTimeout(this.editorChangeTimeout);
    }

    // Debounce to prevent excessive updates
    this.editorChangeTimeout = setTimeout(async () => {
      if (!editor || this.isHandlingProgrammaticChange) {
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const featureName = this.getFeatureFromFilePath(filePath);

      if (featureName) {
        // Set flag to prevent circular updates
        this.isHandlingProgrammaticChange = true;

        try {
          // Update feature selection in sidebar (programmatic, no view sync)
          await this.sidebarProvider.selectFeature(featureName, true);

          // Reveal feature terminal with focus preservation (user is editing)
          await this.revealFeatureTerminal(featureName, true);
        } finally {
          this.isHandlingProgrammaticChange = false;
        }
      }
    }, 100); // 100ms debounce
  }

  /**
   * Handle terminal change event - syncs feature selection and opens plan/prompt
   * Debounced to prevent excessive updates during rapid terminal switching
   */
  public async handleTerminalChange(terminal: vscode.Terminal | undefined): Promise<void> {
    // Clear existing timeout
    if (this.terminalChangeTimeout) {
      clearTimeout(this.terminalChangeTimeout);
    }

    // Debounce to prevent excessive updates
    this.terminalChangeTimeout = setTimeout(async () => {
      // Check if we should ignore this terminal change (e.g., due to terminal closure)
      if (this.isIgnoringNextTerminalChange) {
        this.isIgnoringNextTerminalChange = false;
        return;
      }

      if (!terminal || this.isHandlingProgrammaticChange) {
        return;
      }

      const featureName = this.getFeatureFromTerminal(terminal);

      if (featureName) {
        // Set flag to prevent circular updates
        this.isHandlingProgrammaticChange = true;

        try {
          // Update feature selection in sidebar (programmatic, no view sync)
          await this.sidebarProvider.selectFeature(featureName, true);

          // Open plan/prompt with focus preservation (user is in terminal)
          await this.openFeaturePlanOrPrompt(featureName, true);
        } finally {
          this.isHandlingProgrammaticChange = false;
        }
      }
    }, 100); // 100ms debounce
  }

  /**
   * Handle manual feature selection from sidebar - reveals terminal and opens plan/prompt
   * This is triggered when user clicks a feature in the webview panel
   */
  public async handleManualFeatureSelection(featureName: string): Promise<void> {
    if (this.isHandlingProgrammaticChange) {
      return;
    }

    // Set flag to prevent circular updates
    this.isHandlingProgrammaticChange = true;

    try {
      // Reveal terminal without focus preservation (user wants full context switch)
      await this.revealFeatureTerminal(featureName, false);

      // Open plan/prompt without focus preservation (user wants full context switch)
      await this.openFeaturePlanOrPrompt(featureName, false);
    } finally {
      this.isHandlingProgrammaticChange = false;
    }
  }

  /**
   * Extract feature name from file path
   * Returns null if file is not in a feature worktree
   */
  public getFeatureFromFilePath(filePath: string): string | null {
    // Get the worktrees directory from workspace configuration
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    // Build expected worktrees path pattern: .clauding/worktrees/{featureName}/
    const worktreesPattern = path.join(workspaceFolder.uri.fsPath, '.clauding', 'worktrees');

    // Check if file path contains the worktrees directory
    if (!filePath.startsWith(worktreesPattern)) {
      return null;
    }

    // Extract feature name from path
    // Pattern: /.clauding/worktrees/{featureName}/...
    const relativePath = path.relative(worktreesPattern, filePath);
    const parts = relativePath.split(path.sep);

    if (parts.length === 0) {
      return null;
    }

    const featureName = parts[0];

    // Validate that the feature actually exists
    const feature = this.featureService.getFeature(featureName);
    if (!feature) {
      return null;
    }

    return featureName;
  }

  /**
   * Extract feature name from terminal name
   * Parses patterns:
   * - Agent terminals: "clauding: {featureName}-{commandName}"
   * - Console terminals: "Clauding: {featureName}"
   * Returns null for main terminal ("bash - clauding") or non-feature terminals
   */
  public getFeatureFromTerminal(terminal: vscode.Terminal): string | null {
    const terminalName = terminal.name;

    // Check for agent terminal pattern: "clauding: {feature}-{command}"
    if (terminalName.startsWith('clauding: ')) {
      const afterPrefix = terminalName.substring('clauding: '.length);
      // Extract feature name (everything before the last dash)
      const lastDashIndex = afterPrefix.lastIndexOf('-');
      if (lastDashIndex > 0) {
        const featureName = afterPrefix.substring(0, lastDashIndex);

        // Validate that the feature exists
        const feature = this.featureService.getFeature(featureName);
        if (feature) {
          return featureName;
        }
      }
    }

    // Check for console terminal pattern: "Clauding: {feature}"
    if (terminalName.startsWith('Clauding: ')) {
      const featureName = terminalName.substring('Clauding: '.length);

      // Validate that the feature exists
      const feature = this.featureService.getFeature(featureName);
      if (feature) {
        return featureName;
      }
    }

    // Main terminal or non-feature terminal
    return null;
  }

  /**
   * Reveal the terminal for a feature
   * Shows the most recently active terminal if any exist, otherwise shows global base terminal
   * @param featureName - Name of the feature
   * @param preserveFocus - If true, terminal is revealed without stealing focus
   */
  public async revealFeatureTerminal(featureName: string, preserveFocus: boolean): Promise<void> {
    // Get terminals from the terminal provider (works with both VSCode and tmux)
    const activeTerminals = this.terminalProvider?.getTerminalsByFeature(featureName) || [];

    if (activeTerminals.length > 0) {
      // Find the most recently active terminal for this feature
      const lastActiveTerminal = this.findMostRecentlyActiveTerminal(activeTerminals, featureName);

      if (lastActiveTerminal) {
        // Show the most recently active terminal
        // For tmux: this calls TmuxTerminal.show() → TmuxUIManager.switchToWindow()
        // which ensures the VSCode tmux terminal exists, selects the correct tmux window,
        // and shows the VSCode terminal
        // For VSCode: this shows the terminal
        lastActiveTerminal.show(preserveFocus);
      } else {
        // Fallback to first terminal if we can't determine most recent
        activeTerminals[0].show(preserveFocus);
      }
    } else {
      // No feature terminals found - look for global base terminal
      const allTerminals = this.terminalProvider?.getActiveTerminals() || [];
      const globalBaseTerminal = allTerminals.find(t => t.isBase && !t.featureName);

      if (globalBaseTerminal) {
        // Show the global base terminal using the same mechanism as feature terminals
        // This works for both tmux and VSCode backends
        globalBaseTerminal.show(preserveFocus);
      } else {
        // If no global base terminal exists yet, create it
        await this.ensureMainTerminal();

        // Now find and show it
        const allTerminalsAfter = this.terminalProvider?.getActiveTerminals() || [];
        const newGlobalBase = allTerminalsAfter.find(t => t.isBase && !t.featureName);
        if (newGlobalBase) {
          newGlobalBase.show(preserveFocus);
        }
      }
    }
  }

  /**
   * Find the most recently active terminal for a feature
   * @param terminals - List of terminals for the feature
   * @param featureName - Name of the feature
   * @returns The most recently active terminal, or null if none found
   */
  private findMostRecentlyActiveTerminal(
    terminals: import('../terminals/ITerminalProvider').ITerminal[],
    featureName: string
  ): import('../terminals/ITerminalProvider').ITerminal | null {
    // Retrieve last active terminal ID for this feature from tracking map
    const lastActiveTerminalId = this.lastActiveTerminalByFeature.get(featureName);

    if (lastActiveTerminalId) {
      // Find the terminal with matching ID
      const terminal = terminals.find(t => t.id === lastActiveTerminalId);
      if (terminal) {
        return terminal;
      }
    }

    // If no last active terminal tracked, prefer non-base terminals over base terminals
    // This ensures agent/test terminals are shown if they exist
    const nonBaseTerminal = terminals.find(t => !t.isBase);
    if (nonBaseTerminal) {
      return nonBaseTerminal;
    }

    // Otherwise return null to use fallback (first terminal)
    return null;
  }

  /**
   * Ensure the global base terminal exists, creating it if necessary
   * The global base terminal is a fallback terminal shown when a feature has no terminals
   * It auto-relaunches when closed (handled by the terminal provider)
   */
  public async ensureMainTerminal(): Promise<void> {
    if (!this.terminalProvider) {
      throw new Error('Terminal provider is not initialized');
    }

    // Check if a global base terminal already exists using the centralized method
    const existingGlobalBase = this.terminalProvider.getGlobalBaseTerminal();

    if (existingGlobalBase) {
      // Global base terminal already exists, nothing to do
      return;
    }

    // Create new global base terminal via terminal provider
    // The terminal provider will check for existing terminals and reuse them if found
    // It will also track the terminal and handle auto-relaunch when closed
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder?.uri.fsPath || process.cwd();

    await this.terminalProvider.createTerminal({
      name: 'base - clauding',
      type: TerminalType.Console,
      cwd: cwd,
      featureName: undefined, // Global terminal, not associated with any feature
      isBase: true, // Enable auto-relaunch by provider
      show: false // Don't show yet
    });
  }

  /**
   * Open plan.md or prompt.md for a feature
   * Prefers plan.md, falls back to prompt.md if plan doesn't exist
   * @param featureName - Name of the feature
   * @param preserveFocus - If true, file is opened without stealing focus
   */
  public async openFeaturePlanOrPrompt(featureName: string, preserveFocus: boolean): Promise<void> {
    const feature = this.featureService.getFeature(featureName);
    if (!feature) {
      return;
    }

    // Try plan.md first
    const planPath = getAbsoluteMetaPath(feature.worktreePath, featureName, META_FILES.PLAN);
    if (fs.existsSync(planPath)) {
      const uri = vscode.Uri.file(planPath);
      await vscode.window.showTextDocument(uri, { preview: false, preserveFocus });
      return;
    }

    // Fall back to prompt.md
    const promptPath = getAbsoluteMetaPath(feature.worktreePath, featureName, META_FILES.PROMPT);
    if (fs.existsSync(promptPath)) {
      const uri = vscode.Uri.file(promptPath);
      await vscode.window.showTextDocument(uri, { preview: false, preserveFocus });
      return;
    }

    // Neither file exists - this is unusual but not an error
    // (feature might be in a weird state)
  }

  /**
   * Handle terminal close event - maintains current feature selection
   * When a terminal is closed, VSCode auto-selects the next terminal, triggering
   * onDidChangeActiveTerminal. This handler prevents that auto-selection from
   * changing the feature, and instead activates the appropriate terminal for
   * the current feature (first available feature terminal or main terminal).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async handleTerminalClose(_terminal: vscode.Terminal): Promise<void> {
    // Set flag to ignore the next terminal change event from VSCode's auto-selection
    this.isIgnoringNextTerminalChange = true;

    // Get the currently selected feature
    const currentFeatureName = this.sidebarProvider.getSelectedFeatureName();

    if (currentFeatureName) {
      // Maintain the current feature by activating its terminal
      // This mimics the behavior of manual feature selection
      await this.revealFeatureTerminal(currentFeatureName, false);
    }

    // Fallback timeout to reset flag after 500ms
    // This prevents the flag from staying set if the terminal change event
    // doesn't fire for some reason
    setTimeout(() => {
      this.isIgnoringNextTerminalChange = false;
    }, 500);
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.editorChangeTimeout) {
      clearTimeout(this.editorChangeTimeout);
    }
    if (this.terminalChangeTimeout) {
      clearTimeout(this.terminalChangeTimeout);
    }
    this.disposables.forEach(d => d.dispose());
  }
}
