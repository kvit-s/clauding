import { TmuxUtils, TmuxWindowInfo } from './TmuxUtils';

/**
 * Manages the lifecycle of a tmux session for Clauding
 */
export class TmuxSessionManager {
	private sessionName: string;
	private initialized = false;

	constructor(sessionName: string) {
		this.sessionName = sessionName;
	}

	/**
	 * Get the session name
	 */
	getSessionName(): string {
		return this.sessionName;
	}

	/**
	 * Initialize the session manager
	 * Creates a new session or attaches to existing one
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		await this.ensureSession();
		this.initialized = true;
	}

	/**
	 * Ensure the tmux session exists, create if necessary
	 */
	async ensureSession(): Promise<void> {
		const exists = await this.sessionExists();

		if (!exists) {
			await this.createSession();
		}
	}

	/**
	 * Check if the session exists
	 */
	async sessionExists(): Promise<boolean> {
		return await TmuxUtils.sessionExists(this.sessionName);
	}

	/**
	 * Create a new tmux session
	 * The session is created detached (not attached to any client)
	 */
	async createSession(): Promise<void> {
		try {
			// Create detached session with an initial hidden window
			// -d: detached (don't attach)
			// -s: session name
			// The initial window will be renamed later or killed when first real window is created
			await TmuxUtils.exec(`new-session -d -s "${this.sessionName}" -n "init"`);

			// Set session options for monitoring
			await this.configureSession();

			console.log(`Created tmux session: ${this.sessionName}`);
		} catch (error) {
			throw new Error(`Failed to create tmux session: ${error}`);
		}
	}

	/**
	 * Configure session-level settings
	 */
	private async configureSession(): Promise<void> {
		try {
			// Enable activity monitoring by default for all windows
			await TmuxUtils.exec(`set-option -t "${this.sessionName}" monitor-activity on`);

			// Don't display activity messages in status bar (we'll handle it in UI)
			await TmuxUtils.exec(`set-option -t "${this.sessionName}" visual-activity off`);

			// Set aggressive resize for better multi-client support
			await TmuxUtils.exec(`set-window-option -t "${this.sessionName}" aggressive-resize on`);
		} catch (error) {
			// Configuration errors are not fatal
			console.warn(`Failed to configure tmux session: ${error}`);
		}
	}

	/**
	 * Kill the tmux session
	 */
	async killSession(): Promise<void> {
		try {
			const exists = await this.sessionExists();
			if (exists) {
				await TmuxUtils.exec(`kill-session -t "${this.sessionName}"`);
				console.log(`Killed tmux session: ${this.sessionName}`);
			}
		} catch (error) {
			console.error(`Failed to kill tmux session: ${error}`);
		}

		this.initialized = false;
	}

	/**
	 * Kill the tmux session synchronously
	 * Used during extension shutdown to ensure cleanup completes
	 */
	killSessionSync(): void {
		try {
			// Check if session exists first (synchronously)
			try {
				TmuxUtils.execSync(`has-session -t "${this.sessionName}"`);
				// Session exists, kill it
				TmuxUtils.execSync(`kill-session -t "${this.sessionName}"`);
				console.log(`Killed tmux session (sync): ${this.sessionName}`);
			} catch (error: any) {
				// Session doesn't exist or has-session failed
				if (error.message.includes('no server running') || error.message.includes("can't find session")) {
					// Session doesn't exist, nothing to do
					return;
				}
				throw error;
			}
		} catch (error) {
			console.error(`Failed to kill tmux session (sync): ${error}`);
		}

		this.initialized = false;
	}

	/**
	 * List all windows in the session
	 */
	async listWindows(): Promise<TmuxWindowInfo[]> {
		return await TmuxUtils.listWindows(this.sessionName);
	}

	/**
	 * Check if the session has any windows
	 */
	async hasWindows(): Promise<boolean> {
		const windows = await this.listWindows();
		// Filter out the initial "init" window
		const realWindows = windows.filter(w => w.name !== 'init');
		return realWindows.length > 0;
	}

	/**
	 * Get the number of windows in the session
	 */
	async getWindowCount(): Promise<number> {
		const windows = await this.listWindows();
		// Filter out the initial "init" window
		const realWindows = windows.filter(w => w.name !== 'init');
		return realWindows.length;
	}

	/**
	 * Kill the initial "init" window if it still exists and there are other windows
	 */
	async cleanupInitWindow(): Promise<void> {
		try {
			const windows = await this.listWindows();
			const initWindow = windows.find(w => w.name === 'init');
			const otherWindows = windows.filter(w => w.name !== 'init');

			if (initWindow && otherWindows.length > 0) {
				await TmuxUtils.exec(`kill-window -t ${TmuxUtils.makeTarget(this.sessionName, initWindow.index)}`);
				console.log('Cleaned up initial tmux window');
			}
		} catch (error) {
			console.warn(`Failed to cleanup init window: ${error}`);
		}
	}

	/**
	 * Dispose the session manager
	 */
	async dispose(): Promise<void> {
		await this.killSession();
	}
}
