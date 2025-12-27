import React, { useEffect, useRef } from 'react';
import { FeatureMessage, MessageAction } from '../types';

interface MessagePanelProps {
  messages: FeatureMessage[];
  onDismiss: (messageId: string) => void;
  onAction: (action: MessageAction) => void;
}

export const MessagePanel: React.FC<MessagePanelProps> = ({ messages, onDismiss, onAction }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new messages are added
  useEffect(() => {
    if (panelRef.current && messages.length > 0) {
      panelRef.current.scrollTop = 0;
    }
  }, [messages.length]);

  if (!messages || messages.length === 0) {
    return null;
  }

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Sort messages with newest first
  const sortedMessages = [...messages].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return (
    <div className="message-panel" ref={panelRef}>
      {sortedMessages.map((message) => (
        <div key={message.id} className={`message message-${message.type}`}>
          <span className="message-time">{formatTime(message.timestamp)}</span>
          <span className="message-separator"> - </span>
          <span className="message-text">{message.text}</span>
          {message.dismissible && (
            <button
              className="message-dismiss"
              onClick={() => onDismiss(message.id)}
              title="Dismiss message"
            >
              ×
            </button>
          )}
          {message.actions && message.actions.length > 0 && (
            <>
              {message.actions.map((action, index) => (
                <React.Fragment key={index}>
                  <span className="message-separator"> | </span>
                  <a
                    className="message-action-link"
                    onClick={() => onAction(action)}
                  >
                    {action.label}
                  </a>
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
};
