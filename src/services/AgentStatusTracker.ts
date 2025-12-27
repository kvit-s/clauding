import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FeatureStateManager } from '../state/FeatureStateManager';
import { getFeaturesOutputsDir, getProjectRoot } from '../utils/featureMetaPaths';

export type AgentStatus =
  | 'starting'
  | 'active'
  | 'executing-tool'
  | 'waiting-input'
  | 'idle'
  | 'stopped';

export interface AgentEvent {
  eventType: string;
  toolName?: string;
  featureName: string;
  sessionId: string;
  timestamp: string;
  pid: number;
}

export interface SessionMetrics {
  totalDuration: number; // milliseconds
  toolExecutionTime: Map<string, number>; // toolName -> total ms
  eventCount: Map<string, number>; // eventType -> count
  idleTime: number; // time spent idle
  waitingTime: number; // time waiting for input
}

export interface AgentSession {
  sessionId: string;
  featureName: string;
  status: AgentStatus;
  currentTool?: string;
  lastEvent: AgentEvent;
  lastEventTime: Date;
  eventHistory: AgentEvent[];
  terminalName?: string;
  metrics: SessionMetrics;
}

export class AgentStatusTracker {
  private sessions: Map<string, AgentSession> = new Map();
  private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private pruneInterval: NodeJS.Timeout | undefined;
  private stateManager?: FeatureStateManager;
  private _onAgentIdle: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
  public readonly onAgentIdle: vscode.Event<string> = this._onAgentIdle.event;

  constructor(private worktreesDir: string) {
    // Start periodic cleanup of inactive sessions
    this.pruneInterval = setInterval(() => this.pruneInactiveSessions(), 300000); // Every 5 minutes
  }

  /**
   * Set the state manager for cache invalidation
   */
  public setStateManager(stateManager: FeatureStateManager): void {
    this.stateManager = stateManager;
  }

  /**
   * Start watching a feature's agent status
   */
  public startTracking(featureName: string): void {
    if (this.watchers.has(featureName)) {
      return; // Already watching
    }

    // Get worktree path and derive project root
    const worktreePath = path.join(this.worktreesDir, featureName);
    const projectRoot = getProjectRoot(worktreePath);

    // Use the correct path: .clauding/features/{feature-name}/outputs
    const statusDir = getFeaturesOutputsDir(projectRoot, featureName);

    // Ensure directory exists
    if (!fs.existsSync(statusDir)) {
      fs.mkdirSync(statusDir, { recursive: true });
    }

    // Watch for all .agent-status-* files in the outputs directory
    // Use absolute glob pattern for better compatibility in WSL
    const globPattern = path.join(statusDir, '.agent-status-*');

    const watcher = vscode.workspace.createFileSystemWatcher(globPattern);

    // Handle any status file change (any session)
    watcher.onDidChange((uri) => this.handleStatusChange(featureName, uri));
    watcher.onDidCreate((uri) => this.handleStatusChange(featureName, uri));

    this.watchers.set(featureName, watcher);
  }

