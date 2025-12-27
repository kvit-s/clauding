import * as vscode from 'vscode';
import * as path from 'path';
import { FeatureStateManager } from '../state/FeatureStateManager';
import { ClaudingEventBus } from '../events/ClaudingEventBus';
import { GitService } from '../services/GitService';
import { AgentService } from '../services/AgentService';
import { WorktreeService } from '../services/WorktreeService';
import { FeatureService } from '../services/FeatureService';
import { FeatureQueryService } from '../services/FeatureQueryService';
import { FeatureMetadataWatcher } from '../services/FeatureMetadataWatcher';
import { AgentStatusTracker } from '../services/AgentStatusTracker';
import { MessageService } from '../services/MessageService';
import { OutputParserService } from '../services/OutputParserService';
import { TimelogService } from '../services/TimelogService';
import { EditorService } from '../services/EditorService';
import { AutoCommitService } from '../services/AutoCommitService';
import { FileCheckService } from '../services/FileCheckService';
import { TestService } from '../services/TestService';
import { MergeService } from '../services/MergeService';
import { OutputProcessingPipeline } from '../services/output/OutputProcessingPipeline';
import { FileStabilityStage } from '../services/output/stages/FileStabilityStage';
import { ParsingStage } from '../services/output/stages/ParsingStage';
import { ValidationStage } from '../services/output/stages/ValidationStage';
import { StorageStage } from '../services/output/stages/StorageStage';
import { ITerminalProvider } from '../terminals/ITerminalProvider';
import { TerminalConfig } from '../config/TerminalConfig';
import { TerminalProviderFactory } from '../terminals/TerminalProviderFactory';
import { ConfigService } from '../services/ConfigService';
import { AGENT_COMMANDS } from '../models/AgentCommand';

/**
 * Service layers for dependency management
 */
export enum ServiceLayer {
	/** Infrastructure services (logging, events) */
	Infrastructure = 'infrastructure',
	/** Core domain services (Git, Worktree) */
	Core = 'core',
	/** Feature domain services (Feature management) */
	Feature = 'feature',
	/** Agent domain services (Agent execution) */
	Agent = 'agent',
	/** UI services (Update coordination) */
	UI = 'ui'
}

/**
 * Service container for dependency injection
 * Manages service lifecycle and dependencies
 */
export class ServiceContainer {
	private services: Map<string, unknown> = new Map();
	private disposables: vscode.Disposable[] = [];
	private logger: vscode.LogOutputChannel;

	constructor(
		private context: vscode.ExtensionContext,
		logger: vscode.LogOutputChannel
	) {
		this.logger = logger;
	}

	/**
	 * Initialize all services in dependency order
	 */
	public async initialize(): Promise<void> {
		this.logger.info('[ServiceContainer] Initializing services...');

		// Layer 1: Infrastructure
		await this.initializeInfrastructure();

		// Layer 2: Core
		await this.initializeCore();

		// Layer 3: Feature
		await this.initializeFeature();

		// Layer 4: Agent
		await this.initializeAgent();

		// Layer 5: UI
		await this.initializeUI();

		this.logger.info('[ServiceContainer] All services initialized');
	}

