import React, { useEffect, useState } from 'react';
import { Feature, FileTreeNode, VsCodeApi } from '../types';

interface FilesListProps {
  feature: Feature;
  onOpenFile: (fileName: string) => void;
  hasModifyPrompt: boolean;
  hasTestResults: boolean;
  vscode: VsCodeApi;
}

interface TreeNodeProps {
  node: FileTreeNode;
  level: number;
  onFileClick: (path: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  onFileClick,
  expandedFolders,
  onToggleFolder
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const indentStyle = { paddingLeft: `${level * 12}px` };

  const getGitStatusColor = (status?: string) => {
    switch (status) {
      case 'U': // Untracked
        return 'var(--vscode-gitDecoration-untrackedResourceForeground)';
      case 'M': // Modified
        return 'var(--vscode-gitDecoration-modifiedResourceForeground)';
      case 'A': // Added
        return 'var(--vscode-gitDecoration-addedResourceForeground)';
      case 'D': // Deleted
        return 'var(--vscode-gitDecoration-deletedResourceForeground)';
      case 'R': // Renamed
        return 'var(--vscode-gitDecoration-renamedResourceForeground)';
      default:
        return 'inherit';
    }
  };

  if (node.type === 'directory') {
    return (
      <>
        <div
          className="tree-node directory-node"
          style={indentStyle}
          onClick={() => onToggleFolder(node.path)}
        >
          <span className="tree-icon">{isExpanded ? '▼' : '▶'}</span>
          <span className="tree-label">{node.name}</span>
        </div>
        {isExpanded && node.children && node.children.map(child => (
          <TreeNode
            key={child.path}
            node={child}
            level={level + 1}
            onFileClick={onFileClick}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
          />
        ))}
      </>
    );
  }

  return (
    <div
      className="tree-node file-node"
      style={indentStyle}
      onClick={() => onFileClick(node.path)}
    >
      <span className="tree-icon">📄</span>
      <span className="tree-label" style={{ color: getGitStatusColor(node.gitStatus) }}>
        {node.name}
      </span>
      {node.gitStatus && (
        <span className="git-status-marker" style={{ color: getGitStatusColor(node.gitStatus) }}>
          {node.gitStatus}
        </span>
      )}
    </div>
  );
};

export const FilesList: React.FC<FilesListProps> = ({
  feature,
  vscode
}) => {
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Request file tree from extension
    vscode.postMessage({
      command: 'getFileTree',
      featureName: feature.name
    });

    // Listen for file tree response and refresh signals
    const messageListener = (event: MessageEvent) => {
      const message = event.data;
    if (message.type === 'fileTree') {
        if (message.error) {
          console.error('Failed to load file tree:', message.error);
          setFileTree([]);
        } else {
          setFileTree(message.tree || []);
        }
        setLoading(false);
    } else if (
      message.type === 'update' &&
      message.selectedFeature?.name === feature.name &&
      message.selectedFeature.agentSession?.status === 'idle'
    ) {
      // Refresh file tree when agent goes idle
      vscode.postMessage({
        command: 'getFileTree',
        featureName: feature.name
      });
    }
    };

    window.addEventListener('message', messageListener);
    return () => window.removeEventListener('message', messageListener);
  }, [feature.name, feature.lifecycleStatus, vscode]);

  useEffect(() => {
    // Ensure outputs folder is collapsed when feature changes
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      newSet.delete('outputs');
      return newSet;
    });
  }, [feature.name]);

  // Ensure outputs folder is collapsed when feature changes
  useEffect(() => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      newSet.delete('outputs'); // Ensure outputs is collapsed
      return newSet;
    });
  }, [feature.name]);

  const handleToggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const handleFileClick = (path: string) => {
    vscode.postMessage({
      command: 'openFile',
      featureName: feature.name,
      fileName: path
    });
  };

  if (loading) {
    return (
      <div className="files-list">
        <h4>Files:</h4>
        <div className="loading-message">Loading...</div>
      </div>
    );
  }

  if (fileTree.length === 0) {
    return (
      <div className="files-list">
        <h4>Files:</h4>
        <div className="empty-message">No files found</div>
      </div>
    );
  }

  return (
    <div className="files-list">
      <h4>Files:</h4>
      <div className="file-tree">
        {fileTree.map(node => (
          <TreeNode
            key={node.path}
            node={node}
            level={0}
            onFileClick={handleFileClick}
            expandedFolders={expandedFolders}
            onToggleFolder={handleToggleFolder}
          />
        ))}
      </div>
    </div>
  );
};
