import * as vscode from 'vscode';
import { FeatureService } from '../services/FeatureService';
import { WorktreeService } from '../services/WorktreeService';
import { TimelogService } from '../services/TimelogService';
import { MessageService } from '../services/MessageService';
import { FileCheckService } from '../services/FileCheckService';
import { GitService } from '../services/GitService';
import { AgentService } from '../services/AgentService';
import { ConfigService } from '../services/ConfigService';
import { ValidationService } from '../utils/ValidationService';
import { ITerminalProvider } from '../terminals/ITerminalProvider';
import { FeatureSearchService } from '../services/FeatureSearchService';

// Import refactored components
import { MessageRouter } from './sidebar/MessageRouter';
import { MessageHandler } from './sidebar/MessageHandler';
import { WebviewHtmlBuilder } from './sidebar/WebviewHtmlBuilder';
import { SidebarViewState } from './sidebar/SidebarViewState';
import { WebviewUpdater } from './sidebar/WebviewUpdater';
import { FileTreeBuilder } from './sidebar/FileTreeBuilder';
import { DebugConfigurationManager } from './sidebar/DebugConfigurationManager';
import { FeatureCommandOrchestrator } from './sidebar/FeatureCommandOrchestrator';
import { MergeConflictOrchestrator } from './sidebar/MergeConflictOrchestrator';
import { UIUpdateCoordinator } from '../ui/UIUpdateCoordinator';

// Import handlers
import {
  CreateFeatureHandler,
  SelectFeatureHandler,
  OpenFileHandler,
  OpenFileAtCommitHandler,
  OpenCommitDiffHandler,
  DeleteFeatureHandler,
  RenameFeatureHandler,
  CommitHandler,
  RunTestsHandler,
  OpenConsoleHandler,
  OpenFolderHandler,
  DismissMessageHandler,
  ActivateTerminalHandler,
  CloseTerminalHandler,
  GetFileTreeHandler,
  RunHandler,
  MergeHandler,
  UpdateFromMainHandler,
  ExecuteAgentCommandHandler,
  ApplyPendingCommandHandler,
  MessageActionHandler,
  ToggleArchiveViewHandler,
  ReactivateFeatureHandler
} from './sidebar/handlers';

/**
 * Refactored ClaudingSidebarProvider - much cleaner and more maintainable!
 */
