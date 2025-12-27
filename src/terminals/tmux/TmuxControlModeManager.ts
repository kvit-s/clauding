import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { TmuxSessionManager } from './TmuxSessionManager';

/**
 * Control mode event types
 */
export enum TmuxControlEventType {
	WindowAdd = 'window-add',
	WindowClose = 'window-close',
	WindowRenamed = 'window-renamed',
	Output = 'output',
	LayoutChange = 'layout-change',
	SessionChanged = 'session-changed',
	SessionRenamed = 'session-renamed',
	SessionClosed = 'session-closed',
	ClientSessionChanged = 'client-session-changed',
	Unknown = 'unknown'
}

/**
 * Base control mode event
 */
export interface TmuxControlEvent {
	type: TmuxControlEventType;
	raw: string;
}

/**
 * Window add event
 */
export interface WindowAddEvent extends TmuxControlEvent {
	type: TmuxControlEventType.WindowAdd;
	windowId: string;
	windowIndex: number;
}

/**
 * Window close event
 */
export interface WindowCloseEvent extends TmuxControlEvent {
	type: TmuxControlEventType.WindowClose;
	windowId: string;
	windowIndex: number;
}

/**
 * Window renamed event
 */
export interface WindowRenamedEvent extends TmuxControlEvent {
	type: TmuxControlEventType.WindowRenamed;
	windowId: string;
	windowIndex: number;
	newName: string;
}

/**
 * Output event (activity detected)
 */
export interface OutputEvent extends TmuxControlEvent {
	type: TmuxControlEventType.Output;
	paneId: string;
	content: string;
}

/**
 * Layout change event
 */
export interface LayoutChangeEvent extends TmuxControlEvent {
	type: TmuxControlEventType.LayoutChange;
	windowId: string;
	windowIndex: number;
}

/**
 * Session changed event
 */
export interface SessionChangedEvent extends TmuxControlEvent {
	type: TmuxControlEventType.SessionChanged;
	sessionId: string;
	sessionName: string;
}

/**
 * Session renamed event
 */
export interface SessionRenamedEvent extends TmuxControlEvent {
	type: TmuxControlEventType.SessionRenamed;
	sessionId: string;
	oldName: string;
	newName: string;
}

/**
 * Session closed event
 */
export interface SessionClosedEvent extends TmuxControlEvent {
	type: TmuxControlEventType.SessionClosed;
	sessionId: string;
}

/**
 * Client session changed event
 */
export interface ClientSessionChangedEvent extends TmuxControlEvent {
	type: TmuxControlEventType.ClientSessionChanged;
	sessionId: string;
	sessionName: string;
}

/**
 * Union type of all control events
 */
export type TmuxControlEventUnion =
	| WindowAddEvent
	| WindowCloseEvent
	| WindowRenamedEvent
	| OutputEvent
	| LayoutChangeEvent
	| SessionChangedEvent
	| SessionRenamedEvent
	| SessionClosedEvent
	| ClientSessionChangedEvent
	| TmuxControlEvent;

/**
 * Manages tmux control mode (-C) for real-time event monitoring
 *
 * Control mode provides event-driven monitoring instead of polling,
 * enabling real-time activity detection and lower latency.
 */
export class TmuxControlModeManager {
	private controlProcess: ChildProcess | null = null;
	private running = false;
	private buffer = '';

	// Event emitters for different event types
	private _onWindowAdd = new vscode.EventEmitter<WindowAddEvent>();
	private _onWindowClose = new vscode.EventEmitter<WindowCloseEvent>();
	private _onWindowRenamed = new vscode.EventEmitter<WindowRenamedEvent>();
	private _onOutput = new vscode.EventEmitter<OutputEvent>();
	private _onLayoutChange = new vscode.EventEmitter<LayoutChangeEvent>();
	private _onSessionChanged = new vscode.EventEmitter<SessionChangedEvent>();
	private _onSessionRenamed = new vscode.EventEmitter<SessionRenamedEvent>();
	private _onSessionClosed = new vscode.EventEmitter<SessionClosedEvent>();
	private _onClientSessionChanged = new vscode.EventEmitter<ClientSessionChangedEvent>();
	private _onError = new vscode.EventEmitter<Error>();

	// Public event subscriptions
	readonly onWindowAdd = this._onWindowAdd.event;
	readonly onWindowClose = this._onWindowClose.event;
	readonly onWindowRenamed = this._onWindowRenamed.event;
	readonly onOutput = this._onOutput.event;
	readonly onLayoutChange = this._onLayoutChange.event;
	readonly onSessionChanged = this._onSessionChanged.event;
	readonly onSessionRenamed = this._onSessionRenamed.event;
	readonly onSessionClosed = this._onSessionClosed.event;
	readonly onClientSessionChanged = this._onClientSessionChanged.event;
	readonly onError = this._onError.event;

