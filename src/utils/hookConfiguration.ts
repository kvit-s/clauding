import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Hook configuration for Claude Code's hook system
 */
interface HookConfig {
  type: 'command';
  command: string;
}

interface HookEntry {
  matcher?: string;
  hooks: HookConfig[];
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/**
 * Generate hook configuration for agent status tracking
 */
export function generateHookConfiguration(hookScriptPath: string): Record<string, HookEntry[]> {
  return {
    'SessionStart': [{
      hooks: [{
        type: 'command',
        command: `${hookScriptPath} SessionStart`
      }]
    }],
    'UserPromptSubmit': [{
      hooks: [{
        type: 'command',
        command: `${hookScriptPath} UserPromptSubmit`
      }]
    }],
    'PreToolUse': [{
      matcher: '*',
      hooks: [{
        type: 'command',
        command: `${hookScriptPath} PreToolUse "$TOOL_NAME"`
      }]
    }],
    'PostToolUse': [{
      matcher: '*',
      hooks: [{
        type: 'command',
        command: `${hookScriptPath} PostToolUse "$TOOL_NAME"`
      }]
    }],
    'Stop': [{
      hooks: [{
        type: 'command',
        command: `${hookScriptPath} Stop`
      }]
    }],
    'Notification': [{
      hooks: [{
        type: 'command',
        command: `${hookScriptPath} Notification`
      }]
    }],
    'SessionEnd': [{
      hooks: [{
        type: 'command',
        command: `${hookScriptPath} SessionEnd`
      }]
    }],
    'SubagentStop': [{
      hooks: [{
        type: 'command',
        command: `${hookScriptPath} SubagentStop`
      }]
    }]
  };
}

/**
 * Merge hook configuration into existing settings file
 */
export async function mergeHookConfiguration(
  settingsPath: string,
  hookScriptPath: string
): Promise<void> {
  let settings: ClaudeSettings = {};

  // Load existing settings if they exist
  try {
    const content = await fs.promises.readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  } catch {
    // File doesn't exist or is invalid - start fresh
  }

  // Ensure hooks object exists
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Define hook configurations
  const hookConfig = generateHookConfiguration(hookScriptPath);

  // Replace agent hooks (don't merge to avoid duplicates)
  for (const [eventType, config] of Object.entries(hookConfig)) {
    settings.hooks[eventType] = config;
  }

  // Write back to file
  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.promises.writeFile(
    settingsPath,
    JSON.stringify(settings, null, 2),
    'utf-8'
  );
}

/**
 * Ensure .gitignore includes an entry
 */
export async function ensureGitignoreEntry(gitignorePath: string, entry: string): Promise<void> {
  let content = '';

  try {
    content = await fs.promises.readFile(gitignorePath, 'utf-8');
  } catch {
    // File doesn't exist, will create
  }

  if (!content.includes(entry)) {
    content += `\n# Claude Code project-level configuration (managed by clauding extension)\n${entry}\n`;
    await fs.promises.writeFile(gitignorePath, content, 'utf-8');
  }
}

/**
 * Check if worktree has hook configuration
 */
export async function checkWorktreeHookConfiguration(worktreePath: string): Promise<{
  configured: boolean;
  settingsPath: string;
}> {
  const settingsPath = path.join(worktreePath, '.claude', 'settings.json');

  try {
    const content = await fs.promises.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as ClaudeSettings;

    const hasAgentHooks = settings.hooks && (
      settings.hooks.SessionStart ||
      settings.hooks.UserPromptSubmit ||
      settings.hooks.PreToolUse
    );

    return {
      configured: !!hasAgentHooks,
      settingsPath
    };
  } catch {
    return {
      configured: false,
      settingsPath
    };
  }
}

/**
 * Setup hooks for a worktree
 */
export async function setupWorktreeHooks(
  worktreePath: string,
  featureName: string,
  context: vscode.ExtensionContext
): Promise<void> {
  // 1. Ensure .gitignore includes .claude/
  const gitignorePath = path.join(worktreePath, '.gitignore');
  await ensureGitignoreEntry(gitignorePath, '.claude/');

  // 2. Copy hook script to worktree's .claude/hooks/
  const hookScriptSource = path.join(
    context.extensionPath,
    'resources/hooks/agent-status-tracker.sh'
  );
  const hookScriptDest = path.join(
    worktreePath,
    '.claude/hooks/agent-status-tracker.sh'
  );

  await fs.promises.mkdir(path.dirname(hookScriptDest), { recursive: true });
  await fs.promises.copyFile(hookScriptSource, hookScriptDest);
  await fs.promises.chmod(hookScriptDest, 0o755); // Make executable

  // 3. Create/update worktree's .claude/settings.json
  const settingsPath = path.join(worktreePath, '.claude', 'settings.json');
  await mergeHookConfiguration(settingsPath, './.claude/hooks/agent-status-tracker.sh');
}
