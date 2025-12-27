import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Feature, FeatureLifecycleStatus } from '../models/Feature';
import { WorktreeService } from './WorktreeService';
import { AgentService } from './AgentService';
import { EditorService } from './EditorService';
import { AutoCommitService } from './AutoCommitService';
import { FileCheckService } from './FileCheckService';
import { GitService } from './GitService';
import { TestService } from './TestService';
import { MergeService } from './MergeService';
import { TimelogService } from './TimelogService';
import { FeatureClassificationService, ProjectContext } from './FeatureClassificationService';
import { MessageService } from './MessageService';
import { AgentStatusTracker } from './AgentStatusTracker';
import { FeatureMetadataWatcher } from './FeatureMetadataWatcher';
import { ConfigService } from './ConfigService';
import { AGENT_COMMANDS } from '../models/AgentCommand';
import { ensureFeatureMetaDirExists, getAbsoluteMetaPath, getAbsoluteWorktreeMetaPath, getProjectRoot, getFeaturesMetaPath, META_FILES } from '../utils/featureMetaPaths';
import { ValidationService } from '../utils/ValidationService';
import { setupWorktreeHooks } from '../utils/hookConfiguration';

// Extracted services
import { FeatureQueryService } from './FeatureQueryService';
import { FeatureCommitHelper } from './FeatureCommitHelper';
import { FeatureTerminalManager } from './FeatureTerminalManager';
import { FeatureMergeCoordinator } from './FeatureMergeCoordinator';
import { FeatureStatusResolver } from './FeatureStatusResolver';
import { FeatureLifecycleManager } from './FeatureLifecycleManager';

/**
 * Core FeatureService responsible for high-level feature CRUD and coordination.
 * Delegates to specialized services for specific responsibilities.
 */
export class FeatureService {
  private worktreesDir: string;
  private mainBranch: string;
  private branchPrefix: string;
  private agentService?: AgentService;
  private editorService?: EditorService;
  private autoCommitService?: AutoCommitService;
  private fileCheckService?: FileCheckService;
  private configService?: ConfigService;
  private autoCommitEnabled: boolean = false;
  private testService?: TestService;
  private mergeService?: MergeService;
  private worktreeService?: WorktreeService;
  private timelogService?: TimelogService;
  private messageService?: MessageService;
  private agentStatusTracker?: AgentStatusTracker;
  private metadataWatcher?: FeatureMetadataWatcher;
  private fsFn: typeof fs;
  private context?: vscode.ExtensionContext;

  // Extracted services
  private queryService: FeatureQueryService;
  private commitHelper?: FeatureCommitHelper;
  private terminalManager: FeatureTerminalManager;
  private mergeCoordinator: FeatureMergeCoordinator;
  private statusResolver: FeatureStatusResolver;
  private lifecycleManager: FeatureLifecycleManager;

  // State manager (single source of truth)
  private stateManager?: import('../state/FeatureStateManager').FeatureStateManager;

  constructor(worktreesDir: string, mainBranch: string, branchPrefix: string, fsOverride?: typeof fs, context?: vscode.ExtensionContext) {
    this.worktreesDir = worktreesDir;
    this.mainBranch = mainBranch;
    this.branchPrefix = branchPrefix;
    this.fsFn = fsOverride ?? fs;
    this.context = context;

    // Initialize extracted services
    this.queryService = new FeatureQueryService(worktreesDir, branchPrefix, fsOverride);
    this.terminalManager = new FeatureTerminalManager();
    this.mergeCoordinator = new FeatureMergeCoordinator();
    this.mergeCoordinator.setFeatureQueryService(this.queryService);
    this.statusResolver = new FeatureStatusResolver(fsOverride);
    this.lifecycleManager = new FeatureLifecycleManager(fsOverride);
  }

  public setAgentService(
    agentService: AgentService,
    autoCommitService: AutoCommitService,
    fileCheckService: FileCheckService,
    autoCommitEnabled: boolean
  ): void {
    this.agentService = agentService;
    this.autoCommitService = autoCommitService;
    this.fileCheckService = fileCheckService;
    this.autoCommitEnabled = autoCommitEnabled;
    this.terminalManager.setAgentService(agentService);
    this.mergeCoordinator.setTerminalManager(this.terminalManager);
  }

