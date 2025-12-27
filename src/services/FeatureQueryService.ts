import * as fs from 'fs';
import * as path from 'path';
import { Feature, FeatureLifecycleStatus } from '../models/Feature';
import { getAbsoluteMetaPath, META_FILES, getFeaturesDir, getFeatureFolder, getFeaturesMetaPath } from '../utils/featureMetaPaths';
import { MessageService } from './MessageService';
import { AgentStatusTracker } from './AgentStatusTracker';
import { FeatureStateManager } from '../state/FeatureStateManager';
import { ITerminalProvider } from '../terminals/ITerminalProvider';
import { TmuxTerminal } from '../terminals/tmux/TmuxTerminal';

/**
 * Metadata for archived features
 */
export interface ArchiveMetadata {
  featureName: string;
  prompt?: string;
  mergeCommitHash?: string;
  mergeDate?: Date;
}

/**
 * Service responsible for querying, caching, and sorting features.
 * Extracts feature retrieval logic from FeatureService to follow Single Responsibility Principle.
 *
 * Feature Detection:
 * - Active features: Have both worktree and features folder
 * - Archived features: Have features folder but no worktree
 */
export class FeatureQueryService {
  private worktreesDir: string;
  private branchPrefix: string;
  private messageService?: MessageService;
  private agentStatusTracker?: AgentStatusTracker;
  private terminalProvider?: ITerminalProvider;
  private fsFn: typeof fs;
  private projectRoot: string;

  // State manager (single source of truth)
  private stateManager?: FeatureStateManager;

  constructor(
    worktreesDir: string,
    branchPrefix: string,
    fsOverride?: typeof fs
  ) {
    this.worktreesDir = worktreesDir;
    this.branchPrefix = branchPrefix;
    this.fsFn = fsOverride ?? fs;
    // Calculate project root from worktrees directory
    // worktreesDir = {projectRoot}/.clauding/worktrees
    this.projectRoot = path.resolve(worktreesDir, '../..');
  }

  public setMessageService(messageService: MessageService): void {
    this.messageService = messageService;
  }

  public setAgentStatusTracker(agentStatusTracker: AgentStatusTracker): void {
    this.agentStatusTracker = agentStatusTracker;
  }

  public setTerminalProvider(terminalProvider: ITerminalProvider): void {
    this.terminalProvider = terminalProvider;
  }

  // Set state manager (single source of truth)
  public setStateManager(stateManager: FeatureStateManager): void {
    this.stateManager = stateManager;
  }

  /**
   * Initialize archived features by scanning the features directory
   * Called on extension activation
   */
  public initializeCache(_projectRoot: string): void {
    // Scan features directory and populate state manager
    this.refreshArchivedFeaturesFromFilesystem();
  }

  /**
   * Add newly merged/archived feature to state manager
   * Called by FeatureMergeCoordinator after successful merge
   */
  public async addToArchivedCache(
    _featureName: string,
    _mergeCommitHash: string
  ): Promise<void> {
    // Refresh archived features from filesystem
    this.refreshArchivedFeaturesFromFilesystem();
  }

  /**
   * Get archived feature details from features folder
   */
  public async getArchivedFeatureDetails(
    featureName: string
  ): Promise<ArchiveMetadata | null> {
    const featureFolder = getFeatureFolder(this.projectRoot, featureName);

    if (!this.fsFn.existsSync(featureFolder)) {
      return null;
    }

    // Check if worktree exists - if so, it's not archived
    const worktreePath = path.join(this.worktreesDir, featureName);
    if (this.fsFn.existsSync(worktreePath)) {
      return null; // Not archived
    }

    // Read metadata from features folder
    return this.readArchivedFeatureMetadata(featureName);
  }

  /**
   * Read archived feature metadata from features folder
   */
  private readArchivedFeatureMetadata(featureName: string): ArchiveMetadata | null {
    try {
      // Read prompt from features folder (moved there during merge cleanup)
      let prompt: string | undefined;
      const promptPath = getFeaturesMetaPath(this.projectRoot, featureName, META_FILES.PROMPT);
      if (this.fsFn.existsSync(promptPath)) {
        prompt = this.fsFn.readFileSync(promptPath, 'utf-8').trim();
      }

      // Read status.json for merge metadata
      const statusPath = getFeaturesMetaPath(this.projectRoot, featureName, META_FILES.STATUS);
      let mergeCommitHash: string | undefined;
      let mergeDate: Date | undefined;

      if (this.fsFn.existsSync(statusPath)) {
        const statusContent = this.fsFn.readFileSync(statusPath, 'utf-8');
        const status = JSON.parse(statusContent);
        mergeCommitHash = status.mergeCommitHash;
        if (status.mergeDate) {
          mergeDate = new Date(status.mergeDate);
        }
      }

      return {
        featureName,
        prompt,
        mergeCommitHash,
        mergeDate
      };
    } catch (error) {
      console.error(`Failed to read archived feature metadata for ${featureName}:`, error);
      return null;
    }
  }

