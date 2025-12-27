import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Information about a tmux window
 */
export interface TmuxWindowInfo {
	/** Window index */
	index: number;
	/** Window name */
	name: string;
	/** Whether the window has activity flag set */
	hasActivity: boolean;
	/** Whether the window has silence flag set */
	hasSilence: boolean;
	/** Whether this is the active window */
	isActive: boolean;
	/** Number of panes in the window */
	paneCount: number;
	/** Unix timestamp of last activity (empty string if none) */
	activityTimestamp: string;
	/** Unix timestamp when silence threshold exceeded (empty string if none) */
	silenceTimestamp: string;
}

/**
 * Low-level tmux command utilities
 */
export class TmuxUtils {
	/**
	 * Execute a tmux command
	 * @param command tmux command to execute (without 'tmux' prefix)
	 * @returns Command output
	 */
	static async exec(command: string): Promise<string> {
		try {
			const { stdout, stderr } = await execAsync(`tmux ${command}`);
			if (stderr && !stderr.includes('no current client')) {
				// Some tmux commands output warnings to stderr that are not errors
				console.warn(`tmux stderr: ${stderr}`);
			}
			return stdout.trim();
		} catch (error: any) {
			// Enhance error message
			throw new Error(`tmux command failed: ${command}\n${error.message}`);
		}
	}

	/**
	 * Execute a tmux command synchronously
	 * Used for cleanup operations that must complete before shutdown
	 * @param command tmux command to execute (without 'tmux' prefix)
	 * @returns Command output
	 */
	static execSync(command: string): string {
		try {
			const stdout = execSync(`tmux ${command}`, { encoding: 'utf-8' });
			return stdout.trim();
		} catch (error: any) {
			// Enhance error message
			throw new Error(`tmux command failed: ${command}\n${error.message}`);
		}
	}

	/**
	 * Check if tmux is installed
	 */
	static async isTmuxInstalled(): Promise<boolean> {
		try {
			await execAsync('tmux -V');
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get tmux version
	 */
	static async getTmuxVersion(): Promise<string | null> {
		try {
			const { stdout } = await execAsync('tmux -V');
			return stdout.trim();
		} catch {
			return null;
		}
	}

	/**
	 * List all tmux sessions
	 */
	static async listSessions(): Promise<string[]> {
		try {
			const output = await this.exec('list-sessions -F "#{session_name}"');
			return output ? output.split('\n').filter(s => s.length > 0) : [];
		} catch (error: any) {
			// If no sessions exist, tmux returns an error
			if (error.message.includes('no server running')) {
				return [];
			}
			throw error;
		}
	}

	/**
	 * Check if a session exists
	 */
	static async sessionExists(sessionName: string): Promise<boolean> {
		try {
			const sessions = await this.listSessions();
			return sessions.includes(sessionName);
		} catch {
			return false;
		}
	}

	/**
	 * List windows in a session
	 */
	static async listWindows(sessionName: string): Promise<TmuxWindowInfo[]> {
		try {
			// Format string explanation:
			// #{window_index} - window index number
			// #{window_name} - window name
			// #{window_activity} - activity flag (unix timestamp when activity occurred, or empty string)
			// #{window_silence} - silence flag (unix timestamp when silence threshold exceeded, or empty string)
			// #{window_active} - whether window is active (1 or 0)
			// #{window_panes} - number of panes in window
			const format = '#{window_index}|#{window_name}|#{window_activity}|#{window_silence}|#{window_active}|#{window_panes}';
			const output = await this.exec(`list-windows -t "${sessionName}" -F "${format}"`);

			if (!output) {
				return [];
			}

			const windows: TmuxWindowInfo[] = [];
			const lines = output.split('\n');

			for (const line of lines) {
				if (!line) continue;

				const [indexStr, name, activityStr, silenceStr, activeStr, paneCountStr] = line.split('|');

				windows.push({
					index: parseInt(indexStr, 10),
					name: name || '',
					// tmux returns timestamps (not '1') when activity/silence flags are set
					// Empty string means no activity/silence, non-empty means flag is set
					hasActivity: activityStr !== '' && activityStr !== '0',
					hasSilence: silenceStr !== '' && silenceStr !== '0',
					isActive: activeStr === '1',
					paneCount: parseInt(paneCountStr, 10) || 1,
					activityTimestamp: activityStr,
					silenceTimestamp: silenceStr
				});
			}

			return windows;
		} catch (error: any) {
			// Session might not exist or have no windows
			if (error.message.includes('session not found') || error.message.includes('no current client')) {
				return [];
			}
			throw error;
		}
	}

	/**
	 * Capture pane contents
	 * @param target Target pane (session:window.pane format or window name)
	 * @param captureHistory Whether to capture scrollback history
	 */
	static async capturePane(target: string, captureHistory: boolean = true): Promise<string> {
		try {
			const historyFlag = captureHistory ? '-S -' : '';
			const output = await this.exec(`capture-pane -t "${target}" ${historyFlag} -p`);
			return output;
		} catch (error: any) {
			// Pane might not exist
			if (error.message.includes('no current client')) {
				return '';
			}
			throw error;
		}
	}

	/**
	 * Parse tmux format output into structured data
	 * @param output Output from tmux command with custom format
	 * @param format Format string used (for documentation)
	 * @returns Array of maps with field name -> value
	 */
	static parseTmuxFormat(output: string, formatFields: string[]): Map<string, string>[] {
		const results: Map<string, string>[] = [];
		const lines = output.split('\n');

		for (const line of lines) {
			if (!line) continue;

			const values = line.split('|');
			const map = new Map<string, string>();

			formatFields.forEach((field, index) => {
				map.set(field, values[index] || '');
			});

			results.push(map);
		}

		return results;
	}

	/**
	 * Sanitize a string for use in tmux commands
	 * Removes characters that could be interpreted as command separators
	 */
	static sanitize(input: string): string {
		// Replace or remove characters that could be problematic in tmux
		return input.replace(/[;|&$`(){}[\]<>'"\\]/g, '_');
	}

	/**
	 * Create a safe target identifier for a window
	 * @param sessionName Session name
	 * @param windowIdentifier Window name or index
	 */
	static makeTarget(sessionName: string, windowIdentifier: string | number): string {
		return `"${sessionName}:${windowIdentifier}"`;
	}
}