  public setTestService(testService: TestService): void {
    this.testService = testService;
    this.statusResolver.setTestService(testService);
  }

  public setConfigService(configService: ConfigService): void {
    this.configService = configService;
  }

  public setMergeService(mergeService: MergeService): void {
    this.mergeService = mergeService;
    this.statusResolver.setMergeService(mergeService);
    this.mergeCoordinator.setMergeService(mergeService);
  }

  public setWorktreeService(worktreeService: WorktreeService): void {
    this.worktreeService = worktreeService;
    this.mergeCoordinator.setWorktreeService(worktreeService);
  }

  public setTimelogService(timelogService: TimelogService): void {
    this.timelogService = timelogService;
    // Initialize commit helper when timelog service is set
    const gitService = new GitService();
    this.commitHelper = new FeatureCommitHelper(gitService, timelogService);
    this.mergeCoordinator.setCommitHelper(this.commitHelper);
    this.mergeCoordinator.setGitService(gitService);
  }

  public setMessageService(messageService: MessageService): void {
    this.messageService = messageService;
    this.queryService.setMessageService(messageService);
  }

  public setAgentStatusTracker(agentStatusTracker: AgentStatusTracker): void {
    this.agentStatusTracker = agentStatusTracker;
    this.queryService.setAgentStatusTracker(agentStatusTracker);
    this.mergeCoordinator.setAgentStatusTracker(agentStatusTracker);
  }

  public getAgentStatusTracker(): AgentStatusTracker | undefined {
    return this.agentStatusTracker;
  }

  public setTerminalProvider(terminalProvider: import('../terminals/ITerminalProvider').ITerminalProvider): void {
    this.queryService.setTerminalProvider(terminalProvider);
    this.terminalManager.setTerminalProvider(terminalProvider);
  }

  public setEditorService(editorService: EditorService): void {
    this.editorService = editorService;
    this.mergeCoordinator.setEditorService(editorService);
  }

  public setMetadataWatcher(metadataWatcher: FeatureMetadataWatcher): void {
    this.metadataWatcher = metadataWatcher;
    this.mergeCoordinator.setMetadataWatcher(metadataWatcher);
  }

  // Set state manager (single source of truth)
  public setStateManager(stateManager: import('../state/FeatureStateManager').FeatureStateManager): void {
    this.stateManager = stateManager;
    this.queryService.setStateManager(stateManager);
  }

  /**
   * Initialize archived features cache (non-blocking background operation)
   * Should be called during extension activation
   */
  public initializeArchivedFeaturesCache(): void {
    const projectRoot = path.dirname(path.dirname(this.worktreesDir)); // Go up from .clauding/worktrees
    this.queryService.initializeCache(projectRoot);
  }

  public getMainBranch(): string {
    return this.mainBranch;
  }

