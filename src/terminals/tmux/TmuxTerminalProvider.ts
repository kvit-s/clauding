import * as vscode from 'vscode';
import {
	ITerminalProvider,
	ITerminal,
	TerminalOptions,
	TerminalType
} from '../ITerminalProvider';
import { TerminalConfig } from '../../config/TerminalConfig';
import { TmuxSessionManager } from './TmuxSessionManager';
import { TmuxWindowManager } from './TmuxWindowManager';
import { TmuxActivityMonitor } from './TmuxActivityMonitor';
import { TmuxUIManager } from './TmuxUIManager';
import { TmuxTerminal } from './TmuxTerminal';
import { TmuxControlModeManager } from './TmuxControlModeManager';

/**
 * Tmux-based terminal provider implementation
 */
export class TmuxTerminalProvider implements ITerminalProvider {
	private sessionManager: TmuxSessionManager;
	private windowManager: TmuxWindowManager;
	private activityMonitor: TmuxActivityMonitor;
	private controlModeManager: TmuxControlModeManager | null = null;
	private uiManager: TmuxUIManager;
	private terminals: Map<number, TmuxTerminal> = new Map(); // windowIndex -> terminal
	private terminalIdMap: Map<string, number> = new Map(); // terminal ID -> windowIndex
	private featurePaths: Map<string, string> = new Map(); // Track feature names -> worktree paths
	private useControlMode: boolean;

	private _onDidCloseTerminal = new vscode.EventEmitter<ITerminal>();
	private _onDidChangeActiveTerminal = new vscode.EventEmitter<ITerminal | undefined>();
	private _onDidDetectActivity = new vscode.EventEmitter<ITerminal>();
	private _onDidDetectIdle = new vscode.EventEmitter<ITerminal>();

	readonly onDidCloseTerminal = this._onDidCloseTerminal.event;
	readonly onDidChangeActiveTerminal = this._onDidChangeActiveTerminal.event;
	readonly onDidDetectActivity = this._onDidDetectActivity.event;
	readonly onDidDetectIdle = this._onDidDetectIdle.event;

	constructor(private config: TerminalConfig) {
		const sessionName = config.getFullTmuxSessionName();
		this.sessionManager = new TmuxSessionManager(sessionName);
		this.windowManager = new TmuxWindowManager(this.sessionManager, config);
		this.activityMonitor = new TmuxActivityMonitor(
			this.windowManager,
			config.getTmuxActivityTimeout()
		);
		this.uiManager = new TmuxUIManager(this.sessionManager, this.windowManager);
		this.useControlMode = config.getTmuxUseControlMode();

		// Initialize control mode manager if enabled
		if (this.useControlMode) {
			this.controlModeManager = new TmuxControlModeManager(this.sessionManager);
		}
	}

	async initialize(): Promise<void> {
		// Initialize session
		await this.sessionManager.initialize();

		// Reconnect to existing windows from previous session
		await this.reconnectExistingWindows();

		if (this.useControlMode && this.controlModeManager) {
			// Use control mode for real-time event monitoring
			try {
				await this.controlModeManager.start();

				// Subscribe to control mode events
				this.controlModeManager.onOutput(() => {
					// Output event indicates activity - but we need to map pane to window
					// For simplicity, trigger activity check via polling for now
					// A more sophisticated implementation would track pane-to-window mappings
					this.activityMonitor.checkActivity().catch(error => {
						console.error('Error checking activity on output event:', error);
					});
				});

				this.controlModeManager.onWindowClose(async (event) => {
					const terminal = this.terminals.get(event.windowIndex);
					if (terminal) {
						this.terminals.delete(event.windowIndex);
						this.terminalIdMap.delete(terminal.id);
						this._onDidCloseTerminal.fire(terminal);

						// Handle base terminal recreation
						await this.handleBaseTerminalRecreation(terminal);
					}
				});

				this.controlModeManager.onError(error => {
					console.error('Control mode error, falling back to polling:', error);
					// Fall back to polling-based monitoring
					this.startPollingMonitoring();
				});

				console.log('[TmuxTerminalProvider] Using control mode for monitoring');
			} catch (error) {
				console.error('Failed to start control mode, falling back to polling:', error);
				this.startPollingMonitoring();
			}
		} else {
			// Use polling-based monitoring
			this.startPollingMonitoring();
		}

		// Start periodic cleanup to detect closed windows (still needed even in control mode)
		this.startPeriodicCleanup();
	}

