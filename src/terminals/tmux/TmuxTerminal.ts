import { ITerminal, TerminalType } from '../ITerminalProvider';
import { TmuxWindowManager } from './TmuxWindowManager';
import { TmuxActivityMonitor } from './TmuxActivityMonitor';
import { TmuxUIManager } from './TmuxUIManager';
import type { TmuxTerminalProvider } from './TmuxTerminalProvider';

/**
 * Tmux terminal implementation
 * Represents a tmux window wrapped as an ITerminal
 */
export class TmuxTerminal implements ITerminal {
	private disposed = false;

	constructor(
		private _name: string,
		private windowIndex: number,
		private _featureName: string | undefined,
		private _terminalType: TerminalType,
		private windowManager: TmuxWindowManager,
		private activityMonitor: TmuxActivityMonitor,
		private uiManager: TmuxUIManager,
		private provider: TmuxTerminalProvider,
		private _isBase: boolean = false
	) {}

	get name(): string {
		return this._name;
	}

	get featureName(): string | undefined {
		return this._featureName;
	}

	get terminalType(): TerminalType {
		return this._terminalType;
	}

	get id(): string {
		return `tmux-${this.windowIndex}`;
	}

	get isBase(): boolean {
		return this._isBase;
	}

	/**
	 * Get the underlying VSCode terminal instance that shows the tmux session
	 * This is needed by ViewSyncService for managing the main terminal
	 * @returns The VSCode terminal showing the tmux session, or null if not yet initialized
	 */
	get terminal(): import('vscode').Terminal | null {
		return this.uiManager.getTerminal();
	}

	/**
	 * Get the window index
	 */
	getWindowIndex(): number {
		return this.windowIndex;
	}

	/**
	 * Show the terminal by switching to its window
	 */
	show(preserveFocus?: boolean): void {
		if (this.disposed) {
			return;
		}

		// Switch to this window in the tmux session
		this.uiManager.switchToWindow(this.windowIndex, preserveFocus).catch(error => {
			console.error(`Failed to show terminal ${this.name}:`, error);
		});
	}

	/**
	 * Send text to the terminal
	 */
	sendText(text: string, addNewLine?: boolean): void {
		if (this.disposed) {
			return;
		}

		if (addNewLine) {
			this.windowManager.sendCommand(this.windowIndex, text).catch(error => {
				console.error(`Failed to send command to terminal ${this.name}:`, error);
			});
		} else {
			this.windowManager.sendKeys(this.windowIndex, text, true).catch(error => {
				console.error(`Failed to send text to terminal ${this.name}:`, error);
			});
		}
	}

	/**
	 * Dispose/close the terminal
	 */
	async dispose(): Promise<void> {
		if (this.disposed) {
			return;
		}

		this.disposed = true;

		// Find the next terminal to activate before closing this one
		let nextTerminal = this.provider.getNextTerminalForFeature(this);

		// If no terminal in the same feature, fall back to the global base terminal
		if (!nextTerminal) {
			nextTerminal = this.provider.getGlobalBaseTerminal();
		}

		// If there's a terminal to switch to, activate it first
		if (nextTerminal && nextTerminal instanceof TmuxTerminal) {
			try {
				await this.windowManager.selectWindow(nextTerminal.getWindowIndex());
			} catch (error) {
				console.error(`Failed to select next terminal before disposal:`, error);
			}
		}

		// Now kill the tmux window
		try {
			await this.windowManager.killWindow(this.windowIndex);
		} catch (error) {
			console.error(`Failed to dispose terminal ${this.name}:`, error);
		}
	}

	/**
	 * Get the terminal buffer contents
	 */
	async getBuffer(): Promise<string> {
		if (this.disposed) {
			return '';
		}

		return await this.windowManager.capturePane(this.windowIndex, true);
	}

	/**
	 * Check if the terminal is currently active
	 */
	async isActive(): Promise<boolean> {
		if (this.disposed) {
			return false;
		}

		const state = this.activityMonitor.getActivityState(this.windowIndex);
		return state?.isActive ?? false;
	}

	/**
	 * Check if the terminal is idle
	 */
	async isIdle(): Promise<boolean> {
		if (this.disposed) {
			return false;
		}

		const state = this.activityMonitor.getActivityState(this.windowIndex);
		return state?.isIdle ?? false;
	}

	/**
	 * Get the current activity state synchronously
	 * @returns 'active' if terminal has recent activity, 'idle' if silent for configured timeout,
	 *          undefined if no state available
	 */
	getActivityState(): 'active' | 'idle' | 'has-activity' | undefined {
		if (this.disposed) {
			return undefined;
		}

		const state = this.activityMonitor.getActivityState(this.windowIndex);
		if (!state) {
			return undefined;
		}

		// Simplified logic - with bug fixed, we always have clear state
		if (state.isActive) {
			return 'active';
		}

		// Default to idle (includes isIdle=true and edge cases)
		return 'idle';
	}

	/**
	 * Check if the terminal is disposed
	 */
	isDisposed(): boolean {
		return this.disposed;
	}
}
