import * as vscode from 'vscode';
import {
	EventType,
	EventPayload,
	TypedEventHandler,
	EventHandler
} from './types';

/**
 * Strongly-typed event bus for extension-wide events
 *
 * This event bus provides:
 * - Type-safe event publishing and subscription
 * - Centralized event logging
 * - Event debugging and tracing
 * - Decoupled communication between services
 */
export class ClaudingEventBus implements vscode.Disposable {
	private readonly handlers = new Map<EventType, Set<EventHandler>>();
	private wildcardHandlers?: Set<EventHandler>;
	private readonly logger: vscode.LogOutputChannel;
	private readonly disposables: vscode.Disposable[] = [];

	// Metrics
	private eventCount = 0;
	private eventsByType = new Map<EventType, number>();

	constructor(logger: vscode.LogOutputChannel) {
		this.logger = logger;
		this.logger.info('[ClaudingEventBus] Initialized');
	}

	// ========================================
	// Publishing Events
	// ========================================

	/**
	 * Publish an event to all subscribers
	 * Type-safe - will only accept valid ClaudingEvent types
	 */
	publish<T extends EventType>(event: EventPayload<T>): void {
		const eventType = event.type;

		this.logger.trace(`[ClaudingEventBus] Publishing: ${eventType}`);
		this.logger.trace(`[ClaudingEventBus]   Event data: ${JSON.stringify(event)}`);

		// Update metrics
		this.eventCount++;
		this.eventsByType.set(eventType, (this.eventsByType.get(eventType) || 0) + 1);

		// Get all handlers for this event type
		const handlersForType = this.handlers.get(eventType);

		// Collect all handlers (specific + wildcard)
		const allHandlers: EventHandler[] = [];

		// Add specific handlers for this event type
		if (handlersForType) {
			allHandlers.push(...Array.from(handlersForType));
		}

		// Add wildcard handlers
		if (this.wildcardHandlers && this.wildcardHandlers.size > 0) {
			allHandlers.push(...Array.from(this.wildcardHandlers));
		}

		if (allHandlers.length === 0) {
			this.logger.trace(`[ClaudingEventBus]   No handlers registered for ${eventType}`);
			return;
		}

		this.logger.trace(`[ClaudingEventBus]   Notifying ${allHandlers.length} handler(s)`);

		// Call each handler
		// We use a snapshot to avoid issues with handlers being added/removed during iteration
		for (const handler of allHandlers) {
			try {
				handler(event);
			} catch (error) {
				this.logger.error(
					`[ClaudingEventBus] Handler error for ${eventType}: ${error}`
				);
			}
		}
	}

	// ========================================
	// Subscribing to Events
	// ========================================

	/**
	 * Subscribe to a specific event type
	 * Returns a Disposable that can be used to unsubscribe
	 *
	 * Type-safe - the handler will receive the correct event payload type
	 */
	subscribe<T extends EventType>(
		type: T,
		handler: TypedEventHandler<T>
	): vscode.Disposable {
		this.logger.trace(`[ClaudingEventBus] New subscriber for: ${type}`);

		// Get or create the handler set for this event type
		let handlersForType = this.handlers.get(type);
		if (!handlersForType) {
			handlersForType = new Set();
			this.handlers.set(type, handlersForType);
		}

		// Add the handler (cast needed due to TypeScript limitations with mapped types)
		const genericHandler = handler as EventHandler;
		handlersForType.add(genericHandler);

		// Return a disposable that removes the handler
		const disposable = new vscode.Disposable(() => {
			this.logger.trace(`[ClaudingEventBus] Unsubscribing from: ${type}`);
			handlersForType?.delete(genericHandler);

			// Clean up empty handler sets
			if (handlersForType?.size === 0) {
				this.handlers.delete(type);
			}
		});

		this.disposables.push(disposable);
		return disposable;
	}

	/**
	 * Subscribe to all events (wildcard subscription)
	 * Useful for logging, debugging, or cross-cutting concerns
	 */
	subscribeAll(handler: EventHandler): vscode.Disposable {
		this.logger.trace('[ClaudingEventBus] New wildcard subscriber');

		// Instead of subscribing to existing event types, we'll add this handler to a special wildcard set
		// and check it during publish
		if (!this.wildcardHandlers) {
			this.wildcardHandlers = new Set<EventHandler>();
		}
		this.wildcardHandlers.add(handler);

		// Return a disposable that removes the wildcard subscription
		return new vscode.Disposable(() => {
			this.wildcardHandlers?.delete(handler);
		});
	}

	// ========================================
	// Diagnostics / Monitoring
	// ========================================

	/**
	 * Get event bus statistics
	 */
	getStats(): EventBusStats {
		return {
			totalEvents: this.eventCount,
			eventsByType: new Map(this.eventsByType),
			activeSubscribers: this.countActiveSubscribers()
		};
	}

	/**
	 * Count active subscribers across all event types
	 */
	private countActiveSubscribers(): number {
		let count = 0;
		for (const handlers of this.handlers.values()) {
			count += handlers.size;
		}
		// Add wildcard subscribers
		if (this.wildcardHandlers) {
			count += this.wildcardHandlers.size;
		}
		return count;
	}

	/**
	 * Log current statistics
	 */
	logStats(): void {
		const stats = this.getStats();

		this.logger.info(
			`[ClaudingEventBus] Stats: ${stats.totalEvents} events published, ` +
			`${stats.activeSubscribers} active subscribers`
		);

		if (stats.eventsByType.size > 0) {
			this.logger.info('[ClaudingEventBus] Events by type:');
			for (const [type, count] of stats.eventsByType) {
				this.logger.info(`  - ${type}: ${count}`);
			}
		}
	}

	/**
	 * Reset metrics (useful for testing)
	 */
	resetMetrics(): void {
		this.eventCount = 0;
		this.eventsByType.clear();
		this.logger.info('[ClaudingEventBus] Metrics reset');
	}

	/**
	 * Check if there are any subscribers for a given event type
	 */
	hasSubscribers(type: EventType): boolean {
		const handlers = this.handlers.get(type);
		return handlers ? handlers.size > 0 : false;
	}

	/**
	 * Get the number of subscribers for a given event type
	 */
	getSubscriberCount(type: EventType): number {
		const handlers = this.handlers.get(type);
		return handlers ? handlers.size : 0;
	}

	// ========================================
	// Cleanup
	// ========================================

	dispose(): void {
		this.logger.info('[ClaudingEventBus] Disposing');

		// Log final stats
		this.logStats();

		// Dispose all subscriptions
		this.disposables.forEach(d => d.dispose());

		// Clear all handlers
		this.handlers.clear();
		this.wildcardHandlers?.clear();
	}
}

/**
 * Event bus statistics
 */
export interface EventBusStats {
	totalEvents: number;
	eventsByType: Map<EventType, number>;
	activeSubscribers: number;
}
