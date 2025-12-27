# Clauding Extension Architecture

## Overview

The Clauding VS Code extension follows a clean, layered architecture with clear separation of concerns. This document describes the current architecture and design patterns.

## Core Principles

1. **Single Source of Truth**: All feature state lives in `FeatureStateManager`
2. **Event-Driven Updates**: State changes trigger events, which drive UI updates
3. **Separation of Concerns**: Clear boundaries between services, UI, and state management
4. **Type Safety**: Strong typing throughout, especially for events
5. **Performance**: Debouncing, coalescing, and efficient invalidation patterns

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                             │
│  ┌────────────────┐  ┌──────────────────┐                   │
│  │ Sidebar WebView │  │ Status Bar Items │                   │
│  └────────────────┘  └──────────────────┘                   │
│  ┌────────────────────────────────────────┐                 │
│  │ Message Handlers (25+ handlers)        │                 │
│  │  - CreateFeatureHandler                │                 │
│  │  - MergeHandler, CommitHandler         │                 │
│  │  - RunHandler, SelectFeatureHandler    │                 │
│  │  - ... and more                        │                 │
│  └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                    Coordination Layer                        │
│  ┌─────────────────────┴────────────────┐                   │
│  │     UIUpdateCoordinator              │                   │
│  │  - Debounces updates (100ms)         │                   │
│  │  - Coalesces multiple changes        │                   │
│  │  - Single update mechanism           │                   │
│  │  - Subscribes to onAgentIdle         │                   │
│  └───────────────────▲──────────────────┘                   │
└────────────────────────┼─────────────────────────────────────┘
                          │ subscribes to state events
┌─────────────────────────┼───────────────────────────────────┐
│                     State Layer                              │
│  ┌─────────────────────┴────────────────┐                   │
│  │    FeatureStateManager               │                   │
│  │  - activeFeatures: Map<string, Feature>                  │
│  │  - archivedFeatures: Map<string, Feature>                │
│  │  - Emits: create, update, delete,    │                   │
│  │           invalidate, invalidate-all │                   │
│  │  - Single source of truth            │                   │
│  └───────────────────▲──────────────────┘                   │
└────────────────────────┼─────────────────────────────────────┘
                          │ invalidates state