	/**
	 * Reconnect to existing tmux windows from previous session
	 * This is called during initialization to restore terminal list after extension reload
	 */
	private async reconnectExistingWindows(): Promise<void> {
		try {
			const windows = await this.sessionManager.listWindows();

			// Filter out the initial "init" window
			const realWindows = windows.filter(w => w.name !== 'init');

			if (realWindows.length === 0) {
				console.log('[TmuxTerminalProvider] No existing windows to reconnect');
				return;
			}

			console.log(`[TmuxTerminalProvider] Reconnecting to ${realWindows.length} existing window(s)`);

			for (const window of realWindows) {
				// Parse window name to extract feature name and terminal type
				const { featureName, terminalType } = this.parseTerminalName(window.name);

				// Check if this is a global base terminal (no featureName and name is "base - clauding")
				const isBase = !featureName && window.name === 'base - clauding';

				// Create terminal wrapper for existing window
				const terminal = new TmuxTerminal(
					window.name,
					window.index,
					featureName,
					terminalType,
					this.windowManager,
					this.activityMonitor,
					this.uiManager,
					this,
					isBase
				);

				// Track the terminal
				this.terminals.set(window.index, terminal);
				this.terminalIdMap.set(terminal.id, window.index);

				console.log(`[TmuxTerminalProvider] Reconnected to window: ${window.name} (index: ${window.index})`);
			}
		} catch (error) {
			console.error('[TmuxTerminalProvider] Failed to reconnect to existing windows:', error);
		}
	}

	/**
	 * Parse terminal name to extract feature name and terminal type
	 * Patterns:
	 * - "clauding: {featureName}-{commandName}" -> Agent terminal
	 * - "Clauding: {featureName}" -> Console terminal
	 * - "Tests: {featureName}" -> Test terminal
	 * - "Clauding Pre-Run ({featureName})" -> Pre-run terminal
	 * - "bash - clauding" -> Main terminal
	 */
	private parseTerminalName(name: string): { featureName: string | undefined; terminalType: TerminalType } {
		// Agent terminal: "clauding: {featureName}-{commandName}"
		// Feature names can contain dashes, so we need to find the pattern more carefully
		// The format is always: "clauding: " + featureName + "-" + commandName
		// where commandName is the actual command (e.g., "Create Plan", "Fix Tests")
		if (name.startsWith('clauding: ')) {
			const afterPrefix = name.substring('clauding: '.length);
			// Find the last dash that separates feature name from command name
			const lastDashIndex = afterPrefix.lastIndexOf('-');
			if (lastDashIndex !== -1) {
				const featureName = afterPrefix.substring(0, lastDashIndex);
				return { featureName, terminalType: TerminalType.Agent };
			}
		}

		// Console terminal: "Clauding: {featureName}"
		const consoleMatch = name.match(/^Clauding: (.+)$/);
		if (consoleMatch) {
			return { featureName: consoleMatch[1], terminalType: TerminalType.Console };
		}

		// Test terminal: "Tests: {featureName}"
		const testMatch = name.match(/^Tests: (.+)$/);
		if (testMatch) {
			return { featureName: testMatch[1], terminalType: TerminalType.Test };
		}

		// Pre-run terminal: "Clauding Pre-Run ({featureName})"
		const preRunMatch = name.match(/^Clauding Pre-Run \((.+)\)$/);
		if (preRunMatch) {
			return { featureName: preRunMatch[1], terminalType: TerminalType.PreRun };
		}

		// Main terminal: "bash - clauding"
		if (name === 'bash - clauding') {
			return { featureName: undefined, terminalType: TerminalType.Main };
		}

		// Unknown terminal type - default to console
		return { featureName: undefined, terminalType: TerminalType.Console };
	}

