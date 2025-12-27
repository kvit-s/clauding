import React from 'react';
import { TerminalInfo } from '../types';
import { getDisplayName } from '../utils/terminalDisplayName';

interface TerminalItemProps {
  terminal: TerminalInfo;
  onActivate: () => void;
  onClose: () => void;
}

export const TerminalItem: React.FC<TerminalItemProps> = ({
  terminal,
  onActivate,
  onClose
}) => {
  const getActivityIcon = () => {
    if (!terminal.activityState) {
      return null;
    }

    switch (terminal.activityState) {
      case 'active':
        return <i className="codicon codicon-sync codicon-modifier-spin terminal-activity-indicator active" title="Active"></i>;
      case 'idle':
        return <span className="terminal-activity-indicator idle" title="Idle">○</span>;
      case 'has-activity':
        // Treat as idle - this state should no longer occur with fixed parsing
        return <span className="terminal-activity-indicator idle" title="Idle">○</span>;
      default:
        return null;
    }
  };

  const getTypeIcon = () => {
    switch (terminal.type) {
      case 'agent':
        return <i className="codicon codicon-robot" title="Agent terminal"></i>;
      case 'console':
        return <i className="codicon codicon-terminal" title="Console terminal"></i>;
      case 'test':
        return <i className="codicon codicon-beaker" title="Test terminal"></i>;
      case 'prerun':
        return <i className="codicon codicon-debug-start" title="Pre-run terminal"></i>;
      case 'main':
        return <i className="codicon codicon-home" title="Main terminal"></i>;
      default:
        return <i className="codicon codicon-terminal"></i>;
    }
  };

  const displayName = getDisplayName(terminal.name);

  return (
    <div className="terminal-item">
      <div className="terminal-item-main" onClick={onActivate} title={`Click to activate: ${displayName}`}>
        <span className="terminal-type-icon">{getTypeIcon()}</span>
        <span className="terminal-name">{displayName}</span>
        {getActivityIcon()}
      </div>
      <button
        className="terminal-close-button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close terminal"
      >
        <i className="codicon codicon-close"></i>
      </button>
    </div>
  );
};
