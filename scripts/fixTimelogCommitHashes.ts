#!/usr/bin/env ts-node

/**
 * Script to fix stale commit hashes in archived feature timelogs.
 *
 * Problem: When commits are amended to include timelog changes, the commit hash changes.
 * The timelog contains the old (pre-amend) hash which no longer exists in git history.
 *
 * Solution: For each stale hash, find the correct commit by matching:
 * - Git commit message (contains action name)
 * - Commit timestamp (close to timelog timestamp)
 * - Output file reference (if present in commit message)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface TimelogEntry {
  timestamp: string;
  action: string;
  result: string;
  details?: {
    commitHash?: string;
    outputFile?: string;
    file?: string;
    [key: string]: unknown;
  };
}

interface TimelogFile {
  entries: TimelogEntry[];
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  timestamp: string;
  date: Date;
}

class TimelogHashFixer {
  private projectRoot: string;
  private featuresDir: string;
  private dryRun: boolean;
  private stats = {
    totalFeatures: 0,
    totalEntries: 0,
    staleHashes: 0,
    fixedHashes: 0,
    unfixableHashes: 0
  };

  constructor(projectRoot: string, dryRun: boolean = false) {
    this.projectRoot = projectRoot;
    this.featuresDir = path.join(projectRoot, '.clauding', 'features');
    this.dryRun = dryRun;
  }

  /**
   * Check if a commit hash exists in git history
   */
  private commitExists(hash: string): boolean {
    try {
      execSync(`git cat-file -e ${hash}^{commit}`, {
        cwd: this.projectRoot,
        stdio: 'ignore'
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all commits for a feature (from init to merge)
   */
  private getFeatureCommits(featureName: string): CommitInfo[] {
    try {
      // Find commits that mention this feature name in message
      const output = execSync(
        `git log --all --format='%H|%h|%s|%aI' --grep="${featureName}"`,
        {
          cwd: this.projectRoot,
          encoding: 'utf-8'
        }
      );

      const commits: CommitInfo[] = [];
      const lines = output.trim().split('\n').filter(l => l);

      for (const line of lines) {
        const [hash, shortHash, message, timestamp] = line.split('|');
        commits.push({
          hash,
          shortHash,
          message,
          timestamp,
          date: new Date(timestamp)
        });
      }

      // Also find commits that modified files in the feature's metadata folder
      // This catches commits that might not have the feature name in the message
      try {
        const pathOutput = execSync(
          `git log --all --format='%H|%h|%s|%aI' -- '.clauding/features/${featureName}/*'`,
          {
            cwd: this.projectRoot,
            encoding: 'utf-8'
          }
        );

        const pathLines = pathOutput.trim().split('\n').filter(l => l);
        for (const line of pathLines) {
          const [hash, shortHash, message, timestamp] = line.split('|');
          // Avoid duplicates
          if (!commits.find(c => c.hash === hash)) {
            commits.push({
              hash,
              shortHash,
              message,
              timestamp,
              date: new Date(timestamp)
            });
          }
        }
      } catch {
        // Path-based search might fail if no commits exist, that's OK
      }

      // Sort by date ascending (oldest first)
      commits.sort((a, b) => a.date.getTime() - b.date.getTime());

      return commits;
    } catch (error) {
      console.warn(`Failed to get commits for ${featureName}:`, error);
      return [];
    }
  }

  /**
   * Find the correct commit hash for a timelog entry
   */
  private findCorrectCommit(
    featureName: string,
    entry: TimelogEntry,
    commits: CommitInfo[]
  ): string | null {
    const entryDate = new Date(entry.timestamp);
    const outputFile = entry.details?.outputFile;
    const file = entry.details?.file;

    // Strategy 1: Match by action in commit message and timestamp proximity
    let bestMatch: CommitInfo | null = null;
    let bestTimeDiff = Infinity;

    for (const commit of commits) {
      // Special handling for "Feature Created" / "Initialize feature"
      if (entry.action === 'Feature Created') {
        const isInitCommit =
          commit.message.toLowerCase().includes('initialize feature') ||
          commit.message.toLowerCase().includes('init feature') ||
          commit.message.toLowerCase().includes('feature created');

        if (isInitCommit) {
          const timeDiff = Math.abs(commit.date.getTime() - entryDate.getTime());
          // Allow up to 2 minutes difference for init commits
          if (timeDiff < 2 * 60 * 1000 && timeDiff < bestTimeDiff) {
            bestTimeDiff = timeDiff;
            bestMatch = commit;
          }
        }
        continue;
      }

      // Check if commit message contains the action
      // Be flexible with matching: "Modify Plan" should match "Modify implementation plan"
      const actionLower = entry.action.toLowerCase();
      const messageLower = commit.message.toLowerCase();

      const messageContainsAction =
        messageLower.includes(actionLower) ||
        messageLower.includes(actionLower.replace(/\s+/g, '-')) ||
        // Try to match key words from the action
        actionLower.split(' ').every(word => word.length > 3 && messageLower.includes(word));

      if (!messageContainsAction) {
        continue;
      }

      // If we have an output file, check if it's referenced in the commit
      if (outputFile) {
        const messageContainsOutput = commit.message.includes(outputFile);
        if (messageContainsOutput) {
          // Exact match on output file - this is very likely the right commit
          return commit.hash;
        }
      }

      // If we have a file reference (like prompt.md), check for it
      if (file) {
        const messageContainsFile = commit.message.includes(file);
        if (messageContainsFile) {
          const timeDiff = Math.abs(commit.date.getTime() - entryDate.getTime());
          if (timeDiff < 2 * 60 * 1000) {
            return commit.hash;
          }
        }
      }

      // Calculate time difference
      const timeDiff = Math.abs(commit.date.getTime() - entryDate.getTime());

      // Consider commits within 5 minutes as candidates
      if (timeDiff < 5 * 60 * 1000 && timeDiff < bestTimeDiff) {
        bestTimeDiff = timeDiff;
        bestMatch = commit;
      }
    }

    return bestMatch?.hash || null;
  }

  /**
   * Process a single timelog file
   */
  private processTimelog(featureName: string, timelogPath: string): void {
    console.log(`\nProcessing feature: ${featureName}`);

    const content = fs.readFileSync(timelogPath, 'utf-8');
    const timelog: TimelogFile = JSON.parse(content);

    let modified = false;
    const featureCommits = this.getFeatureCommits(featureName);

    console.log(`  Found ${featureCommits.length} commits in git history`);

    for (let i = 0; i < timelog.entries.length; i++) {
      const entry = timelog.entries[i];
      this.stats.totalEntries++;

      // Skip entries without commit hashes
      if (!entry.details?.commitHash) {
        continue;
      }

      const hash = entry.details.commitHash;

      // Check if hash exists
      if (this.commitExists(hash)) {
        console.log(`  ✓ Entry ${i + 1} (${entry.action}): ${hash} - OK`);
        continue;
      }

      this.stats.staleHashes++;
      console.log(`  ✗ Entry ${i + 1} (${entry.action}): ${hash} - STALE`);

      // Try to find the correct hash
      const correctHash = this.findCorrectCommit(featureName, entry, featureCommits);

      if (correctHash) {
        console.log(`    → Found replacement: ${correctHash.substring(0, 7)}`);

        if (!this.dryRun) {
          entry.details.commitHash = correctHash.substring(0, 7);
          modified = true;
        }
        this.stats.fixedHashes++;
      } else {
        console.log(`    → Could not find replacement`);
        this.stats.unfixableHashes++;
      }
    }

    // Write back if modified
    if (modified && !this.dryRun) {
      fs.writeFileSync(timelogPath, JSON.stringify(timelog, null, 2), 'utf-8');
      console.log(`  ✓ Timelog updated`);
    }
  }

  /**
   * Process all archived features
   */
  public async run(): Promise<void> {
    console.log('Fixing timelog commit hashes...');
    console.log(`Project root: ${this.projectRoot}`);
    console.log(`Features directory: ${this.featuresDir}`);
    console.log(`Dry run: ${this.dryRun ? 'YES' : 'NO'}`);
    console.log('---');

    if (!fs.existsSync(this.featuresDir)) {
      console.error(`Features directory not found: ${this.featuresDir}`);
      process.exit(1);
    }

    // Get all feature directories
    const features = fs.readdirSync(this.featuresDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    this.stats.totalFeatures = features.length;
    console.log(`Found ${features.length} features\n`);

    // Process each feature
    for (const featureName of features) {
      const timelogPath = path.join(this.featuresDir, featureName, 'timelog.json');

      if (!fs.existsSync(timelogPath)) {
        console.log(`Skipping ${featureName}: no timelog.json`);
        continue;
      }

      try {
        this.processTimelog(featureName, timelogPath);
      } catch (error) {
        console.error(`Error processing ${featureName}:`, error);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total features: ${this.stats.totalFeatures}`);
    console.log(`Total timelog entries: ${this.stats.totalEntries}`);
    console.log(`Stale hashes found: ${this.stats.staleHashes}`);
    console.log(`Fixed hashes: ${this.stats.fixedHashes}`);
    console.log(`Unfixable hashes: ${this.stats.unfixableHashes}`);

    if (this.dryRun) {
      console.log('\n⚠ DRY RUN - No changes were made');
      console.log('Run without --dry-run to apply changes');
    } else {
      console.log('\n✓ Changes have been applied');
    }
  }
}

// Main execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const projectRoot = process.cwd();

const fixer = new TimelogHashFixer(projectRoot, dryRun);
fixer.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