	/**
	 * Start polling-based activity monitoring
	 */
	private startPollingMonitoring(): void {
		const monitoringInterval = this.config.getTmuxMonitoringInterval();
		this.activityMonitor.start(monitoringInterval);

		// Subscribe to activity events
		this.activityMonitor.onActivity(windowIndex => {
			const terminal = this.terminals.get(windowIndex);
			if (terminal) {
				this._onDidDetectActivity.fire(terminal);
			}
		});

		this.activityMonitor.onIdle(windowIndex => {
			const terminal = this.terminals.get(windowIndex);
			if (terminal) {
				this._onDidDetectIdle.fire(terminal);
			}
		});

		console.log('[TmuxTerminalProvider] Using polling-based monitoring');
	}

	async createTerminal(options: TerminalOptions): Promise<ITerminal> {
		// Check if this is a global base terminal (isBase: true, no featureName)
		// If one already exists, return it instead of creating a duplicate
		if (options.isBase && !options.featureName) {
			const existingGlobalBase = Array.from(this.terminals.values()).find(
				t => t.isBase && !t.featureName
			);
			if (existingGlobalBase) {
				console.log('[TmuxTerminalProvider] Global base terminal already exists, reusing it');
				return existingGlobalBase;
			}
		}

		// Create tmux window
		const windowIndex = await this.windowManager.createWindow(
			options.name,
			options.cwd || process.cwd(),
			options.env
		);

		// Create terminal wrapper
		const terminal = new TmuxTerminal(
			options.name,
			windowIndex,
			options.featureName,
			options.type,
			this.windowManager,
			this.activityMonitor,
			this.uiManager,
			this,
			options.isBase ?? false
		);

		// Track the terminal
		this.terminals.set(windowIndex, terminal);
		this.terminalIdMap.set(terminal.id, windowIndex);

		// Track feature path for base terminal recreation
		if (options.featureName && options.cwd) {
			this.featurePaths.set(options.featureName, options.cwd);
		}

		// Send initial message if provided
		if (options.message) {
			terminal.sendText(`# ${options.message}`, false);
		}

		// Show the terminal if requested
		if (options.show) {
			terminal.show(options.preserveFocus);
		}

		return terminal;
	}

	getActiveTerminals(): ITerminal[] {
		return Array.from(this.terminals.values()).filter(t => !t.isDisposed());
	}

	getTerminalsByFeature(featureName: string): ITerminal[] {
		const terminals = this.getActiveTerminals().filter(t => t.featureName === featureName);

		// Sort by window index to ensure consistent ordering (oldest first)
		return terminals.sort((a, b) => {
			if (a instanceof TmuxTerminal && b instanceof TmuxTerminal) {
				return a.getWindowIndex() - b.getWindowIndex();
			}
			return 0;
		});
	}

	/**
	 * Get the next terminal to show when closing the current terminal
	 * @param currentTerminal The terminal being closed
	 * @returns The next terminal to activate, or undefined if no other terminals exist
	 */
	getNextTerminalForFeature(currentTerminal: TmuxTerminal): TmuxTerminal | undefined {
		if (!currentTerminal.featureName) {
			return undefined;
		}

		// Get all terminals for the same feature, excluding the current one
		const terminals = this.getTerminalsByFeature(currentTerminal.featureName)
			.filter(t => t !== currentTerminal) as TmuxTerminal[];

		if (terminals.length === 0) {
			return undefined;
		}

		// Prefer base terminal
		const baseTerminal = terminals.find(t => t.isBase);
		if (baseTerminal) {
			return baseTerminal;
		}

		// Otherwise return the first terminal (oldest by window index)
		return terminals[0];
	}

	getTerminalById(id: string): ITerminal | undefined {
		const windowIndex = this.terminalIdMap.get(id);
		if (windowIndex !== undefined) {
			return this.terminals.get(windowIndex);
		}
		return undefined;
	}

	getGlobalBaseTerminal(): TmuxTerminal | undefined {
		// Find the global base terminal (isBase: true, no featureName)
		const allTerminals = Array.from(this.terminals.values());
		return allTerminals.find(t => t.isBase && !t.featureName) as TmuxTerminal | undefined;
	}

	supportsActivityMonitoring(): boolean {
		return true;
	}

	supportsBufferReading(): boolean {
		return true;
	}