	constructor(private sessionManager: TmuxSessionManager) {}

	/**
	 * Start control mode monitoring
	 */
	async start(): Promise<void> {
		if (this.running) {
			return;
		}

		// Ensure session exists
		await this.sessionManager.ensureSession();

		const sessionName = this.sessionManager.getSessionName();

		// Spawn tmux in control mode
		this.controlProcess = spawn('tmux', [
			'-C',
			'attach-session',
			'-t',
			sessionName
		]);

		if (!this.controlProcess.stdout || !this.controlProcess.stderr) {
			throw new Error('Failed to create control mode process streams');
		}

		this.running = true;

		// Handle stdout (control mode output)
		this.controlProcess.stdout.on('data', (data: Buffer) => {
			this.handleOutput(data.toString());
		});

		// Handle stderr (errors and debug output)
		this.controlProcess.stderr.on('data', (data: Buffer) => {
			console.error('[TmuxControlMode] stderr:', data.toString());
		});

		// Handle process exit
		this.controlProcess.on('exit', (code, signal) => {
			console.log(`[TmuxControlMode] Process exited with code ${code}, signal ${signal}`);
			this.running = false;

			if (code !== 0 && code !== null) {
				this._onError.fire(new Error(`Control mode process exited with code ${code}`));
			}
		});

		// Handle process error
		this.controlProcess.on('error', (error) => {
			console.error('[TmuxControlMode] Process error:', error);
			this._onError.fire(error);
			this.running = false;
		});

		console.log('[TmuxControlMode] Started control mode monitoring');
	}

	/**
	 * Stop control mode monitoring
	 */
	stop(): void {
		if (!this.running) {
			return;
		}

		if (this.controlProcess) {
			// Send exit command to control mode
			this.sendCommand('detach-client');

			// Kill the process if it doesn't exit gracefully
			setTimeout(() => {
				if (this.controlProcess && !this.controlProcess.killed) {
					this.controlProcess.kill('SIGTERM');
				}
			}, 1000);

			this.controlProcess = null;
		}

		this.running = false;
		this.buffer = '';
		console.log('[TmuxControlMode] Stopped control mode monitoring');
	}

	/**
	 * Check if control mode is running
	 */
	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Send a command to the control mode process
	 */
	sendCommand(command: string): void {
		if (!this.controlProcess || !this.controlProcess.stdin) {
			throw new Error('Control mode process not running');
		}

		this.controlProcess.stdin.write(`${command}\n`);
	}

	/**
	 * Handle output from control mode
	 */
	private handleOutput(data: string): void {
		// Append to buffer
		this.buffer += data;

		// Process complete lines
		const lines = this.buffer.split('\n');

		// Keep the last incomplete line in the buffer
		this.buffer = lines.pop() || '';

		// Process each complete line
		for (const line of lines) {
			if (line.trim()) {
				this.processLine(line);
			}
		}
	}

	/**
	 * Process a single line of control mode output
	 */
	private processLine(line: string): void {
		// Control mode output format:
		// %window-add @0
		// %window-close @1
		// %window-renamed @2 new-name
		// %output %1 content...
		// %layout-change @0
		// %session-changed $0 session-name
		// %session-renamed $0 old-name new-name
		// %session-closed $0
		// %client-session-changed client-name $0 session-name

		if (!line.startsWith('%')) {
			// Not a control mode event, might be command output
			return;
		}

		const parts = line.slice(1).split(' ');
		const eventType = parts[0];

		try {
			switch (eventType) {
				case 'window-add':
					this.handleWindowAdd(line, parts);
					break;
				case 'window-close':
					this.handleWindowClose(line, parts);
					break;
				case 'window-renamed':
					this.handleWindowRenamed(line, parts);
					break;
				case 'output':
					this.handleOutputEvent(line, parts);
					break;
				case 'layout-change':
					this.handleLayoutChange(line, parts);
					break;
				case 'session-changed':
					this.handleSessionChanged(line, parts);
					break;
				case 'session-renamed':
					this.handleSessionRenamed(line, parts);
					break;
				case 'session-closed':
					this.handleSessionClosed(line, parts);
					break;
				case 'client-session-changed':
					this.handleClientSessionChanged(line, parts);
					break;
				default:
					console.log(`[TmuxControlMode] Unknown event type: ${eventType}`);
			}
		} catch (error) {
			console.error(`[TmuxControlMode] Error processing event: ${line}`, error);
		}
	}

