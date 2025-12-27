import * as fs from 'fs';
import { TimelogEntry } from '../models/Feature';
import {
  getFeaturesMetaPath,
  getProjectRoot,
  ensureFeaturesFolderExists,
  META_FILES
} from '../utils/featureMetaPaths';

interface TimelogFile {
  entries: TimelogEntry[];
}

export class TimelogService {
  /**
   * Add an entry to a feature's timelog (stored in features folder)
   */
  public async addEntry(
    worktreePath: string,
    featureName: string,
    action: string,
    result: 'Success' | 'Failed' | 'Warning',
    details?: Record<string, unknown>,
    commitHash?: string,
    timestamp?: string
  ): Promise<void> {
    const projectRoot = getProjectRoot(worktreePath);

    // Ensure features folder exists before writing
    ensureFeaturesFolderExists(projectRoot, featureName);

    const timelogPath = getFeaturesMetaPath(projectRoot, featureName, META_FILES.TIMELOG);

    // Load existing timelog
    let timelog: TimelogFile;
    if (fs.existsSync(timelogPath)) {
      const content = fs.readFileSync(timelogPath, 'utf-8');
      timelog = JSON.parse(content);
    } else {
      timelog = { entries: [] };
    }

    // Add new entry with optional commit hash and timestamp
    const entry: TimelogEntry = {
      timestamp: timestamp || new Date().toISOString(),
      action,
      result,
      details,
      ...(commitHash ? { commitHash } : {})
    };
    timelog.entries.push(entry);

    // Save timelog - wrap in try-catch for permission errors
    try {
      fs.writeFileSync(timelogPath, JSON.stringify(timelog, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to write timelog:', error);
      // Don't throw - handle gracefully
    }
  }

  /**
   * Get all entries from a feature's timelog (from features folder)
   */
  public getEntries(worktreePath: string, featureName: string): TimelogEntry[] {
    const projectRoot = getProjectRoot(worktreePath);
    const timelogPath = getFeaturesMetaPath(projectRoot, featureName, META_FILES.TIMELOG);

    if (!fs.existsSync(timelogPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(timelogPath, 'utf-8');
      const timelog: TimelogFile = JSON.parse(content);
      return timelog.entries;
    } catch (error) {
      console.error('Failed to read timelog:', error);
      return [];
    }
  }

  /**
   * Get the most recent entry
   */
  public getLastEntry(worktreePath: string, featureName: string): TimelogEntry | null {
    const entries = this.getEntries(worktreePath, featureName);
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }
}
