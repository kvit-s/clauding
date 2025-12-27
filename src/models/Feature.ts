import { FeatureMessage } from './FeatureMessage';

export type AgentStatus =
  | 'starting'
  | 'active'
  | 'executing-tool'
  | 'waiting-input'
  | 'idle'
  | 'stopped';

export interface AgentSessionInfo {
  sessionId: string;
  status: AgentStatus;
  currentTool?: string;
  lastActivity: Date;
  terminalName?: string;
}

export interface EditorActivity {
  document: string;       // Document URI or path
  isDirty: boolean;       // Has unsaved changes
}

export interface TerminalInfo {
  name: string;
  terminalId: string;
  type: 'agent' | 'console' | 'test' | 'prerun' | 'main';
  activityState?: 'active' | 'idle' | 'has-activity';
  windowIndex?: number;
}

export interface Feature {
  name: string;                    // Feature name (without "feature-" prefix)
  worktreePath: string;            // Absolute path to worktree (or archived feature path for archived)
  branchName: string;              // "feature/{name}" (or empty string for archived)
  status: FeatureStatus;           // Current state (legacy, still used for detailed status)
  lifecycleStatus: FeatureLifecycleStatus; // New: pre-plan/plan/implement/wrap-up
  messages?: FeatureMessage[];     // Messages displayed in the message panel
  pendingCommand?: PendingCommand; // Set when waiting for [Apply]
  classification?: {
    result: 'lightweight' | 'standard';
    timestamp: string;
    modelUsed: string;
  };
  activeEditors?: EditorActivity[];     // Active editors for this feature
  prompt?: string;                 // Feature prompt text from prompt.md

  // Hook-based agent status (single session for backward compatibility)
  agentSession?: AgentSessionInfo;

  // All active agent sessions (supports multiple concurrent agents per feature)
  agentSessions?: AgentSessionInfo[];

  // Active terminals for this feature
  activeTerminals?: TerminalInfo[];

  /**
   * For archived features: git commit hash where metadata can be retrieved
   */
  metadataCommitHash?: string;

  /**
   * For archived features: git commit hash of the merge commit
   */
  mergeCommitHash?: string;

  /**
   * For archived features: date when feature was merged
   */
  mergeDate?: Date;
}

/**
 * High-level feature lifecycle status
 */
export type FeatureLifecycleStatus = 'pre-plan' | 'plan' | 'implement' | 'wrap-up' | 'legacy';

export interface FeatureStatus {
  type: 'just-created' | 'needs-plan' | 'classifying' | 'plan-created' | 'implementing' |
        'tests-failed' | 'tests-passed' | 'ready-to-merge' | 'waiting-for-edit';
  message: string;                 // Status message to display
}

export interface PendingCommand {
  command: string;                 // Command name (e.g., "Create Plan")
  missingFiles: string[];          // Files that were created/need editing
}

export interface TimelogEntry {
  timestamp: string;               // ISO 8601
  action: string;                  // Action name
  result: 'Success' | 'Failed' | 'Warning';
  details?: Record<string, unknown>;  // Optional metadata
  commitHash?: string;             // Git commit hash at the start of the operation
}

/**
 * Helper function to determine if a feature is archived.
 * A feature is archived if it has no branch (empty branchName).
 */
export function isArchived(feature: Feature): boolean {
  return feature.branchName === '';
}
