import * as vscode from 'vscode';

/**
 * Terminal types supported by the extension
 */
export enum TerminalType {
	Agent = 'agent',
	Console = 'console',
	Test = 'test',
	PreRun = 'prerun',
	Main = 'main'
}

/**
 * Options for creating a terminal
 */
export interface TerminalOptions {
	/** Terminal name */
	name: string;
	/** Terminal type */
	type: TerminalType;
	/** Working directory */
	cwd?: string;
	/** Environment variables */
	env?: Record<string, string>;
	/** Initial message to display */
	message?: string;
	/** Feature name (for agent, console, test, prerun terminals) */
	featureName?: string;
	/** Command name (for agent terminals) */
	commandName?: string;
	/** Whether to show the terminal immediately */
	show?: boolean;
	/** Whether to preserve focus when showing */
	preserveFocus?: boolean;
	/** Whether this is a base terminal for a feature (automatically created on feature creation) */
	isBase?: boolean;
}

/**
 * Represents a terminal instance (abstraction over VS Code Terminal or tmux window)
 */
export interface ITerminal {
	/** Terminal name */
	readonly name: string;

	/** Feature name associated with this terminal */
	readonly featureName: string | undefined;

	/** Terminal type */
	readonly terminalType: TerminalType;

	/** Unique identifier for the terminal */
	readonly id: string;

	/** Whether this is a base terminal for a feature */
	readonly isBase: boolean;

	/**
	 * Show the terminal in the UI
	 * @param preserveFocus Whether to preserve focus on current editor
	 */
	show(preserveFocus?: boolean): void;

	/**
	 * Send text to the terminal
	 * @param text Text to send
	 * @param addNewLine Whether to add a newline after the text
	 */
	sendText(text: string, addNewLine?: boolean): void;

	/**
	 * Dispose/close the terminal
	 */
	dispose(): void | Promise<void>;

	/**
	 * Get the terminal buffer contents (tmux only)
	 * @returns Buffer contents or undefined if not supported
	 */
	getBuffer?(): Promise<string>;

	/**
	 * Check if the terminal has recent activity (tmux only)
	 * @returns True if terminal is currently active
	 */
	isActive?(): Promise<boolean>;

	/**
	 * Check if the terminal is idle (tmux only)
	 * @returns True if terminal has been silent for the configured timeout
	 */
	isIdle?(): Promise<boolean>;

	/**
	 * Get the current activity state synchronously (tmux only)
	 * @returns Activity state: 'active' | 'idle' | 'has-activity' | undefined
	 */
	getActivityState?(): 'active' | 'idle' | 'has-activity' | undefined;
}

/**
 * Terminal provider interface - abstracts terminal creation and management
 */
export interface ITerminalProvider {
	/**
	 * Initialize the terminal provider
	 */
	initialize(): Promise<void>;

	/**
	 * Create a new terminal
	 * @param options Terminal creation options
	 * @returns Terminal instance
	 */
	createTerminal(options: TerminalOptions): Promise<ITerminal>;

	/**
	 * Get all active terminals
	 * @returns Array of active terminals
	 */
	getActiveTerminals(): ITerminal[];

	/**
	 * Get terminals associated with a specific feature
	 * @param featureName Feature name
	 * @returns Array of terminals for the feature
	 */
	getTerminalsByFeature(featureName: string): ITerminal[];

	/**
	 * Get a terminal by its unique identifier
	 * @param id Terminal identifier
	 * @returns Terminal instance or undefined
	 */
	getTerminalById(id: string): ITerminal | undefined;

	/**
	 * Get the global base terminal (isBase: true, no featureName)
	 * @returns Global base terminal instance or undefined
	 */
	getGlobalBaseTerminal(): ITerminal | undefined;

	/**
	 * Dispose the terminal provider and clean up resources
	 */
	dispose(): void;

	/**
	 * Check if the provider supports activity monitoring
	 */
	supportsActivityMonitoring(): boolean;

	/**
	 * Check if the provider supports buffer reading
	 */
	supportsBufferReading(): boolean;

	/**
	 * Check if the provider supports idle detection
	 */
	supportsIdleDetection(): boolean;

	/**
	 * Event fired when a terminal is closed
	 */
	readonly onDidCloseTerminal: vscode.Event<ITerminal>;

	/**
	 * Event fired when the active terminal changes
	 */
	readonly onDidChangeActiveTerminal: vscode.Event<ITerminal | undefined>;

	/**
	 * Event fired when activity is detected on a terminal (tmux only)
	 */
	readonly onDidDetectActivity?: vscode.Event<ITerminal>;

	/**
	 * Event fired when a terminal becomes idle (tmux only)
	 */
	readonly onDidDetectIdle?: vscode.Event<ITerminal>;
}

/**
 * Activity state for a terminal
 */
export interface ActivityState {
	/** Whether the terminal has recent activity */
	isActive: boolean;
	/** Whether the terminal is idle */
	isIdle: boolean;
	/** Last time the activity state was checked */
	lastChecked: Date;
	/** When activity was last detected (for grace period logic) */
	lastActivityDetected?: Date;
}
