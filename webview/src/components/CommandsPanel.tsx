import React, { useState, useEffect } from 'react';
import { Feature, AgentCommand, AgentDefinition } from '../types';
import { AgentSelector } from './AgentSelector';

interface CommandsPanelProps {
  feature: Feature;
  agentCommands: AgentCommand[];
  agents: AgentDefinition[];           // NEW
  defaultAgentId: string;              // NEW
  onExecuteCommand: (commandName: string, agentId?: string) => void;  // Updated
  onApplyPendingCommand: () => void;
}

export const CommandsPanel: React.FC<CommandsPanelProps> = ({
  feature,
  agentCommands,
  agents,
  defaultAgentId,
  onExecuteCommand,
  onApplyPendingCommand
}) => {
  // Track selected agent for each command
  // Default to defaultAgentId or command's preferredAgentId
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>({});

  // Initialize selected agents when commands or default changes
  useEffect(() => {
    const initialSelections: Record<string, string> = {};
    agentCommands.forEach(cmd => {
      if (!selectedAgents[cmd.name]) {
        initialSelections[cmd.name] = cmd.preferredAgentId || defaultAgentId;
      }
    });
    if (Object.keys(initialSelections).length > 0) {
      setSelectedAgents(prev => ({ ...prev, ...initialSelections }));
    }
  }, [agentCommands, defaultAgentId]);

  const handleAgentSelect = (commandName: string, agentId: string) => {
    setSelectedAgents(prev => ({ ...prev, [commandName]: agentId }));
  };

  const isPending = !!feature.pendingCommand;
  const pendingCommand = feature.pendingCommand?.command;

  // Only show agent selector if there are multiple agents
  const showAgentSelector = agents.length > 1;

  return (
    <div className="commands-panel">
      <h4>Agent Commands:</h4>
      <div className="command-group">
        {agentCommands.map((command) => {
          const selectedAgentId = selectedAgents[command.name] || defaultAgentId;
          const fullLabel = command.label || command.name;
          const isCommandPending = pendingCommand === command.name;

          return (
            <div key={command.name} className="agent-command-row">
              <button
                className="command-button"
                onClick={() => onExecuteCommand(command.name, selectedAgentId)}
                disabled={isPending}
                title={fullLabel}
              >
                {fullLabel} {isCommandPending ? '⏳' : ''}
              </button>

              {showAgentSelector && (
                <AgentSelector
                  agents={agents}
                  selectedAgentId={selectedAgentId}
                  defaultAgentId={defaultAgentId}
                  onSelect={(agentId) => handleAgentSelect(command.name, agentId)}
                  disabled={isPending}
                />
              )}
            </div>
          );
        })}
      </div>

      <h4>Commands:</h4>
      <div className="command-group">
        <button
          className="command-button"
          onClick={() => onExecuteCommand('Run')}
          title="Run"
        >
          Run
        </button>
        <button
          className="command-button"
          onClick={() => onExecuteCommand('Open Console')}
          title="Terminal"
        >
          Terminal
        </button>
        <button
          className="command-button"
          onClick={() => onExecuteCommand('Open Folder')}
          title="Open Folder"
        >
          Open Folder
        </button>
        <button
          className="command-button"
          onClick={() => onExecuteCommand('Run Tests')}
          title="Run Tests"
        >
          Run Tests
        </button>
        <button
          className="command-button"
          onClick={() => onExecuteCommand('Commit')}
          title="Commit"
        >
          Commit
        </button>
        <button
          className="command-button"
          onClick={() => onExecuteCommand('Finalize')}
          title="Finalize"
        >
          Finalize
        </button>
        <button
          className="command-button"
          onClick={() => onExecuteCommand('Update from Main')}
          disabled={isPending}
          title="Update from Main"
        >
          Update from Main
        </button>
      </div>

      {isPending && (
        <button
          className="apply-button"
          onClick={onApplyPendingCommand}
        >
          [Apply]
        </button>
      )}
    </div>
  );
};
