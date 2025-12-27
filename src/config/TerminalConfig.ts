import * as vscode from 'vscode';

/**
 * Terminal provider types
 */
export type TerminalProviderType = 'vscode' | 'tmux' | 'auto';

/**
 * Configuration for terminal providers
 */
export class TerminalConfig {
	private static readonly CONFIG_SECTION = 'clauding.terminal';

	/**
	 * Get the configured terminal provider type
	 */
	getProvider(): TerminalProviderType {
		const config = vscode.workspace.getConfiguration(TerminalConfig.CONFIG_SECTION);
		return config.get<TerminalProviderType>('provider', 'auto');
	}

	/**
	 * Get the tmux session name configuration
	 */
	getTmuxSessionName(): string {
		const config = vscode.workspace.getConfiguration(TerminalConfig.CONFIG_SECTION);
		return config.get<string>('tmux.sessionName', 'clauding');
	}

	/**
	 * Get the tmux activity timeout in seconds
	 */
	getTmuxActivityTimeout(): number {
		const config = vscode.workspace.getConfiguration(TerminalConfig.CONFIG_SECTION);
		// Default set to 5 to allow for agent thinking periods
		return config.get<number>('tmux.activityTimeout', 5);
	}

	/**
	 * Get the tmux monitoring interval in milliseconds
	 */
	getTmuxMonitoringInterval(): number {
		const config = vscode.workspace.getConfiguration(TerminalConfig.CONFIG_SECTION);
		return config.get<number>('tmux.monitoringInterval', 1000);
	}

	/**
	 * Check if tmux control mode should be used
	 */
	getTmuxUseControlMode(): boolean {
		const config = vscode.workspace.getConfiguration(TerminalConfig.CONFIG_SECTION);
		return config.get<boolean>('tmux.useControlMode', false);
	}

	/**
	 * Get the tmux mouse mode configuration
	 * When true (default), tmux handles mouse events allowing proper scrolling
	 * When false, mouse events pass to the terminal which causes incorrect behavior
	 */
	getTmuxMouseMode(): boolean {
		const config = vscode.workspace.getConfiguration(TerminalConfig.CONFIG_SECTION);
		return config.get<boolean>('tmux.mouseMode', true);
	}

	/**
	 * Get the full tmux session name including workspace prefix
	 */
	getFullTmuxSessionName(): string {
		const baseSessionName = this.getTmuxSessionName();
		const workspaceName = this.getWorkspaceName();
		return `${baseSessionName}-${workspaceName}`;
	}

	/**
	 * Get a safe workspace name for use in tmux session names
	 */
	private getWorkspaceName(): string {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			const name = workspaceFolders[0].name;
			// Sanitize workspace name for tmux (remove special characters)
			return name.replace(/[^a-zA-Z0-9_-]/g, '_');
		}
		return 'default';
	}

	/**
	 * Validate the configuration and return any warnings
	 */
	validate(): string[] {
		const warnings: string[] = [];

		const timeout = this.getTmuxActivityTimeout();
		if (timeout < 1 || timeout > 300) {
			warnings.push('tmux.activityTimeout should be between 1 and 300 seconds');
		}

		const interval = this.getTmuxMonitoringInterval();
		if (interval < 100 || interval > 10000) {
			warnings.push('tmux.monitoringInterval should be between 100 and 10000 milliseconds');
		}

		return warnings;
	}
}