  /**
   * Stop watching a feature
   */
  public stopTracking(featureName: string): void {
    const watcher = this.watchers.get(featureName);
    if (watcher) {
      watcher.dispose();
      this.watchers.delete(featureName);
    }

    // Remove sessions for this feature
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.featureName === featureName) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get current session for feature (most recent)
   */
  public getSession(featureName: string): AgentSession | undefined {
    const sessions = this.getSessions(featureName);
    if (sessions.length === 0) {
      return undefined;
    }

    // Return most recent session
    return sessions.sort((a, b) =>
      b.lastEventTime.getTime() - a.lastEventTime.getTime()
    )[0];
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.status !== 'stopped' && s.status !== 'idle'
    );
  }

  /**
   * Get all sessions for a specific feature (supports multiple concurrent agents)
   */
  public getSessions(featureName: string): AgentSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.featureName === featureName
    );
  }

  /**
   * Handle status file change
   */
  private async handleStatusChange(featureName: string, fileUri: vscode.Uri): Promise<void> {
    try {
      const content = await fs.promises.readFile(fileUri.fsPath, 'utf-8');
      const event = this.parseEvent(content);

      if (event) {
        this.updateSession(event);
      }
    } catch {
      // File doesn't exist or is unreadable - ignore
      // This can happen during rapid file writes
    }
  }

  /**
   * Parse and validate event JSON
   */
  private parseEvent(content: string): AgentEvent | null {
    try {
      const event = JSON.parse(content) as AgentEvent;

      // Validate required fields
      if (!event.eventType || !event.featureName || !event.sessionId || !event.timestamp) {
        return null;
      }

      return event;
    } catch {
      return null;
    }
  }

  /**
   * Update session state based on event
   */
  private updateSession(event: AgentEvent): void {
    const { sessionId, featureName } = event;

    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        sessionId,
        featureName,
        status: 'starting',
        lastEvent: event,
        lastEventTime: new Date(event.timestamp),
        eventHistory: [],
        metrics: {
          totalDuration: 0,
          toolExecutionTime: new Map(),
          eventCount: new Map(),
          idleTime: 0,
          waitingTime: 0
        }
      };
      this.sessions.set(sessionId, session);
    }

    // Track previous status to detect transitions
    const previousStatus = session.status;

    // Update metrics before changing status
    this.updateMetrics(session, event);

    // Update status based on event type
    session.status = this.mapEventToStatus(event.eventType);
    session.currentTool = event.toolName;
    session.lastEvent = event;
    session.lastEventTime = new Date(event.timestamp);
    session.eventHistory.push(event);

    // Keep only last 100 events
    const maxHistory = vscode.workspace.getConfiguration('clauding.agentStatus').get<number>('maxHistoryEvents', 100);
    if (session.eventHistory.length > maxHistory) {
      session.eventHistory.shift();
    }

    // Invalidate state manager cache for this feature
    if (this.stateManager) {
      this.stateManager.invalidate(session.featureName);
    }

    // Detect transition to idle or end-of-session and fire event
    if ((session.status === 'idle' || session.status === 'stopped') && previousStatus !== session.status) {
      this._onAgentIdle.fire(featureName);
    }

    // Notify user if configured
    this.notifyIfNeeded(session);
  }

  /**
   * Map event type to agent status
   */
  private mapEventToStatus(eventType: string): AgentStatus {
    const mapping: Record<string, AgentStatus> = {
      'SessionStart': 'starting',
      'UserPromptSubmit': 'active',
      'PreToolUse': 'executing-tool',
      'PostToolUse': 'active',
      'Stop': 'idle',
      'Notification': 'waiting-input',
      'SessionEnd': 'stopped',
      'SubagentStop': 'active'
    };

    return mapping[eventType] || 'active';
  }

  /**
   * Update session metrics
   */
  private updateMetrics(session: AgentSession, event: AgentEvent): void {
    const timeSinceLastEvent =
      new Date(event.timestamp).getTime() -
      session.lastEventTime.getTime();

    // Track time by status
    switch (session.status) {
      case 'executing-tool':
        if (session.currentTool) {
          const toolTime = session.metrics.toolExecutionTime.get(session.currentTool) || 0;
          session.metrics.toolExecutionTime.set(session.currentTool, toolTime + timeSinceLastEvent);
        }
        break;
      case 'idle':
        session.metrics.idleTime += timeSinceLastEvent;
        break;
      case 'waiting-input':
        session.metrics.waitingTime += timeSinceLastEvent;
        break;
    }

    // Increment event count
    const count = session.metrics.eventCount.get(event.eventType) || 0;
    session.metrics.eventCount.set(event.eventType, count + 1);

    // Update total duration
    session.metrics.totalDuration =
      new Date(event.timestamp).getTime() -
      new Date(session.eventHistory[0]?.timestamp || event.timestamp).getTime();
  }

  /**
   * Cleanup inactive sessions and their status files
   */
  private pruneInactiveSessions(): void {
    const timeout = vscode.workspace.getConfiguration('clauding.agentStatus').get<number>('sessionTimeout', 3600) * 1000;
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveTime = now - session.lastEventTime.getTime();
      if (inactiveTime > timeout && (session.status === 'idle' || session.status === 'stopped')) {
        // Clean up the status file from disk
        try {
          // Get worktree path and derive project root
          const worktreePath = path.join(this.worktreesDir, session.featureName);
          const projectRoot = getProjectRoot(worktreePath);

          // Use the correct path: .clauding/features/{feature-name}/outputs
          const statusDir = getFeaturesOutputsDir(projectRoot, session.featureName);
          const statusFilePath = path.join(statusDir, `.agent-status-${sessionId}`);

          if (fs.existsSync(statusFilePath)) {
            fs.unlinkSync(statusFilePath);
          }
        } catch {
          // Ignore errors - status file might already be deleted
        }

        // Remove session from memory
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Send notifications based on user configuration
   */
  private notifyIfNeeded(session: AgentSession): void {
    const config = vscode.workspace.getConfiguration('clauding.agentStatus');
    const notifications = config.get<{
      notifyOnIdle?: boolean;
      notifyOnError?: boolean;
      notifyOnInput?: boolean;
    }>('notifications', {
      notifyOnIdle: false,
      notifyOnError: true,
      notifyOnInput: true
    });

    if (session.status === 'idle' && notifications.notifyOnIdle) {
      vscode.window.showInformationMessage(
        `Agent completed in ${session.featureName}`,
        'Show Terminal'
      ).then(action => {
        if (action === 'Show Terminal' && session.terminalName) {
          // Activate terminal - would need terminal reference
          vscode.commands.executeCommand('clauding.showTerminal', session.terminalName);
        }
      });
    }

    if (session.status === 'waiting-input' && notifications.notifyOnInput) {
      vscode.window.showWarningMessage(
        `Agent needs input in ${session.featureName}`,
        'Show Terminal'
      ).then(action => {
        if (action === 'Show Terminal' && session.terminalName) {
          vscode.commands.executeCommand('clauding.showTerminal', session.terminalName);
        }
      });
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    // Clear interval
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
    }

    // Dispose all watchers
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
    this.sessions.clear();

    // Dispose event emitter
    this._onAgentIdle.dispose();
  }
}
