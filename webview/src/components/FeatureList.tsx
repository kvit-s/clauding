import React, { useState, useRef } from 'react';
import { Feature, ViewMode, SearchState, VsCodeApi } from '../types';
import { getLifecycleIcon, getLifecycleDescription } from '../utils/statusIcons';
import { ActivityIcon } from './ActivityIcon';

interface FeatureListProps {
  features: Feature[];
  selectedFeature: Feature | null;
  onSelectFeature: (feature: Feature) => void;
  onDeleteFeature: (featureName: string) => void;
  onRenameFeature: (featureName: string) => void;
  viewMode: ViewMode;
  searchState?: SearchState;
  vscode: VsCodeApi;
}

export const FeatureList: React.FC<FeatureListProps> = ({
  features,
  selectedFeature,
  onSelectFeature,
  onDeleteFeature,
  onRenameFeature,
  viewMode,
  searchState,
  vscode
}) => {
  const [showTooltip, setShowTooltip] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [showStatusTooltip, setShowStatusTooltip] = useState<string | null>(null);
  const [statusTooltipPosition, setStatusTooltipPosition] = useState({ top: 0, left: 0 });
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const statusIconRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  const handleMouseEnter = (featureName: string, feature: Feature) => {
    if (!feature.prompt) return;

    const element = itemRefs.current.get(featureName);
    if (element) {
      const rect = element.getBoundingClientRect();

      // Find the panel container to get its boundaries
      const panel = element.closest('.app') || document.body;
      const panelRect = panel.getBoundingClientRect();

      // Estimate tooltip width (can be adjusted based on actual rendering)
      const tooltipWidth = 400; // Approximate width of the tooltip (matches CSS max-width)
      const margin = 5;

      // Calculate position ensuring popup stays within panel boundaries
      // Left-align with panel to prevent left cutoff, but also prevent right overflow
      let leftPosition = Math.max(panelRect.left + margin, rect.left);
      // Ensure the tooltip doesn't overflow the right edge
      leftPosition = Math.min(leftPosition, panelRect.right - tooltipWidth - margin);

      setTooltipPosition({
        top: rect.bottom + margin,
        left: leftPosition
      });
    }
    setShowTooltip(featureName);
  };

  const handleMouseLeave = () => {
    setShowTooltip(null);
  };

  const handleStatusMouseEnter = (featureName: string) => {
    const element = statusIconRefs.current.get(featureName);
    if (element) {
      const rect = element.getBoundingClientRect();

      // Find the panel container to get its boundaries
      const panel = element.closest('.app') || document.body;
      const panelRect = panel.getBoundingClientRect();

      // Estimate tooltip width for status tooltip
      const tooltipWidth = 250; // Status tooltips (matches CSS max-width)
      const margin = 5;

      // Right-align tooltip's right edge with icon's right edge
      let leftPosition = rect.right - tooltipWidth;

      // Ensure tooltip stays within panel boundaries
      leftPosition = Math.max(panelRect.left + margin, leftPosition);
      leftPosition = Math.min(panelRect.right - tooltipWidth - margin, leftPosition);

      setStatusTooltipPosition({
        top: rect.bottom + margin,
        left: leftPosition
      });
    }
    setShowStatusTooltip(featureName);
  };

  const handleStatusMouseLeave = () => {
    setShowStatusTooltip(null);
  };

  const handleClearSearch = () => {
    vscode.postMessage({ command: 'clearSearch' });
  };

  return (
    <div className="feature-list">
      {searchState?.isActive && (
        <div className="search-active-indicator">
          <span className="search-text">Searching for: "{searchState.query}"</span>
          <button
            className="search-reset-button"
            onClick={handleClearSearch}
            title="Clear search"
            aria-label="Clear search"
          >
            ×
          </button>
        </div>
      )}
      <div className="feature-items">
        {features.length === 0 ? (
          <div className="empty-message">
            {searchState?.isActive
              ? `No features match "${searchState.query}"`
              : viewMode === 'active' ? 'No active features' : 'No archived features'
            }
          </div>
        ) : (
          features.map(feature => {
            return (
              <div
                key={feature.name}
                className={`feature-item ${selectedFeature?.name === feature.name ? 'selected' : ''} ${viewMode === 'archived' ? 'archived' : ''}`}
              >
                <div
                  ref={(el) => {
                    if (el) {
                      itemRefs.current.set(feature.name, el);
                    }
                  }}
                  className="feature-item-content"
                  onClick={() => onSelectFeature(feature)}
                  onMouseEnter={() => handleMouseEnter(feature.name, feature)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="feature-name">
                    {feature.name}
                    {viewMode === 'archived' && feature.mergeDate && (
                      <span className="feature-merge-date">
                        {' '}{new Date(feature.mergeDate).toISOString().split('T')[0]}
                      </span>
                    )}
                  </span>
                </div>
                {viewMode === 'active' && (
                  <div className="feature-item-icons">
                    {(feature.agentSession || (feature.activeTerminals && feature.activeTerminals.length > 0)) && (
                      <ActivityIcon
                        agentSession={feature.agentSession}
                        activeTerminals={feature.activeTerminals}
                        onSessionClick={() => {
                          if (feature.agentSession?.terminalName) {
                            vscode.postMessage({
                              command: 'activateTerminal',
                              terminalName: feature.agentSession.terminalName
                            });
                          }
                        }}
                      />
                    )}
                    <span
                      ref={(el) => {
                        if (el) {
                          statusIconRefs.current.set(feature.name, el);
                        }
                      }}
                      className="feature-status-icon"
                      onMouseEnter={() => handleStatusMouseEnter(feature.name)}
                      onMouseLeave={handleStatusMouseLeave}
                    >
                      {getLifecycleIcon(feature.lifecycleStatus)}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {showTooltip && (
        <div
          className="feature-prompt-tooltip"
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`
          }}
        >
          <div className="feature-prompt-tooltip-header">Prompt:</div>
          <div className="feature-prompt-tooltip-content">
            {features.find(f => f.name === showTooltip)?.prompt}
          </div>
        </div>
      )}
      {showStatusTooltip && (
        <div
          className="feature-status-tooltip"
          style={{
            position: 'fixed',
            top: `${statusTooltipPosition.top}px`,
            left: `${statusTooltipPosition.left}px`
          }}
        >
          {getLifecycleDescription(features.find(f => f.name === showStatusTooltip)?.lifecycleStatus || '')}
        </div>
      )}
    </div>
  );
};