  /**
   * Get all features by scanning the worktrees directory
   */
  public getFeatures(
    sortOrder: { type: 'alphabetical' | 'chronological' | 'stage'; direction: 'asc' | 'desc' } = { type: 'chronological', direction: 'asc' },
    determineStatusFn: (worktreePath: string) => import('../models/Feature').FeatureStatus,
    loadLifecycleStatusFn: (worktreePath: string, featureName: string) => FeatureLifecycleStatus
  ): Feature[] {
    // Scan filesystem and populate state manager
    this.refreshFromFilesystem(determineStatusFn, loadLifecycleStatusFn);

    // Return from state manager (single source of truth)
    if (this.stateManager) {
      return this.sortFeatures(this.stateManager.getAllFeatures(), sortOrder);
    }

    // Fallback if state manager not initialized
    return [];
  }

  /**
   * Scan filesystem and update state manager with active features
   */
  private refreshFromFilesystem(
    determineStatusFn: (worktreePath: string) => import('../models/Feature').FeatureStatus,
    loadLifecycleStatusFn: (worktreePath: string, featureName: string) => FeatureLifecycleStatus
  ): void {
    if (!this.stateManager) {
      return;
    }

    if (!this.fsFn.existsSync(this.worktreesDir)) {
      return;
    }

    const dirs = this.fsFn.readdirSync(this.worktreesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    const features = dirs
      .map(name => this.getFeatureUncached(name, determineStatusFn, loadLifecycleStatusFn))
      .filter(f => f !== null) as Feature[];

    // All features with worktrees are active (no archived cache filtering)
    const activeFeatures = features;

    // Synchronize active features with state manager
    const existingActiveFeatures = this.stateManager.getAllFeatures();
    const newFeatureNames = new Set(activeFeatures.map(f => f.name));

    // Remove active features that no longer exist in filesystem
    for (const existing of existingActiveFeatures) {
      if (!newFeatureNames.has(existing.name)) {
        this.stateManager.deleteFeature(existing.name);
      }
    }

    // Add or update active features
    for (const feature of activeFeatures) {
      if (this.stateManager.hasActiveFeature(feature.name)) {
        this.stateManager.updateFeature(feature.name, feature);
      } else {
        this.stateManager.createFeature(feature);
      }
    }
  }

  /**
   * Get a specific feature by name
   */
  public getFeature(
    name: string,
    determineStatusFn: (worktreePath: string) => import('../models/Feature').FeatureStatus,
    loadLifecycleStatusFn: (worktreePath: string, featureName: string) => FeatureLifecycleStatus
  ): Feature | null {
    // Try to get from state manager first
    if (this.stateManager && this.stateManager.hasFeature(name)) {
      return this.stateManager.getFeature(name);
    }

    // If not in state manager, load from filesystem and add it
    const feature = this.getFeatureUncached(name, determineStatusFn, loadLifecycleStatusFn);
    if (feature && this.stateManager) {
      this.stateManager.createFeature(feature);
    }
    return feature;
  }

  /**
   * Get a specific feature by name (bypassing cache)
   */
  private getFeatureUncached(
    name: string,
    determineStatusFn: (worktreePath: string) => import('../models/Feature').FeatureStatus,
    loadLifecycleStatusFn: (worktreePath: string, featureName: string) => FeatureLifecycleStatus
  ): Feature | null {
    const worktreePath = path.join(this.worktreesDir, name);

    if (!this.fsFn.existsSync(worktreePath)) {
      return null;
    }

    const branchName = `${this.branchPrefix}${name}`;

    // Load classification if it exists
    let classification: { result: 'lightweight' | 'standard'; timestamp: string; modelUsed: string } | undefined;

    try {
      const classificationPath = getAbsoluteMetaPath(worktreePath, name, META_FILES.CLASSIFICATION);
      if (this.fsFn.existsSync(classificationPath)) {
        const content = this.fsFn.readFileSync(classificationPath, 'utf-8');
        const parsed = JSON.parse(content);
        classification = {
          result: parsed.classification.result,
          timestamp: parsed.timestamp,
          modelUsed: parsed.llm.model
        };
      }
    } catch {
      // Ignore errors loading classification
    }

    // Get agent sessions from hook-based tracker
    let agentSession: import('../models/Feature').AgentSessionInfo | undefined;
    let agentSessions: import('../models/Feature').AgentSessionInfo[] | undefined;

    if (this.agentStatusTracker) {
      const sessions = this.agentStatusTracker.getSessions(name);
      if (sessions && sessions.length > 0) {
        // Map all sessions to the feature
        agentSessions = sessions.map(session => ({
          sessionId: session.sessionId,
          status: session.status,
          currentTool: session.currentTool,
          lastActivity: session.lastEventTime,
          terminalName: session.terminalName
        }));

        // For backward compatibility, also set the most recent session as agentSession
        const mostRecentSession = sessions.sort((a, b) =>
          b.lastEventTime.getTime() - a.lastEventTime.getTime()
        )[0];

        agentSession = {
          sessionId: mostRecentSession.sessionId,
          status: mostRecentSession.status,
          currentTool: mostRecentSession.currentTool,
          lastActivity: mostRecentSession.lastEventTime,
          terminalName: mostRecentSession.terminalName
        };
      }
    }

    // Load prompt content
    let prompt: string | undefined;
    try {
      const promptPath = getAbsoluteMetaPath(worktreePath, name, META_FILES.PROMPT);
      if (this.fsFn.existsSync(promptPath)) {
        const promptContent = this.fsFn.readFileSync(promptPath, 'utf-8').trim();
        // Truncate prompt if too long (max 500 chars for tooltip)
        prompt = promptContent.length > 500
          ? promptContent.slice(0, 497) + '...'
          : promptContent;
      }
    } catch {
      // Ignore errors loading prompt
    }

    // Load pending command
    const pendingCommand = this.loadPendingCommand(worktreePath);

    // Get active terminals for this feature
    const activeTerminals = this.getTerminalsForFeature(name);

    return {
      name,
      worktreePath,
      branchName,
      status: determineStatusFn(worktreePath),
      lifecycleStatus: loadLifecycleStatusFn(worktreePath, name),
      messages: this.messageService?.getMessages(worktreePath, name) || [],
      pendingCommand,
      classification,
      agentSession,
      agentSessions,
      activeTerminals,
      prompt
    };
  }

  /**
   * Get terminal information for a feature
   */
  private getTerminalsForFeature(featureName: string): import('../models/Feature').TerminalInfo[] {
    if (!this.terminalProvider) {
      return [];
    }

    const terminals = this.terminalProvider.getTerminalsByFeature(featureName);

    return terminals.map((terminal) => ({
      name: terminal.name,
      terminalId: terminal.name, // Use name as ID for now
      type: terminal.terminalType as 'agent' | 'console' | 'test' | 'prerun' | 'main',
      // Get activity state if available (tmux provider only)
      activityState: terminal.getActivityState ? terminal.getActivityState() : undefined,
      windowIndex: terminal instanceof TmuxTerminal ? terminal.getWindowIndex() : undefined
    }));
  }

  /**
   * Sort features by the given sort order
   */
  private sortFeatures(features: Feature[], sortOrder: { type: 'alphabetical' | 'chronological' | 'stage'; direction: 'asc' | 'desc' }): Feature[] {
    const sorted = [...features];

    switch (sortOrder.type) {
      case 'alphabetical':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;

      case 'chronological':
        // Sort by directory creation time (oldest first in asc)
        sorted.sort((a, b) => {
          const statA = this.fsFn.statSync(a.worktreePath);
          const statB = this.fsFn.statSync(b.worktreePath);
          return statA.birthtimeMs - statB.birthtimeMs;
        });
        break;

      case 'stage': {
        // Define lifecycle stage order
        const stageOrder: Record<FeatureLifecycleStatus, number> = {
          'pre-plan': 1,
          'plan': 2,
          'implement': 3,
          'wrap-up': 4,
          'legacy': 5
        };
        sorted.sort((a, b) => {
          const orderA = stageOrder[a.lifecycleStatus] || 999;
          const orderB = stageOrder[b.lifecycleStatus] || 999;
          return orderA - orderB;
        });
        break;
      }
    }

    // Reverse if direction is 'desc'
    if (sortOrder.direction === 'desc') {
      sorted.reverse();
    }

    return sorted;
  }

  /**
   * Load the pending command from the feature's worktree
   */
  private loadPendingCommand(worktreePath: string): { command: string; missingFiles: string[] } | undefined {
    const featureName = path.basename(worktreePath);
    const pendingCommandPath = getAbsoluteMetaPath(worktreePath, featureName, META_FILES.PENDING_COMMAND);
    if (!this.fsFn.existsSync(pendingCommandPath)) {
      return undefined;
    }
    try {
      const content = this.fsFn.readFileSync(pendingCommandPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // If file is corrupted, return undefined
      return undefined;
    }
  }

  /**
   * Invalidate all features (triggers reload from filesystem)
   */
  public invalidateCache(): void {
    if (this.stateManager) {
      this.stateManager.invalidateAll();
    }
  }

  /**
   * Invalidate a specific feature (triggers reload from filesystem)
   * @param featureName The name of the feature to invalidate
   */
  public invalidateFeatureCache(featureName: string): void {
    if (this.stateManager) {
      this.stateManager.invalidate(featureName);
    }
  }

  /**
   * Scan features directory and populate state manager with archived features
   * Called during initialization and when archived features are updated
   */
  private refreshArchivedFeaturesFromFilesystem(): void {
    if (!this.stateManager) {
      return;
    }

    const featuresDir = getFeaturesDir(this.projectRoot);

    if (!this.fsFn.existsSync(featuresDir)) {
      return;
    }

    // Scan features directory
    const featureNames = this.fsFn.readdirSync(featuresDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    // Filter to only archived features (no worktree)
    const archivedFeatures: Feature[] = [];
    for (const featureName of featureNames) {
      const worktreePath = path.join(this.worktreesDir, featureName);

      // Skip if worktree exists (it's an active feature)
      if (this.fsFn.existsSync(worktreePath)) {
        continue;
      }

      // Read metadata for archived feature
      const metadata = this.readArchivedFeatureMetadata(featureName);
      if (metadata) {
        archivedFeatures.push({
          name: metadata.featureName,
          prompt: metadata.prompt,
          status: {
            type: 'ready-to-merge',
            message: 'Archived feature'
          },
          lifecycleStatus: 'legacy' as FeatureLifecycleStatus,
          mergeCommitHash: metadata.mergeCommitHash,
          mergeDate: metadata.mergeDate,
          worktreePath: path.join(featuresDir, featureName), // Use features folder path for timelog access
          branchName: '' // Archived features don't have a branch
        });
      }
    }

    // Get existing archived features from state manager
    const existingArchivedFeatures = this.stateManager.getArchivedFeatures();
    const newFeatureMap = new Map(archivedFeatures.map(f => [f.name, f]));

    // Remove archived features that no longer exist
    for (const existing of existingArchivedFeatures) {
      if (!newFeatureMap.has(existing.name)) {
        this.stateManager.deleteFeature(existing.name);
      }
    }

    // Add new archived features (don't update existing to avoid triggering events)
    for (const feature of archivedFeatures) {
      if (!this.stateManager.hasArchivedFeature(feature.name)) {
        this.stateManager.addArchivedFeature(feature);
      }
    }
  }

  /**
   * Get all archived features (pure read operation from state manager)
   */
  public async getArchivedFeatures(sortOrder?: { type: 'alphabetical' | 'chronological' | 'stage'; direction: 'asc' | 'desc' }): Promise<Feature[]> {
    // Refresh from filesystem to ensure up-to-date
    this.refreshArchivedFeaturesFromFilesystem();

    // Read from state manager (single source of truth)
    if (this.stateManager) {
      const archived = this.stateManager.getArchivedFeatures();

      // Apply sort order if provided, otherwise default to merge date descending
      if (sortOrder) {
        return this.sortFeatures(archived, sortOrder);
      }

      // Default sort by merge date descending (most recent first)
      return archived.sort((a, b) =>
        (b.mergeDate?.getTime() || 0) - (a.mergeDate?.getTime() || 0)
      );
    }

    // Fallback if state manager not initialized
    return [];
  }

  /**
   * Invalidate the archived feature cache
   */
  public invalidateArchivedCache(): void {
    // Refresh archived features from filesystem
    this.refreshArchivedFeaturesFromFilesystem();
  }
}