┌─────────────────────────┼───────────────────────────────────┐
│                    Service Layer                             │
│  ┌──────────────────────┴─────────────────┐                 │
│  │  File Watchers                         │                 │
│  │  ┌─────────────────────────────────┐   │                 │
│  │  │ FeatureFileWatcher              │   │                 │
│  │  │  - Consolidated watcher         │   │                 │
│  │  │  - Watches: metadata, outputs,  │   │                 │
│  │  │    agent status                 │   │                 │
│  │  │  - Debounced events (100ms)     │   │                 │
│  │  └─────────────────────────────────┘   │                 │
│  │  ┌─────────────────────────────────┐   │                 │
│  │  │ FeatureMetadataWatcher          │   │                 │
│  │  │  - Watches: plan.md, status.json│   │                 │
│  │  │  - Calls: stateManager.invalidate│   │                 │
│  │  └─────────────────────────────────┘   │                 │
│  │  ┌─────────────────────────────────┐   │                 │
│  │  │ AgentStatusTracker              │   │                 │
│  │  │  - Watches: .agent-status-*     │   │                 │
│  │  │  - Tracks agent sessions        │   │                 │
│  │  │  - Emits: onAgentIdle           │   │                 │
│  │  │  - Calls: stateManager.invalidate│   │                 │
│  │  └─────────────────────────────────┘   │                 │
│  └────────────────────────────────────────┘                 │
│  ┌────────────────────────────────────────┐                 │
│  │  Agent Processing                      │                 │
│  │  ┌─────────────────────────────────┐   │                 │
│  │  │ AgentExecutionStateMachine      │   │                 │
│  │  │  - State: idle → starting →     │   │                 │
│  │  │    running → completing → idle  │   │                 │
│  │  │  - Validated transitions        │   │                 │
│  │  └─────────────────────────────────┘   │                 │
│  │  ┌─────────────────────────────────┐   │                 │
│  │  │ OutputProcessingPipeline        │   │                 │
│  │  │  - FileStabilityStage           │   │                 │
│  │  │  - ParsingStage                 │   │                 │
│  │  │  - ValidationStage              │   │                 │
│  │  │  - StorageStage                 │   │                 │
│  │  └─────────────────────────────────┘   │                 │
│  └────────────────────────────────────────┘                 │
│  ┌────────────────────────────────────────┐                 │
│  │  Business Logic                        │                 │
│  │  - FeatureService                      │                 │
│  │  - FeatureQueryService                 │                 │
│  │  - FeatureStatusResolver               │                 │
│  │  - FeatureLifecycleManager             │                 │
│  │  - FeatureCommitHelper                 │                 │
│  │  - FeatureTerminalManager              │                 │
│  │  - FeatureMergeCoordinator             │                 │
│  │  - GitService                          │                 │
│  │  - GitHistoryService                   │                 │
│  │  - AgentService                        │                 │
│  │  - WorktreeService                     │                 │
│  │  - TestService                         │                 │
│  │  - MergeService                        │                 │
│  │  - ConfigService                       │                 │
│  └────────────────────────────────────────┘                 │
│  ┌────────────────────────────────────────┐                 │
│  │  Terminal Providers                    │                 │
│  │  - ITerminalProvider (interface)       │                 │
│  │  - VSCodeTerminalProvider              │                 │
│  │  - TmuxTerminalProvider                │                 │
│  │  - TerminalProviderFactory             │                 │
│  └────────────────────────────────────────┘                 │
│  ┌────────────────────────────────────────┐                 │
│  │  Infrastructure                        │                 │
│  │  - ServiceContainer (DI)               │                 │
│  │  - ClaudingEventBus                    │                 │
│  └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### FeatureStateManager (`src/state/FeatureStateManager.ts`)

The central state manager that owns all feature state. Maintains separate maps for active and archived features.

**Internal Structure:**
```typescript
class FeatureStateManager {
  private activeFeatures: Map<string, Feature>;
  private archivedFeatures: Map<string, Feature>;
}
```

**API:**
```typescript
class FeatureStateManager {
  // Read operations (searches both active and archived)
  getFeature(name: string): Feature | null
  getAllFeatures(): Feature[]
  getArchivedFeatures(): Feature[]
  hasFeature(name: string): boolean

  // Read operations (specific list)
  getActiveFeature(name: string): Feature | null
  getArchivedFeature(name: string): Feature | null
  hasActiveFeature(name: string): boolean
  hasArchivedFeature(name: string): boolean

  // Write operations (emit events)
  createFeature(feature: Feature): void
  addArchivedFeature(feature: Feature): void
  updateFeature(name: string, updates: Partial<Feature>): void
  deleteFeature(name: string): void

  // Invalidation (triggers reload from disk)
  invalidate(name: string): void
  invalidateAll(): void
  invalidateAllActive(): void
  invalidateAllArchived(): void

  // Diagnostics
  getStats(): { totalFeatures: number; activeFeatures: number; archivedFeatures: number }
  logState(): void

  // Events
  onStateChanged: Event<FeatureStateChange>
}
```

**Event Types:**
- `create` - New feature added
- `update` - Feature modified
- `delete` - Feature removed
- `invalidate` - Feature needs reload from disk
- `invalidate-all` - All features need reload

### UIUpdateCoordinator (`src/ui/UIUpdateCoordinator.ts`)

Coordinates all UI updates to prevent excessive refreshes.

**Responsibilities:**
- Subscribe to FeatureStateManager events
- Subscribe to AgentStatusTracker `onAgentIdle` for file tree refresh
- Debounce rapid changes (100ms window)
- Coalesce multiple feature updates into single UI refresh
- Maintain update metrics

