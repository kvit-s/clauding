import * as vscode from 'vscode';
import { ITerminalProvider } from './ITerminalProvider';
import { VSCodeTerminalProvider } from './VSCodeTerminalProvider';
import { TerminalConfig, TerminalProviderType } from '../config/TerminalConfig';
import { TmuxUtils } from './tmux/TmuxUtils';

/**
 * Factory for creating terminal providers
 */
export class TerminalProviderFactory {
	/**
	 * Create a terminal provider based on configuration
	 */
	static async create(config: TerminalConfig): Promise<ITerminalProvider> {
		const providerType = config.getProvider();

		// Validate configuration
		const warnings = config.validate();
		if (warnings.length > 0) {
			vscode.window.showWarningMessage(
				`Clauding terminal configuration warnings: ${warnings.join(', ')}`
			);
		}

		// Determine which provider to use
		let useProvider: 'vscode' | 'tmux' = 'vscode';

		if (providerType === 'tmux') {
			// User explicitly requested tmux
			const isTmuxAvailable = await TmuxUtils.isTmuxInstalled();
			if (isTmuxAvailable) {
				useProvider = 'tmux';
			} else {
				vscode.window.showWarningMessage(
					'Clauding: tmux not found. Falling back to VS Code terminals. Install tmux for enhanced terminal monitoring.'
				);
				useProvider = 'vscode';
			}
		} else if (providerType === 'auto') {
			// Auto-detect tmux availability
			const isTmuxAvailable = await TmuxUtils.isTmuxInstalled();
			if (isTmuxAvailable) {
				useProvider = 'tmux';
			} else {
				useProvider = 'vscode';
			}
		} else {
			// User explicitly requested vscode
			useProvider = 'vscode';
		}

		// Create the appropriate provider
		if (useProvider === 'tmux') {
			const { TmuxTerminalProvider } = await import('./tmux/TmuxTerminalProvider');
			const provider = new TmuxTerminalProvider(config);
			await provider.initialize();

			return provider;
		} else {
			const provider = new VSCodeTerminalProvider();
			await provider.initialize();
			return provider;
		}
	}
}
