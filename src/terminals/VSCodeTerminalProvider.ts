import * as vscode from 'vscode';
import {
	ITerminalProvider,
	ITerminal,
	TerminalOptions,
	TerminalType
} from './ITerminalProvider';

/**
 * VS Code Terminal implementation of ITerminal
 */
class VSCodeTerminal implements ITerminal {
	private disposed = false;

	constructor(
		private vsCodeTerminal: vscode.Terminal,
		private _featureName: string | undefined,
		private _terminalType: TerminalType,
		private _isBase: boolean = false
	) {}

	get name(): string {
		return this.vsCodeTerminal.name;
	}

	get featureName(): string | undefined {
		return this._featureName;
	}

	get terminalType(): TerminalType {
		return this._terminalType;
	}

	get id(): string {
		// Use process ID if available, otherwise fall back to name
		// Note: processId is a promise in VS Code API
		return `vscode-${this.vsCodeTerminal.name}`;
	}

	get isBase(): boolean {
		return this._isBase;
	}

	/**
	 * Get the underlying VSCode terminal instance
	 * This is needed by ViewSyncService for managing the main terminal
	 */
	get terminal(): vscode.Terminal {
		return this.vsCodeTerminal;
	}

	show(preserveFocus?: boolean): void {
		if (!this.disposed) {
			this.vsCodeTerminal.show(preserveFocus);
		}
	}

	sendText(text: string, addNewLine?: boolean): void {
		if (!this.disposed) {
			this.vsCodeTerminal.sendText(text, addNewLine);
		}
	}

	dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this.vsCodeTerminal.dispose();
		}
	}

	// Enhanced capabilities not supported by VS Code terminals
	async getBuffer(): Promise<string> {
		throw new Error('Buffer reading is not supported by VS Code terminal provider');
	}

	async isActive(): Promise<boolean> {
		throw new Error('Activity detection is not supported by VS Code terminal provider');
	}

	async isIdle(): Promise<boolean> {
		throw new Error('Idle detection is not supported by VS Code terminal provider');
	}
}

/**
 * VS Code Terminal Provider implementation
 * Wraps VS Code's built-in terminal API to conform to ITerminalProvider interface
 */
export class VSCodeTerminalProvider implements ITerminalProvider {
	private terminals: Map<string, VSCodeTerminal> = new Map();
	private disposables: vscode.Disposable[] = [];
	private featurePaths: Map<string, string> = new Map(); // Track feature names -> worktree paths

	private _onDidCloseTerminal = new vscode.EventEmitter<ITerminal>();
	private _onDidChangeActiveTerminal = new vscode.EventEmitter<ITerminal | undefined>();

	readonly onDidCloseTerminal = this._onDidCloseTerminal.event;
	readonly onDidChangeActiveTerminal = this._onDidChangeActiveTerminal.event;

	async initialize(): Promise<void> {
		// Subscribe to VS Code terminal events
		this.disposables.push(
			vscode.window.onDidCloseTerminal(this.handleTerminalClose.bind(this))
		);

		this.disposables.push(
			vscode.window.onDidChangeActiveTerminal(this.handleActiveTerminalChange.bind(this))
		);

		// Register existing terminals
		for (const terminal of vscode.window.terminals) {
			this.registerExistingTerminal(terminal);
		}
	}