**Dependencies:**
- `FeatureStateManager` - for state change events
- `WebviewUpdater` - for sending updates to webview
- `AgentStatusTracker` (optional) - for idle events

**Flow:**
1. State manager emits change event
2. Coordinator adds feature to update queue
3. Debounce timer resets
4. After 100ms of inactivity, single UI update sent
5. Metrics tracked (update count, coalescing rate)

### ClaudingEventBus (`src/events/ClaudingEventBus.ts`)

Strongly-typed event bus for extension-wide events.

**Features:**
- Type-safe publish/subscribe
- Event logging and debugging
- Wildcard subscriptions
- Event metrics tracking

**Event Categories (`src/events/types.ts`):**

| Category | Events |
|----------|--------|
| Feature | `feature.created`, `feature.updated`, `feature.deleted`, `feature.archived`, `feature.unarchived` |
| Agent | `agent.started`, `agent.completed`, `agent.statusChanged`, `agent.error` |
| File | `file.changed`, `file.created`, `file.deleted` |
| View | `view.changed`, `feature.selected`, `sortOrder.changed` |
| Git | `git.branchChanged`, `git.mergeRequested`, `git.mergeCompleted` |
| Output | `output.parsed`, `output.error` |

**Usage:**
```typescript
// Publish
eventBus.publish({
  type: 'feature.created',
  featureName: 'my-feature',
  worktreePath: '/path/to/worktree',
  branchName: 'feature/my-feature',
  timestamp: new Date()
});

// Subscribe
eventBus.subscribe('feature.created', (event) => {
  // Handle event
});

// Wildcard subscription
eventBus.subscribeAll((event) => {
  console.log('Event:', event.type);
});
```

### FeatureMetadataWatcher (`src/services/FeatureMetadataWatcher.ts`)

Watches feature metadata files for changes.

**Watched Files:**
- `plan.md` - Plan creation/modification
- `status.json` - Status changes
- `prompt.md` - Feature prompts
- `modify-prompt.md` - Plan modifications
- `outputs/implement-plan*.txt` - Implementation outputs
- `outputs/wrap-up.json` - Wrap-up completion

**Flow:**
1. File system detects change
2. Watcher debounces (100ms)
3. Calls `stateManager.invalidate(featureName)`
4. State manager emits `invalidate` event
5. UIUpdateCoordinator refreshes webview

### AgentStatusTracker (`src/services/AgentStatusTracker.ts`)

Tracks agent execution status in real-time.

**Responsibilities:**
- Watch for `.agent-status-*` files
- Parse agent events (tool execution, status changes)
- Maintain session metrics (duration, tool time, idle time)
- Trigger state invalidation when status changes
- Emit `onAgentIdle` event when agent stops
- Prune inactive sessions periodically
- Send user notifications based on configuration

**Agent Status Values:**
- `starting` - Agent session starting
- `active` - Agent is processing
- `executing-tool` - Agent is running a tool
- `waiting-input` - Agent waiting for user input
- `idle` - Agent finished
- `stopped` - Session ended

**Flow:**
1. Agent writes status file
2. Tracker detects and parses event
3. Updates session information
4. Calls `stateManager.invalidate(featureName)`
5. Fires `onAgentIdle` if transitioning to idle/stopped
6. UI automatically refreshes via UIUpdateCoordinator

### AgentExecutionStateMachine (`src/services/AgentExecutionStateMachine.ts`)

Provides explicit state management for agent execution with validated transitions.

**States:**
- `idle` → `starting`
- `starting` → `running` | `error`
- `running` → `completing` | `error`
- `completing` → `idle` | `error`
- `error` → `idle`

**Benefits:**
- Prevents invalid state transitions
- Clear error handling
- Easier debugging and testing

### OutputProcessingPipeline (`src/services/output/OutputProcessingPipeline.ts`)

Structured pipeline for processing agent output files.

