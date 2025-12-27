# Configuration

Clauding can be configured via VS Code Settings (File > Preferences > Settings, or press Ctrl+,) or by editing your user or workspace `settings.json` directly. Search for "Clauding" to view all available options.

This document provides a detailed reference for all Clauding settings, grouped by category, along with their types, defaults, scopes, and usage examples.

---

## Agent Settings

### `clauding.agent.command`
- **Type:** `string`
- **Default:** `claude`
- **Scope:** `window`
- **Description:** Command to launch the coding agent (e.g., the Claude CLI executable).
- **Example:**
```jsonc
"clauding.agent.command": "claude --dangerously-skip-permissions"
```

---

## LLM Integration (Experimental)

> **Disabled by default.** See [DEVELOPING.md](DEVELOPING.md#experimental-feature-classification) for how to enable and configure.

---

## Test Settings

### `clauding.test.command`
- **Type:** `string`
- **Default:** `""` (empty)
- **Scope:** `resource`
- **Description:** Default test command for all features (e.g., `npm test`, `pytest`, `cargo test`). Can be overridden per feature.
- **Example:**
```jsonc
{
  "clauding.test.command": "pytest -q"
}
```

---

## Agent Status Tracking

### `clauding.agentStatus.notifications`
- **Type:** `object`
- **Default:**
```json
{
  "notifyOnIdle": false,
  "notifyOnError": true,
  "notifyOnInput": true
}
```
- **Scope:** `window`
- **Description:** Configure which status changes trigger VS Code notifications:
  - `notifyOnIdle`: Notify when the agent becomes idle.
  - `notifyOnError`: Notify on agent errors.
  - `notifyOnInput`: Notify when agent is waiting for user input.

### `clauding.agentStatus.maxHistoryEvents`
- **Type:** `number`
- **Default:** `100`
- **Scope:** `window`
- **Description:** Maximum number of status events to keep in the per-session history.

### `clauding.agentStatus.sessionTimeout`
- **Type:** `number`
- **Default:** `3600` (seconds)
- **Scope:** `window`
- **Description:** Seconds before inactive agent sessions are pruned (default: 1 hour).

---

## Pre-Run Commands

### `clauding.preRunCommands`
- **Type:** `string[]`
- **Default:** `[]` (empty array)
- **Scope:** `window`
- **Description:** Commands to run before _every_ feature [Run] action (e.g., `["npm install", "npm run build"]`). Executes in the feature's worktree.

### `clauding.autoCloseRunTerminal`
- **Type:** `boolean`
- **Default:** `true`
- **Scope:** `window`
- **Description:** Automatically close pre-run command terminals when the debug or run session terminates.
- **Example:**
```jsonc
{
  "clauding.preRunCommands": ["npm ci", "npm run build"],
  "clauding.autoCloseRunTerminal": false
}
```

---

## Terminal Configuration

### `clauding.terminal.provider`
- **Type:** `string`
- **Default:** `auto`
- **Scope:** `window`
- **Allowed values:**
  - `vscode` – use VS Code's built-in terminals
  - `tmux` – use tmux for enhanced terminal management (requires tmux)
  - `auto` – detect tmux availability and use it if available
- **Description:** Terminal provider to use for feature worktree terminals.
- **Example:**
```jsonc
{
  "clauding.terminal.provider": "tmux",
  "clauding.terminal.tmux.sessionName": "myproject",
  "clauding.terminal.tmux.mouseMode": false
}
```

#### TMUX-Specific Settings

These settings apply only when `clauding.terminal.provider` is set to `tmux` (or `auto` and tmux is detected).

##### `clauding.terminal.tmux.sessionName`
- **Type:** `string`
- **Default:** `clauding`
- **Scope:** `window`
- **Description:** Base name for the tmux session used by Clauding (prefixed by workspace name).

##### `clauding.terminal.tmux.activityTimeout`
- **Type:** `number` (1–300)
- **Default:** `5` (seconds)
- **Scope:** `window`
- **Description:** Seconds of silence before a terminal pane is considered idle.

##### `clauding.terminal.tmux.monitoringInterval`
- **Type:** `number` (100–10000)
- **Default:** `1000` (milliseconds)
- **Scope:** `window`
- **Description:** Polling interval in milliseconds for activity monitoring.

##### `clauding.terminal.tmux.useControlMode`
- **Type:** `boolean`
- **Default:** `false`
- **Scope:** `window`
- **Description:** Use tmux control mode for real-time events instead of polling (experimental).

##### `clauding.terminal.tmux.mouseMode`
- **Type:** `boolean`
- **Default:** `true`
- **Scope:** `window`
- **Description:** Enable tmux mouse mode for proper scrolling behavior. When disabled, mouse events pass through to the terminal application.

---

## Agent Executables

### `clauding.agents`
- **Type:** `array of object`
- **Default:**
```json
[
  {
    "id": "claude",
    "executable": "claude",
    "flags": "--dangerously-skip-permissions"
  }
]
```
- **Scope:** `window`
- **Description:** List of agent executables available for running commands. Each entry:
- **Example:**
```jsonc
{
  "clauding.agents": [
    {
      "id": "claude",
      "executable": "claude",
      "flags": "--dangerously-skip-permissions"
    },
    {
      "id": "gpt",
      "executable": "openai",
      "flags": "--model gpt-4"
    }
  ],
  "clauding.defaultAgentId": "gpt"
}
```
  - `id` (_string_): unique identifier and display name.
  - `executable` (_string_): command to invoke the agent.
  - `flags` (_string_): default command-line flags.

### `clauding.defaultAgentId`
- **Type:** `string`
- **Default:** `claude`
- **Scope:** `window`
- **Description:** ID of the default agent to use for all commands (must match one of `clauding.agents[].id`).

---

## Deprecated Settings

> These settings are deprecated and will be removed in future releases—please migrate to the replacements below.

### `clauding.agentExecutable`
- **Type:** `string`
- **Default:** `claude`
- **Scope:** `window`
- **Deprecated in favor of:** `clauding.agents`

### `clauding.agentFlags`
- **Type:** `string`
- **Default:** `--dangerously-skip-permissions`
- **Scope:** `window`
- **Deprecated in favor of:** `clauding.agents`

---

## Usage Monitoring

### `clauding.usage.checkDelay`
- **Type:** `number` (500–10000)
- **Default:** `2000` (milliseconds)
- **Scope:** `window`
- **Description:** Delay to wait for the Claude CLI to initialize when checking usage.

### `clauding.usage.parseDelay`
- **Type:** `number` (200–5000)
- **Default:** `1000` (milliseconds)
- **Scope:** `window`
- **Description:** Delay after sending `/usage` command before parsing the output.

### `clauding.usage.timeout`
- **Type:** `number` (5000–60000)
- **Default:** `30000` (milliseconds)
- **Scope:** `window`
- **Description:** Maximum time to wait for the usage check to complete.
- **Example:**
```jsonc
{
  "clauding.usage.checkDelay": 5000,
  "clauding.usage.timeout": 45000
}
```

---

## Custom Agent Commands

### `clauding.agentCommands`
- **Type:** `array of object`
- **Default:** `[]`
- **Scope:** `window`
- **Description:** Defines custom, user–supplied agent commands that override or extend the built‑in commands. A command entry with the same `name` as a default command replaces that command entirely—you can override every property (`path`, `prompt`, `requiredFiles`, `outputFilePrefix`, `label`, `preferredAgentId`, `defaultPrompt`, `prompts`, etc.), so include any defaults you still want to keep. Because of the complexity, this setting cannot be edited in the Settings UI—edit your `settings.json` directly:

1. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P).
2. Run `Preferences: Open Settings (JSON)`.
3. Add entries to `"clauding.agentCommands"`.

