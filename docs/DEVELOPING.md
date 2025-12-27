# Developing Clauding

This document covers the internal architecture and development setup for contributors.

## Building from Source

```bash
git clone https://github.com/adaptiverisk/clauding.git
cd clauding
npm install
npm run compile
npm run build
```

## Running in Development

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Changes to TypeScript require recompilation (`npm run compile`)
4. Changes to webview require rebuild (`cd webview && npm run build`)

## Dogfooding Workflow

Use a production version of Clauding to develop Clauding itself.

### Setup

```bash
# Build and install production version
npm run release
```

Restart VS Code. The production version is now active in your main VS Code instance.

### Daily Development

1. Open the clauding source directory in VS Code (production version is active)
2. Edit source files
3. Press `F5` to launch Extension Development Host

**What happens:**
- A new VS Code window opens with your development version
- Production version is automatically disabled in this debug window
- Your main VS Code still runs production

### Debug Configuration

Your `.vscode/launch.json` should contain:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "~/clauding-test"
      ]
    }
  ]
}
```

The `--extensionDevelopmentPath` tells the debug instance to load from source instead of the installed version.

### Updating Production

After finishing a feature:

```bash
# Update version in package.json, then:
npm run release
# Restart VS Code
```

## Running Tests

```bash
npm test                 # Run all tests
npm run test:unit        # Fast unit tests only
npm run test:integration # Integration tests
npm run test:watch       # Watch mode
```

See [TESTING.md](TESTING.md) for detailed testing guidelines.

## Project Structure

```
clauding/
├── src/
│   ├── commands/          # VS Code command implementations
│   ├── config/            # Configuration management
│   ├── di/                # Dependency injection container
│   ├── events/            # Event handlers
│   ├── features/          # Feature management logic
│   ├── migration/         # Data migration utilities
│   ├── models/            # Data models and types
│   ├── providers/         # VS Code tree/webview providers
│   ├── services/          # Core business logic (33 services)
│   ├── state/             # State management
│   ├── terminals/         # Terminal/tmux integration
│   ├── test/              # Test suites
│   ├── ui/                # UI utilities
│   ├── utils/             # Shared utilities
│   ├── watchers/          # File system watchers
│   └── extension.ts       # Main entry point
├── webview/
│   ├── src/               # React UI source
│   ├── dist/              # Built webview assets
│   └── webpack.config.js  # Webview bundling config
├── dist/                  # Compiled extension
├── resources/             # Icons and assets
└── out/                   # TypeScript output
```

## Data Architecture

Clauding uses a dual-folder architecture separating worktrees from metadata:

### Active Feature

```
.clauding/
├── worktrees/
│   └── {feature-name}/              # Git worktree (feature branch)
│       ├── .clauding/               # ✅ Committed with feature
│       │   ├── prompt.md            # Feature description
│       │   ├── plan.md              # Implementation plan
│       │   └── modify-prompt.md     # Plan modification instructions
│       └── [source code]            # Feature code changes
│
└── features/
    └── {feature-name}/              # ❌ Local only (never committed)
        ├── messages.json            # UI notifications
        ├── status.json              # Lifecycle status
        ├── timelog.json             # Action history with commit refs
        ├── classification.json      # AI feature classification
        └── outputs/                 # Agent session logs
            ├── create-plan-{timestamp}-{hash}.txt
            ├── implement-plan-{timestamp}-{hash}.txt
            └── fix-tests-{timestamp}-{hash}.txt
```

### After Merge (Archived)

```
.clauding/
└── features/
    └── {feature-name}/              # Preserved after merge
        ├── prompt.md                # Moved from worktree
        ├── plan.md                  # Moved from worktree
        ├── modify-prompt.md         # Moved from worktree
        ├── messages.json
        ├── status.json
        ├── timelog.json
        ├── classification.json
        └── outputs/
            └── [all session logs]
# Worktree is deleted after merge
```

### Design Rationale

- **Clean git history**: Only `.md` files committed with features
- **No metadata clutter**: Runtime data never pollutes repository
- **Complete history**: All metadata preserved after merge
- **Commit tracking**: Each metadata file references its commit hash
- **Scalable**: Unlimited archived features without repo bloat

## Key Services

| Service | Responsibility |
|---------|----------------|
| `AgentService` | Manages CLI agent execution |
| `GitService` | Git operations |
| `WorktreeService` | Git worktree management |
| `FeatureService` | Feature CRUD operations |
| `FeatureLifecycleManager` | State machine for feature lifecycle |
| `FeatureMergeCoordinator` | Merge workflow orchestration |
| `ConfigService` | VS Code settings integration |
| `LLMService` | OpenRouter/LLM API integration |
| `TimelogService` | Action history tracking |
| `TmuxService` | Terminal session management |

## Building for Distribution

```bash
npm run build      # Build extension + webview
npm run package    # Create .vsix package
```

This creates a `.vsix` file that can be installed via:
```bash
code --install-extension clauding-x.x.x.vsix
```

## Creating a Release

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Test locally:
   ```bash
   npm run release  # Builds, packages, and installs locally
   ```
4. Commit and push changes
5. Create a GitHub release:
   ```bash
   gh release create v0.1.0 --title "v0.1.0" --notes "Release notes here"
   ```

The `.github/workflows/release.yml` workflow will automatically:
- Build the extension
- Package the VSIX
- Attach it to the release as a downloadable asset

## Code Style

- ESLint + Prettier configured
- Run `npm run lint` before committing
- TypeScript strict mode enabled

## Debugging

1. Set breakpoints in VS Code
2. Press `F5` to launch debug session
3. Extension logs appear in Debug Console
4. Use "Developer: Toggle Developer Tools" in Extension Host for webview debugging

---

## Experimental Features

### Experimental: Feature Classification

LLM-based feature classification is an experimental feature that automatically categorizes features by complexity and type. **Disabled by default.**

#### Enabling for Testing

Add to your VS Code settings:

```json
{
  "clauding.llm.enabled": true,
  "clauding.llm.apiKey": "your-openrouter-api-key",
  "clauding.llm.baseURL": "https://openrouter.ai/api/v1",
  "clauding.llm.model": "openai/gpt-4o-mini:free"
}
```

#### Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `clauding.llm.enabled` | boolean | `false` | Enable feature classification |
| `clauding.llm.apiKey` | string | `""` | API key (stored in machine scope) |
| `clauding.llm.baseURL` | string | `https://openrouter.ai/api/v1` | OpenAI-compatible API endpoint |
| `clauding.llm.model` | string | `openai/gpt-4o-mini:free` | Model to use |
| `clauding.llm.temperature` | number | `0.7` | Sampling temperature (0.0-2.0) |
| `clauding.llm.maxTokens` | number | `4000` | Max tokens for responses |

#### How It Works

When enabled, after creating a plan, Clauding sends the feature prompt to the configured LLM to classify:
- **Complexity**: trivial, simple, moderate, complex, very_complex
- **Type**: feature, bugfix, refactor, documentation, test, infrastructure

Classification results are stored in `.clauding/features/{name}/classification.json`.

#### Why Experimental?

- Requires external API (cost, latency, availability)
- Classification quality varies by model
- May not provide significant value for all workflows