**Stages (in order):**
1. **FileStabilityStage** - Wait for file to stabilize (size stops changing)
2. **ParsingStage** - Parse output content
3. **ValidationStage** - Validate file format and content
4. **StorageStage** - Store processed results

**Benefits:**
- Testable individual stages
- Easy to add new stages
- Clear separation of concerns
- Consistent error handling

### ServiceContainer (`src/di/ServiceContainer.ts`)

Dependency injection container for managing service lifecycle and dependencies.

**Service Layers:**
- **Infrastructure** - Logging, events (ClaudingEventBus, FeatureStateManager, TerminalProvider)
- **Core** - Git, Worktree, Config, Timelog services
- **Feature** - Feature management (FeatureService, FeatureQueryService, MetadataWatcher, etc.)
- **Agent** - Agent execution (AgentService, OutputParserService, AgentStatusTracker, OutputPipeline)
- **UI** - UI coordination (UIUpdateCoordinator)

**Dependency Injection Patterns:**
- **Constructor injection** - Services accept optional dependencies (e.g., `fsOverride?: typeof fs`)
- **Setter injection** - Services expose setters for cross-layer dependencies (e.g., `setStateManager()`)
- **Chained injection** - Parent services pass dependencies to child services

**Benefits:**
- Clear service boundaries
- No circular dependencies at construction
- Centralized lifecycle management
- Full test coverage support (mock fs, services)
- Type-safe dependency resolution

### FeatureFileWatcher (`src/watchers/FeatureFileWatcher.ts`)

Consolidated file watcher that monitors all feature-related files.

**Watches two locations per feature:**
1. **Worktree `.clauding/`** - `prompt.md`, `plan.md`, `modify-prompt.md`
2. **Features folder** - `status.json`, `classification.json`, `timelog.json`, `lifecycle.json`, `messages.json`, `pending-command.json`, `wrap-up.json`, `outputs/**`, `.agent-status-*`

**File Change Types:**
- `metadata` - plan.md, prompt.md, classification.json, etc.
- `output` - Files in outputs/ directory
- `status` - status.json and .agent-status-* files
- `other` - Unclassified files

**Benefits:**
- Reduces number of file watchers
- Consistent debouncing (100ms)
- Single event stream for all file changes
- Lower resource usage

### FeatureQueryService (`src/services/FeatureQueryService.ts`)

Handles feature querying, caching, and sorting logic.

**Responsibilities:**
- Query features from filesystem
- Populate state manager cache
- Sort features by different criteria
- Manage archived features cache

**Sorting Options:**
- Alphabetical - By feature name
- Chronological - By creation time
- Stage - By lifecycle status

### FeatureStatusResolver (`src/services/FeatureStatusResolver.ts`)

Determines feature status based on filesystem state and git information.

**Status Rules:**
- `conflict` - Merge conflicts present
- `modified` - Uncommitted changes
- `untracked` - Untracked files exist
- `clean` - No changes

### FeatureLifecycleManager (`src/services/FeatureLifecycleManager.ts`)

Manages feature lifecycle status transitions based on file presence.

**Lifecycle Detection:**
- `pre-plan` - Only prompt.md exists
- `plan` - plan.md exists
- `implement` - implement-plan*.txt files exist
- `merge` - Manual status in status.json
- `wrap-up` - wrap-up.json exists

### Terminal Providers (`src/terminals/`)

Abstraction layer for terminal management supporting multiple backends.

**Components:**
- `ITerminalProvider` - Interface defining terminal operations
- `VSCodeTerminalProvider` - VS Code integrated terminal
- `TmuxTerminalProvider` - tmux-based terminal (with control mode)
- `TerminalProviderFactory` - Creates appropriate provider based on config

**Tmux Support:**
- Session management
- Window management
- Buffer capture
- Activity monitoring
- Control mode for programmatic control

### Message Handlers (`src/providers/sidebar/handlers/`)

Modular handlers for webview messages. Each handler processes a specific message type.

