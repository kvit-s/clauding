import * as vscode from 'vscode';
import { FeatureStateManager, FeatureStateChange } from '../state/FeatureStateManager';
import { WebviewUpdater } from '../providers/sidebar/WebviewUpdater';

/**
 * Coordinates all UI updates - single update queue
 *
 * This coordinator:
 * - Subscribes to state changes from FeatureStateManager
 * - Debounces multiple rapid changes into single UI update
 * - Prevents duplicate/redundant webview updates
 * - Provides metrics for monitoring update frequency
 */
export class UIUpdateCoordinator implements vscode.Disposable {
	private updateQueue: Set<string> = new Set(); // Feature names that need updates
	private fullRefreshPending = false; // If true, do full refresh instead of partial
	private updateTimer?: NodeJS.Timeout;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly logger: vscode.LogOutputChannel;

	// Metrics
	private updateCount = 0;
	private coalescedUpdates = 0;
	private lastUpdateTime?: Date;

	private static readonly DEBOUNCE_MS = 100; // Wait 100ms for additional changes

	constructor(
		private readonly stateManager: FeatureStateManager,
		private readonly webviewUpdater: WebviewUpdater,
		private readonly webview: vscode.Webview,
		logger: vscode.LogOutputChannel,
		agentStatusTracker?: import('../services/AgentStatusTracker').AgentStatusTracker
	) {
		this.logger = logger;
		this.logger.info('[UIUpdateCoordinator] Initialized');

		// Subscribe to state changes
		const subscription = this.stateManager.onStateChanged(change => {
			this.handleStateChange(change);
		});
		this.disposables.push(subscription);

		// Subscribe to agent idle events for file tree refresh
		if (agentStatusTracker) {
			const idleSubscription = agentStatusTracker.onAgentIdle(featureName => {
				this.handleAgentIdle(featureName);
			});
			this.disposables.push(idleSubscription);
		}
	}

	/**
	 * Handle a state change event
	 */
	private handleStateChange(change: FeatureStateChange): void {
		this.logger.trace(`[UIUpdateCoordinator] State change: ${change.type} ${change.featureName || 'all'}`);

		switch (change.type) {
			case 'create':
			case 'update':
				// Specific feature changed
				this.scheduleUpdate(change.featureName);
				break;

			case 'delete':
				// Feature deleted - might need full refresh
				this.scheduleUpdate();
				break;

			case 'invalidate':
				// Feature invalidated - schedule update when it's reloaded
				this.scheduleUpdate(change.featureName);
				break;

			case 'invalidate-all':
				// All features invalidated - schedule full refresh
				this.scheduleUpdate();
				break;
		}
	}

	/**
	 * Handle agent idle event - refresh file tree for the feature
	 */
	private handleAgentIdle(featureName: string): void {
		this.logger.info(`[UIUpdateCoordinator] Agent idle for feature: ${featureName}, refreshing file tree`);
		this.webviewUpdater.sendFileTreeRefresh(this.webview, featureName);
	}

	/**
	 * Schedule a UI update
	 * @param featureName Optional feature name. If not provided, schedules a full refresh.
	 */
	scheduleUpdate(featureName?: string): void {
		if (featureName) {
			this.logger.trace(`[UIUpdateCoordinator] Scheduling update for: ${featureName}`);
			this.updateQueue.add(featureName);
		} else {
			this.logger.trace('[UIUpdateCoordinator] Scheduling full refresh');
			this.fullRefreshPending = true;
			this.updateQueue.clear(); // Full refresh supersedes individual updates
		}

		this.debounceUpdate();
	}

	/**
	 * Debounce the update - wait for multiple rapid changes
	 */
	private debounceUpdate(): void {
		if (this.updateTimer) {
			// Already have a pending update - this update will be coalesced
			this.coalescedUpdates++;
			clearTimeout(this.updateTimer);
		}

		this.updateTimer = setTimeout(() => {
			this.performUpdate();
		}, UIUpdateCoordinator.DEBOUNCE_MS);
	}

	/**
	 * Perform the actual update
	 */
	private async performUpdate(): Promise<void> {
		const queueSize = this.updateQueue.size;
		const isFullRefresh = this.fullRefreshPending;

		this.logger.info(
			`[UIUpdateCoordinator] Performing update: ` +
			`${isFullRefresh ? 'full refresh' : `${queueSize} feature(s)`}`
		);

		// Send the update (only if webviewUpdater is available)
		if (this.webviewUpdater) {
			await this.webviewUpdater.sendUpdate(this.webview);
		}

		// Update metrics
		this.updateCount++;
		this.lastUpdateTime = new Date();

		// Clear the queue
		this.updateQueue.clear();
		this.fullRefreshPending = false;
		this.updateTimer = undefined;

		// Log metrics periodically
		if (this.updateCount % 10 === 0) {
			this.logMetrics();
		}
	}

	/**
	 * Force an immediate update (bypasses debouncing)
	 */
	forceUpdate(): void {
		this.logger.info('[UIUpdateCoordinator] Force update requested');

		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = undefined;
		}

		this.performUpdate();
	}

	/**
	 * Get current metrics
	 */
	getMetrics(): UIUpdateMetrics {
		return {
			totalUpdates: this.updateCount,
			coalescedUpdates: this.coalescedUpdates,
			coalescingRate: this.updateCount > 0
				? this.coalescedUpdates / (this.updateCount + this.coalescedUpdates)
				: 0,
			lastUpdateTime: this.lastUpdateTime,
			pendingUpdates: this.updateQueue.size,
			fullRefreshPending: this.fullRefreshPending
		};
	}

	/**
	 * Log current metrics
	 */
	private logMetrics(): void {
		const metrics = this.getMetrics();
		this.logger.info(
			`[UIUpdateCoordinator] Metrics: ${metrics.totalUpdates} updates, ` +
			`${metrics.coalescedUpdates} coalesced (${(metrics.coalescingRate * 100).toFixed(1)}% reduction)`
		);
	}

	/**
	 * Reset metrics (useful for testing)
	 */
	resetMetrics(): void {
		this.updateCount = 0;
		this.coalescedUpdates = 0;
		this.lastUpdateTime = undefined;
		this.logger.info('[UIUpdateCoordinator] Metrics reset');
	}

	/**
	 * Dispose and cleanup
	 */
	dispose(): void {
		this.logger.info('[UIUpdateCoordinator] Disposing');

		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}

		this.disposables.forEach(d => d.dispose());
		this.updateQueue.clear();

		// Log final metrics
		this.logMetrics();
	}
}

/**
 * Metrics for monitoring UI update behavior
 */
export interface UIUpdateMetrics {
	totalUpdates: number;
	coalescedUpdates: number;
	coalescingRate: number; // 0-1, percentage of updates that were coalesced
	lastUpdateTime?: Date;
	pendingUpdates: number;
	fullRefreshPending: boolean;
}
