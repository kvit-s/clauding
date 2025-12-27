import * as vscode from 'vscode';
import { TmuxWindowManager } from './TmuxWindowManager';
import { TmuxSessionManager } from './TmuxSessionManager';

/**
 * Manages the single VS Code terminal that displays the tmux session
 */
export class TmuxUIManager {
	private vsCodeTerminal: vscode.Terminal | null = null;
	private currentWindowIndex: number | null = null;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private sessionManager: TmuxSessionManager,
		private windowManager: TmuxWindowManager
	) {
		// Listen for terminal close events
		this.disposables.push(
			vscode.window.onDidCloseTerminal(terminal => {
				if (terminal === this.vsCodeTerminal) {
					this.vsCodeTerminal = null;
					this.currentWindowIndex = null;
				}
			})
		);
	}

	/**
	 * Get the currently tracked VSCode terminal (may be null if not yet created)
	 * @returns The VS Code terminal showing tmux, or null if not initialized
	 */
	getTerminal(): vscode.Terminal | null {
		return this.vsCodeTerminal;
	}

	/**
	 * Ensure the tmux terminal exists and is ready
	 * @returns The VS Code terminal showing tmux
	 */
	async ensureTerminal(): Promise<vscode.Terminal> {
		// Check if we have a cached reference and it's still valid
		if (this.vsCodeTerminal) {
			const terminalExists = vscode.window.terminals.some(t => t === this.vsCodeTerminal);
			if (terminalExists) {
				return this.vsCodeTerminal;
			}
			// Terminal was closed, clear the reference
			this.vsCodeTerminal = null;
		}

		const sessionName = this.sessionManager.getSessionName();

		// Look for an existing terminal by name (e.g., after extension reload)
		const existingTerminal = vscode.window.terminals.find(t => t.name === 'Clauding (tmux)');
		if (existingTerminal) {
			this.vsCodeTerminal = existingTerminal;
			return this.vsCodeTerminal;
		}

		// Create a new terminal that attaches to the tmux session
		this.vsCodeTerminal = vscode.window.createTerminal({
			name: 'Clauding (tmux)',
			shellPath: 'tmux',
			shellArgs: ['attach-session', '-t', sessionName],
			message: `Clauding tmux session: ${sessionName}\nThis terminal shows your feature terminals. Switch between them using the sidebar.`
		});

		return this.vsCodeTerminal;
	}

	/**
	 * Switch to a specific tmux window
	 * @param windowIndex Window index to switch to
	 * @param preserveFocus Whether to preserve focus on current editor
	 */
	async switchToWindow(windowIndex: number, preserveFocus?: boolean): Promise<void> {
		// Ensure terminal exists
		const terminal = await this.ensureTerminal();

		// Select the window in tmux
		await this.windowManager.selectWindow(windowIndex);

		// Update current window tracking
		this.currentWindowIndex = windowIndex;

		// Show the terminal if requested
		if (!preserveFocus) {
			terminal.show(false);
		} else {
			terminal.show(true);
		}
	}

	/**
	 * Get the currently displayed window index
	 */
	getCurrentWindowIndex(): number | null {
		return this.currentWindowIndex;
	}

	/**
	 * Show the tmux terminal
	 */
	async show(preserveFocus?: boolean): Promise<void> {
		const terminal = await this.ensureTerminal();
		terminal.show(preserveFocus);
	}

	/**
	 * Hide/close the tmux terminal
	 */
	hide(): void {
		if (this.vsCodeTerminal) {
			this.vsCodeTerminal.dispose();
			this.vsCodeTerminal = null;
			this.currentWindowIndex = null;
		}
	}

	/**
	 * Dispose the UI manager
	 */
	dispose(): void {
		this.hide();
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}
