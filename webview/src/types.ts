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
  lastActivity: Date | string;  // Can be Date or ISO string
  terminalName?: string;
}

export interface TerminalInfo {
  name: string;
  terminalId: string;
  type: 'agent' | 'console' | 'test' | 'prerun' | 'main';
  activityState?: 'active' | 'idle' | 'has-activity';
  windowIndex?: number;
}

export interface Feature {
  name: string;
  worktreePath: string;
  branchName: string;
  status: FeatureStatus;
  lifecycleStatus: FeatureLifecycleStatus;
  messages?: FeatureMessage[];
  pendingCommand?: PendingCommand;
  // Hook-based agent status
  agentSession?: AgentSessionInfo;
  agentSessions?: AgentSessionInfo[];
  activeTerminals?: TerminalInfo[];
  prompt?: string;
  isArchived?: boolean;
  mergeDate?: string;  // ISO date string for archived features
}

export type FeatureLifecycleStatus = 'pre-plan' | 'plan' | 'implement' | 'wrap-up' | 'legacy';

export interface FeatureMessage {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'warning' | 'error' | 'success';
  actions?: MessageAction[];
  dismissible: boolean;
}

export interface MessageAction {
  label: string;
  command: string;
  args?: any[];
}

export interface FeatureStatus {
  type: 'just-created' | 'needs-plan' | 'plan-created' | 'implementing' |
        'tests-failed' | 'tests-passed' | 'ready-to-merge' | 'waiting-for-edit';
  message: string;
}

export interface PendingCommand {
  command: string;
  missingFiles: string[];
}

export interface TimelogEntry {
  timestamp: string;
  action: string;
  result: 'Success' | 'Failed' | 'Warning';
  commitHash?: string;
  details?: {
    file?: string;
    commitHash?: string;
    outputFile?: string;
    [key: string]: any;
  };
}

export type SortType = 'alphabetical' | 'chronological' | 'stage';
export type SortDirection = 'asc' | 'desc';

export interface SortOrder {
  type: SortType;
  direction: SortDirection;
}

export type ViewMode = 'active' | 'archived';

export interface AgentDefinition {
  id: string;           // Used for both identification and display
  executable: string;
  flags: string;
}

export interface AgentCommand {
  name: string;
  label?: string;
  path: string;
  prompt: string;
  requiredFiles?: any[];
  outputFilePrefix: string;
  preferredAgentId?: string;  // Optional agent ID preference
}

export interface SearchState {
  query: string;
  isActive: boolean;
}

export interface WebviewState {
  features: Feature[];
  selectedFeature: Feature | null;
  timelog: TimelogEntry[];
  sortOrder: SortOrder;
  viewMode: ViewMode;
  agentCommands: AgentCommand[];
  agents: AgentDefinition[];        // NEW
  defaultAgentId: string;           // NEW
  searchState?: SearchState;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  gitStatus?: 'M' | 'A' | 'D' | 'R' | 'U';
  children?: FileTreeNode[];
}

// VS Code API type
export interface VsCodeApi {
  postMessage(message: any): void;
  setState(state: any): void;
  getState(): any;
}

// VS Code API for webview
declare global {
  function acquireVsCodeApi(): VsCodeApi;
}
