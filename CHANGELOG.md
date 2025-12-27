# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-12-27

### Added

- **Feature Management**
  - Create, rename, archive, and delete features
  - Each feature gets isolated git branch and worktree
  - Feature metadata stored in `.clauding/features/{name}/`
  - Feature lifecycle states: planning, implementing, testing, merging, completed, archived

- **Agent Integration**
  - Agent-agnostic design supporting any CLI agent (Claude, Codex, custom agents)
  - Multiple agent configuration with `clauding.agents` setting
  - Default agent selection with `clauding.defaultAgentId`
  - Custom agent commands with template variables

- **Workflow Commands**
  - Create Plan / Create Lightweight Plan
  - Modify Plan
  - Implement Plan
  - Fix All Tests
  - Resolve Conflicts
  - Generic Agent (ad-hoc sessions)

- **Terminal Management**
  - tmux integration for enhanced terminal management
  - VS Code terminal fallback
  - Auto-detection of tmux availability
  - Mouse mode and activity monitoring settings

- **Merge & Conflict Resolution**
  - Merge feature branches to main
  - AI-assisted conflict resolution
  - Manual resolution options (use feature/use main)
  - Merge abort capability

- **Agent Status Tracking**
  - Real-time agent status monitoring (idle, working, waiting for input, error)
  - Configurable notifications for status changes
  - Session history with configurable retention

- **Interaction Logging**
  - Complete agent session capture to timestamped log files
  - Output files stored in `.clauding/features/{name}/outputs/`
  - Logs available for review, debugging, and prompt optimization

- **Test Integration**
  - Configurable test commands per workspace
  - Test result parsing
  - Pre-run commands before test execution

- **Usage Monitoring**
  - Claude CLI usage tracking
  - Configurable check delays and timeouts

- **UI**
  - Sidebar panel for feature management
  - Feature sorting and search
  - Archive view toggle
  - Plan report viewer

### Deprecated

- `clauding.agentExecutable` - use `clauding.agents` instead
- `clauding.agentFlags` - use `clauding.agents` instead

### Security

- API keys stored in machine scope (not synced across devices)

[Unreleased]: https://github.com/kvit-s/clauding/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kvit-s/clauding/releases/tag/v0.1.0
