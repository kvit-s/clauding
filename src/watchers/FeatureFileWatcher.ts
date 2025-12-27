import * as vscode from 'vscode';
import * as path from 'path';

/**
 * File change event types
 */
export type FileChangeType = 'metadata' | 'output' | 'status' | 'other';

/**
 * File change event
 */
export interface FileChangeEvent {
	featureName: string;
	filePath: string;
	changeType: FileChangeType;
	timestamp: Date;
}

/**
 * Single file watcher per feature, coordinates all file events
 * Consolidates multiple watchers from:
 * - FeatureMetadataWatcher (plan.md, prompt.md, classification.json, etc.)
 * - OutputParserService (outputs/**)
 * - AgentStatusTracker (.agent-status-*)
 *
 * Watches two locations per feature:
 * - Worktree .clauding/ for prompt.md, plan.md, modify-prompt.md
 * - Features folder for all other metadata
 */
export class FeatureFileWatcher implements vscode.Disposable {
	private watchers: Map<string, vscode.FileSystemWatcher[]> = new Map();
	private readonly _onFileChanged = new vscode.EventEmitter<FileChangeEvent>();
	public readonly onFileChanged = this._onFileChanged.event;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly logger: vscode.LogOutputChannel;

	// Debouncing: track last event time per feature+file combination
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
	private readonly debounceDelay = 100; // 100ms

	constructor(logger: vscode.LogOutputChannel) {
		this.logger = logger;
		this.disposables.push(this._onFileChanged);
		this.logger.info('[FeatureFileWatcher] Initialized');
	}

	/**
	 * Start watching all relevant files for a feature in both worktree and features folder
	 * @param featureName - Name of the feature
	 * @param worktreeMetaDir - Path to worktree .clauding/ directory
	 * @param featuresMetaDir - Path to features/{feature-name}/ directory
	 */
	startWatching(featureName: string, worktreeMetaDir: string, featuresMetaDir?: string): void {
		this.logger.info(`[FeatureFileWatcher] Starting watch for feature: ${featureName}`);
		this.logger.info(`[FeatureFileWatcher]   Worktree: ${worktreeMetaDir}`);
		if (featuresMetaDir) {
			this.logger.info(`[FeatureFileWatcher]   Features: ${featuresMetaDir}`);
		}

		// Stop any existing watchers for this feature
		this.stopWatching(featureName);

		const watcherList: vscode.FileSystemWatcher[] = [];

		// Watch worktree .clauding/ for prompt.md, plan.md, modify-prompt.md
		const worktreePattern = new vscode.RelativePattern(worktreeMetaDir, '{prompt.md,plan.md,modify-prompt.md}');
		const worktreeWatcher = vscode.workspace.createFileSystemWatcher(worktreePattern);

		// Subscribe to all change types for worktree
		const onWorktreeChange = (uri: vscode.Uri) => this.handleChange(featureName, uri, 'change');
		const onWorktreeCreate = (uri: vscode.Uri) => this.handleChange(featureName, uri, 'create');
		const onWorktreeDelete = (uri: vscode.Uri) => this.handleChange(featureName, uri, 'delete');

		worktreeWatcher.onDidChange(onWorktreeChange);
		worktreeWatcher.onDidCreate(onWorktreeCreate);
		worktreeWatcher.onDidDelete(onWorktreeDelete);

		watcherList.push(worktreeWatcher);
		this.disposables.push(worktreeWatcher);

		// Watch features folder for all other metadata (if provided)
		if (featuresMetaDir) {
			const featuresPattern = new vscode.RelativePattern(featuresMetaDir, '{status.json,classification.json,timelog.json,lifecycle.json,messages.json,pending-command.json,wrap-up.json,outputs/**,.agent-status-*}');
			const featuresWatcher = vscode.workspace.createFileSystemWatcher(featuresPattern);

			// Subscribe to all change types for features folder
			const onFeaturesChange = (uri: vscode.Uri) => this.handleChange(featureName, uri, 'change');
			const onFeaturesCreate = (uri: vscode.Uri) => this.handleChange(featureName, uri, 'create');
			const onFeaturesDelete = (uri: vscode.Uri) => this.handleChange(featureName, uri, 'delete');

			featuresWatcher.onDidChange(onFeaturesChange);
			featuresWatcher.onDidCreate(onFeaturesCreate);
			featuresWatcher.onDidDelete(onFeaturesDelete);

			watcherList.push(featuresWatcher);
			this.disposables.push(featuresWatcher);
		}

		this.watchers.set(featureName, watcherList);

		this.logger.debug(`[FeatureFileWatcher] Started watching ${featureName} with ${watcherList.length} watcher(s)`);
	}

