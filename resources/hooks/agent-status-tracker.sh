#!/bin/bash
# Agent Status Tracking Hook
# Sends lifecycle events to VS Code extension for real-time status updates

EVENT_TYPE="$1"
TOOL_NAME="${2:-}"
FEATURE_NAME="${CLAUDING_FEATURE_NAME:-unknown}"
WORKTREE_PATH="${CLAUDING_WORKTREE_PATH:-unknown}"
SESSION_ID="${CLAUDING_SESSION_ID:-$$}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Build JSON message
JSON=$(cat <<EOF
{
  "eventType": "$EVENT_TYPE",
  "toolName": "$TOOL_NAME",
  "featureName": "$FEATURE_NAME",
  "worktreePath": "$WORKTREE_PATH",
  "sessionId": "$SESSION_ID",
  "timestamp": "$TIMESTAMP",
  "pid": $$
}
EOF
)

# Write to status file (watched by extension)
# Use session ID to create unique file per agent session
# Write to the outputs folder in the worktree's .clauding directory
STATUS_FILE="${WORKTREE_PATH}/.clauding/outputs/.agent-status-${SESSION_ID}"
echo "$JSON" > "$STATUS_FILE" 2>/dev/null || true

# Also update the "latest" symlink for quick access to most recent session
ln -sf ".agent-status-${SESSION_ID}" "${WORKTREE_PATH}/.clauding/outputs/.agent-status-latest" 2>/dev/null || true
