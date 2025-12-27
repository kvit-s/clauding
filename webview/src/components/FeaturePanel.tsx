import React from 'react';
import { Feature, TimelogEntry, VsCodeApi, MessageAction, ViewMode, AgentCommand, AgentDefinition } from '../types';
import { MessagePanel } from './MessagePanel';
import { FilesList } from './FilesList';
import { CommandsPanel } from './CommandsPanel';
import { TimelogPanel } from './TimelogPanel';
import { TerminalItem } from './TerminalItem';

interface FeaturePanelProps {
  feature: Feature;
  timelog: TimelogEntry[];
  agentCommands: AgentCommand[];
  agents: AgentDefinition[];        // NEW
  defaultAgentId: string;           // NEW
  hasModifyPrompt: boolean;
  hasTestResults: boolean;
  onOpenFile: (fileName: string) => void;
  onExecuteCommand: (commandName: string, agentId?: string) => void;  // Updated
  onApplyPendingCommand: () => void;
  onOpenFileAtCommit: (filePath: string, commitHash: string) => void;
  onOpenCommitDiff: (commitHash: string) => void;
  vscode: VsCodeApi;
  onDismissMessage: (messageId: string) => void;
  onMessageAction: (action: MessageAction) => void;
  viewMode: ViewMode;
  onRenameFeature?: (featureName: string) => void;
  onDeleteFeature?: (featureName: string) => void;
  onReactivateFeature?: (featureName: string) => void;
}

export const FeaturePanel: React.FC<FeaturePanelProps> = ({
  feature,
  timelog,
  agentCommands,
  agents,
  defaultAgentId,
  hasModifyPrompt,
  hasTestResults,
  onOpenFile,
  onExecuteCommand,
  onApplyPendingCommand,
  onOpenFileAtCommit,
  onOpenCommitDiff,
  vscode,
  onDismissMessage,
  onMessageAction,
  viewMode,
  onRenameFeature,
  onDeleteFeature,
  onReactivateFeature
}) => {
  const isArchived = viewMode === 'archived';

  return (
    <div className="feature-panel">
      {isArchived && (
        <div className="archived-info-message">
          Archived features show files and timelog only (read-only)
        </div>
      )}

      {feature.prompt && (
        <div className="feature-prompt-section">
          <div className="feature-prompt-header">Prompt</div>
          <div className="feature-prompt-content">{feature.prompt}</div>
        </div>
      )}

      {!isArchived && onRenameFeature && onDeleteFeature && (
        <div className="feature-panel-toolbar">
          <button
            className="toolbar-rename-button"
            onClick={() => onRenameFeature(feature.name)}
            title="Rename feature"
          >
            ✎ Rename
          </button>
          <button
            className="toolbar-delete-button"
            onClick={() => onDeleteFeature(feature.name)}
            title="Delete feature (removes worktree and deletes branch)"
          >
            × Delete
          </button>
        </div>
      )}

      {isArchived && onReactivateFeature && (
        <div className="feature-panel-toolbar">
          <button
            className="toolbar-reactivate-button"
            onClick={() => onReactivateFeature(feature.name)}
            title="Reactivate this archived feature with a new worktree"
          >
            ↻ Reactivate
          </button>
        </div>
      )}

      {!isArchived && (
        <MessagePanel
          messages={feature.messages || []}
          onDismiss={onDismissMessage}
          onAction={onMessageAction}
        />
      )}

      <FilesList
        feature={feature}
        onOpenFile={onOpenFile}
        hasModifyPrompt={hasModifyPrompt}
        hasTestResults={hasTestResults}
        vscode={vscode}
      />

      {!isArchived && (
        <div className="terminals-section">
          <div className="section-header">Terminals</div>
          <div className="terminals-list">
            {feature.activeTerminals && feature.activeTerminals.length > 0 ? (
              feature.activeTerminals.map((terminal) => (
                <TerminalItem
                  key={terminal.terminalId}
                  terminal={terminal}
                  onActivate={() => {
                    vscode.postMessage({
                      command: 'activateTerminal',
                      terminalName: terminal.name
                    });
                  }}
                  onClose={() => {
                    vscode.postMessage({
                      command: 'closeTerminal',
                      terminalName: terminal.name
                    });
                  }}
                />
              ))
            ) : (
              <div className="empty-message">No active terminals</div>
            )}
          </div>
        </div>
      )}

      {!isArchived && (
        <CommandsPanel
          feature={feature}
          agentCommands={agentCommands}
          agents={agents}              // NEW
          defaultAgentId={defaultAgentId}  // NEW
          onExecuteCommand={onExecuteCommand}
          onApplyPendingCommand={onApplyPendingCommand}
        />
      )}

      <TimelogPanel
        timelog={timelog}
        onOpenFileAtCommit={onOpenFileAtCommit}
        onOpenCommitDiff={onOpenCommitDiff}
      />
    </div>
  );
};