	/**
	 * Stop watching a specific feature
	 */
	stopWatching(featureName: string): void {
		const watcherList = this.watchers.get(featureName);
		if (watcherList) {
			// Dispose all watchers for this feature
			for (const watcher of watcherList) {
				watcher.dispose();
			}
			this.watchers.delete(featureName);
			this.logger.debug(`[FeatureFileWatcher] Stopped watching ${featureName}`);
		}

		// Clear any pending debounce timers for this feature
		const keysToDelete: string[] = [];
		for (const [key] of this.debounceTimers) {
			if (key.startsWith(`${featureName}:`)) {
				clearTimeout(this.debounceTimers.get(key));
				keysToDelete.push(key);
			}
		}
		keysToDelete.forEach(key => this.debounceTimers.delete(key));
	}

	/**
	 * Handle a file change event
	 */
	private handleChange(featureName: string, uri: vscode.Uri, eventType: 'change' | 'create' | 'delete'): void {
		const filePath = uri.fsPath;
		const changeType = this.classifyChange(uri);

		this.logger.trace(`[FeatureFileWatcher] ${eventType}: ${filePath} (type: ${changeType})`);

		// Debounce per feature + file path
		const debounceKey = `${featureName}:${filePath}`;

		// Clear existing timer
		const existingTimer = this.debounceTimers.get(debounceKey);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Set new timer
		const timer = setTimeout(() => {
			this.emitChange({
				featureName,
				filePath,
				changeType,
				timestamp: new Date()
			});
			this.debounceTimers.delete(debounceKey);
		}, this.debounceDelay);

		this.debounceTimers.set(debounceKey, timer);
	}

	/**
	 * Classify the type of file change based on the file path
	 */
	private classifyChange(uri: vscode.Uri): FileChangeType {
		const fileName = path.basename(uri.fsPath);

		// Metadata files (worktree + features folder)
		if (['plan.md', 'prompt.md', 'modify-prompt.md', 'classification.json', 'timelog.json', 'lifecycle.json', 'messages.json', 'pending-command.json', 'wrap-up.json'].includes(fileName)) {
			return 'metadata';
		}

		// Status file
		if (fileName === 'status.json') {
			return 'status';
		}

		// Agent status files
		if (fileName.startsWith('.agent-status-')) {
			return 'status';
		}

		// Output files
		if (uri.fsPath.includes('/outputs/') || uri.fsPath.includes('\\outputs\\')) {
			return 'output';
		}

		return 'other';
	}

	/**
	 * Emit a file change event
	 */
	private emitChange(event: FileChangeEvent): void {
		this._onFileChanged.fire(event);
		this.logger.debug(`[FeatureFileWatcher] Event emitted: ${event.featureName} - ${event.changeType} - ${path.basename(event.filePath)}`);
	}

	/**
	 * Get statistics about watched features
	 */
	getStats(): { watchedFeatures: number; activeTimers: number } {
		return {
			watchedFeatures: this.watchers.size,
			activeTimers: this.debounceTimers.size
		};
	}

	/**
	 * Clean up
	 */
	dispose(): void {
		this.logger.info('[FeatureFileWatcher] Disposing');

		// Clear all debounce timers
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();

		// Dispose all watchers
		for (const watcherArray of this.watchers.values()) {
			for (const watcher of watcherArray) {
				watcher.dispose();
			}
		}
		this.watchers.clear();

		// Dispose event emitter and other disposables
		this.disposables.forEach(d => d.dispose());
	}
}