**Key Handlers:**
- `CreateFeatureHandler` - Create new features
- `SelectFeatureHandler` - Feature selection
- `RunHandler` - Execute agent commands
- `MergeHandler` - Merge features to main
- `CommitHandler` - Commit changes
- `OpenFileHandler` - Open files in editor
- `GetFileTreeHandler` - Build file tree for UI
- Plus 18+ more handlers

## Data Flow

### Feature Creation

```
User clicks "Create Feature"
  ↓
CreateFeatureHandler
  ↓
FeatureService.createFeature()
  ↓
- Creates worktree
- Creates metadata files
- Gets feature data
  ↓
Feature data loaded into memory
  ↓
FeatureQueryService calls getFeature()
  ↓
StateManager.createFeature() (automatic)
  ↓
StateManager emits 'create' event
  ↓
UIUpdateCoordinator receives event
  ↓
After 100ms debounce
  ↓
Webview refreshed with new feature
```

### Metadata Change

```
User saves plan.md
  ↓
File system emits change event
  ↓
FeatureMetadataWatcher receives event
  ↓
Debounced for 100ms
  ↓
stateManager.invalidate('feature-name')
  ↓
StateManager emits 'invalidate' event
  ↓
UIUpdateCoordinator receives event
  ↓
After 100ms debounce
  ↓
Webview refreshed (feature reloaded from disk)
```

### Agent Status Update

```
Agent executes tool
  ↓
Writes to .agent-status-{sessionId}
  ↓
AgentStatusTracker receives file change
  ↓
Parses agent event
  ↓
Updates session state
  ↓
stateManager.invalidate('feature-name')
  ↓
StateManager emits 'invalidate' event
  ↓
UIUpdateCoordinator receives event
  ↓
After 100ms debounce
  ↓
Webview refreshed (shows updated agent status)
  ↓
If agent becomes idle:
  ↓
AgentStatusTracker fires onAgentIdle
  ↓
UIUpdateCoordinator sends file tree refresh
```

## Performance Optimizations

### 1. Debouncing

Multiple components use 100ms debouncing:
- **FeatureMetadataWatcher**: Coalesces rapid file changes
- **AgentStatusTracker**: Groups status updates
- **UIUpdateCoordinator**: Batches UI refreshes
- **FeatureFileWatcher**: Debounces per feature+file

**Impact**: Reduces UI updates by ~50% during rapid changes

### 2. State Manager Caching

Features are cached in memory until explicitly invalidated.

**Cache Strategies:**
- **Invalidation on mutation**: Manual operations invalidate cache
- **Invalidation on file change**: Watchers trigger invalidation
- **Lazy loading**: Features loaded on first access
- **Separate active/archived caches**: Prevents confusion

### 3. UI Update Coalescing

UIUpdateCoordinator batches multiple feature changes:

**Example:**
```
Feature A changes → Queue: [A]
Feature B changes → Queue: [A, B]  (timer resets)
Feature C changes → Queue: [A, B, C] (timer resets)
--- 100ms passes ---
Single UI update sent (all features refreshed)
```

**Impact**: Reduces webview updates from N to 1 during rapid changes

### 4. File Stability Optimization

Agent output file processing uses optimized timing:
- Max stability wait: 2000ms
- Check interval: 50ms
- Required stable checks: 3

**Impact**: ~150ms typical processing time for stable files

## Extension Lifecycle

### Activation

```
1. Extension activates
2. Validate workspace (must be git repo)
3. Ensure .clauding directories exist
4. Update worktree .claudeignore files
5. Initialize NotificationService
6. Initialize logger (LogOutputChannel)
7. Initialize ServiceContainer which creates:
   - ClaudingEventBus
   - FeatureStateManager
   - TerminalProvider
   - GitService, WorktreeService
   - FeatureService, FeatureQueryService
   - AgentService, AgentStatusTracker
   - FeatureMetadataWatcher
   - OutputProcessingPipeline
8. Initialize archived features cache (background)
9. Create FeatureSearchService
10. Register ClaudingSidebarProvider
11. Connect state manager to sidebar
12. Watch configuration changes
13. Initialize watchers for existing features
14. Create ViewSyncService
15. Create main terminal
16. Register editor/terminal change listeners
17. Register commands
18. Extension ready
```

