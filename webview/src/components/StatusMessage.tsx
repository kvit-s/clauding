import React from 'react';
import { FeatureStatus } from '../types';

interface StatusMessageProps {
  status: FeatureStatus;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({ status }) => {
  const getStatusClass = (): string => {
    switch (status.type) {
      case 'just-created':
      case 'needs-plan':
        return 'status-info';
      case 'plan-created':
      case 'implementing':
        return 'status-working';
      case 'tests-failed':
        return 'status-error';
      case 'tests-passed':
        return 'status-success';
      case 'ready-to-merge':
        return 'status-success';
      case 'waiting-for-edit':
        return 'status-waiting';
      default:
        return 'status-info';
    }
  };

  return (
    <div className={`status-message ${getStatusClass()}`}>
      <strong>Status:</strong> {status.message}
    </div>
  );
};
