import * as vscode from 'vscode';
import * as path from 'path';
import { ensureClaudingDirectories } from './utils/directorySetup';
import { ConfigService } from './services/ConfigService';
import { FeatureService } from './services/FeatureService';
import { WorktreeService } from './services/WorktreeService';
import { GitService } from './services/GitService';
import { TimelogService } from './services/TimelogService';
import { MessageService } from './services/MessageService';
import { AgentService } from './services/AgentService';
import { AgentStatusTracker } from './services/AgentStatusTracker';
import { FeatureMetadataWatcher } from './services/FeatureMetadataWatcher';
import { ClaudingSidebarProvider } from './providers/ClaudingSidebarProvider';
import { NotificationService } from './services/NotificationService';
import { ValidationService } from './utils/ValidationService';
import { openSettingsCommand } from './commands/settingsCommand';
import { ViewSyncService } from './services/ViewSyncService';
import { configureAgentHooksCommand } from './commands/configureAgentHooksCommand';
import { cleanupBranchesCommand } from './commands/cleanupBranchesCommand';
import * as featureMetaPaths from './utils/featureMetaPaths';
import { updateAllWorktreeClaudeignores } from './utils/worktreeSetup';
import { ITerminalProvider, TerminalType } from './terminals/ITerminalProvider';
import { FeatureSearchService } from './services/FeatureSearchService';
// New architecture components
import { FeatureStateManager } from './state/FeatureStateManager';
import { ServiceContainer } from './di/ServiceContainer';

export async function activate(context: vscode.ExtensionContext) {
  console.log('Clauding extension activated');

  // Get workspace root
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Clauding requires a workspace to be opened');
    return;
  }

  // Validate workspace
  const validation = await ValidationService.validateWorkspace(workspaceRoot);
  if (!validation.valid) {
    const errorList = validation.errors.join('\n');
    vscode.window.showErrorMessage(
      `Clauding cannot activate:\n${errorList}`,
      'Learn More'
    ).then(choice => {
      if (choice === 'Learn More') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/kvit-s/clauding#installation'));
      }
    });
    return;
  }

  // Ensure .clauding directory structure
  const dirs = ensureClaudingDirectories(workspaceRoot);

  // Migration: Update .claudeignore for all existing worktrees
  // This prevents "too many open files" errors by excluding sibling worktrees
  try {
    await updateAllWorktreeClaudeignores(dirs.worktrees);
  } catch (error) {
    console.error('[Extension] Failed to update worktree .claudeignore files:', error);
  }

  // Initialize notification service
  const notificationService = new NotificationService();
  context.subscriptions.push(notificationService);

  // Initialize logger for new architecture components
  const logger = vscode.window.createOutputChannel('Clauding', { log: true });
  context.subscriptions.push(logger);
  logger.info('[Extension] Activating...');

  // Initialize ServiceContainer (replaces manual DI)
  const container = new ServiceContainer(context, logger);
  await container.initialize();
  context.subscriptions.push(container);

  // Get services from container
  const featureStateManager = container.get<FeatureStateManager>('stateManager');
  const featureService = container.get<FeatureService>('featureService');
  const worktreeService = container.get<WorktreeService>('worktreeService');
  const gitService = container.get<GitService>('gitService');
  const timelogService = container.get<TimelogService>('timelogService');
  const messageService = container.get<MessageService>('messageService');
  const agentService = container.get<AgentService>('agentService');
  const agentStatusTracker = container.get<AgentStatusTracker>('agentStatusTracker');
  const metadataWatcher = container.get<FeatureMetadataWatcher>('metadataWatcher');

  // Get config for commit message prefix
  const configService = new ConfigService(dirs.config);
  const config = configService.getConfig();

  // Initialize archived features cache (non-blocking background operation)
  featureService.initializeArchivedFeaturesCache();

  // Get terminal provider from container
  const terminalProvider = container.get('terminalProvider') as ITerminalProvider;

  // Create search service
  const searchService = new FeatureSearchService(context, dirs.worktrees, featureMetaPaths.getFeaturesDir(workspaceRoot));

  // Register sidebar provider
  const sidebarProvider = new ClaudingSidebarProvider(
    context,
    context.extensionUri,
    featureService,
    worktreeService,
    timelogService,
    gitService,
    messageService,
    agentService,
    terminalProvider,
    configService,
    config.commitMessagePrefix,
    workspaceRoot,
    searchService
  );

  // Connect state manager to sidebar provider
  sidebarProvider.setStateManager(featureStateManager, logger);
  sidebarProvider.setAgentStatusTracker(agentStatusTracker);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'clauding-sidebar',
      sidebarProvider
    )
  );

  // Watch for configuration changes and refresh webview when agent commands change
  context.subscriptions.push(
    configService.watchConfiguration(() => {
      // When configuration changes, refresh the webview to show updated commands
      sidebarProvider.updateWebview();
    })
  );

  // Note: metadata changes now trigger state manager invalidation automatically
  // which in turn triggers UIUpdateCoordinator to update the webview

  // Initialize watchers for all active features
  const initializeWatchers = async () => {
    try {
      const features = await featureService.getFeatures();
      for (const feature of features) {
        if (feature.lifecycleStatus !== 'legacy') {
          // Get metadata directory path for watching (new architecture uses features folder only)
          const projectRoot = featureMetaPaths.getProjectRoot(feature.worktreePath);
          const featuresMetaDir = featureMetaPaths.getFeaturesMetaPath(projectRoot, feature.name, '');

          metadataWatcher.startWatching(feature.name, featuresMetaDir);
          agentStatusTracker.startTracking(feature.name);
        }
      }
    } catch (error) {
      console.error('[Extension] Failed to initialize feature watchers:', error);
    }
  };

  initializeWatchers();

  // Initialize view sync service
  const viewSyncService = new ViewSyncService(
    sidebarProvider,
    featureService,
    worktreeService,
    agentService,
    terminalProvider
  );

  // Set view sync service reference on sidebar provider for manual feature selection
  sidebarProvider.setViewSyncService(viewSyncService);

  // Initialize global base terminal
  // This creates a persistent terminal that auto-relaunches when closed
  await viewSyncService.ensureMainTerminal();

  // Register event listeners for view synchronization
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      viewSyncService.handleEditorChange(editor);
    }),
    vscode.window.onDidChangeActiveTerminal(terminal => {
      viewSyncService.handleTerminalChange(terminal);
    }),
    vscode.window.onDidCloseTerminal(async terminal => {
      await viewSyncService.handleTerminalClose(terminal);
    }),
    viewSyncService
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('clauding.newFeature', () => {
      sidebarProvider.promptForFeatureName();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('clauding.sortFeatures', () => {
      sidebarProvider.showSortOptions();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('clauding.searchFeatures', () => {
      sidebarProvider.showSearchOptions();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('clauding.toggleArchiveView', () => {
      sidebarProvider.toggleArchiveView();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('clauding.openSettings', () => {
      openSettingsCommand(workspaceRoot);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('clauding.configureAgentHooks', () => {
      configureAgentHooksCommand(context, dirs.worktrees);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('clauding.cleanupBranches', () => {
      cleanupBranchesCommand(workspaceRoot);
    })
  );

  console.log('Clauding services initialized');
}

export async function deactivate() {
	console.log('Clauding extension deactivating...');
	// Note: Cleanup is handled by disposing context.subscriptions
	// which includes ServiceContainer that disposes all services including tmux
}