### Feature Watching

```
Feature created
  ↓
FeatureMetadataWatcher.startWatching(featureName)
  ↓
AgentStatusTracker.startTracking(featureName)
  ↓
Watchers active for feature
```

### Deactivation

```
1. Extension deactivates
2. Dispose all registered disposables via context.subscriptions
3. ServiceContainer disposes all services in reverse order:
   - FeatureStateManager
   - ClaudingEventBus
   - UIUpdateCoordinator
   - FeatureMetadataWatcher
   - AgentStatusTracker
   - TerminalProvider (including tmux cleanup)
4. Clear all timers and watchers
5. Extension unloaded
```

## Testing Strategy

### Unit Tests

Each component should have unit tests:

**FeatureStateManager:**
- CRUD operations
- Event emission
- Invalidation logic
- Active/archived separation

**UIUpdateCoordinator:**
- Debouncing
- Coalescing
- Event subscription

**FeatureMetadataWatcher:**
- File change detection
- Debouncing
- State manager integration

### Integration Tests

Test key flows:

**Feature Creation Flow:**
1. Create feature
2. Verify state manager updated
3. Verify UI update triggered

**Metadata Change Flow:**
1. Modify metadata file
2. Verify watcher detects change
3. Verify state invalidated
4. Verify UI updated

## Debugging

### Logging

All major components log to the "Clauding" output channel:

```typescript
logger.info('[FeatureStateManager] Creating feature: my-feature');
logger.trace('[UIUpdateCoordinator] Scheduling update for: my-feature');
logger.warn('[AgentStatusTracker] Session timeout: session-123');
```

**Log Levels:**
- `trace`: Detailed flow information
- `debug`: Debugging information
- `info`: Important state changes
- `warn`: Potential issues
- `error`: Failures

### Metrics

UIUpdateCoordinator tracks:
- Total update count
- Coalescing rate
- Last update time

FeatureStateManager tracks:
- Feature count (active/archived)
- Event emission count
- Invalidation count

## Directory Structure

```
src/
├── commands/           # VS Code command handlers
├── config/             # Configuration (TerminalConfig)
├── di/                 # Dependency injection (ServiceContainer)
├── events/             # Event bus and types
├── models/             # Data models (Feature, AgentCommand)
├── providers/
│   └── sidebar/        # Sidebar webview provider
│       └── handlers/   # Message handlers (25+)
├── services/           # Business logic services
│   └── output/         # Output processing pipeline
│       └── stages/     # Pipeline stages
├── state/              # State management (FeatureStateManager)
├── terminals/          # Terminal providers
│   └── tmux/           # Tmux-specific implementation
├── test/               # Test files
├── ui/                 # UI coordination
├── utils/              # Utility functions
├── watchers/           # File watchers
└── extension.ts        # Extension entry point
```

## Conclusion

The architecture provides:
- **Single source of truth** for feature state (FeatureStateManager with active/archived separation)
- **Type-safe** event system (ClaudingEventBus with 16 event types)
- **Efficient** UI updates through debouncing and coalescing (UIUpdateCoordinator)
- **Maintainable** code with clear separation of concerns
- **Testable** components with dependency injection (ServiceContainer, fs injection)
- **Robust agent execution** with validated state transitions (AgentExecutionStateMachine)
- **Structured output processing** with extensible pipeline (OutputProcessingPipeline)
- **Consolidated file watching** with optimized debouncing (FeatureFileWatcher)
- **Flexible terminal support** with VSCode and tmux backends
- **Modular message handling** with 25+ specialized handlers
- **Clear service boundaries** with proper dependency management
- **Full test coverage** support through injectable dependencies