export class ClaudingSidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private viewSyncService?: { handleManualFeatureSelection(featureName: string): Promise<void> };

  // Core components
  private readonly messageRouter: MessageRouter;
  private readonly htmlBuilder: WebviewHtmlBuilder;
  private readonly viewState: SidebarViewState;
  private readonly webviewUpdater: WebviewUpdater;
  private readonly fileTreeBuilder: FileTreeBuilder;
  private readonly debugConfigManager: DebugConfigurationManager;
  private readonly commandOrchestrator: FeatureCommandOrchestrator;
  private readonly mergeOrchestrator: MergeConflictOrchestrator;

  // New architecture components
  private stateManager?: import('../state/FeatureStateManager').FeatureStateManager;
  private uiUpdateCoordinator?: UIUpdateCoordinator;
  private logger?: vscode.LogOutputChannel;
  private agentStatusTracker?: import('../services/AgentStatusTracker').AgentStatusTracker;

  // Track most recently selected active feature for smart selection when toggling back to active view
  private lastSelectedActiveFeature: string | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
    private readonly featureService: FeatureService,
    private readonly worktreeService: WorktreeService,
    private readonly timelogService: TimelogService,
    private readonly gitService: GitService,
    private readonly messageService: MessageService,
    private readonly agentService: AgentService,
    private readonly terminalProvider: ITerminalProvider,
    private readonly configService: ConfigService,
    private readonly commitMessagePrefix: string,
    private readonly projectRoot: string,
    private readonly searchService: FeatureSearchService
  ) {
    // Initialize core components
    this.viewState = new SidebarViewState(context);
    this.htmlBuilder = new WebviewHtmlBuilder(extensionUri);
    this.webviewUpdater = new WebviewUpdater(featureService, timelogService, this.viewState, configService, searchService);
    this.fileTreeBuilder = new FileTreeBuilder(featureService, gitService, projectRoot);
    this.debugConfigManager = new DebugConfigurationManager();
    this.commandOrchestrator = new FeatureCommandOrchestrator(
      featureService,
      new FileCheckService(),
      messageService,
      gitService,
      worktreeService['worktreesDir']
    );
    this.mergeOrchestrator = new MergeConflictOrchestrator(
      featureService,
      gitService,
      agentService,
      messageService
    );

    // Initialize message router and register handlers
    this.messageRouter = new MessageRouter();
    this.registerMessageHandlers();

    // Subscribe to terminal activity events to trigger UI updates
    if (this.terminalProvider.onDidDetectActivity) {
      this.terminalProvider.onDidDetectActivity(() => {
        // Terminal activity detected - update webview to show new activity state
        this.updateWebview();
      });
    }

    if (this.terminalProvider.onDidDetectIdle) {
      this.terminalProvider.onDidDetectIdle(() => {
        // Terminal became idle - update webview to show idle state
        this.updateWebview();
      });
    }

    // Subscribe to terminal close events to trigger UI updates
    this.terminalProvider.onDidCloseTerminal(() => {
      // Terminal closed - update webview to remove it from the list
      this.updateWebview();
    });
  }

  /**
   * Set the agent status tracker and subscribe to idle events for auto-opening plan.md
   */
  private setupAgentIdleHandler(): void {
    if (!this.agentStatusTracker) {
      return;
    }

    // Subscribe to agent idle events for auto-opening plan.md
    this.agentStatusTracker.onAgentIdle(async (featureName: string) => {
      await this.handleAgentIdleForPlanAutoOpen(featureName);
    });
  }

  /**
   * Handle agent idle event for auto-opening plan.md
   */
  private async handleAgentIdleForPlanAutoOpen(featureName: string): Promise<void> {
    try {
      const feature = this.featureService.getFeature(featureName);
      if (!feature) {
        return;
      }

      // Check if plan.md exists
      const planPath = vscode.Uri.joinPath(vscode.Uri.file(feature.worktreePath), '.clauding', 'plan.md');

      try {
        // Check if file exists
        await vscode.workspace.fs.stat(planPath);

        // Check if plan.md is already open
        const isAlreadyOpen = vscode.window.visibleTextEditors.some(
          editor => editor.document.uri.fsPath === planPath.fsPath
        );

        if (!isAlreadyOpen) {
          // Open plan.md using the OpenFileHandler
          const openFileHandler = new OpenFileHandler(
            this.featureService,
            this.messageService,
            () => this.updateWebview(),
            this.projectRoot
          );

          await openFileHandler.handle({
            command: 'openFile',
            featureName,
            fileName: 'plan.md'
          });
        }
      } catch (error) {
      }
    } catch (error) {
      // Silently ignore errors - this is a best-effort auto-open feature
      console.error('Error in handleAgentIdleForPlanAutoOpen:', error);
    }
  }

  /**
   * Register all message handlers with the router
   */
  private registerMessageHandlers(): void {
    // Simple handlers - using an inline class that extends MessageHandler
    class GetFeaturesHandler extends MessageHandler {
      constructor(
        featureService: FeatureService,
        messageService: MessageService,
        private readonly updateCallback: () => void
      ) {
        super(featureService, messageService);
      }
      async handle(): Promise<void> {
        console.log('Handling getFeatures');
        this.updateCallback();
      }
    }

    class PromptForFeatureNameHandler extends MessageHandler {
      constructor(
        featureService: FeatureService,
        messageService: MessageService,
        private readonly promptCallback: () => Promise<void>
      ) {
        super(featureService, messageService);
      }
      async handle(): Promise<void> {
        console.log('Prompting for feature name');
        await this.promptCallback();
      }
    }

    class ResolveMergeConflictsHandler extends MessageHandler {
      constructor(featureService: FeatureService, messageService: MessageService) {
        super(featureService, messageService);
      }
      async handle(): Promise<void> {
        // This is handled differently - conflicts are resolved via dialog
        console.warn('resolveMergeConflicts should be handled via dialog, not as a direct message');
      }
    }

    this.messageRouter.registerHandler(
      'getFeatures',
      new GetFeaturesHandler(this.featureService, this.messageService, () => this.updateWebview())
    );

    this.messageRouter.registerHandler(
      'promptForFeatureName',
      new PromptForFeatureNameHandler(this.featureService, this.messageService, () => this.promptForFeatureName())
    );

    class PromptForRenameHandler extends MessageHandler<{ command: 'promptForRename'; featureName: string }> {
      constructor(
        featureService: FeatureService,
        messageService: MessageService,
        private readonly promptCallback: (featureName: string) => Promise<void>
      ) {
        super(featureService, messageService);
      }
      async handle(message: { command: 'promptForRename'; featureName: string }): Promise<void> {
        await this.promptCallback(message.featureName);
      }
    }

    this.messageRouter.registerHandler(
      'promptForRename',
      new PromptForRenameHandler(this.featureService, this.messageService, (featureName: string) => this.promptForRename(featureName))
    );

    this.messageRouter.registerHandler(
      'createFeature',
      new CreateFeatureHandler(
        this.featureService,
        this.messageService,
        this.worktreeService,
        this.gitService,
        this.commitMessagePrefix,
        this.terminalProvider,
        async (featureName: string) => {
          // Switch to active view if currently viewing archived
          if (this.viewState.getViewMode() === 'archived') {
            this.viewState.setViewMode('active');
          }
          // Auto-select the created feature and update UI
          this.viewState.setSelectedFeatureName(featureName);
          this.updateWebview();
        }
      )
    );

    this.messageRouter.registerHandler(
      'selectFeature',
      new SelectFeatureHandler(
        this.featureService,
        this.messageService,
        async (featureName: string, skipViewSync: boolean) => {
          await this.selectFeature(featureName, skipViewSync);
        }
      )
    );

    this.messageRouter.registerHandler(
      'openFile',
      new OpenFileHandler(
        this.featureService,
        this.messageService,
        () => this.updateWebview(),
        this.projectRoot
      )
    );

    this.messageRouter.registerHandler(
      'openFileAtCommit',
      new OpenFileAtCommitHandler(
        this.featureService,
        this.messageService,
        () => this.updateWebview()
      )
    );

    this.messageRouter.registerHandler(
      'openCommitDiff',
      new OpenCommitDiffHandler(
        this.featureService,
        this.messageService,
        () => this.updateWebview()
      )
    );

    this.messageRouter.registerHandler(
      'deleteFeature',
      new DeleteFeatureHandler(
        this.featureService,
        this.messageService,
        this.worktreeService,
        this.gitService,
        this.timelogService,
        this.commitMessagePrefix,
        (featureName: string) => {
          // Clear selection if deleted feature was selected
          if (this.viewState.getSelectedFeatureName() === featureName) {
            this.viewState.setSelectedFeatureName(null);
          }
          // Invalidate cache and update UI
          this.featureService.invalidateCache();
          this.updateWebview();
        }
      )
    );

    this.messageRouter.registerHandler(
      'renameFeature',
      new RenameFeatureHandler(
        this.featureService,
        this.messageService,
        this.worktreeService,
        this.gitService,
        (oldName: string, newName: string) => {
          // Update selection if renamed feature was selected
          if (this.viewState.getSelectedFeatureName() === oldName) {
            this.viewState.setSelectedFeatureName(newName);
          }
          // Invalidate cache and update UI
          this.featureService.invalidateCache();
          this.updateWebview();
        }
      )
    );

    this.messageRouter.registerHandler(
      'commit',
      new CommitHandler(
        this.featureService,
        this.messageService,
        this.gitService,
        this.timelogService,
        () => this.updateWebview(),
        (featureName: string) => this.refreshFileTree(featureName)
      )
    );

    this.messageRouter.registerHandler(
      'runTests',
      new RunTestsHandler(
        this.featureService,
        this.messageService,
        () => this.updateWebview()
      )
    );

    this.messageRouter.registerHandler(
      'openconsole',
      new OpenConsoleHandler(
        this.featureService,
        this.messageService,
        this.terminalProvider,
        () => this.updateWebview()
      )
    );

    this.messageRouter.registerHandler(
      'openfolder',
      new OpenFolderHandler(
        this.featureService,
        this.messageService,
        () => this.updateWebview()
      )
    );

    this.messageRouter.registerHandler(
      'dismissMessage',
      new DismissMessageHandler(
        this.featureService,
        this.messageService,
        () => this.updateWebview()
      )
    );

    this.messageRouter.registerHandler(
      'activateTerminal',
      new ActivateTerminalHandler(
        this.featureService,
        this.messageService,
        this.terminalProvider
      )
    );

    this.messageRouter.registerHandler(
      'closeTerminal',
      new CloseTerminalHandler(
        this.featureService,
        this.messageService,
        this.terminalProvider
      )
    );

    this.messageRouter.registerHandler(
      'getFileTree',
      new GetFileTreeHandler(
        this.featureService,
        this.messageService,
        this.fileTreeBuilder,
        () => this.view?.webview
      )
    );

    this.messageRouter.registerHandler(
      'run',
      new RunHandler(
        this.featureService,
        this.messageService,
        this.debugConfigManager,
        this.terminalProvider,
        () => this.updateWebview()
      )
    );

    this.messageRouter.registerHandler(
      'merge',
      new MergeHandler(
        this.featureService,
        this.messageService,
        this.mergeOrchestrator,
        this.viewState,
        () => this.updateWebview(),
        (featureName: string) => this.refreshFileTree(featureName)
      )
    );

    this.messageRouter.registerHandler(
      'updateFromMain',
      new UpdateFromMainHandler(
        this.featureService,
        this.messageService,
        this.mergeOrchestrator,
        this.commandOrchestrator,
        () => this.updateWebview(),
        (featureName: string) => this.refreshFileTree(featureName)
      )
    );

    this.messageRouter.registerHandler(
      'executeAgentCommand',
      new ExecuteAgentCommandHandler(
        this.featureService,
        this.messageService,
        this.commandOrchestrator,
        () => this.updateWebview(),
        (featureName: string) => this.refreshFileTree(featureName)
      )
    );

    this.messageRouter.registerHandler(
      'applyPendingCommand',
      new ApplyPendingCommandHandler(
        this.featureService,
        this.messageService,
        this.commandOrchestrator,
        () => this.updateWebview(),
        (featureName: string) => this.refreshFileTree(featureName)
      )
    );

    this.messageRouter.registerHandler(
      'messageAction',
      new MessageActionHandler(
        this.featureService,
        this.messageService,
        {
          executeAgentCommand: async (featureName: string, commandName: string) => {
            await this.commandOrchestrator.executeAgentCommand(
              featureName,
              commandName,
              () => this.updateWebview(),
              (fn: string) => this.refreshFileTree(fn)
            );
          },
          runTests: async (featureName: string) => {
            await this.messageRouter.route({ command: 'runTests', featureName });
          },
          merge: async (featureName: string) => {
            await this.messageRouter.route({ command: 'merge', featureName });
          },
          saveTestResults: async (featureName: string) => {
            await this.handleSaveTestResults(featureName);
          }
        }
      )
    );

    this.messageRouter.registerHandler(
      'resolveMergeConflicts',
      new ResolveMergeConflictsHandler(this.featureService, this.messageService)
    );

    this.messageRouter.registerHandler(
      'toggleArchiveView',
      new ToggleArchiveViewHandler(
        this.featureService,
        this.messageService,
        async () => {
          await this.toggleArchiveView();
        }
      )
    );

    this.messageRouter.registerHandler(
      'reactivateFeature',
      new ReactivateFeatureHandler(
        this.featureService,
        this.messageService,
        this.worktreeService,
        this.gitService,
        this.commitMessagePrefix,
        this.terminalProvider,
        async (featureName: string) => {
          // Switch to active view if currently viewing archived
          if (this.viewState.getViewMode() === 'archived') {
            this.viewState.setViewMode('active');
          }
          // Auto-select the reactivated feature and update UI
          this.viewState.setSelectedFeatureName(featureName);
          this.updateWebview();

          // Explicitly refresh the file tree for the reactivated feature
          // This ensures the UI shows files from the correct location
          if (this.view) {
            this.webviewUpdater.sendFileTreeRefresh(this.view.webview, featureName);
          }
        }
      )
    );

    class ClearSearchHandler extends MessageHandler {
      constructor(
        featureService: FeatureService,
        messageService: MessageService,
        private readonly clearSearchCallback: () => void
      ) {
        super(featureService, messageService);
      }
      async handle(): Promise<void> {
        this.clearSearchCallback();
      }
    }

    this.messageRouter.registerHandler(
      'clearSearch',
      new ClearSearchHandler(this.featureService, this.messageService, () => {
        this.viewState.clearSearch();
        this.updateWebview();
      })
    );
  }

  /**
   * Get the currently selected feature name
   */
  public getSelectedFeatureName(): string | null {
    return this.viewState.getSelectedFeatureName();
  }

  /**
   * Resolve the webview view
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
      enableCommandUris: true
    };

    webviewView.webview.html = this.htmlBuilder.getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.messageRouter.route(message);
    });

    // Note: agent status changes now trigger state manager invalidation automatically
    // which in turn triggers UIUpdateCoordinator to update the webview

    // Initialize UI update coordinator if state manager is available
    if (this.stateManager && this.logger) {
      this.initializeUIUpdateCoordinator();
    }

    // Send initial data
    this.updateWebview();
  }

  /**
   * Phase 2: Initialize the UI update coordinator
   */
  private initializeUIUpdateCoordinator(): void {
    if (!this.stateManager || !this.logger || !this.view) {
      return;
    }

    if (this.uiUpdateCoordinator) {
      // Already initialized
      return;
    }

    // Create coordinator
    this.uiUpdateCoordinator = new UIUpdateCoordinator(
      this.stateManager,
      this.webviewUpdater,
      this.view.webview,
      this.logger,
      this.agentStatusTracker
    );

    this.logger.info('[ClaudingSidebarProvider] UIUpdateCoordinator initialized');
  }

  /**
   * Set the ViewSyncService reference for view synchronization
   */
  public setViewSyncService(viewSyncService: { handleManualFeatureSelection(featureName: string): Promise<void> }): void {
    this.viewSyncService = viewSyncService;
  }

  /**
   * Set the state manager and logger
   */
  public setStateManager(stateManager: import('../state/FeatureStateManager').FeatureStateManager, logger: vscode.LogOutputChannel): void {
    this.stateManager = stateManager;
    this.logger = logger;

    // If webview is already resolved, initialize the UI update coordinator
    if (this.view) {
      this.initializeUIUpdateCoordinator();
    }
  }

  /**
   * Set the agent status tracker
   */
  public setAgentStatusTracker(agentStatusTracker: import('../services/AgentStatusTracker').AgentStatusTracker): void {
    this.agentStatusTracker = agentStatusTracker;

    // Set up the agent idle handler for auto-opening plan.md
    this.setupAgentIdleHandler();

    // If webview is already resolved, initialize the UI update coordinator
    if (this.view) {
      this.initializeUIUpdateCoordinator();
    }
  }

  /**
   * Programmatically select a feature without triggering view sync
   */
  public async selectFeature(featureName: string, skipViewSync: boolean = false): Promise<void> {
    this.viewState.setSelectedFeatureName(featureName);

    // Track the most recently selected active feature (if in active view mode)
    if (this.viewState.getViewMode() === 'active') {
      const feature = this.featureService.getFeature(featureName);
      const { isArchived } = require('../models/Feature');
      if (feature && !isArchived(feature)) {
        this.lastSelectedActiveFeature = featureName;
      }
    }

    await this.updateWebview();

    // Don't trigger view sync for programmatic selection
    if (!skipViewSync && this.viewSyncService) {
      await this.viewSyncService.handleManualFeatureSelection(featureName);
    }
  }

  /**
   * Prompt for feature name and create feature
   */
  public async promptForFeatureName(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter feature name',
      placeHolder: 'my-feature',
      validateInput: (value) => {
        const validation = ValidationService.isValidFeatureName(value);
        return validation.valid ? null : validation.error;
      }
    });

    if (name) {
      await this.messageRouter.route({ command: 'createFeature', name: name.trim() });
    }
  }

  /**
   * Prompt for new feature name for rename operation
   */
  public async promptForRename(oldFeatureName: string): Promise<void> {
    const newName = await vscode.window.showInputBox({
      prompt: `Enter new name for feature "${oldFeatureName}"`,
      placeHolder: oldFeatureName,
      value: oldFeatureName,
      validateInput: (value) => {
        if (!value || value.trim() === '') {
          return 'Feature name cannot be empty';
        }
        const validation = ValidationService.isValidFeatureName(value);
        if (!validation.valid) {
          return validation.error;
        }
        // Check if new name conflicts with existing feature
        const existingFeature = this.featureService.getFeature(value);
        if (existingFeature && value !== oldFeatureName) {
          return `Feature "${value}" already exists`;
        }
        return null;
      }
    });

    if (newName && newName.trim() !== oldFeatureName) {
      await this.messageRouter.route({
        command: 'renameFeature',
        featureName: oldFeatureName,
        newFeatureName: newName.trim()
      });
    }
  }

  /**
   * Show sort options and update sort order
   */
  public async showSortOptions(): Promise<void> {
    const currentSort = this.viewState.getSortOrder();
    const options = [
      {
        label: `${currentSort.type === 'chronological' && currentSort.direction === 'asc' ? '$(check) ' : ''}Chronological (oldest first)`,
        description: 'Sort by creation time (oldest → newest)',
        value: { type: 'chronological' as const, direction: 'asc' as const }
      },
      {
        label: `${currentSort.type === 'chronological' && currentSort.direction === 'desc' ? '$(check) ' : ''}Chronological (newest first)`,
        description: 'Sort by creation time (newest → oldest)',
        value: { type: 'chronological' as const, direction: 'desc' as const }
      },
      {
        label: `${currentSort.type === 'alphabetical' && currentSort.direction === 'asc' ? '$(check) ' : ''}Alphabetical (A-Z)`,
        description: 'Sort by feature name (A → Z)',
        value: { type: 'alphabetical' as const, direction: 'asc' as const }
      },
      {
        label: `${currentSort.type === 'alphabetical' && currentSort.direction === 'desc' ? '$(check) ' : ''}Alphabetical (Z-A)`,
        description: 'Sort by feature name (Z → A)',
        value: { type: 'alphabetical' as const, direction: 'desc' as const }
      },
      {
        label: `${currentSort.type === 'stage' && currentSort.direction === 'asc' ? '$(check) ' : ''}Lifecycle Stage (pre-plan → legacy)`,
        description: 'Sort by lifecycle status (pre-plan → plan → implement → wrap-up → legacy)',
        value: { type: 'stage' as const, direction: 'asc' as const }
      },
      {
        label: `${currentSort.type === 'stage' && currentSort.direction === 'desc' ? '$(check) ' : ''}Lifecycle Stage (legacy → pre-plan)`,
        description: 'Sort by lifecycle status (legacy → wrap-up → implement → plan → pre-plan)',
        value: { type: 'stage' as const, direction: 'desc' as const }
      }
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select sort order for features'
    });

    if (selected) {
      this.viewState.setSortOrder(selected.value);
      this.updateWebview();
    }
  }

  /**
   * Show search input with history suggestions
   */
  public async showSearchOptions(): Promise<void> {
    const searchState = this.viewState.getSearchState();
    const history = this.searchService.getHistory();

    return new Promise<void>((resolve) => {
      const quickPick = vscode.window.createQuickPick();
      quickPick.placeholder = 'Type to search features (use * for wildcard)';
      quickPick.ignoreFocusOut = false;

      // Pre-fill with current search if active
      if (searchState.isActive) {
        quickPick.value = searchState.query;
      }

      // Build items list: Reset option (if search is active) + history
      const items: vscode.QuickPickItem[] = [];

      if (searchState.isActive) {
        items.push({
          label: '$(clear-all) Reset Search',
          description: 'Clear search and show all features',
          alwaysShow: true
        });
      }

      // Add history items
      for (const term of history) {
        items.push({
          label: `$(history) ${term}`,
          description: 'Previous search',
          alwaysShow: false
        });
      }

      quickPick.items = items;

      // Handle selection
      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        const value = quickPick.value.trim();

        if (selected?.label === '$(clear-all) Reset Search') {
          // Reset search
          this.viewState.clearSearch();
          this.updateWebview();
        } else if (selected?.label.startsWith('$(history)')) {
          // Use selected history item
          const historyTerm = selected.label.replace('$(history) ', '');
          this.viewState.setSearchState({
            query: historyTerm,
            isActive: true
          });
          this.searchService.addToHistory(historyTerm);
          this.updateWebview();
        } else if (value !== '') {
          // Use typed value (free-text search)
          this.viewState.setSearchState({
            query: value,
            isActive: true
          });
          this.searchService.addToHistory(value);
          this.updateWebview();
        } else {
          // Empty value - clear search
          this.viewState.clearSearch();
          this.updateWebview();
        }

        quickPick.hide();
        resolve();
      });

      quickPick.onDidHide(() => {
        quickPick.dispose();
        resolve();
      });

      quickPick.show();
    });
  }

  /**
   * Determine which active feature should be selected when switching to active view
   * Priority:
   * 1. Active editor file (if it belongs to an active feature)
   * 2. Top visible terminal (if it belongs to an active feature)
   * 3. Previously selected active feature (if it still exists and is active)
   * 4. Otherwise, return null (clear selection)
   */
  private async determineActiveFeatureSelection(): Promise<string | null> {
    // Priority 1: Check active editor file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const filePath = activeEditor.document.uri.fsPath;
      const featureName = this.getFeatureFromFilePath(filePath);
      if (featureName) {
        // Verify feature exists and is active (not archived)
        const feature = this.featureService.getFeature(featureName);
        const { isArchived } = require('../models/Feature');
        if (feature && !isArchived(feature)) {
          return featureName;
        }
      }
    }

    // Priority 2: Check active terminal
    const activeTerminal = vscode.window.activeTerminal;
    if (activeTerminal) {
      const featureName = this.getFeatureFromTerminal(activeTerminal);
      if (featureName) {
        // Verify feature exists and is active (not archived)
        const feature = this.featureService.getFeature(featureName);
        const { isArchived } = require('../models/Feature');
        if (feature && !isArchived(feature)) {
          return featureName;
        }
      }
    }

    // Priority 3: Check previously selected active feature
    if (this.lastSelectedActiveFeature) {
      const feature = this.featureService.getFeature(this.lastSelectedActiveFeature);
      const { isArchived } = require('../models/Feature');
      if (feature && !isArchived(feature)) {
        return this.lastSelectedActiveFeature;
      }
    }

    // Priority 4: No match found, clear selection
    return null;
  }

  /**
   * Extract feature name from file path
   * Returns null if file is not in a feature worktree
   * Duplicated from ViewSyncService for separation of concerns
   */
  private getFeatureFromFilePath(filePath: string): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    // Build expected worktrees path pattern: .clauding/worktrees/{featureName}/
    const worktreesPattern = vscode.Uri.joinPath(workspaceFolder.uri, '.clauding', 'worktrees').fsPath;

    // Check if file path contains the worktrees directory
    if (!filePath.startsWith(worktreesPattern)) {
      return null;
    }

    // Extract feature name from path
    const relativePath = filePath.substring(worktreesPattern.length + 1);
    const parts = relativePath.split(/[/\\]/);

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
   * Returns null for main terminal or non-feature terminals
   * Duplicated from ViewSyncService for separation of concerns
   */
  private getFeatureFromTerminal(terminal: vscode.Terminal): string | null {
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
   * Toggle between active and archived feature views
   */
  public async toggleArchiveView(): Promise<void> {
    // Toggle the view mode
    const currentMode = this.viewState.getViewMode();
    const newMode = currentMode === 'active' ? 'archived' : 'active';
    this.viewState.setViewMode(newMode);

    // Smart selection handling
    if (newMode === 'active') {
      // When switching to active view, use smart selection
      const selectedFeature = await this.determineActiveFeatureSelection();
      if (selectedFeature) {
        // Select the feature with skipViewSync=true to prevent activating plan.md or terminal
        await this.selectFeature(selectedFeature, true);
      } else {
        // No match found, clear selection
        this.viewState.setSelectedFeatureName(null);
        this.updateWebview();
      }
    } else {
      // When switching to archived view, clear selection
      this.viewState.setSelectedFeatureName(null);
      this.updateWebview();
    }
  }

  /**
   * Update the webview with debouncing
   */
  public updateWebview(): void {
    this.viewState.scheduleUpdate(() => {
      this.performWebviewUpdate();
    }, 100);
  }

  /**
   * Perform the actual webview update
   */
  private async performWebviewUpdate(): Promise<void> {
    if (!this.view) {
      return;
    }

    await this.webviewUpdater.sendUpdate(this.view.webview);
  }

  /**
   * Refresh the file tree for a feature
   */
  private refreshFileTree(featureName: string): void {
    if (!this.view) {
      return;
    }

    this.webviewUpdater.sendFileTreeRefresh(this.view.webview, featureName);
  }

  /**
   * Handle save test results
   */
  private async handleSaveTestResults(featureName: string): Promise<void> {
    try {
      const feature = this.featureService.getFeature(featureName);
      if (!feature) {
        vscode.window.showErrorMessage(`Feature "${featureName}" not found`);
        return;
      }

      // Find and close the test terminal
      const terminals = vscode.window.terminals.filter(t =>
        t.name === `Tests: ${featureName}`
      );

      if (terminals.length > 0) {
        terminals[0].dispose(); // This will trigger onDidCloseTerminal
      } else {
        // No terminal found - tests may have already completed
        this.messageService.addMessage(
          feature.worktreePath,
          featureName,
          'No running test terminal found for this feature.',
          'warning',
          { dismissible: true }
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to save test results: ${errorMessage}`);
    }
  }
}
