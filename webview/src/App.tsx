import React, { useState, useEffect, useCallback } from 'react';
import { Feature, WebviewState, TimelogEntry, MessageAction } from './types';
import { FeatureList } from './components/FeatureList';
import { FeaturePanel } from './components/FeaturePanel';

const vscode = acquireVsCodeApi();

export const App: React.FC = () => {
  const [state, setState] = useState<WebviewState>({
    features: [],
    selectedFeature: null,
    timelog: [],
    sortOrder: { type: 'chronological', direction: 'desc' }, // Default matches backend; actual value comes from persisted state
    viewMode: 'active',
    agentCommands: [],
    agents: [],           // NEW
    defaultAgentId: '',   // NEW
    searchState: { query: '', isActive: false }
  });
  const [featureListHeight, setFeatureListHeight] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // Handle messages from extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === 'update') {
        setState({
          features: message.features || [],
          selectedFeature: message.selectedFeature || null,
          timelog: message.timelog || [],
          sortOrder: message.sortOrder || { type: 'chronological', direction: 'desc' }, // Fallback matches backend default
          viewMode: message.viewMode || 'active',
          agentCommands: message.agentCommands || [],
          agents: message.agents || [],              // NEW
          defaultAgentId: message.defaultAgentId || '', // NEW
          searchState: message.searchState || { query: '', isActive: false }
        });
      }
    };

    window.addEventListener('message', messageHandler);

    // Request initial data
    vscode.postMessage({ command: 'getFeatures' });

    return () => window.removeEventListener('message', messageHandler);
  }, []);

  const handleCreateFeature = () => {
    // Use VS Code's input box instead of browser prompt
    vscode.postMessage({ command: 'promptForFeatureName' });
  };

  const handleSelectFeature = (feature: Feature) => {
    vscode.postMessage({ command: 'selectFeature', name: feature.name });
  };

  const handleOpenFile = (fileName: string) => {
    if (state.selectedFeature) {
      vscode.postMessage({
        command: 'openFile',
        featureName: state.selectedFeature.name,
        fileName
      });
    }
  };

  const handleExecuteCommand = (commandName: string, agentId?: string) => {  // Updated signature
    if (!state.selectedFeature) return;

    // Check if this is an agent command
    const isAgentCommand = state.agentCommands.some(cmd => cmd.name === commandName);

    if (isAgentCommand) {
      vscode.postMessage({
        command: 'executeAgentCommand',
        featureName: state.selectedFeature.name,
        commandName,
        agentId  // NEW: Include selected agent
      });
    }
    // Run command
    else if (commandName === 'Run') {
      vscode.postMessage({
        command: 'run',
        featureName: state.selectedFeature.name
      });
    }
    // Test command
    else if (commandName === 'Run Tests') {
      vscode.postMessage({
        command: 'runTests',
        featureName: state.selectedFeature.name
      });
    }
    // Finalize command
    else if (commandName === 'Finalize') {
      vscode.postMessage({
        command: 'merge',
        featureName: state.selectedFeature.name
      });
    }
    // Update from Main command
    else if (commandName === 'Update from Main') {
      vscode.postMessage({
        command: 'updateFromMain',
        featureName: state.selectedFeature.name
      });
    }
    // Other commands (Open Console, Open Folder, Commit)
    // Note: Configure Run has been removed as it's handled in global settings
    else {
      vscode.postMessage({
        command: commandName.toLowerCase().replace(' ', ''),
        featureName: state.selectedFeature.name
      });
    }
  };

  const handleApplyPendingCommand = () => {
    if (state.selectedFeature) {
      vscode.postMessage({
        command: 'applyPendingCommand',
        featureName: state.selectedFeature.name
      });
    }
  };

  const handleOpenFileAtCommit = (filePath: string, commitHash: string) => {
    console.log('handleOpenFileAtCommit called:', { filePath, commitHash, featureName: state.selectedFeature?.name });
    if (state.selectedFeature) {
      const message = {
        command: 'openFileAtCommit',
        featureName: state.selectedFeature.name,
        filePath,
        commitHash
      };
      console.log('Sending message to extension:', message);
      vscode.postMessage(message);
    }
  };

  const handleOpenCommitDiff = (commitHash: string) => {
    if (state.selectedFeature) {
      vscode.postMessage({
        command: 'openCommitDiff',
        featureName: state.selectedFeature.name,
        commitHash
      });
    }
  };

  const handleDeleteFeature = (featureName: string) => {
    vscode.postMessage({
      command: 'deleteFeature',
      featureName
    });
  };

  const handleRenameFeature = (featureName: string) => {
    // Prompt user for new name using VS Code's input box
    vscode.postMessage({
      command: 'promptForRename',
      featureName
    });
  };

  const handleDismissMessage = (messageId: string) => {
    if (state.selectedFeature) {
      vscode.postMessage({
        command: 'dismissMessage',
        featureName: state.selectedFeature.name,
        messageId
      });
    }
  };

  const handleMessageAction = (action: MessageAction) => {
    if (state.selectedFeature) {
      vscode.postMessage({
        command: 'messageAction',
        featureName: state.selectedFeature.name,
        action
      });
    }
  };

  const handleReactivateFeature = (featureName: string) => {
    vscode.postMessage({
      command: 'reactivateFeature',
      featureName
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setFeatureListHeight(e.clientY);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Check if modify prompt exists
  const hasModifyPrompt = state.selectedFeature ?
    state.timelog.some(e => e.action === 'Modify Plan') : false;

  // Check if test results exist
  const hasTestResults = state.selectedFeature ?
    state.timelog.some(e => e.action === 'Run Tests') : false;

  return (
    <div className="app">
      <FeatureList
        features={state.features}
        selectedFeature={state.selectedFeature}
        onSelectFeature={handleSelectFeature}
        onDeleteFeature={handleDeleteFeature}
        onRenameFeature={handleRenameFeature}
        viewMode={state.viewMode}
        searchState={state.searchState}
        vscode={vscode}
      />

      {state.selectedFeature && (
        <>
          <div className="resize-splitter" onMouseDown={handleMouseDown} />
          <FeaturePanel
            feature={state.selectedFeature}
            timelog={state.timelog}
            agentCommands={state.agentCommands}
            agents={state.agents}              // NEW
            defaultAgentId={state.defaultAgentId}  // NEW
            hasModifyPrompt={hasModifyPrompt}
            hasTestResults={hasTestResults}
            onOpenFile={handleOpenFile}
            onExecuteCommand={handleExecuteCommand}
            onApplyPendingCommand={handleApplyPendingCommand}
            onOpenFileAtCommit={handleOpenFileAtCommit}
            onOpenCommitDiff={handleOpenCommitDiff}
            vscode={vscode}
            onDismissMessage={handleDismissMessage}
            onMessageAction={handleMessageAction}
            viewMode={state.viewMode}
            onRenameFeature={handleRenameFeature}
            onDeleteFeature={handleDeleteFeature}
            onReactivateFeature={handleReactivateFeature}
          />
        </>
      )}
    </div>
  );
};
