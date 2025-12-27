import { AgentService } from './AgentService';
import { ITerminalProvider } from '../terminals/ITerminalProvider';

/**
 * Service responsible for managing terminals associated with features.
 * Centralizes terminal checking and cleanup logic.
 */
export class FeatureTerminalManager {
  private agentService?: AgentService;
  private terminalProvider?: ITerminalProvider;

  public setAgentService(agentService: AgentService): void {
    this.agentService = agentService;
  }

  public setTerminalProvider(terminalProvider: ITerminalProvider): void {
    this.terminalProvider = terminalProvider;
  }

  /**
   * Check for active terminals associated with a feature
   * Returns terminal names immediately if any are found (no waiting)
   */
  public checkForActiveTerminals(featureName: string): string[] {
    if (!this.terminalProvider) {
      return [];
    }

    // Check for active terminals using terminal provider
    const activeTerminals = this.terminalProvider.getTerminalsByFeature(featureName);

    if (activeTerminals.length === 0) {
      return [];
    }

    // Return terminal names immediately
    return activeTerminals.map(t => t.name);
  }

  /**
   * Kill all active terminals for a feature and wait for output files to be captured
   * This reuses the same output capture logic as manual terminal closing
   */
  public async killAllTerminalsAndCaptureOutput(
    featureName: string,
    worktreePath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    if (!this.agentService || !this.terminalProvider) {
      return;
    }

    const activeTerminals = this.terminalProvider.getTerminalsByFeature(featureName);
    if (activeTerminals.length === 0) {
      return;
    }

    onProgress?.(`Killing ${activeTerminals.length} terminal(s) and capturing output...`);

    // Kill terminals and wait for output files (reuses waitForFileStability)
    await this.agentService.killAllTerminalsForFeature(featureName, worktreePath);

    onProgress?.('All terminals closed and output captured');
  }

  /**
   * Verify no active terminals exist, throw error if any are found
   * @throws Error with terminal names if active terminals exist
   */
  public verifyNoActiveTerminals(featureName: string): void {
    const activeTerminalNames = this.checkForActiveTerminals(featureName);

    if (activeTerminalNames.length > 0) {
      // Create a custom error with terminal info for UI to handle
      const error = new Error('ACTIVE_TERMINALS') as Error & { terminalNames: string[] };
      error.terminalNames = activeTerminalNames;
      throw error;
    }
  }
}