  /**
   * Classify a feature and store the classification metadata
   */
  public async classifyAndStoreFeature(
    featureName: string,
    autoClassify: boolean = true
  ): Promise<void> {
    if (!autoClassify) {
      return;
    }

    const feature = this.getFeature(featureName);
    if (!feature) {
      throw new Error(`Feature not found: ${featureName}`);
    }

    const promptPath = getAbsoluteMetaPath(feature.worktreePath, featureName, META_FILES.PROMPT);
    const promptContent = this.fsFn.readFileSync(promptPath, 'utf-8');

    // Gather project context
    const mainWorkspaceDir = path.dirname(path.dirname(this.worktreesDir)); // Go up from .clauding/worktrees
    const readmePath = path.join(mainWorkspaceDir, 'README.md');
    const archPath = path.join(mainWorkspaceDir, 'ARCHITECTURE.md');

    const context: ProjectContext = {};
    if (this.fsFn.existsSync(readmePath)) {
      const readme = this.fsFn.readFileSync(readmePath, 'utf-8');
      context.readme = readme.slice(0, 1000); // First 1000 chars
    }
    if (this.fsFn.existsSync(archPath)) {
      const arch = this.fsFn.readFileSync(archPath, 'utf-8');
      context.architecture = arch.slice(0, 1000);
    }

    // Record start timestamp and ensure clean commit BEFORE classification
    const startTimestamp = new Date().toISOString();
    const gitService = new GitService();
    const commitHash = await gitService.ensureCleanCommit(feature.worktreePath, 'Feature Classification');

    // Classify
    const classificationService = new FeatureClassificationService(feature.worktreePath);
    const result = await classificationService.classifyFeature(
      featureName,
      promptContent,
      context
    );

    // Update feature cache
    this.invalidateCache();

    // Log to timelog with start timestamp and commit hash
    if (this.timelogService) {
      await this.timelogService.addEntry(
        feature.worktreePath,
        featureName,
        'Feature Classified',
        'Success',
        {
          result: result.classification.result,
          model: result.metadata.llm.model,
          timestamp: result.metadata.timestamp
        },
        commitHash,
        startTimestamp
      );
    }

    // Commit classification metadata
    try {
      const classificationCommitHash = await gitService.stageAndCommit(
        feature.worktreePath,
        `feat: Add feature classification

Classification: ${result.metadata.classification.result}
Model: ${result.metadata.llm.model}
Confidence: ${result.metadata.classification.confidence}

Generated by: FeatureClassificationService
Timestamp: ${result.metadata.timestamp}`
      );

      // Update metadata with commit hash
      await classificationService.updateCommitHash(featureName, classificationCommitHash);
    } catch (error) {
      // Log error but don't fail the operation
      console.error('Failed to commit classification metadata:', error);
    }
  }

  /**
   * Get all features by scanning the worktrees directory
   */
  public getFeatures(sortOrder: { type: 'alphabetical' | 'chronological' | 'stage'; direction: 'asc' | 'desc' } = { type: 'chronological', direction: 'asc' }): Feature[] {
    return this.queryService.getFeatures(
      sortOrder,
      (worktreePath: string) => this.statusResolver.determineFeatureStatus(worktreePath),
      (worktreePath: string, featureName: string) => this.lifecycleManager.loadLifecycleStatus(worktreePath, featureName)
    );
  }

  /**
   * Get a specific feature by name (with caching)
   */
  public getFeature(name: string): Feature | null {
    return this.queryService.getFeature(
      name,
      (worktreePath: string) => this.statusResolver.determineFeatureStatus(worktreePath),
      (worktreePath: string, featureName: string) => this.lifecycleManager.loadLifecycleStatus(worktreePath, featureName)
    );
  }

  /**
   * Invalidate the feature cache (call after mutations)
   */
  public invalidateCache(): void {
    this.queryService.invalidateCache();
  }

  /**
   * Invalidate cache for a specific feature
   * @param featureName The name of the feature to invalidate
   */
  public invalidateFeatureCache(featureName: string): void {
    this.queryService.invalidateFeatureCache(featureName);
  }

