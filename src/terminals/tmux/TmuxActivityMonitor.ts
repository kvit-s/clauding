import * as vscode from 'vscode';
import { TmuxWindowManager } from './TmuxWindowManager';
import { ActivityState } from '../ITerminalProvider';

/**
 * Monitors tmux window activity using polling
 */
export class TmuxActivityMonitor {
	private pollInterval: NodeJS.Timeout | null = null;
	private windowStates: Map<number, ActivityState> = new Map();
	private lastSeenActivityTimestamp: Map<number, string> = new Map(); // Track last seen activity timestamp per window
	private activityStartTime: Map<number, Date> = new Map(); // Track when activity first started for delayed active state
	private running = false;

	private _onActivity = new vscode.EventEmitter<number>(); // window index
	private _onIdle = new vscode.EventEmitter<number>(); // window index

	readonly onActivity = this._onActivity.event;
	readonly onIdle = this._onIdle.event;

	// Delay before showing active state (in milliseconds)
	private readonly ACTIVE_STATE_DELAY_MS = 1500; // 1.5 seconds

	constructor(
		private windowManager: TmuxWindowManager,
		private activityTimeoutSeconds: number
	) {}

	/**
	 * Start monitoring activity
	 * @param intervalMs Polling interval in milliseconds
	 */
	start(intervalMs: number): void {
		if (this.running) {
			return;
		}

		this.running = true;
		this.pollInterval = setInterval(() => {
			this.checkActivity().catch(error => {
				console.error('Error checking tmux activity:', error);
			});
		}, intervalMs);

		// Update timeout for all existing windows (in case they were created with hardcoded defaults)
		this.updateActivityTimeout(this.activityTimeoutSeconds).catch(error => {
			console.error('Error updating activity timeout on start:', error);
		});

		// Do an immediate check
		this.checkActivity().catch(error => {
			console.error('Error in initial activity check:', error);
		});
	}

	/**
	 * Stop monitoring activity
	 */
	stop(): void {
		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
		this.running = false;
	}

	/**
	 * Check activity for all windows and emit events on state changes
	 */
	async checkActivity(): Promise<void> {
		try {
			const windows = await this.windowManager.listWindows();

			for (const window of windows) {
				// Skip the init window
				if (window.name === 'init') {
					continue;
				}

				const windowIndex = window.index;
				const previousState = this.windowStates.get(windowIndex);
				const now = new Date();

				// Check if this is NEW activity by comparing timestamps
				const lastSeenTimestamp = this.lastSeenActivityTimestamp.get(windowIndex) || '';
				const currentTimestamp = window.activityTimestamp;
				const isNewActivity = currentTimestamp !== '' && currentTimestamp !== lastSeenTimestamp;

				// Update our record of the last seen timestamp
				if (currentTimestamp !== '') {
					this.lastSeenActivityTimestamp.set(windowIndex, currentTimestamp);
				}

				// Determine current tmux flags
				const tmuxHasSilence = window.hasSilence;

				let isActive = false;
				let isIdle = false;

				if (isNewActivity) {
					// NEW activity detected
					// Track when this activity started if we don't have a start time
					if (!this.activityStartTime.has(windowIndex)) {
						this.activityStartTime.set(windowIndex, now);
					}

					// Only show active after sustained activity for ACTIVE_STATE_DELAY_MS
					const activityStart = this.activityStartTime.get(windowIndex)!;
					const timeSinceActivityStart = now.getTime() - activityStart.getTime();

					if (timeSinceActivityStart >= this.ACTIVE_STATE_DELAY_MS) {
						// Sustained activity - show as active
						isActive = true;
						isIdle = false;
					} else {
						// Within delay period - stay idle
						isActive = false;
						isIdle = true;
					}
				} else if (tmuxHasSilence) {
					// Confirmed idle by tmux - clear activity start time
					this.activityStartTime.delete(windowIndex);
					isActive = false;
					isIdle = true;
				} else if (previousState?.lastActivityDetected) {
					// Transition period: activity was reset, waiting for silence confirmation
					// Keep showing "active" for configured grace period (activityTimeout)
					const timeSinceActivity = now.getTime() - previousState.lastActivityDetected.getTime();
					const gracePeriodMs = this.activityTimeoutSeconds * 1000;

					if (timeSinceActivity < gracePeriodMs) {
						// Within grace period - show as active
						isActive = true;
						isIdle = false;
					} else {
						// Grace period expired, assume idle
						this.activityStartTime.delete(windowIndex);
						isActive = false;
						isIdle = true;
					}
				} else {
					// No previous state, default to idle
					this.activityStartTime.delete(windowIndex);
					isActive = false;
					isIdle = true;
				}

				const currentState: ActivityState = {
					isActive,
					isIdle,
					lastChecked: now,
					lastActivityDetected: isNewActivity ? now : previousState?.lastActivityDetected
				};

				// Store current state
				this.windowStates.set(windowIndex, currentState);

				// Emit events on state changes
				if (previousState) {
					// Activity detected (was not active, now is active)
					if (!previousState.isActive && isActive) {
						this._onActivity.fire(windowIndex);
					}

					// Became idle (was not idle, now is idle)
					if (!previousState.isIdle && isIdle) {
						this._onIdle.fire(windowIndex);
					}
				}
			}

			// Clean up states for windows that no longer exist
			const existingIndices = new Set(windows.map(w => w.index));
			for (const [index] of this.windowStates) {
				if (!existingIndices.has(index)) {
					this.windowStates.delete(index);
					this.lastSeenActivityTimestamp.delete(index);
					this.activityStartTime.delete(index);
				}
			}
		} catch (error) {
			console.error('Error in checkActivity:', error);
		}
	}

	/**
	 * Get the current activity state for a window
	 */
	getActivityState(windowIndex: number): ActivityState | undefined {
		return this.windowStates.get(windowIndex);
	}

	/**
	 * Get all activity states
	 */
	getAllActivityStates(): Map<number, ActivityState> {
		return new Map(this.windowStates);
	}

	/**
	 * Update the activity timeout for silence detection
	 */
	async updateActivityTimeout(timeoutSeconds: number): Promise<void> {
		this.activityTimeoutSeconds = timeoutSeconds;

		// Update all existing windows
		try {
			const windows = await this.windowManager.listWindows();
			for (const window of windows) {
				if (window.name !== 'init') {
					await this.windowManager.setWindowOption(
						window.index,
						'monitor-silence',
						timeoutSeconds
					);
				}
			}
		} catch (error) {
			console.error('Error updating activity timeout:', error);
		}
	}

	/**
	 * Dispose the monitor
	 */
	dispose(): void {
		this.stop();
		this._onActivity.dispose();
		this._onIdle.dispose();
		this.windowStates.clear();
		this.lastSeenActivityTimestamp.clear();
		this.activityStartTime.clear();
	}
}