	supportsIdleDetection(): boolean {
		return true;
	}

	/**
	 * Handle base terminal recreation when a base terminal is closed
	 */
	private async handleBaseTerminalRecreation(terminal: TmuxTerminal): Promise<void> {
		// If this was a base terminal, recreate it automatically
		if (terminal.isBase) {
			// Small delay to avoid race conditions
			setTimeout(async () => {
				// Handle global base terminal (no featureName)
				if (!terminal.featureName) {
					// Recreate the global base terminal immediately
					const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
					const cwd = workspaceFolder?.uri.fsPath || process.cwd();

					await this.createTerminal({
						name: 'base - clauding',
						type: TerminalType.Console,
						cwd: cwd,
						featureName: undefined,
						isBase: true,
						show: true, // Show the recreated terminal
						preserveFocus: false
					});
					console.log(`[TmuxTerminalProvider] Recreated global base terminal`);
				} else {
					// Handle feature-specific base terminal (if they still exist)
					const featureName = terminal.featureName;
					const featurePath = this.featurePaths.get(featureName);

					if (featurePath) {
						// Check if feature still has no terminals (base terminal was the only one)
						const remainingTerminals = this.getTerminalsByFeature(featureName);

						if (remainingTerminals.length === 0) {
							// Recreate the base terminal
							await this.createTerminal({
								name: `Clauding: ${featureName}`,
								type: TerminalType.Console,
								cwd: featurePath,
								featureName: featureName,
								isBase: true,
								show: true, // Show the recreated terminal
								preserveFocus: false
							});
							console.log(`[TmuxTerminalProvider] Recreated base terminal for feature: ${featureName}`);
						}
					}
				}
			}, 100);
		}
	}

	/**
	 * Start periodic cleanup to detect windows that were closed externally
	 */
	private cleanupInterval: NodeJS.Timeout | null = null;

	private startPeriodicCleanup(): void {
		// Check every 5 seconds for windows that no longer exist
		this.cleanupInterval = setInterval(() => {
			this.cleanupClosedWindows().catch(error => {
				console.error('Error during periodic cleanup:', error);
			});
		}, 5000);
	}

	/**
	 * Clean up terminals for windows that no longer exist in tmux
	 */
	private async cleanupClosedWindows(): Promise<void> {
		const windows = await this.windowManager.listWindows();
		const existingIndices = new Set(windows.map(w => w.index));

		// Find terminals for windows that no longer exist
		const closedTerminals: TmuxTerminal[] = [];
		for (const [windowIndex, terminal] of this.terminals) {
			if (!existingIndices.has(windowIndex)) {
				closedTerminals.push(terminal);
			}
		}

		// Fire close events and remove from tracking
		for (const terminal of closedTerminals) {
			const windowIndex = terminal.getWindowIndex();
			this.terminals.delete(windowIndex);
			this.terminalIdMap.delete(terminal.id);
			this._onDidCloseTerminal.fire(terminal);

			// Handle base terminal recreation
			await this.handleBaseTerminalRecreation(terminal);
		}
	}

	/**
	 * Get the UI manager (for integration with UI components)
	 */
	getUIManager(): TmuxUIManager {
		return this.uiManager;
	}

	/**
	 * Get the activity monitor (for integration with UI components)
	 */
	getActivityMonitor(): TmuxActivityMonitor {
		return this.activityMonitor;
	}

	dispose(): void {
		// Stop periodic cleanup
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}

		// Stop control mode if running
		if (this.controlModeManager) {
			this.controlModeManager.dispose();
		}

		// Stop activity monitoring
		this.activityMonitor.dispose();

		// Dispose UI manager
		this.uiManager.dispose();

		// Kill the tmux session synchronously (this will close all windows)
		// Use synchronous kill to ensure cleanup completes before extension shutdown
		this.sessionManager.killSessionSync();

		// Dispose event emitters
		this._onDidCloseTerminal.dispose();
		this._onDidChangeActiveTerminal.dispose();
		this._onDidDetectActivity.dispose();
		this._onDidDetectIdle.dispose();

		// Clear terminal tracking
		this.terminals.clear();
		this.terminalIdMap.clear();
	}
}
