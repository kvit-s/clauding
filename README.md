# Clauding - Parallel Feature Development with AI Agents

> Originally built for coding with Claude ("clauding")—now extended to other agents.

Clauding is a VS Code extension for managing parallel development work using AI coding agents. It provides the infrastructure to work on multiple features simultaneously, each isolated in its own git worktree, while capturing complete agent interaction logs for review, prompt optimization, and fine-tuning.

## Why Clauding?

**Work on multiple things at once.** Switch between a bug fix, a new feature, and a refactoring task without stashing or juggling branches. Each unit of work lives in its own isolated worktree.

**Use any CLI agent.** Clauding is agent-agnostic. While it ships with Claude CLI integration, you can configure any command-line AI agent (claude code, codex cli, Mistral's vibe, your own agent).

**Capture everything.** Every agent session is logged with full input/output. Review what worked, analyze failures, optimize your prompts, or use logs for fine-tuning custom models.

## Core Concepts

### Features as Units of Work

A "feature" in Clauding is any discrete unit of work:
- Bug fixes
- New features
- Refactoring tasks
- Documentation updates
- Experiments and spikes
- Hotfixes

Each feature gets:
- Its own **git branch** (automatically created)
- Its own **worktree** (isolated working directory)
- Its own **metadata** (prompts, plans, status, logs)

### Agent-Agnostic Design

Clauding doesn't care which AI agent you use. Configure your preferred agent:

```json
{
  "clauding.agent.command": "claude"      // Default: Claude CLI
  // Or use any CLI agent:
  // "clauding.agent.command": "aider"
  // "clauding.agent.command": "gpt-engineer"
  // "clauding.agent.command": "./my-custom-agent.sh"
}
```

### Flexible Workflow

Clauding suggests a structured workflow (Plan → Implement → Test → Merge), but **nothing is enforced**. Use it however you want:

- **Full AI workflow**: Create plan → Implement with agent → Run tests → Merge
- **Hybrid**: Write code manually, use agent only for tests or reviews
- **Manual only**: Use Clauding purely as a git worktree/terminal manager
- **Exploratory**: Spin up features for experiments, discard or merge as needed

You don't even need to use a coding agent—Clauding works as a standalone tool for managing parallel workstreams with git worktrees.

### Complete Interaction Logging

Every agent session is captured to timestamped log files:
```
.clauding/features/{feature-name}/outputs/
├── create-plan-2024-01-15T10-30-00-abc123.txt
├── implement-plan-2024-01-15T11-45-00-def456.txt
└── fix-tests-2024-01-15T14-20-00-ghi789.txt
```

Use these logs to:
- **Review** what the agent did and why
- **Debug** failed implementations
- **Optimize** prompts based on what worked
- **Fine-tune** custom models on successful interactions
- **Audit** changes before merging

## Key Features

- **Parallel Development**: Work on multiple features simultaneously in isolated worktrees
- **Multiple Agents**: Configure multiple CLI agents and select which one to use for each action, or use none at all
- **Flexible Workflow**: Suggested structure (plan → implement → merge) but use any workflow you want
- **Full Logging**: Capture complete agent interactions for review and optimization
- **Smart Merging**: AI-assisted conflict resolution when merging back to main
- **Complete History**: Track all actions with timestamps and git commit references

## Prerequisites

- Git installed and configured
- tmux installed (Linux/macOS/WSL)
- VS Code workspace must be a git repository
- CLI coding agent of your choice (optional, e.g., `claude`, `codex`, `vibe`)

## Installation

### 1. Get the Extension

**Option A:** Download the latest `.vsix` from [GitHub Releases](https://github.com/adaptiverisk/clauding/releases)

**Option B:** Build from source:
```bash
git clone https://github.com/adaptiverisk/clauding.git
cd clauding
npm install
npm run package
```

### 2. Install

```bash
code --install-extension clauding-*.vsix
```

## Quick Start

### 1. Create a Feature

1. Click the Clauding icon in the activity bar
2. Click the [+] button
3. Enter a feature name (e.g., "authentication-system")
4. The feature prompt file opens automatically

### 2. Describe Your Feature

Edit `prompt.md` with your feature description:

```markdown
# Authentication System

Implement a basic authentication system with:
- User registration endpoint
- Login endpoint with JWT tokens
- Password hashing with bcrypt
- Session management
```

Save the file.

### 3. Generate a Plan

1. Click "Create Plan"
2. Wait for the agent to generate an implementation plan
3. Review the generated `plan.md`
4. Optionally modify the plan with LLM using "Modify Plan" or manually by editing `plan.md`

### 4. Implement the Feature

1. Click "Implement Plan"
2. The configured agent will implement all steps from the plan
3. Check the output file for details
4. Review the changes

### 5. Run Tests

1. Click "Run Tests"
2. Review test results
3. If tests fail, click "Fix All Tests"

### 6. Merge to Main

1. Commit any remaining changes
2. Click "Merge"
3. If conflicts occur, choose a resolution strategy
4. Feature is merged and worktree cleaned up (history preserved for later review)

## What Goes Where

Clauding creates a `.clauding/` folder in your project root (add to `.gitignore`—it's local metadata).

**What gets committed with your feature branch:**
- Your code changes
- `.clauding/prompt.md` — feature description
- `.clauding/plan.md` — implementation plan

**What stays local (never committed):**
- Agent session logs
- Feature status and history
- Worktree management data

## Configuration

Configure Clauding through VS Code settings (`File > Preferences > Settings` or `Ctrl+,`). Search for "Clauding" to see all available options.

### Agent Configuration

- **`clauding.agent.command`**: Command to launch the coding agent (default: `"claude"`)

### Custom Agent Commands
- **`clauding.agentCommands`**: Array of custom agent command configurations. Each entry can include:
  - `name` (string): Unique identifier and default display label.
  - `label` (string, optional): Optional display label (defaults to name).
  - `path` (string): Working directory: `.` for root or `{worktree}` for feature worktree.
  - `prompt` (string): Template string with variable placeholders (`{feature-name}`, `{working-directory}`, `{worktree}`, `{root}`, `{file:path}`).
  - `defaultPrompt` (string, optional): Base system prompt applied when no agent-specific override is provided.
  - `prompts` (object, optional): Map from `agentId` to prompt text, allowing different system prompts for each agent executable.
  - `requiredFiles` (array, optional): File specifications that must exist before command execution.
  - `outputFilePrefix` (string): Prefix for output file names.

### Test Configuration

- **`clauding.test.command`**: Test command to run (e.g., `"npm test"`, `"pytest"`, `"cargo test"`). This is a workspace setting.

### Agent Status Tracking

Configure real-time agent status tracking and notifications:

- **`clauding.agentStatus.showStatusBar`**: Show agent status in status bar (default: `true`)
- **`clauding.agentStatus.notifications`**: Configure when to show notifications for agent status changes
  - `notifyOnIdle`: Show notification when agent becomes idle (default: `false`)
  - `notifyOnError`: Show notification on errors (default: `true`)
  - `notifyOnInput`: Show notification when agent needs input (default: `true`)
- **`clauding.agentStatus.maxHistoryEvents`**: Maximum number of events to keep in history per session (default: `100`)
- **`clauding.agentStatus.sessionTimeout`**: Seconds before inactive sessions are pruned (default: `3600` - 1 hour)

### Pre-Run Commands

- **`clauding.preRunCommands`**: Commands to run before ALL feature [Run] actions (e.g., `["npm install", "npm run build"]`). These commands execute in the feature's worktree directory and apply to all features. This is a workspace setting.
- **`clauding.autoCloseRunTerminal`**: Automatically close pre-run command terminals when the debug session terminates (default: `true`)

### Example: Workspace Settings

For project-specific settings, add to `.vscode/settings.json` in your workspace:

```json
{
  "clauding.test.command": "npm test",
  "clauding.preRunCommands": ["npm install"],
  "clauding.autoCloseRunTerminal": true
}
```

## Workflow

### Feature Lifecycle States

1. **Just Created**: Edit the feature prompt
2. **Needs Plan**: Run Create Plan
3. **Plan Created**: Review and implement
4. **Implementing**: Run tests
5. **Tests Failed**: Fix with agent or manually
6. **Tests Passed**: Commit changes
7. **Ready to Merge**: Merge into main

### Commands

**Agent Commands:**
- **Generic Agent**: Interactive agent session
- **Create Plan**: Generate implementation plan
- **Modify Plan**: Update existing plan
- **Implement Plan**: Execute implementation
- **Fix All Tests**: Fix failing tests

**Utility Commands:**
- **Open Console**: Open terminal in worktree
- **Open Folder**: Open worktree in file explorer
- **Run Tests**: Execute test command
- **Commit**: Create git commit
- **Merge**: Merge into main branch and archive feature

## Feature Metadata Structure

Feature metadata files are stored in `.clauding/` directory within each feature's worktree:

```
.clauding/worktrees/{feature-name}/
  .clauding/
    prompt.md              # Initial feature description
    plan.md                # Implementation plan
    modify-prompt.md       # Instructions for plan modifications
    timelog.json           # Time tracking data
    classification.json    # Feature classification metadata
    status.json            # Feature status
    {feature-name}.name    # Feature name marker file
    outputs/               # Agent session outputs
      create-plan-*.md
      implement-plan-*.md
```

## Security

### API Key Handling

Clauding takes security seriously when handling sensitive credentials:

- **Machine-scoped storage**: API keys (e.g., `clauding.llm.apiKey`) are stored in VS Code's machine-scoped settings, meaning they are **not synced** across devices via Settings Sync
- **No logging**: API keys are never written to agent output logs or extension logs
- **No transmission**: Clauding never transmits your API keys to any service other than the configured LLM endpoint (`clauding.llm.baseURL`)

### Agent Credentials

Clauding launches CLI agents (like `claude`) as subprocesses. These agents manage their own authentication:

- Clauding does not access or store agent authentication tokens
- Agent credentials are handled entirely by the agent's own configuration
- Refer to your agent's documentation for credential management

### Reporting Security Issues

If you discover a security vulnerability, please report it privately via [GitHub Security Advisories](https://github.com/kvit-s/clauding/security/advisories/new) rather than opening a public issue.

## Development

See [DEVELOPING.md](DEVELOPING.md) for build instructions, architecture, and contribution guidelines.

## License

MIT

## Support

- GitHub Issues: [Report a bug](https://github.com/kvit-s/clauding/issues)
- Documentation: [Full docs](https://github.com/kvit-s/clauding#readme)