	/**
	 * Get workspace root path from VS Code API
	 */
	private getWorkspaceRoot(): string {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			throw new Error('No workspace folder open');
		}
		return workspaceFolder.uri.fsPath;
	}

	/**
	 * Get absolute worktrees directory path
	 */
	private getAbsoluteWorktreesDir(): string {
		const config = vscode.workspace.getConfiguration('clauding');
		const worktreesDirConfig = config.get<string>('worktreesDir', '.clauding/worktrees');
		const projectRoot = this.getWorkspaceRoot();
		return path.isAbsolute(worktreesDirConfig)
			? worktreesDirConfig
			: path.join(projectRoot, worktreesDirConfig);
	}

	/**
	 * Initialize infrastructure services
	 */
	private async initializeInfrastructure(): Promise<void> {
		this.logger.trace('[ServiceContainer] Initializing infrastructure services...');

		// Event Bus
		const eventBus = new ClaudingEventBus(this.logger);
		this.register('eventBus', eventBus, ServiceLayer.Infrastructure);

		// State Manager
		const stateManager = new FeatureStateManager(this.logger);
		this.register('stateManager', stateManager, ServiceLayer.Infrastructure);

		// Terminal Provider
		const terminalConfig = new TerminalConfig();
		const terminalProvider = await TerminalProviderFactory.create(terminalConfig);
		this.register('terminalProvider', terminalProvider, ServiceLayer.Infrastructure);

		this.logger.trace('[ServiceContainer] Infrastructure services initialized');
	}

	/**
	 * Initialize core domain services
	 */
	private async initializeCore(): Promise<void> {
		this.logger.trace('[ServiceContainer] Initializing core services...');

		// Config Service
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			throw new Error('No workspace folder open');
		}
		const projectRoot = workspaceFolder.uri.fsPath;
		const configDir = path.join(projectRoot, '.clauding', 'config');
		const configService = new ConfigService(configDir);
		this.register('configService', configService, ServiceLayer.Core);

		// Git Service (no arguments - uses default exec functions)
		const gitService = new GitService();
		this.register('gitService', gitService, ServiceLayer.Core);

		// Timelog Service
		const timelogService = new TimelogService();
		this.register('timelogService', timelogService, ServiceLayer.Core);

		// Worktree Service
		const config = vscode.workspace.getConfiguration('clauding');
		const mainBranch = config.get<string>('mainBranch', 'main');
		const branchPrefix = config.get<string>('branchPrefix', 'feature/');
		const worktreesDir = this.getAbsoluteWorktreesDir();

		const worktreeService = new WorktreeService(
			projectRoot,
			worktreesDir,
			mainBranch,
			branchPrefix
		);
		this.register('worktreeService', worktreeService, ServiceLayer.Core);

		this.logger.trace('[ServiceContainer] Core services initialized');
	}

	/**
	 * Initialize feature domain services
	 */
	private async initializeFeature(): Promise<void> {
		this.logger.trace('[ServiceContainer] Initializing feature services...');

		const stateManager = this.get<FeatureStateManager>('stateManager');
		const config = vscode.workspace.getConfiguration('clauding');
		const mainBranch = config.get<string>('mainBranch', 'main');
		const branchPrefix = config.get<string>('branchPrefix', 'feature/');
		const worktreesDir = this.getAbsoluteWorktreesDir();

		// Feature Query Service
		const featureQueryService = new FeatureQueryService(worktreesDir, branchPrefix);
		featureQueryService.setStateManager(stateManager);
		this.register('featureQueryService', featureQueryService, ServiceLayer.Feature);

		// Feature Service
		const featureService = new FeatureService(worktreesDir, mainBranch, branchPrefix, undefined, this.context);
		featureService.setStateManager(stateManager);
		this.register('featureService', featureService, ServiceLayer.Feature);

		// Message Service
		const messageService = new MessageService();
		this.register('messageService', messageService, ServiceLayer.Feature);

		// Feature Metadata Watcher (no constructor arguments)
		const metadataWatcher = new FeatureMetadataWatcher();
		metadataWatcher.setStateManager(stateManager);
		this.register('metadataWatcher', metadataWatcher, ServiceLayer.Feature);

		// Editor Service
		const editorService = new EditorService();
		this.register('editorService', editorService, ServiceLayer.Feature);

		// File Check Service
		const fileCheckService = new FileCheckService();
		this.register('fileCheckService', fileCheckService, ServiceLayer.Feature);

		// Auto Commit Service
		const gitService = this.get<GitService>('gitService');
		const timelogService = this.get<TimelogService>('timelogService');
		const commitMessagePrefix = config.get<string>('commitMessagePrefix', '');
		const autoCommitService = new AutoCommitService(
			gitService,
			timelogService,
			commitMessagePrefix
		);
		this.register('autoCommitService', autoCommitService, ServiceLayer.Feature);

		// Test Service
		const testCommand = config.get<string>('testCommand', '');
		const terminalProvider = this.get<ITerminalProvider>('terminalProvider');
		const testService = new TestService(testCommand, false, messageService, terminalProvider);
		this.register('testService', testService, ServiceLayer.Feature);

		// Merge Service
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			throw new Error('No workspace folder open');
		}
		const projectRoot = workspaceFolder.uri.fsPath;
		const mergeService = new MergeService(projectRoot, mainBranch);
		this.register('mergeService', mergeService, ServiceLayer.Feature);

		// Wire up FeatureService dependencies
		const worktreeService = this.get<WorktreeService>('worktreeService');
		const configService = this.get<ConfigService>('configService');
		featureService.setTestService(testService);
		featureService.setMergeService(mergeService);
		featureService.setWorktreeService(worktreeService);
		featureService.setTimelogService(timelogService);
		featureService.setMessageService(messageService);
		featureService.setEditorService(editorService);
		featureService.setMetadataWatcher(metadataWatcher);
		featureService.setTerminalProvider(terminalProvider);
		featureService.setConfigService(configService);

		this.logger.trace('[ServiceContainer] Feature services initialized');
	}

	/**
	 * Initialize agent domain services
	 */
	private async initializeAgent(): Promise<void> {
		this.logger.trace('[ServiceContainer] Initializing agent services...');

		const stateManager = this.get<FeatureStateManager>('stateManager');
		const messageService = this.get<MessageService>('messageService');
		const config = vscode.workspace.getConfiguration('clauding');
		const worktreesDir = this.getAbsoluteWorktreesDir();

		// Register custom agent commands (including defaultPrompt and prompts) into AGENT_COMMANDS
		const configService = this.get<ConfigService>('configService');
		const mergedCommands = configService.getMergedCommands();
		for (const cmd of mergedCommands) {
			AGENT_COMMANDS[cmd.name] = cmd;
		}

		// Output Processing Pipeline
		const outputPipeline = new OutputProcessingPipeline(this.logger);
		outputPipeline.addStage(new FileStabilityStage(this.logger));
		outputPipeline.addStage(new ParsingStage(this.logger));
		outputPipeline.addStage(new ValidationStage(this.logger));
		outputPipeline.addStage(new StorageStage(this.logger));
		this.register('outputPipeline', outputPipeline, ServiceLayer.Agent);

		// Output Parser Service
		const outputParserService = new OutputParserService(worktreesDir);
		this.register('outputParserService', outputParserService, ServiceLayer.Agent);

		// Agent Status Tracker
		const agentStatusTracker = new AgentStatusTracker(worktreesDir);
		agentStatusTracker.setStateManager(stateManager);
		this.register('agentStatusTracker', agentStatusTracker, ServiceLayer.Agent);

		// Agent Service
		// Get default agent from ConfigService (supports new multi-agent configuration)
		const defaultAgent = configService.getDefaultAgent();
		const agentExecutable = defaultAgent.executable;
		const agentFlags = defaultAgent.flags || '';

		const terminalProvider = this.get<ITerminalProvider>('terminalProvider');
		const workspaceRoot = this.getWorkspaceRoot();
		const agentService = new AgentService(agentExecutable, agentFlags, terminalProvider, workspaceRoot);
		agentService.setMessageService(messageService);
		agentService.setOutputParserService(outputParserService);
		agentService.setLogger(this.logger);
		this.register('agentService', agentService, ServiceLayer.Agent);

		// Wire up dependencies
		const featureService = this.get<FeatureService>('featureService');
		const autoCommitService = this.get<AutoCommitService>('autoCommitService');
		const fileCheckService = this.get<FileCheckService>('fileCheckService');
		const autoCommitAfterAgent = config.get<boolean>('autoCommitAfterAgent', false);

		featureService.setAgentStatusTracker(agentStatusTracker);
		featureService.setAgentService(
			agentService,
			autoCommitService,
			fileCheckService,
			autoCommitAfterAgent
		);

		this.logger.trace('[ServiceContainer] Agent services initialized');
	}

	/**
	 * Initialize UI services
	 */
	private async initializeUI(): Promise<void> {
		this.logger.trace('[ServiceContainer] Initializing UI services...');

		// Note: UIUpdateCoordinator will be created when webview is available
		// It requires WebviewUpdater and Webview which are created later
		// See ClaudingSidebarProvider for coordinator initialization

		this.logger.trace('[ServiceContainer] UI services initialized');
	}

	/**
	 * Register a service
	 */
	private register<T>(name: string, service: T, layer: ServiceLayer): void {
		this.services.set(name, service);
		this.logger.trace(`[ServiceContainer] Registered ${name} (${layer})`);

		// Register for disposal if it has a dispose method
		if (service && typeof (service as unknown as vscode.Disposable).dispose === 'function') {
			this.disposables.push(service as unknown as vscode.Disposable);
		}
	}

	/**
	 * Get a service by name
	 */
	public get<T>(name: string): T {
		const service = this.services.get(name);
		if (!service) {
			throw new Error(`Service not found: ${name}`);
		}
		return service as T;
	}

	/**
	 * Check if a service is registered
	 */
	public has(name: string): boolean {
		return this.services.has(name);
	}

	/**
	 * Dispose all services
	 */
	public dispose(): void {
		this.logger.info('[ServiceContainer] Disposing all services...');

		// Dispose in reverse order
		this.disposables.reverse().forEach(disposable => {
			try {
				disposable.dispose();
			} catch (error) {
				this.logger.error(`[ServiceContainer] Error disposing service: ${error}`);
			}
		});

		this.disposables = [];
		this.services.clear();

		this.logger.info('[ServiceContainer] All services disposed');
	}
}