Default commands you can override:
- `Create Plan` — reads `.clauding/prompt.md` and writes a detailed `.clauding/plan.md`.
- `Create Lightweight Plan` — shorter plan based on `.clauding/prompt.md`, saves to `.clauding/plan.md`.
- `Modify Plan` — updates `.clauding/plan.md` using `.clauding/modify-prompt.md`.
- `Implement Plan` — applies the steps in `.clauding/plan.md`.
- `Fix All Tests` — fixes failing tests after reviewing test output.
- `Resolve Conflicts` — resolves merge conflicts using `.clauding/plan.md` for context.
- `Generic Agent` — blank prompt for ad‑hoc sessions.

Each command object must have:
- `name` (_string_): unique identifier and default display label.
- `label` (_string_, optional): custom display label (defaults to `name`).
- `path` (_string_): `"."` for the repository root or `"{worktree}"` for the feature worktree.
- `prompt` (_string_): template string passed to the agent, supporting variable placeholders:
  - `{feature-name}`: the feature name
  - `{working-directory}` or `{worktree}`: the absolute path to the feature worktree
  - `{root}`: the absolute path to the repository root
  - `{file:<relative-path>}`: inline the contents of the specified file (relative to the working directory). For example, if your command runs in the feature worktree, `{file:plan.md}` injects the contents of `<feature-worktree>/plan.md`.
- `requiredFiles` (_array of object_, optional): file checks before running the command. Each:
  - `path` (_string_): file path or glob pattern.
  - `type` (_string_): `"exact"` (will create missing file) or `"pattern"` (error if none found).
  - `template` (_string_, optional): content to create for `"exact"` files.
  - `errorMessage` (_string_, optional): custom error for missing `"pattern"` files.
- `outputFilePrefix` (_string_): prefix for agent output files (under `.clauding/features/.../outputs`).

Additionally, you can specify agent-specific prompts:
- `defaultPrompt` (_string_, optional): Base system prompt applied when no agent-specific override is provided.
- `prompts` (_object<string,string>_, optional): Map from agent ID to prompt text, allowing different system prompts per agent executable.

#### Example

```jsonc
"clauding.agentCommands": [
  {
    "name": "summarize",
    "label": "Summarize Feature",
    "path": "{worktree}",
    "prompt": "Summarize the feature \"{feature-name}\" in a few sentences.",
    "requiredFiles": [
      {
        "path": "prompt.md",
        "type": "exact",
        "template": "# Prompt for {feature-name}\n\n"
      }
    ],
    "defaultPrompt": "Provide an overview of this feature before summarization.",
    "prompts": {
      "claude": "Please summarize {feature-name} using Claude conventions.",
      "gpt": "GPT-style summary of {feature-name}:"
    },
    "outputFilePrefix": "summary"
  }
]
```

---
