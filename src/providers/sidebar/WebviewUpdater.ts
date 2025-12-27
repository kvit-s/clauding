import * as vscode from 'vscode';
import { FeatureService } from '../../services/FeatureService';
import { TimelogService } from '../../services/TimelogService';
import { ConfigService } from '../../services/ConfigService';
import { SidebarViewState } from './SidebarViewState';
import { FeatureSearchService } from '../../services/FeatureSearchService';
import { Feature } from '../../models/Feature';

/**
 * Handles webview updates and message sending
 */
export class WebviewUpdater {
  constructor(
    private readonly featureService: FeatureService,
    private readonly timelogService: TimelogService,
    private readonly viewState: SidebarViewState,
    private readonly configService: ConfigService,
    private readonly searchService: FeatureSearchService
  ) {}

  /**
   * Send an update message to the webview
   * @param webview The webview to update
   */
  async sendUpdate(webview: vscode.Webview): Promise<void> {
    const sortOrder = this.viewState.getSortOrder();
    const viewMode = this.viewState.getViewMode();
    const searchState = this.viewState.getSearchState();

    // Get features from FeatureService
    // This populates the state manager and returns features from the appropriate list
    let features: Feature[];
    if (viewMode === 'active') {
      features = this.featureService.getFeatures(sortOrder);
    } else {
      features = await this.featureService.getArchivedFeatures(sortOrder);
    }

    // Apply search filter if active
    if (searchState.isActive && searchState.query.trim() !== '') {
      const isArchived = viewMode === 'archived';
      features = await this.searchService.searchFeatures(
        searchState.query,
        features,
        isArchived
      );
    }

    const selectedFeatureName = this.viewState.getSelectedFeatureName();

    // Get selected feature from state manager
    let selectedFeature = null;
    if (selectedFeatureName) {
      selectedFeature = this.featureService.getFeature(selectedFeatureName);
      // If selected feature no longer exists, clear the selection
      if (!selectedFeature) {
        this.viewState.setSelectedFeatureName(null);
      }
    }

    let timelog: unknown[] = [];
    if (selectedFeature && selectedFeature.worktreePath && selectedFeatureName) {
      timelog = this.timelogService.getEntries(selectedFeature.worktreePath, selectedFeatureName);
    }

    // Get merged agent commands
    const agentCommands = this.configService.getMergedCommands();

    // Get agents configuration
    const agents = this.configService.getAgents();
    const config = this.configService.getConfig();
    const defaultAgentId = config.defaultAgentId || agents[0]?.id || 'claude';

    webview.postMessage({
      type: 'update',
      features: features,
      selectedFeature: selectedFeature,
      timelog: timelog,
      sortOrder: sortOrder,
      viewMode: viewMode,
      agentCommands: agentCommands,
      agents: agents,              // NEW
      defaultAgentId: defaultAgentId,  // NEW
      searchState: searchState
    });
  }

  /**
   * Send a file tree refresh message to the webview
   * @param webview The webview to update
   * @param featureName The feature name
   */
  sendFileTreeRefresh(webview: vscode.Webview, featureName: string): void {
    webview.postMessage({
      type: 'refreshFileTree',
      featureName
    });
  }
}