  /**
   * Create a new feature
   */
  public async createFeature(
    name: string,
    worktreeService: WorktreeService,
    gitService: GitService,
    commitMessagePrefix: string
  ): Promise<Feature> {
    // Validate feature name using ValidationService
    const validation = ValidationService.isValidFeatureName(name);
    if (!validation.valid) {
      throw new Error(validation.error!);
    }

    // Validate length limit (not in ValidationService)
    if (name.length > 255) {
      throw new Error('Feature name too long: exceeds maximum length');
    }

    // Check if active feature already exists
    const existingFeature = this.getFeature(name);
    console.log(`[createFeature] Checking for existing feature "${name}": ${existingFeature ? 'found' : 'not found'}`);
    if (existingFeature !== null) {
      const { isArchived } = await import('../models/Feature');
      const archived = isArchived(existingFeature);
      console.log(`[createFeature] Feature "${name}" isArchived = ${archived} (branchName="${existingFeature.branchName}")`);
      if (!archived) {
        console.log(`[createFeature] ERROR: Active feature already exists`);
        throw new Error(`Active feature "${name}" already exists`);
      }
    }

    // Check for archived features with same name (warning only)
    const archivedFeatures = await this.getArchivedFeatures();
    const archivedCount = archivedFeatures.filter(f => f.name === name).length;
    if (archivedCount > 0) {
      console.warn(
        `Found ${archivedCount} archived feature(s) with name "${name}". ` +
        `They will be distinguished by merge date in archive view.`
      );
    }

    // Check if git branch already exists
    const sanitizedFeatureName = name.replace(/\s+/g, '-');
    const branchName = `${this.branchPrefix}${sanitizedFeatureName}`;
    // Compute project root from worktreesDir (typically {projectRoot}/.clauding/worktrees)
    const projectRoot = path.dirname(path.dirname(this.worktreesDir));
    if (await gitService.branchExists(projectRoot, branchName)) {
      throw new Error(`Git branch "${branchName}" already exists`);
    }

    // Create worktree
    const worktreePath = await worktreeService.createWorktree(name);

    // Ensure feature meta directory exists
    ensureFeatureMetaDirExists(worktreePath, name);

    // Start tracking this feature's agent status
    if (this.agentStatusTracker) {
      this.agentStatusTracker.startTracking(name);
    }

    // Start watching this feature's metadata for changes in both locations
    if (this.metadataWatcher) {
      const projectRoot = getProjectRoot(worktreePath);
      const featuresMetaDir = getFeaturesMetaPath(projectRoot, name, '');
      this.metadataWatcher.startWatching(name, featuresMetaDir);
    }

    // Configure agent hooks for this worktree
    if (this.context) {
      try {
        await setupWorktreeHooks(worktreePath, name, this.context);
      } catch (error) {
        console.warn('Failed to setup worktree hooks:', error);
        // Don't fail feature creation if hooks setup fails
      }
    }

    // Create initial files using new path structure
    const promptPath = getAbsoluteMetaPath(worktreePath, name, META_FILES.PROMPT);
    const timelogPath = getAbsoluteMetaPath(worktreePath, name, META_FILES.TIMELOG);

    this.fsFn.writeFileSync(promptPath, '', 'utf-8');

    // Initialize lifecycle status to 'pre-plan'
    this.lifecycleManager.saveLifecycleStatus(worktreePath, name, 'pre-plan');

    // Create initial timelog without commit hash (will be updated after commit)
    const initialTimelog: {
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
          action: 'Feature Created',
          result: 'Success',
          details: {
            file: META_FILES.PROMPT
          }
        }
      ]
    };
    this.fsFn.writeFileSync(timelogPath, JSON.stringify(initialTimelog, null, 2), 'utf-8');

    // Create initial commit
    const commitMessage = `${commitMessagePrefix}(${name}): Initialize feature`;
    let commitHash = await gitService.stageAndCommit(worktreePath, commitMessage);

    // Update timelog with commit hash (using dedicated field)
    initialTimelog.entries[0].commitHash = commitHash;
    initialTimelog.entries[0].details = {
      file: META_FILES.PROMPT
    };
    this.fsFn.writeFileSync(timelogPath, JSON.stringify(initialTimelog, null, 2), 'utf-8');

    // Amend the commit to include the updated timelog
    if (this.commitHelper) {
      await this.commitHelper.safeAmend(worktreePath, `${commitMessagePrefix}(${name}): Update timelog with commit hash`);
    } else {
      // Fallback if commit helper not initialized yet
      try {
        commitHash = await gitService.stageAndAmend(worktreePath);
      } catch (error) {
        const errorMessage = error instanceof Error && error.message ? error.message : String(error);
        if (errorMessage && !errorMessage.includes('No changes to commit')) {
          console.warn('Failed to amend commit, falling back to second commit:', errorMessage);
          try {
            await gitService.stageAndCommit(
              worktreePath,
              `${commitMessagePrefix}(${name}): Update timelog with commit hash`
            );
          } catch (secondError) {
            const secondErrorMessage = secondError instanceof Error && secondError.message ? secondError.message : String(secondError);
            if (secondErrorMessage && !secondErrorMessage.includes('No changes to commit')) {
              throw secondError;
            }
          }
        }
      }
    }

    // Get the created feature (state manager is automatically populated by getFeature)
    const createdFeature = this.getFeature(name)!;

    // Return the created feature
    return createdFeature;
  }

  /**
   * Execute an agent command for a feature
   */
  public async executeAgentCommand(
    featureName: string,
    commandName: string,
    onProgress?: (message: string) => void,
    terminalService?: unknown,
    agentId?: string  // NEW parameter (optional, at end for backward compatibility)
  ): Promise<void> {
    const feature = this.getFeature(featureName);
    if (!feature) {
      throw new Error(`Feature not found: ${featureName}`);
    }

    if (!this.agentService || !this.autoCommitService || !this.fileCheckService) {
      throw new Error('Agent services not initialized');
    }

    const command = AGENT_COMMANDS[commandName];
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    // Check required files
    const fileCheck = await this.fileCheckService.checkRequiredFiles(command, feature.worktreePath);
    if (!fileCheck.allExist) {
      throw new Error(`Missing required files: ${fileCheck.missingFiles.join(', ')}`);
    }

    // Special handling for Create Plan and Create Lightweight Plan: commit prompt.md first
    if (commandName === 'Create Plan' || commandName === 'Create Lightweight Plan') {
      onProgress?.(`Committing prompt.md...`);
      if (this.commitHelper) {
        await this.commitHelper.safeCommit(
          feature.worktreePath,
          `feat: Add feature prompt\n\nPreparing to create implementation plan`
        );
      } else {
        try {
          const gitService = new GitService();
          await gitService.stageAndCommit(
            feature.worktreePath,
            `feat: Add feature prompt\n\nPreparing to create implementation plan`
          );
        } catch (error) {
          const errorMessage = error instanceof Error && error.message ? error.message : String(error);
          if (errorMessage && !errorMessage.includes('No changes to commit')) {
            throw error;
          }
        }
      }
    }

    // Record start timestamp and ensure clean commit BEFORE agent execution
    const startTimestamp = new Date().toISOString();
    const gitService = new GitService();
    const commitHash = await gitService.ensureCleanCommit(feature.worktreePath, commandName);

    // Determine which agent to use
    let agentOverride: { id: string; executable: string; flags: string } | undefined;
    if (this.configService) {
      let agent;
      if (agentId) {
        // User explicitly selected an agent via UI
        agent = this.configService.getAgentById(agentId);
        if (!agent) {
          throw new Error(`Agent '${agentId}' not found`);
        }
      } else {
        // Use default agent (for automatic invocations or when user doesn't select)
        agent = this.configService.getDefaultAgent();
      }
      agentOverride = { id: agent.id, executable: agent.executable, flags: agent.flags || '' };
    }

    // Show progress
    onProgress?.(`Executing ${commandName}...`);

    try {
      // Execute command with terminal if provided
      const result = await this.agentService.executeCommand(
        commandName,
        feature.worktreePath,
        terminalService,
        featureName,
        undefined, // conflictInfo
        agentOverride  // Pass agent override
      );

      if (!result.success) {
        throw new Error(`Agent command failed with exit code ${result.exitCode}`);
      }

      // Auto-commit if enabled
      if (this.autoCommitEnabled) {
        onProgress?.(`Committing changes...`);
        await this.autoCommitService.commitAfterAgent(
          feature.worktreePath,
          featureName,
          commandName,
          result.outputFile,
          commitHash,
          startTimestamp
        );
      } else {
        // Just add timelog entry with start timestamp and commit hash
        await this.autoCommitService['timelogService'].addEntry(
          feature.worktreePath,
          featureName,
          commandName,
          'Success',
          {
            outputFile: result.outputFile
          },
          commitHash,
          startTimestamp
        );
      }

      onProgress?.(`${commandName} completed`);
    } catch (error) {
      // Add failed timelog entry with start timestamp and commit hash
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.autoCommitService['timelogService'].addEntry(
        feature.worktreePath,
        featureName,
        commandName,
        'Failed',
        {
          error: errorMessage
        },
        commitHash,
        startTimestamp
      );
      throw error;
    }
  }

  /**
   * Save a pending command to the feature's worktree
   */
  public savePendingCommand(worktreePath: string, commandName: string, missingFiles: string[]): void {
    const featureName = path.basename(worktreePath);
    const pendingCommandPath = getAbsoluteMetaPath(worktreePath, featureName, META_FILES.PENDING_COMMAND);
    const pendingCommand = {
      command: commandName,
      missingFiles
    };
    this.fsFn.writeFileSync(pendingCommandPath, JSON.stringify(pendingCommand, null, 2), 'utf-8');

    // Invalidate cache to update features list
    this.invalidateFeatureCache(featureName);
  }

  /**
   * Clear the pending command from the feature's worktree
   */
  public clearPendingCommand(worktreePath: string): void {
    const featureName = path.basename(worktreePath);
    const pendingCommandPath = getAbsoluteMetaPath(worktreePath, featureName, META_FILES.PENDING_COMMAND);
    if (this.fsFn.existsSync(pendingCommandPath)) {
      this.fsFn.unlinkSync(pendingCommandPath);

      // Invalidate cache to update features list
      this.invalidateFeatureCache(featureName);
    }
  }

  /**
   * Update the lifecycle status of a feature
   */
  public updateFeatureStatus(featureName: string, status: FeatureLifecycleStatus): void {
    const feature = this.getFeature(featureName);
    if (!feature) {
      throw new Error(`Feature not found: ${featureName}`);
    }
    this.lifecycleManager.saveLifecycleStatus(feature.worktreePath, featureName, status);
    this.invalidateCache();
  }

  /**
   * Kill all active terminals for a feature and wait for output files to be captured
   */
  public async killAllTerminalsAndCaptureOutput(
    featureName: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    const feature = this.getFeature(featureName);
    if (!feature) {
      return;
    }

    await this.terminalManager.killAllTerminalsAndCaptureOutput(
      featureName,
      feature.worktreePath,
      onProgress
    );
  }

  /**
   * Close all active editors for a feature
   */
  public async closeAllEditorsForFeature(
    featureName: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    const feature = this.getFeature(featureName);
    if (!feature) {
      return;
    }

    await this.mergeCoordinator.closeAllEditorsForFeature(
      featureName,
      feature.worktreePath,
      onProgress
    );
  }

  /**
   * Run tests for a feature
   */
  public async runTests(
    featureName: string,
    onProgress?: (message: string) => void,
    onComplete?: (outputFile: string) => void
  ): Promise<void> {
    const feature = this.getFeature(featureName);
    if (!feature || !this.testService || !this.timelogService) {
      throw new Error('Feature or test service not found');
    }

    onProgress?.('Running tests...');

    // Run tests with completion callback for auto-commit and timelog
    await this.testService.runTests(
      feature.worktreePath,
      featureName,
      async (result) => {
        // Auto-commit if enabled
        if (this.autoCommitEnabled && this.autoCommitService) {
          onProgress?.('Committing changes...');
          await this.autoCommitService.commitAfterTests(
            feature.worktreePath,
            featureName,
            result.outputFile
          );
        } else {
          // Add timelog entry if auto-commit is disabled
          await this.timelogService!.addEntry(
            feature.worktreePath,
            featureName,
            'Run Tests',
            'Success',
            {
              outputFile: result.outputFile
            }
          );
        }

        onProgress?.('Tests completed');

        // Notify caller that tests are complete
        onComplete?.(result.outputFile);
      }
    );
  }

  /**
   * Merge a feature into main branch
   */
  public async mergeFeature(
    featureName: string,
    onProgress?: (message: string) => void
  ): Promise<{ success: boolean; hasConflicts: boolean; conflictedFiles: string[] }> {
    const feature = this.getFeature(featureName);
    if (!feature) {
      throw new Error('Feature not found');
    }

    return await this.mergeCoordinator.mergeFeature(
      featureName,
      feature.branchName,
      feature.worktreePath,
      onProgress
    );
  }

  /**
   * Update feature branch from main (merge main into feature)
   */
  public async updateFromMain(
    featureName: string,
    onProgress?: (message: string) => void
  ): Promise<{ success: boolean; hasConflicts: boolean; conflictedFiles: string[] }> {
    const feature = this.getFeature(featureName);
    if (!feature) {
      throw new Error('Feature not found');
    }

    const result = await this.mergeCoordinator.updateFromMain(
      featureName,
      feature.worktreePath,
      onProgress
    );

    // Invalidate cache to update features list
    if (result.success) {
      this.invalidateCache();
    }

    return result;
  }

  /**
   * Resolve merge conflicts from updating from main
   */
  public async resolveUpdateFromMainConflicts(
    featureName: string,
    conflictedFiles: string[],
    strategy: 'feature' | 'main' | 'agent' | 'cancel'
  ): Promise<void> {
    const feature = this.getFeature(featureName);
    if (!feature) {
      throw new Error('Feature not found');
    }

    await this.mergeCoordinator.resolveUpdateFromMainConflicts(
      featureName,
      feature.worktreePath,
      conflictedFiles,
      strategy
    );

    // Invalidate cache to update features list
    this.invalidateCache();
  }

  /**
   * Resolve merge conflicts with a strategy
   */
  public async resolveMergeConflicts(
    featureName: string,
    conflictedFiles: string[],
    strategy: 'feature' | 'main' | 'agent' | 'cancel',
    onProgress?: (message: string) => void
  ): Promise<void> {
    const feature = this.getFeature(featureName);
    if (!feature) {
      throw new Error('Feature not found');
    }

    await this.mergeCoordinator.resolveMergeConflicts(
      featureName,
      feature.branchName,
      feature.worktreePath,
      conflictedFiles,
      strategy,
      onProgress
    );

    // Invalidate cache to update features list
    this.invalidateCache();
  }

  /**
   * Complete merge after agent resolves conflicts
   */
  public async completeMergeAfterAgent(
    featureName: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    const feature = this.getFeature(featureName);
    if (!feature) {
      throw new Error('Feature not found');
    }

    await this.mergeCoordinator.completeMergeAfterAgent(
      featureName,
      feature.branchName,
      feature.worktreePath,
      onProgress
    );

    // Invalidate cache to update features list
    this.invalidateCache();
  }

  /**
   * Get all archived features from git history
   */
  public async getArchivedFeatures(sortOrder?: { type: 'alphabetical' | 'chronological' | 'stage'; direction: 'asc' | 'desc' }): Promise<Feature[]> {
    return await this.queryService.getArchivedFeatures(sortOrder);
  }

  /**
   * Invalidate the archived feature cache
   */
  public invalidateArchivedCache(): void {
    this.queryService.invalidateArchivedCache();
  }

  /**
   * Get a unique feature name by checking existing features and appending counter if needed
   * @param baseName The base name to use
   * @returns A unique feature name (either baseName or baseName_N where N is a counter)
   */
  public getUniqueFeatureName(baseName: string): string {
    const { isArchived } = require('../models/Feature');
    const existingFeatures = this.getFeatures();
    console.log(`[getUniqueFeatureName] Total features: ${existingFeatures.length}`);
    console.log(`[getUniqueFeatureName] Features: ${existingFeatures.map(f => `${f.name}(archived:${isArchived(f)})`).join(', ')}`);

    // Only consider active features (exclude archived)
    const existingNames = new Set(existingFeatures.filter(f => !isArchived(f)).map(f => f.name));
    console.log(`[getUniqueFeatureName] Active feature names: ${Array.from(existingNames).join(', ')}`);

    // If base name doesn't exist among active features, use it
    if (!existingNames.has(baseName)) {
      console.log(`[getUniqueFeatureName] Base name "${baseName}" is available`);
      return baseName;
    }

    // Otherwise, find the first available counter
    let counter = 1;
    while (existingNames.has(`${baseName}_${counter}`)) {
      counter++;
    }

    return `${baseName}_${counter}`;
  }

}
