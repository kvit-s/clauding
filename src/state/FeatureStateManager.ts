import * as vscode from 'vscode';
import { Feature } from '../models/Feature';

/**
 * Event types for feature state changes
 */
export type FeatureStateChangeType = 'create' | 'update' | 'delete' | 'invalidate' | 'invalidate-all';

/**
 * Feature state change event
 */
export interface FeatureStateChange {
	type: FeatureStateChangeType;
	featureName?: string;
	changes?: Partial<Feature>;
	timestamp: Date;
}

/**
 * Central state manager - owns all feature state
 * All mutations go through this manager
 *
 * This is the single source of truth for feature state in the extension.
 * Maintains separate lists for active and archived features to prevent confusion.
 */
export class FeatureStateManager implements vscode.Disposable {
	private activeFeatures: Map<string, Feature> = new Map();
	private archivedFeatures: Map<string, Feature> = new Map();
	private readonly _onStateChanged = new vscode.EventEmitter<FeatureStateChange>();
	public readonly onStateChanged = this._onStateChanged.event;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly logger: vscode.LogOutputChannel;

	constructor(logger: vscode.LogOutputChannel) {
		this.logger = logger;
		this.disposables.push(this._onStateChanged);
		this.logger.info('[FeatureStateManager] Initialized');
	}

	// ========================================
	// Read Operations
	// ========================================

	/**
	 * Get a single feature by name (searches both active and archived)
	 */
	getFeature(name: string): Feature | null {
		const feature = this.activeFeatures.get(name) || this.archivedFeatures.get(name) || null;
		this.logger.trace(`[FeatureStateManager] getFeature(${name}): ${feature ? 'found' : 'not found'}`);
		return feature;
	}

	/**
	 * Get a single active feature by name
	 */
	getActiveFeature(name: string): Feature | null {
		const feature = this.activeFeatures.get(name) || null;
		this.logger.trace(`[FeatureStateManager] getActiveFeature(${name}): ${feature ? 'found' : 'not found'}`);
		return feature;
	}

	/**
	 * Get a single archived feature by name
	 */
	getArchivedFeature(name: string): Feature | null {
		const feature = this.archivedFeatures.get(name) || null;
		this.logger.trace(`[FeatureStateManager] getArchivedFeature(${name}): ${feature ? 'found' : 'not found'}`);
		return feature;
	}

	/**
	 * Get all active features
	 */
	getAllFeatures(): Feature[] {
		const features = Array.from(this.activeFeatures.values());
		this.logger.trace(`[FeatureStateManager] getAllFeatures(): ${features.length} features`);
		return features;
	}

	/**
	 * Get all archived features
	 */
	getArchivedFeatures(): Feature[] {
		const archived = Array.from(this.archivedFeatures.values());
		this.logger.trace(`[FeatureStateManager] getArchivedFeatures(): ${archived.length} archived`);
		return archived;
	}

	/**
	 * Check if a feature exists (searches both active and archived)
	 */
	hasFeature(name: string): boolean {
		return this.activeFeatures.has(name) || this.archivedFeatures.has(name);
	}

	/**
	 * Check if an active feature exists
	 */
	hasActiveFeature(name: string): boolean {
		return this.activeFeatures.has(name);
	}

	/**
	 * Check if an archived feature exists
	 */
	hasArchivedFeature(name: string): boolean {
		return this.archivedFeatures.has(name);
	}

	// ========================================
	// Write Operations (emit events)
	// ========================================

	/**
	 * Create a new active feature (this is the primary method for creating features)
	 */
	createFeature(feature: Feature): void {
		this.logger.info(`[FeatureStateManager] createFeature: ${feature.name}`);

		// Active features should never exist in archived
		if (this.archivedFeatures.has(feature.name)) {
			this.logger.warn(`[FeatureStateManager] Feature ${feature.name} exists in archived list, removing from archived`);
			this.archivedFeatures.delete(feature.name);
		}

		if (this.activeFeatures.has(feature.name)) {
			this.logger.warn(`[FeatureStateManager] Feature ${feature.name} already exists, overwriting`);
		}

		this.activeFeatures.set(feature.name, feature);

		const change: FeatureStateChange = {
			type: 'create',
			featureName: feature.name,
			timestamp: new Date()
		};

		this._onStateChanged.fire(change);
		this.logger.debug(`[FeatureStateManager] Event fired: create ${feature.name}`);
	}

	/**
	 * Add an archived feature to the cache (internal use - called when loading from git history)
	 */
	addArchivedFeature(feature: Feature): void {
		this.logger.info(`[FeatureStateManager] addArchivedFeature: ${feature.name}`);

		// Archived features should never exist in active
		if (this.activeFeatures.has(feature.name)) {
			this.logger.warn(`[FeatureStateManager] Feature ${feature.name} exists in active list, removing from active`);
			this.activeFeatures.delete(feature.name);
		}

		if (this.archivedFeatures.has(feature.name)) {
			this.logger.debug(`[FeatureStateManager] Archived feature ${feature.name} already exists, overwriting`);
		}

		this.archivedFeatures.set(feature.name, feature);

		const change: FeatureStateChange = {
			type: 'create',
			featureName: feature.name,
			timestamp: new Date()
		};

		this._onStateChanged.fire(change);
		this.logger.debug(`[FeatureStateManager] Event fired: create archived ${feature.name}`);
	}