	/**
	 * Register an existing VS Code terminal
	 */
	private registerExistingTerminal(terminal: vscode.Terminal): void {
		const { featureName, terminalType } = this.parseTerminalName(terminal.name);
		// Check if this is a global base terminal (no featureName and name is "base - clauding")
		const isBase = !featureName && terminal.name === 'base - clauding';
		const wrappedTerminal = new VSCodeTerminal(terminal, featureName, terminalType, isBase);
		this.terminals.set(terminal.name, wrappedTerminal);
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
		const agentMatch = name.match(/^clauding: (.+?)-(.+)$/);
		if (agentMatch) {
			return { featureName: agentMatch[1], terminalType: TerminalType.Agent };
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

		// Unknown terminal type - treat as generic
		return { featureName: undefined, terminalType: TerminalType.Main };
	}

	async createTerminal(options: TerminalOptions): Promise<ITerminal> {
		// Check if this is a global base terminal (isBase: true, no featureName)
		// If one already exists, return it instead of creating a duplicate
		if (options.isBase && !options.featureName) {
			const existingGlobalBase = Array.from(this.terminals.values()).find(
				t => t.isBase && !t.featureName
			);
			if (existingGlobalBase) {
				console.log('[VSCodeTerminalProvider] Global base terminal already exists, reusing it');
				return existingGlobalBase;
			}
		}

		const terminalOptions: vscode.TerminalOptions = {
			name: options.name,
			cwd: options.cwd,
			env: options.env,
			message: options.message
		};

		const terminal = vscode.window.createTerminal(terminalOptions);
		const wrappedTerminal = new VSCodeTerminal(
			terminal,
			options.featureName,
			options.type,
			options.isBase ?? false
		);

		this.terminals.set(options.name, wrappedTerminal);

		// Track feature path for base terminal recreation
		if (options.featureName && options.cwd) {
			this.featurePaths.set(options.featureName, options.cwd);
		}

		if (options.show) {
			wrappedTerminal.show(options.preserveFocus);
		}

		return wrappedTerminal;
	}

	getActiveTerminals(): ITerminal[] {
		return Array.from(this.terminals.values());
	}

	getTerminalsByFeature(featureName: string): ITerminal[] {
		return Array.from(this.terminals.values()).filter(
			terminal => terminal.featureName === featureName
		);
	}

	getTerminalById(id: string): ITerminal | undefined {
		// For VS Code terminals, ID is based on name
		const name = id.replace(/^vscode-/, '');
		return this.terminals.get(name);
	}

	getGlobalBaseTerminal(): VSCodeTerminal | undefined {
		// Find the global base terminal (isBase: true, no featureName)
		const allTerminals = Array.from(this.terminals.values());
		return allTerminals.find(t => t.isBase && !t.featureName) as VSCodeTerminal | undefined;
	}

	dispose(): void {
		// Dispose all event listeners
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];

		// Dispose event emitters
		this._onDidCloseTerminal.dispose();
		this._onDidChangeActiveTerminal.dispose();

		// Note: We don't dispose the actual terminals here since they're managed by VS Code
		this.terminals.clear();
	}

	supportsActivityMonitoring(): boolean {
		return false;
	}

	supportsBufferReading(): boolean {
		return false;
	}

	supportsIdleDetection(): boolean {
		return false;
	}

	/**
	 * Handle VS Code terminal close event
	 */
	private async handleTerminalClose(terminal: vscode.Terminal): Promise<void> {
		const wrappedTerminal = this.terminals.get(terminal.name);
		if (wrappedTerminal) {
			this.terminals.delete(terminal.name);
			this._onDidCloseTerminal.fire(wrappedTerminal);

			// If this was a base terminal, recreate it automatically
			if (wrappedTerminal.isBase) {
				// Small delay to avoid race conditions
				setTimeout(async () => {
					// Handle global base terminal (no featureName)
					if (!wrappedTerminal.featureName) {
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
						console.log(`[VSCodeTerminalProvider] Recreated global base terminal`);
					} else {
						// Handle feature-specific base terminal (if they still exist)
						const featureName = wrappedTerminal.featureName;
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
								console.log(`[VSCodeTerminalProvider] Recreated base terminal for feature: ${featureName}`);
							}
						}
					}
				}, 100);
			}
		}
	}

	/**
	 * Handle VS Code active terminal change event
	 */
	private handleActiveTerminalChange(terminal: vscode.Terminal | undefined): void {
		if (terminal) {
			let wrappedTerminal = this.terminals.get(terminal.name);

			// If terminal is not tracked yet, register it
			if (!wrappedTerminal) {
				this.registerExistingTerminal(terminal);
				wrappedTerminal = this.terminals.get(terminal.name);
			}

			this._onDidChangeActiveTerminal.fire(wrappedTerminal);
		} else {
			this._onDidChangeActiveTerminal.fire(undefined);
		}
	}
}
