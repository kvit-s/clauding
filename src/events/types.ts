/**
 * Event types for the Clauding event bus
 *
 * All extension-wide events are defined here for type safety
 */

// ============================================
// Feature Events
// ============================================

export interface FeatureCreatedEvent {
	type: 'feature.created';
	featureName: string;
	worktreePath: string;
	branchName: string;
	timestamp: Date;
}

export interface FeatureUpdatedEvent {
	type: 'feature.updated';
	featureName: string;
	changes: Record<string, unknown>;
	timestamp: Date;
}

export interface FeatureDeletedEvent {
	type: 'feature.deleted';
	featureName: string;
	timestamp: Date;
}

export interface FeatureArchivedEvent {
	type: 'feature.archived';
	featureName: string;
	archivePath: string;
	timestamp: Date;
}

export interface FeatureUnarchivedEvent {
	type: 'feature.unarchived';
	featureName: string;
	worktreePath: string;
	timestamp: Date;
}

// ============================================
// Agent Events
// ============================================

export interface AgentStartedEvent {
	type: 'agent.started';
	featureName: string;
	sessionId: string;
	command: string;
	timestamp: Date;
}

export interface AgentCompletedEvent {
	type: 'agent.completed';
	featureName: string;
	sessionId: string;
	command: string;
	outputFile?: string;
	exitCode?: number;
	timestamp: Date;
}

export interface AgentStatusChangedEvent {
	type: 'agent.statusChanged';
	featureName: string;
	sessionId: string;
	status: 'starting' | 'active' | 'executing-tool' | 'waiting-input' | 'idle' | 'stopped';
	currentTool?: string;
	timestamp: Date;
}

export interface AgentErrorEvent {
	type: 'agent.error';
	featureName: string;
	sessionId: string;
	error: string;
	timestamp: Date;
}

// ============================================
// File Events
// ============================================

export interface FileChangedEvent {
	type: 'file.changed';
	featureName: string;
	filePath: string;
	changeType: 'metadata' | 'output' | 'status' | 'other';
	timestamp: Date;
}

export interface FileCreatedEvent {
	type: 'file.created';
	featureName: string;
	filePath: string;
	timestamp: Date;
}

export interface FileDeletedEvent {
	type: 'file.deleted';
	featureName: string;
	filePath: string;
	timestamp: Date;
}

// ============================================
// View Events
// ============================================

export interface ViewChangedEvent {
	type: 'view.changed';
	viewMode: 'active' | 'archived';
	timestamp: Date;
}

export interface FeatureSelectedEvent {
	type: 'feature.selected';
	featureName: string | null;
	source: 'user' | 'editor' | 'terminal' | 'system';
	timestamp: Date;
}

export interface SortOrderChangedEvent {
	type: 'sortOrder.changed';
	sortOrder: 'alphabetical' | 'recent';
	timestamp: Date;
}

// ============================================
// Git Events
// ============================================

export interface GitBranchChangedEvent {
	type: 'git.branchChanged';
	featureName: string;
	branchName: string;
	timestamp: Date;
}

export interface GitMergeRequestedEvent {
	type: 'git.mergeRequested';
	featureName: string;
	targetBranch: string;
	timestamp: Date;
}

export interface GitMergeCompletedEvent {
	type: 'git.mergeCompleted';
	featureName: string;
	targetBranch: string;
	success: boolean;
	timestamp: Date;
}

// ============================================
// Output Events
// ============================================

export interface OutputParsedEvent {
	type: 'output.parsed';
	featureName: string;
	outputFile: string;
	messageCount: number;
	timestamp: Date;
}

export interface OutputErrorEvent {
	type: 'output.error';
	featureName: string;
	outputFile: string;
	error: string;
	timestamp: Date;
}

// ============================================
// Union Type of All Events
// ============================================

export type ClaudingEvent =
	// Feature events
	| FeatureCreatedEvent
	| FeatureUpdatedEvent
	| FeatureDeletedEvent
	| FeatureArchivedEvent
	| FeatureUnarchivedEvent
	// Agent events
	| AgentStartedEvent
	| AgentCompletedEvent
	| AgentStatusChangedEvent
	| AgentErrorEvent
	// File events
	| FileChangedEvent
	| FileCreatedEvent
	| FileDeletedEvent
	// View events
	| ViewChangedEvent
	| FeatureSelectedEvent
	| SortOrderChangedEvent
	// Git events
	| GitBranchChangedEvent
	| GitMergeRequestedEvent
	| GitMergeCompletedEvent
	// Output events
	| OutputParsedEvent
	| OutputErrorEvent;

/**
 * Extract the event type string from the ClaudingEvent union
 */
export type EventType = ClaudingEvent['type'];

/**
 * Get the event payload type for a given event type string
 */
export type EventPayload<T extends EventType> = Extract<ClaudingEvent, { type: T }>;

/**
 * Type-safe event handler for a specific event type
 */
export type TypedEventHandler<T extends EventType> = (event: EventPayload<T>) => void;

/**
 * Generic event handler (any event type)
 */
export type EventHandler = (event: ClaudingEvent) => void;
