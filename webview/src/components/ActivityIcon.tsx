import React, { useState, useRef } from 'react';
import { AgentSessionInfo, TerminalInfo } from '../types';
import { getDisplayName } from '../utils/terminalDisplayName';

interface ActivityIconProps {
  agentSession?: AgentSessionInfo;
  activeTerminals?: TerminalInfo[];
  onSessionClick?: () => void;
}

export const ActivityIcon: React.FC<ActivityIconProps> = ({
  agentSession,
  activeTerminals,
  onSessionClick
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLDivElement>(null);

  // Check if any terminal is active
  const hasActiveTerminal = activeTerminals?.some(t => t.activityState === 'active') || false;
  const activeTerminalCount = activeTerminals?.filter(t => t.activityState === 'active').length || 0;
  const totalTerminalCount = activeTerminals?.length || 0;

  // Check if this feature ever had terminals (indicates tmux is being used)
  // If terminals were present at any point, we shouldn't fall back to agent status
  const hasTerminalSupport = activeTerminals !== undefined;

  // Determine if we should show the spinner
  // IMPORTANT: When we have terminal activity data (tmux), use ONLY that
  // Don't mix agent status with terminal activity - they are separate systems
  const shouldShowSpinner = hasTerminalSupport
    ? hasActiveTerminal  // With tmux: use terminal activity exclusively (even if count is 0)
    : (agentSession && agentSession.status !== 'stopped' && agentSession.status !== 'idle'); // Without tmux: use agent status

  // Don't show anything if no spinner needed and no terminals/agent
  if (!shouldShowSpinner && !agentSession && totalTerminalCount === 0) {
    return null;
  }

  const handleMouseEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();

      // Find the panel container to get its boundaries
      const panel = iconRef.current.closest('.app') || document.body;
      const panelRect = panel.getBoundingClientRect();

      // Estimate tooltip width for activity tooltip
      const tooltipWidth = 300; // Activity tooltips can contain terminal details (matches CSS max-width)
      const margin = 5;

      // Right-align tooltip's right edge with icon's right edge
      let leftPosition = rect.right - tooltipWidth;

      // Ensure tooltip stays within panel boundaries
      leftPosition = Math.max(panelRect.left + margin, leftPosition);
      leftPosition = Math.min(panelRect.right - tooltipWidth - margin, leftPosition);

      setTooltipPosition({
        top: rect.bottom + margin,
        left: leftPosition
      });
    }
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  const formatLastActivity = (lastActivity: string | Date): string => {
    const now = new Date();
    const activity = new Date(lastActivity);
    const seconds = Math.floor((now.getTime() - activity.getTime()) / 1000);

    if (seconds < 60) {
      return `${seconds}s ago`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m ago`;
    } else {
      const hours = Math.floor(seconds / 3600);
      return `${hours}h ago`;
    }
  };

  const getIcon = () => {
    // With tmux: use terminal activity exclusively
    if (hasTerminalSupport) {
      if (hasActiveTerminal) {
        return <i className="codicon codicon-sync codicon-modifier-spin activity-icon"></i>;
      }
      // Show idle indicator if we have terminals but none are active
      if (totalTerminalCount > 0) {
        return <span className="activity-icon">○</span>;
      }
      // No terminals left - don't show anything
      return null;
    }

    // Without tmux: fall back to agent status
    if (agentSession) {
      switch (agentSession.status) {
        case 'starting':
        case 'active':
        case 'executing-tool':
          return <i className="codicon codicon-sync codicon-modifier-spin activity-icon"></i>;
        case 'waiting-input':
          return <span className="activity-icon pulsing">⚠</span>;
        case 'idle':
          return <span className="activity-icon">○</span>;
        case 'stopped':
          return null;
      }
    }

    return null;
  };

  const getStatusText = () => {
    // With tmux: use terminal-based status
    if (hasTerminalSupport) {
      if (totalTerminalCount > 0) {
        if (hasActiveTerminal) {
          if (activeTerminalCount === 1) {
            return 'Terminal active';
          }
          return `${activeTerminalCount} terminals active`;
        }
        if (totalTerminalCount === 1) {
          return 'Terminal idle';
        }
        return `${totalTerminalCount} terminals idle`;
      }
      // No terminals left
      return 'No terminals';
    }

    // Without tmux: use agent status
    if (agentSession) {
      switch (agentSession.status) {
        case 'starting': return 'Agent starting...';
        case 'active': return 'Agent active';
        case 'executing-tool':
          return `Executing: ${agentSession.currentTool || 'tool'}`;
        case 'waiting-input': return 'Waiting for input';
        case 'idle': return 'Agent idle';
        case 'stopped': return 'Agent stopped';
      }
    }

    return 'No activity';
  };

  const handleClick = () => {
    if (onSessionClick) {
      onSessionClick();
    }
  };

  return (
    <>
      <div
        ref={iconRef}
        className="activity-indicator"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        title={getStatusText()}
        style={{ cursor: 'pointer' }}
      >
        {getIcon()}
        {agentSession && agentSession.currentTool && (
          <span className="tool-badge">
            {agentSession.currentTool}
          </span>
        )}
      </div>
      {showTooltip && (
        <div
          className="activity-tooltip"
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            {getStatusText()}
          </div>

          {/* With tmux: show terminal details */}
          {totalTerminalCount > 0 ? (
            <div style={{ marginTop: '4px', fontSize: '0.9em', opacity: 0.8 }}>
              {activeTerminals?.map((t, i) => (
                <div key={i}>
                  {getDisplayName(t.name)}: {t.activityState || 'unknown'}
                </div>
              ))}
            </div>
          ) : (
            /* Without tmux: show agent details */
            agentSession && (
              <>
                <div style={{ fontSize: '0.9em', opacity: 0.8 }}>
                  {formatLastActivity(agentSession.lastActivity)}
                </div>
                {agentSession.currentTool && (
                  <div style={{ marginTop: '4px', fontSize: '0.9em' }}>
                    Tool: {agentSession.currentTool}
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}
    </>
  );
};
