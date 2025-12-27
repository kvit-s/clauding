import { TmuxUtils, TmuxWindowInfo } from './TmuxUtils';
import { TmuxSessionManager } from './TmuxSessionManager';
import { TerminalConfig } from '../../config/TerminalConfig';

/**
 * Manages tmux windows within a session
 */
export class TmuxWindowManager {
	constructor(
		private sessionManager: TmuxSessionManager,
		private config?: TerminalConfig
	) {}

	/**
	 * Create a new tmux window
	 * @param name Window name
	 * @param cwd Working directory
	 * @param env Environment variables
	 * @returns Window index
	 */
	async createWindow(
		name: string,
		cwd: string,
		env?: Record<string, string>
	): Promise<number> {
		// Ensure the tmux session exists before creating a window
		await this.sessionManager.ensureSession();

		const sessionName = this.sessionManager.getSessionName();

		try {
			// Sanitize window name
			const safeName = TmuxUtils.sanitize(name);

			// Build environment variable arguments
			let envArgs = '';
			if (env) {
				for (const [key, value] of Object.entries(env)) {
					// Escape special characters in value
					const escapedValue = value.replace(/"/g, '\\"');
					envArgs += ` -e ${key}="${escapedValue}"`;
				}
			}

			// Create the window
			// -d: don't make it the active window
			// -n: window name
			// -c: start directory
			// -P -F: print format (returns window index)
			const indexStr = await TmuxUtils.exec(
				`new-window -d -t "${sessionName}" -n "${safeName}" -c "${cwd}"${envArgs} -P -F "#{window_index}"`
			);

			const windowIndex = parseInt(indexStr.trim(), 10);

			// Configure window-specific settings
			await this.configureWindow(windowIndex);

			// Cleanup init window if this is the first real window
			await this.sessionManager.cleanupInitWindow();

			console.log(`Created tmux window: ${safeName} (index: ${windowIndex})`);
			return windowIndex;
		} catch (error) {
			throw new Error(`Failed to create tmux window "${name}": ${error}`);
		}
	}

	/**
	 * Configure window-specific settings
	 */
	private async configureWindow(windowIndex: number): Promise<void> {
		const sessionName = this.sessionManager.getSessionName();
		const target = TmuxUtils.makeTarget(sessionName, windowIndex);

		try {
			// Enable activity monitoring for this window
			await TmuxUtils.exec(`set-window-option -t ${target} monitor-activity on`);

			// Set silence monitoring (default: 5 seconds)
			// This will be overridden by the activity monitor with user config
			await TmuxUtils.exec(`set-window-option -t ${target} monitor-silence 5`);

			// Configure mouse mode based on user settings
			// When mouse is on (default), tmux handles mouse events allowing proper scrolling
			// When mouse is off, mouse events pass to the terminal which causes incorrect behavior
			const mouseMode = this.config?.getTmuxMouseMode() !== false ? 'on' : 'off';
			await TmuxUtils.exec(`set-window-option -t ${target} mouse ${mouseMode}`);
		} catch (error) {
			console.warn(`Failed to configure window ${windowIndex}: ${error}`);
		}
	}

	/**
	 * Send keys to a window
	 * @param windowIndex Window index
	 * @param text Text to send
	 * @param literal If true, send text literally without interpreting as keys
	 */
	async sendKeys(windowIndex: number, text: string, literal: boolean = true): Promise<void> {
		const sessionName = this.sessionManager.getSessionName();
		const target = TmuxUtils.makeTarget(sessionName, windowIndex);

		try {
			if (literal) {
				// Send as literal text
				const escapedText = text.replace(/"/g, '\\"');
				await TmuxUtils.exec(`send-keys -t ${target} -l "${escapedText}"`);
			} else {
				// Send as key sequence (can include special keys like Enter, C-c, etc.)
				await TmuxUtils.exec(`send-keys -t ${target} "${text}"`);
			}
		} catch (error) {
			throw new Error(`Failed to send keys to window ${windowIndex}: ${error}`);
		}
	}

	/**
	 * Send a command to a window (text + Enter)
	 */
	async sendCommand(windowIndex: number, command: string): Promise<void> {
		await this.sendKeys(windowIndex, command, true);
		await this.sendKeys(windowIndex, 'Enter', false);
	}

	/**
	 * Kill a window
	 */
	async killWindow(windowIndex: number): Promise<void> {
		const sessionName = this.sessionManager.getSessionName();
		const target = TmuxUtils.makeTarget(sessionName, windowIndex);

		try {
			await TmuxUtils.exec(`kill-window -t ${target}`);
			console.log(`Killed tmux window: ${windowIndex}`);
		} catch (error) {
			// Window might already be closed
			const errorStr = error instanceof Error ? error.message : String(error);
			if (!errorStr.includes('window not found')) {
				throw new Error(`Failed to kill window ${windowIndex}: ${errorStr}`);
			}
		}
	}

	/**
	 * Check if a window exists
	 */
	async windowExists(windowIndex: number): Promise<boolean> {
		try {
			const windows = await this.listWindows();
			return windows.some(w => w.index === windowIndex);
		} catch {
			return false;
		}
	}

	/**
	 * Find window by name
	 */
	async findWindowByName(name: string): Promise<TmuxWindowInfo | undefined> {
		const windows = await this.listWindows();
		return windows.find(w => w.name === name);
	}

	/**
	 * List all windows
	 */
	async listWindows(): Promise<TmuxWindowInfo[]> {
		return await this.sessionManager.listWindows();
	}

	/**
	 * Capture pane contents from a window
	 * @param windowIndex Window index
	 * @param captureHistory Whether to include scrollback history
	 */
	async capturePane(windowIndex: number, captureHistory: boolean = true): Promise<string> {
		const sessionName = this.sessionManager.getSessionName();
		const target = TmuxUtils.makeTarget(sessionName, windowIndex);

		try {
			return await TmuxUtils.capturePane(target, captureHistory);
		} catch (error) {
			throw new Error(`Failed to capture pane from window ${windowIndex}: ${error}`);
		}
	}

	/**
	 * Select (activate) a window
	 */
	async selectWindow(windowIndex: number): Promise<void> {
		const sessionName = this.sessionManager.getSessionName();
		const target = TmuxUtils.makeTarget(sessionName, windowIndex);

		try {
			await TmuxUtils.exec(`select-window -t ${target}`);
		} catch (error) {
			throw new Error(`Failed to select window ${windowIndex}: ${error}`);
		}
	}

	/**
	 * Set a window option
	 */
	async setWindowOption(
		windowIndex: number,
		option: string,
		value: string | number
	): Promise<void> {
		const sessionName = this.sessionManager.getSessionName();
		const target = TmuxUtils.makeTarget(sessionName, windowIndex);

		try {
			await TmuxUtils.exec(`set-window-option -t ${target} ${option} ${value}`);
		} catch (error) {
			throw new Error(`Failed to set window option ${option}=${value} for window ${windowIndex}: ${error}`);
		}
	}

	/**
	 * Get a window option
	 */
	async getWindowOption(windowIndex: number, option: string): Promise<string> {
		const sessionName = this.sessionManager.getSessionName();
		const target = TmuxUtils.makeTarget(sessionName, windowIndex);

		try {
			return await TmuxUtils.exec(`show-window-options -t ${target} -v ${option}`);
		} catch (error) {
			throw new Error(`Failed to get window option ${option} for window ${windowIndex}: ${error}`);
		}
	}

	/**
	 * Rename a window
	 */
	async renameWindow(windowIndex: number, newName: string): Promise<void> {
		const sessionName = this.sessionManager.getSessionName();
		const target = TmuxUtils.makeTarget(sessionName, windowIndex);
		const safeName = TmuxUtils.sanitize(newName);

		try {
			await TmuxUtils.exec(`rename-window -t ${target} "${safeName}"`);
		} catch (error) {
			throw new Error(`Failed to rename window ${windowIndex} to "${newName}": ${error}`);
		}
	}
}
