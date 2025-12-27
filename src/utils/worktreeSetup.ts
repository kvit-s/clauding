import * as path from 'path';
import * as fs from 'fs';

/**
 * Default patterns to include in .claudeignore to prevent
 * Claude Code CLI from watching too many files
 */
const DEFAULT_CLAUDEIGNORE_PATTERNS = [
  '# Sibling worktrees (prevent watching other features)',
  '../.clauding/worktrees/*',
  '',
  '# Dependencies',
  'node_modules/',
  '',
  '# Build artifacts',
  'out/',
  'dist/',
  '.vscode-test/',
  '',
  '# Editor directories',
  '.vscode/',
].join('\n');

/**
 * Ensures that a .claudeignore file exists in the worktree with the required patterns.
 * This prevents Claude Code CLI from watching too many files (e.g., sibling worktrees).
 *
 * @param worktreePath - Absolute path to the worktree directory
 */
export async function ensureClaudeignoreExists(worktreePath: string): Promise<void> {
  const claudeignorePath = path.join(worktreePath, '.claudeignore');

  try {
    let existingContent = '';

    // Read existing .claudeignore if it exists
    if (fs.existsSync(claudeignorePath)) {
      existingContent = fs.readFileSync(claudeignorePath, 'utf-8');
    }

    // Parse existing patterns (excluding comments and empty lines)
    const existingPatterns = existingContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    // Parse required patterns
    const requiredPatterns = DEFAULT_CLAUDEIGNORE_PATTERNS
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    // Check which required patterns are missing
    const missingPatterns = requiredPatterns.filter(
      pattern => !existingPatterns.includes(pattern)
    );

    // If all required patterns exist, no need to update
    if (missingPatterns.length === 0) {
      return;
    }

    // Merge: keep existing content and append missing patterns
    let newContent = existingContent;

    if (existingContent && !existingContent.endsWith('\n')) {
      newContent += '\n';
    }

    if (existingContent) {
      newContent += '\n# Added by clauding to prevent watching too many files\n';
    }

    newContent += missingPatterns.join('\n') + '\n';

    // Write the updated .claudeignore
    fs.writeFileSync(claudeignorePath, existingContent ? newContent : DEFAULT_CLAUDEIGNORE_PATTERNS);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create/update .claudeignore: ${errorMessage}`);
  }
}

/**
 * Updates .claudeignore for all existing worktrees in the worktrees directory.
 * This is useful for migrating existing worktrees.
 *
 * @param worktreesDir - Absolute path to the directory containing all worktrees
 */
export async function updateAllWorktreeClaudeignores(worktreesDir: string): Promise<void> {
  if (!fs.existsSync(worktreesDir)) {
    return;
  }

  const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const worktreePath = path.join(worktreesDir, entry.name);
      try {
        await ensureClaudeignoreExists(worktreePath);
      } catch (error) {
        // Log error but continue with other worktrees
        console.error(`Failed to update .claudeignore for ${entry.name}:`, error);
      }
    }
  }
}
