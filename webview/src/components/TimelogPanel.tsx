import React, { useState } from 'react';
import { TimelogEntry } from '../types';

interface TimelogPanelProps {
  timelog: TimelogEntry[];
  onOpenFileAtCommit: (filePath: string, commitHash: string) => void;
  onOpenCommitDiff: (commitHash: string) => void;
}

export const TimelogPanel: React.FC<TimelogPanelProps> = ({
  timelog,
  onOpenFileAtCommit,
  onOpenCommitDiff
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const getDisplayAction = (entry: TimelogEntry): string => {
    let action = entry.action;

    // Check if this is a classification entry
    if (entry.action === 'Feature Classified' && entry.details?.result) {
      action = `${entry.action} - ${entry.details.result}`;
    }

    if (action.length > 30) {
      return action.substring(0, 27) + '...';
    }
    return action;
  };

  return (
    <div className="timelog-panel">
      <div
        className="timelog-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>{isExpanded ? '▼' : '▶'} Timelog</span>
      </div>
      {isExpanded && (
        <div className="timelog-entries">
          {timelog.length === 0 ? (
            <div className="empty-message">No actions yet</div>
          ) : (
            [...timelog].reverse().map((entry, index) => (
              <div key={index} className="timelog-entry">
                <span className="timelog-timestamp">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className="timelog-action"> - {getDisplayAction(entry)}</span>
                {entry.details?.file && (
                  <>
                    {' - '}
                    <a
                      className="timelog-link"
                      onClick={(e) => {
                        e.preventDefault();
                        const filePath = entry.details!.file!;
                        const commitHash = entry.commitHash || entry.details?.commitHash;
                        if (commitHash) {
                          onOpenFileAtCommit(filePath, commitHash);
                        } else {
                          // Open current file if no commit hash
                          onOpenFileAtCommit(filePath, 'HEAD');
                        }
                      }}
                    >
                      {entry.details.file}
                    </a>
                  </>
                )}
                {(entry.commitHash || entry.details?.commitHash) && (
                  <>
                    {' ('}
                    <a
                      className="timelog-link"
                      onClick={(e) => {
                        e.preventDefault();
                        const commitHash = entry.commitHash || entry.details!.commitHash!;
                        onOpenCommitDiff(commitHash);
                      }}
                    >
                      {entry.commitHash || entry.details!.commitHash}
                    </a>
                    {')'}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
