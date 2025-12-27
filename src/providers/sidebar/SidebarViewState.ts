import * as vscode from 'vscode';

export type SortType = 'alphabetical' | 'chronological' | 'stage';
export type SortDirection = 'asc' | 'desc';

export interface SortOrder {
  type: SortType;
  direction: SortDirection;
}

export interface SearchState {
  query: string;
  isActive: boolean;
}

/**
 * Manages the view state for the sidebar
 */
export class SidebarViewState {
  private readonly SORT_ORDER_STORAGE_KEY = 'clauding.sortOrder';

  private selectedFeatureName: string | null = null;
  private updateTimeout?: NodeJS.Timeout;
  private sortOrder: SortOrder = { type: 'chronological', direction: 'desc' };
  private viewMode: 'active' | 'archived' = 'active';
  private searchState: SearchState = { query: '', isActive: false };

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadSortOrder();
  }

  /**
   * Get the currently selected feature name
   */
  getSelectedFeatureName(): string | null {
    return this.selectedFeatureName;
  }

  /**
   * Set the currently selected feature name
   * @param featureName The feature name to select
   */
  setSelectedFeatureName(featureName: string | null): void {
    this.selectedFeatureName = featureName;
  }

  /**
   * Get the current sort order
   */
  getSortOrder(): SortOrder {
    return this.sortOrder;
  }

  /**
   * Set the sort order
   * @param sortOrder The sort order to set
   */
  setSortOrder(sortOrder: SortOrder): void {
    this.sortOrder = sortOrder;
    this.saveSortOrder();
  }

  /**
   * Clear the update timeout if it exists
   */
  clearUpdateTimeout(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = undefined;
    }
  }

  /**
   * Schedule an update with debouncing
   * @param callback The update callback
   * @param delayMs The debounce delay in milliseconds
   */
  scheduleUpdate(callback: () => void, delayMs: number = 100): void {
    this.clearUpdateTimeout();
    this.updateTimeout = setTimeout(callback, delayMs);
  }

  /**
   * Get the current view mode
   */
  getViewMode(): 'active' | 'archived' {
    return this.viewMode;
  }

  /**
   * Set the view mode
   * @param viewMode The view mode to set
   */
  setViewMode(viewMode: 'active' | 'archived'): void {
    this.viewMode = viewMode;
  }

  /**
   * Get the current search state
   */
  getSearchState(): SearchState {
    return this.searchState;
  }

  /**
   * Set the search state
   */
  setSearchState(state: SearchState): void {
    this.searchState = state;
  }

  /**
   * Clear search state
   */
  clearSearch(): void {
    this.searchState = { query: '', isActive: false };
  }

  /**
   * Load sort order from extension storage
   */
  private loadSortOrder(): void {
    try {
      const stored = this.context.globalState.get<SortOrder>(this.SORT_ORDER_STORAGE_KEY);
      if (stored && stored.type && stored.direction) {
        this.sortOrder = stored;
      }
    } catch (error) {
      console.error('Error loading sort order:', error);
      this.sortOrder = { type: 'chronological', direction: 'desc' };
    }
  }

  /**
   * Save sort order to extension storage
   */
  private saveSortOrder(): void {
    try {
      this.context.globalState.update(this.SORT_ORDER_STORAGE_KEY, this.sortOrder);
    } catch (error) {
      console.error('Error saving sort order:', error);
    }
  }
}
