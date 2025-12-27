import React from 'react';
import { AgentDefinition } from '../types';

interface AgentSelectorProps {
  agents: AgentDefinition[];
  selectedAgentId: string;
  defaultAgentId: string;
  onSelect: (agentId: string) => void;
  disabled?: boolean;
}

const MAX_AGENT_NAME_LENGTH = 12;

const truncateAgentName = (name: string, maxLength: number): string => {
  if (name.length > maxLength) {
    return name.substring(0, maxLength - 1) + '…';
  }
  return name;
};

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  agents,
  selectedAgentId,
  defaultAgentId,
  onSelect,
  disabled = false
}) => {
  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const displayName = selectedAgent?.id || selectedAgentId;
  const truncatedName = truncateAgentName(displayName, MAX_AGENT_NAME_LENGTH);

  return (
    <select
      className="agent-selector"
      value={selectedAgentId}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
      title={displayName}
    >
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id} title={agent.id}>
          {truncateAgentName(agent.id, MAX_AGENT_NAME_LENGTH)}
        </option>
      ))}
    </select>
  );
};