	/**
	 * Handle window-add event
	 */
	private handleWindowAdd(raw: string, parts: string[]): void {
		// Format: %window-add @0
		const windowId = parts[1];
		const windowIndex = this.extractWindowIndex(windowId);

		const event: WindowAddEvent = {
			type: TmuxControlEventType.WindowAdd,
			raw,
			windowId,
			windowIndex
		};

		this._onWindowAdd.fire(event);
	}

	/**
	 * Handle window-close event
	 */
	private handleWindowClose(raw: string, parts: string[]): void {
		// Format: %window-close @0
		const windowId = parts[1];
		const windowIndex = this.extractWindowIndex(windowId);

		const event: WindowCloseEvent = {
			type: TmuxControlEventType.WindowClose,
			raw,
			windowId,
			windowIndex
		};

		this._onWindowClose.fire(event);
	}

	/**
	 * Handle window-renamed event
	 */
	private handleWindowRenamed(raw: string, parts: string[]): void {
		// Format: %window-renamed @0 new-name
		const windowId = parts[1];
		const windowIndex = this.extractWindowIndex(windowId);
		const newName = parts.slice(2).join(' ');

		const event: WindowRenamedEvent = {
			type: TmuxControlEventType.WindowRenamed,
			raw,
			windowId,
			windowIndex,
			newName
		};

		this._onWindowRenamed.fire(event);
	}

	/**
	 * Handle output event (activity detected)
	 */
	private handleOutputEvent(raw: string, parts: string[]): void {
		// Format: %output %1 content...
		const paneId = parts[1];
		const content = parts.slice(2).join(' ');

		const event: OutputEvent = {
			type: TmuxControlEventType.Output,
			raw,
			paneId,
			content
		};

		this._onOutput.fire(event);
	}

	/**
	 * Handle layout-change event
	 */
	private handleLayoutChange(raw: string, parts: string[]): void {
		// Format: %layout-change @0
		const windowId = parts[1];
		const windowIndex = this.extractWindowIndex(windowId);

		const event: LayoutChangeEvent = {
			type: TmuxControlEventType.LayoutChange,
			raw,
			windowId,
			windowIndex
		};

		this._onLayoutChange.fire(event);
	}

	/**
	 * Handle session-changed event
	 */
	private handleSessionChanged(raw: string, parts: string[]): void {
		// Format: %session-changed $0 session-name
		const sessionId = parts[1];
		const sessionName = parts.slice(2).join(' ');

		const event: SessionChangedEvent = {
			type: TmuxControlEventType.SessionChanged,
			raw,
			sessionId,
			sessionName
		};

		this._onSessionChanged.fire(event);
	}

	/**
	 * Handle session-renamed event
	 */
	private handleSessionRenamed(raw: string, parts: string[]): void {
		// Format: %session-renamed $0 old-name new-name
		const sessionId = parts[1];
		const oldName = parts[2];
		const newName = parts.slice(3).join(' ');

		const event: SessionRenamedEvent = {
			type: TmuxControlEventType.SessionRenamed,
			raw,
			sessionId,
			oldName,
			newName
		};

		this._onSessionRenamed.fire(event);
	}

	/**
	 * Handle session-closed event
	 */
	private handleSessionClosed(raw: string, parts: string[]): void {
		// Format: %session-closed $0
		const sessionId = parts[1];

		const event: SessionClosedEvent = {
			type: TmuxControlEventType.SessionClosed,
			raw,
			sessionId
		};

		this._onSessionClosed.fire(event);
	}

	/**
	 * Handle client-session-changed event
	 */
	private handleClientSessionChanged(raw: string, parts: string[]): void {
		// Format: %client-session-changed client-name $0 session-name
		const sessionId = parts[2];
		const sessionName = parts.slice(3).join(' ');

		const event: ClientSessionChangedEvent = {
			type: TmuxControlEventType.ClientSessionChanged,
			raw,
			sessionId,
			sessionName
		};

		this._onClientSessionChanged.fire(event);
	}

	/**
	 * Extract window index from window ID
	 * Window ID format: @0, @1, @2, etc.
	 */
	private extractWindowIndex(windowId: string): number {
		const match = windowId.match(/@(\d+)/);
		return match ? parseInt(match[1], 10) : -1;
	}

	/**
	 * Dispose the control mode manager
	 */
	dispose(): void {
		this.stop();

		// Dispose all event emitters
		this._onWindowAdd.dispose();
		this._onWindowClose.dispose();
		this._onWindowRenamed.dispose();
		this._onOutput.dispose();
		this._onLayoutChange.dispose();
		this._onSessionChanged.dispose();
		this._onSessionRenamed.dispose();
		this._onSessionClosed.dispose();
		this._onClientSessionChanged.dispose();
		this._onError.dispose();
	}
}