	/**
	 * Update an existing feature (searches both maps, updates in place)
	 * NOTE: This does not move features between active/archived - use addArchivedFeature for that
	 */
	updateFeature(name: string, updates: Partial<Feature>): void {
		this.logger.info(`[FeatureStateManager] updateFeature: ${name}, fields: ${Object.keys(updates).join(', ')}`);

		// Find the feature in either map
		const inActive = this.activeFeatures.has(name);
		const inArchived = this.archivedFeatures.has(name);

		if (!inActive && !inArchived) {
			this.logger.warn(`[FeatureStateManager] Cannot update non-existent feature: ${name}`);
			return;
		}

		const existing = this.activeFeatures.get(name) || this.archivedFeatures.get(name);
		if (!existing) {
			return; // Should never happen due to check above
		}

		// Merge updates
		const updated = { ...existing, ...updates };

		// Update in the same map
		const targetMap = inActive ? this.activeFeatures : this.archivedFeatures;
		targetMap.set(name, updated);

		const change: FeatureStateChange = {
			type: 'update',
			featureName: name,
			changes: updates,
			timestamp: new Date()
		};

		this._onStateChanged.fire(change);
		this.logger.debug(`[FeatureStateManager] Event fired: update ${name}`);
	}

	/**
	 * Delete a feature (searches both active and archived)
	 */
	deleteFeature(name: string): void {
		this.logger.info(`[FeatureStateManager] deleteFeature: ${name}`);

		const inActive = this.activeFeatures.has(name);
		const inArchived = this.archivedFeatures.has(name);

		if (!inActive && !inArchived) {
			this.logger.warn(`[FeatureStateManager] Cannot delete non-existent feature: ${name}`);
			return;
		}

		if (inActive) {
			this.activeFeatures.delete(name);
			this.logger.debug(`[FeatureStateManager] Deleted ${name} from active features`);
		}
		if (inArchived) {
			this.archivedFeatures.delete(name);
			this.logger.debug(`[FeatureStateManager] Deleted ${name} from archived features`);
		}

		const change: FeatureStateChange = {
			type: 'delete',
			featureName: name,
			timestamp: new Date()
		};

		this._onStateChanged.fire(change);
		this.logger.debug(`[FeatureStateManager] Event fired: delete ${name}`);
	}

	// ========================================
	// Invalidation (triggers reload from disk)
	// ========================================

	/**
	 * Invalidate a single feature (signals it needs to be reloaded from disk)
	 */
	invalidate(name: string): void {
		this.logger.info(`[FeatureStateManager] invalidate: ${name}`);

		// Remove from both maps - will be reloaded on next access
		this.activeFeatures.delete(name);
		this.archivedFeatures.delete(name);

		const change: FeatureStateChange = {
			type: 'invalidate',
			featureName: name,
			timestamp: new Date()
		};

		this._onStateChanged.fire(change);
		this.logger.debug(`[FeatureStateManager] Event fired: invalidate ${name}`);
	}

	/**
	 * Invalidate all active features (signals reload needed)
	 */
	invalidateAllActive(): void {
		this.logger.info(`[FeatureStateManager] invalidateAllActive: ${this.activeFeatures.size} active features`);

		this.activeFeatures.clear();

		// Fire a single invalidate-all event
		const change: FeatureStateChange = {
			type: 'invalidate-all',
			timestamp: new Date()
		};
		this._onStateChanged.fire(change);

		this.logger.debug(`[FeatureStateManager] Fired invalidate-all event for active features`);
	}

	/**
	 * Invalidate all archived features (signals reload needed)
	 */
	invalidateAllArchived(): void {
		this.logger.info(`[FeatureStateManager] invalidateAllArchived: ${this.archivedFeatures.size} archived features`);

		this.archivedFeatures.clear();

		// Fire a single invalidate-all event
		const change: FeatureStateChange = {
			type: 'invalidate-all',
			timestamp: new Date()
		};
		this._onStateChanged.fire(change);

		this.logger.debug(`[FeatureStateManager] Fired invalidate-all event for archived features`);
	}

	/**
	 * Invalidate all features (signals full reload needed)
	 */
	invalidateAll(): void {
		this.logger.info(`[FeatureStateManager] invalidateAll: ${this.activeFeatures.size + this.archivedFeatures.size} total features`);

		this.activeFeatures.clear();
		this.archivedFeatures.clear();

		// Fire a single invalidate-all event
		const change: FeatureStateChange = {
			type: 'invalidate-all',
			timestamp: new Date()
		};
		this._onStateChanged.fire(change);

		this.logger.debug(`[FeatureStateManager] Fired invalidate-all event`);
	}

	// ========================================
	// Diagnostics / Monitoring
	// ========================================

	/**
	 * Get statistics about the state manager
	 */
	getStats(): { totalFeatures: number; archivedFeatures: number; activeFeatures: number } {
		return {
			totalFeatures: this.activeFeatures.size + this.archivedFeatures.size,
			archivedFeatures: this.archivedFeatures.size,
			activeFeatures: this.activeFeatures.size
		};
	}

	/**
	 * Log current state (for debugging)
	 */
	logState(): void {
		const stats = this.getStats();
		this.logger.info(`[FeatureStateManager] State: ${stats.totalFeatures} total (${stats.activeFeatures} active, ${stats.archivedFeatures} archived)`);

		this.logger.trace('[FeatureStateManager] Active features:');
		for (const [name, feature] of this.activeFeatures) {
			this.logger.trace(`  - ${name}: ${feature.lifecycleStatus}`);
		}

		this.logger.trace('[FeatureStateManager] Archived features:');
		for (const [name, feature] of this.archivedFeatures) {
			this.logger.trace(`  - ${name}: merged ${feature.mergeDate?.toISOString() || 'unknown'}`);
		}
	}

	// ========================================
	// Cleanup
	// ========================================

	dispose(): void {
		this.logger.info('[FeatureStateManager] Disposing');
		this.activeFeatures.clear();
		this.archivedFeatures.clear();
		this.disposables.forEach(d => d.dispose());
	}
}
