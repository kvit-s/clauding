import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentResult } from '../models/AgentCommand';

/**
 * Agent execution states
 */
export type AgentExecutionState =
	| 'idle'
	| 'starting'
	| 'running'
	| 'completing'
	| 'error';

/**
 * State transition data
 */
export interface StateTransitionData {
	terminal?: vscode.Terminal;
	outputFile?: string;
	sessionId?: string;
	error?: Error;
	featureName?: string;
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<AgentExecutionState, AgentExecutionState[]> = {
	idle: ['starting'],
	starting: ['running', 'error'],
	running: ['completing', 'error'],
	completing: ['idle', 'error'],
	error: ['idle']
};

/**
 * State machine for agent execution
 * Provides explicit state management with validated transitions
 */
export class AgentExecutionStateMachine {
	private state: AgentExecutionState = 'idle';
	private currentData: StateTransitionData = {};
	private logger: vscode.LogOutputChannel;

	constructor(logger: vscode.LogOutputChannel) {
		this.logger = logger;
	}

	/**
	 * Get current state
	 */
	public getState(): AgentExecutionState {
		return this.state;
	}

	/**
	 * Get current state data
	 */
	public getData(): StateTransitionData {
		return { ...this.currentData };
	}

	/**
	 * Transition to a new state with validation
	 */
	public transition(newState: AgentExecutionState, data?: StateTransitionData): void {
		// Validate transition
		const validNextStates = VALID_TRANSITIONS[this.state];
		if (!validNextStates.includes(newState)) {
			const error = new Error(
				`Invalid state transition: ${this.state} -> ${newState}`
			);
			this.logger.error(`[AgentStateMachine] ${error.message}`);
			throw error;
		}

		const oldState = this.state;
		this.state = newState;

		// Merge data
		if (data) {
			this.currentData = { ...this.currentData, ...data };
		}

		this.logger.info(
			`[AgentStateMachine] State transition: ${oldState} -> ${newState}` +
			(data?.featureName ? ` (feature: ${data.featureName})` : '')
		);

		// Handle state-specific actions
		this.onStateEnter(newState);
	}

	/**
	 * Reset state machine to idle
	 */
	public reset(): void {
		this.logger.trace('[AgentStateMachine] Resetting to idle state');
		this.state = 'idle';
		this.currentData = {};
	}

	/**
	 * Check if state machine is idle
	 */
	public isIdle(): boolean {
		return this.state === 'idle';
	}

	/**
	 * Check if state machine is in error state
	 */
	public isError(): boolean {
		return this.state === 'error';
	}

	/**
	 * Check if state machine is executing (starting or running)
	 */
	public isExecuting(): boolean {
		return this.state === 'starting' || this.state === 'running';
	}

	/**
	 * Handle state entry actions
	 */
	private onStateEnter(state: AgentExecutionState): void {
		switch (state) {
			case 'starting':
				this.logger.trace('[AgentStateMachine] Entering starting state');
				break;

			case 'running':
				this.logger.trace('[AgentStateMachine] Entering running state');
				break;

			case 'completing':
				this.logger.trace('[AgentStateMachine] Entering completing state');
				break;

			case 'idle':
				this.logger.trace('[AgentStateMachine] Entering idle state');
				break;

			case 'error':
				if (this.currentData.error) {
					this.logger.error(
						`[AgentStateMachine] Entering error state: ${this.currentData.error.message}`
					);
				}
				break;
		}
	}

	/**
	 * Write status file for current state
	 */
	public async writeStatusFile(outputsDir: string): Promise<void> {
		if (!this.currentData.sessionId || !this.currentData.featureName) {
			return;
		}

		const statusFilePath = path.join(
			outputsDir,
			`.agent-status-${this.currentData.sessionId}`
		);

		try {
			let eventType: string;
			switch (this.state) {
				case 'starting':
					eventType = 'SessionStart';
					break;
				case 'running':
					eventType = 'ToolExecution';
					break;
				case 'completing':
				case 'idle':
					eventType = 'SessionEnd';
					break;
				case 'error':
					eventType = 'SessionError';
					break;
				default:
					return; // Don't write status for unknown states
			}

			const status = {
				eventType,
				featureName: this.currentData.featureName,
				sessionId: this.currentData.sessionId,
				timestamp: new Date().toISOString(),
				pid: process.pid,
				state: this.state,
				...(this.currentData.error && { error: this.currentData.error.message })
			};

			fs.writeFileSync(statusFilePath, JSON.stringify(status, null, 2), 'utf-8');
			this.logger.trace(
				`[AgentStateMachine] Wrote status file: ${path.basename(statusFilePath)}`
			);
		} catch (error) {
			this.logger.error(
				`[AgentStateMachine] Failed to write status file: ${error}`
			);
		}
	}

	/**
	 * Execute agent command with state machine
	 * Manages state transitions automatically
	 */
	public async execute(
		createTerminalFn: () => Promise<{
			terminal: vscode.Terminal;
			sessionId: string;
			outputFile: string;
		}>,
		waitForCompletionFn: (terminal: vscode.Terminal) => Promise<string>,
		cleanupFn: (outputFile: string) => Promise<void>,
		featureName: string,
		outputsDir: string
	): Promise<AgentResult> {
		// Ensure we start from idle
		if (this.state !== 'idle') {
			throw new Error(
				`Cannot execute: state machine is not idle (current state: ${this.state})`
			);
		}

		try {
			// State: idle -> starting
			this.transition('starting', { featureName });
			await this.writeStatusFile(outputsDir);

			// Create terminal and start execution
			const { terminal, sessionId, outputFile } = await createTerminalFn();

			// State: starting -> running
			this.transition('running', { terminal, sessionId, outputFile });
			await this.writeStatusFile(outputsDir);

			// Wait for completion
			const output = await waitForCompletionFn(terminal);

			// State: running -> completing
			this.transition('completing');
			await this.writeStatusFile(outputsDir);

			// Cleanup
			await cleanupFn(outputFile);

			// State: completing -> idle
			this.transition('idle');
			await this.writeStatusFile(outputsDir);

			return {
				success: true,
				output,
				outputFile,
				exitCode: 0
			};
		} catch (error) {
			// State: * -> error
			this.transition('error', { error: error as Error });
			await this.writeStatusFile(outputsDir);

			// State: error -> idle (cleanup)
			this.transition('idle');

			throw error;
		}
	}
}
