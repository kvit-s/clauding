#!/usr/bin/env bash

# Set up a disposable git workspace for Clauding manual testing.
# Usage: ./setup-test-workspace.sh [/absolute/path/to/workspace]

set -euo pipefail

WORKSPACE_ROOT="${1:-$HOME/clauding-test}"

# Ensure we are working with an absolute path
if [[ "${WORKSPACE_ROOT}" != /* ]]; then
  echo "Please provide an absolute path. Received: ${WORKSPACE_ROOT}" >&2
  exit 1
fi

if [[ -d "${WORKSPACE_ROOT}/.git" ]]; then
  echo "Workspace already initialized at ${WORKSPACE_ROOT}" >&2
  exit 1
fi

echo "Creating test workspace at ${WORKSPACE_ROOT}"
mkdir -p "${WORKSPACE_ROOT}"
cd "${WORKSPACE_ROOT}"

echo "Initializing git repository"
git init
git config user.name "s k"
git config user.email "s@k"

echo "Creating sample files"
mkdir -p src
printf "console.log('Hello');\n" > src/index.js
printf "# Test Project\n" > README.md

echo "Creating initial commit"
git add .
git commit -m "Initial commit"
git branch -M main

echo "Workspace ready at ${WORKSPACE_ROOT}"
