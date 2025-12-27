import * as fs from 'fs';
import * as path from 'path';

export interface ClaudingDirectories {
  root: string;
  config: string;
  worktrees: string;
}

export function ensureClaudingDirectories(workspaceRoot: string): ClaudingDirectories {
  const claudingRoot = path.join(workspaceRoot, '.clauding');
  const configDir = path.join(claudingRoot, 'config');
  const worktreesDir = path.join(claudingRoot, 'worktrees');

  // Create directories if they don't exist
  if (!fs.existsSync(claudingRoot)) {
    fs.mkdirSync(claudingRoot, { recursive: true });
  }
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
    // Update .gitignore when worktrees directory is first created
    updateGitignore(workspaceRoot);
  }

  return {
    root: claudingRoot,
    config: configDir,
    worktrees: worktreesDir
  };
}

function updateGitignore(workspaceRoot: string): void {
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  const entryToAdd = '.clauding';

  try {
    let gitignoreContent = '';

    // Read existing .gitignore if it exists
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');

      // Check if the entry already exists
      const lines = gitignoreContent.split('\n');
      if (lines.some(line => line.trim() === entryToAdd)) {
        return; // Entry already exists, no need to add
      }
    }

    // Add the entry to .gitignore
    const separator = gitignoreContent && !gitignoreContent.endsWith('\n') ? '\n' : '';
    const newContent = gitignoreContent + separator + entryToAdd + '\n';

    fs.writeFileSync(gitignorePath, newContent, 'utf-8');
  } catch (error) {
    // Silently fail if we can't update .gitignore (e.g., permission issues)
    console.error('Failed to update .gitignore:', error);
  }
}
