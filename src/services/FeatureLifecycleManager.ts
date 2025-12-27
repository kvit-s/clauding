import * as fs from 'fs';
import { FeatureLifecycleStatus } from '../models/Feature';
import {
  getAbsoluteWorktreeMetaPath,
  getFeaturesOutputsDir,
  getFeaturesMetaPath,
  getProjectRoot,
  ensureFeaturesFolderExists,
  META_FILES
} from '../utils/featureMetaPaths';

/**
 * Service responsible for managing feature lifecycle status.
 * Handles status transitions and validation, decoupling lifecycle state from feature operations.
 */
export class FeatureLifecycleManager {
  private fsFn: typeof fs;

  constructor(fsOverride?: typeof fs) {
    this.fsFn = fsOverride ?? fs;
  }

  /**
   * Load the lifecycle status from disk using file-based detection only:
   * - pre-plan: No plan.md exists
   * - plan: plan.md exists, no implement-plan*.txt in features/outputs/
   * - implement: implement-plan*.txt exists in features/outputs/, no wrap-up.json
   * - wrap-up: wrap-up.json exists in features folder
   *
   * NOTE: We no longer read lifecycleStatus from status.json. Status is purely determined
   * by the presence of specific files (plan.md in worktree, implement-plan*.txt in features/outputs/, wrap-up.json in features folder).
   */
  public loadLifecycleStatus(worktreePath: string, featureName: string): FeatureLifecycleStatus {
    const projectRoot = getProjectRoot(worktreePath);

    // Check for wrap-up.json in features folder
    const wrapUpPath = getFeaturesMetaPath(projectRoot, featureName, META_FILES.WRAP_UP);
    if (this.fsFn.existsSync(wrapUpPath)) {
      return 'wrap-up';
    }

    // Check for implement-plan*.txt in features/outputs/
    const outputsDir = getFeaturesOutputsDir(projectRoot, featureName);
    if (this.fsFn.existsSync(outputsDir)) {
      try {
        const files = this.fsFn.readdirSync(outputsDir);
        const hasImplementPlan = files.some(file => file.startsWith('implement-plan') && file.endsWith('.txt'));
        if (hasImplementPlan) {
          return 'implement';
        }
      } catch {
        // Ignore errors reading directory
      }
    }

    // Check for plan.md in worktree
    const planPath = getAbsoluteWorktreeMetaPath(worktreePath, META_FILES.PLAN);
    if (this.fsFn.existsSync(planPath)) {
      return 'plan';
    }

    // No plan.md means pre-plan - check for prompt.md in worktree
    const promptPath = getAbsoluteWorktreeMetaPath(worktreePath, META_FILES.PROMPT);
    if (this.fsFn.existsSync(promptPath)) {
      return 'pre-plan';
    }

    return 'legacy'; // Default for existing features without any detection markers
  }

  /**
   * Save the lifecycle status to disk in features folder
   * NOTE: We no longer persist lifecycleStatus to status.json. Status is now purely
   * determined by file-based detection (plan.md in worktree, implement-plan*.txt in features/outputs/, wrap-up.json in features folder).
   * This method now only saves metadata like timestamps and commit hash.
   * @param status - No longer persisted, kept for API compatibility
   * @param commitHash - Optional commit hash to track
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public saveLifecycleStatus(worktreePath: string, featureName: string, status: FeatureLifecycleStatus, commitHash?: string): void {
    const projectRoot = getProjectRoot(worktreePath);
    const statusPath = getFeaturesMetaPath(projectRoot, featureName, META_FILES.STATUS);

    // Ensure features folder exists
    ensureFeaturesFolderExists(projectRoot, featureName);

    const data = {
      // lifecycleStatus removed - now determined by file-based detection only
      updatedAt: new Date().toISOString(),
      ...(commitHash ? { commitHash } : {})
    };
    this.fsFn.writeFileSync(statusPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Update the lifecycle status of a feature
   */
  public updateLifecycleStatus(worktreePath: string, featureName: string, status: FeatureLifecycleStatus, commitHash?: string): void {
    this.saveLifecycleStatus(worktreePath, featureName, status, commitHash);
  }

  /**
   * Validate a lifecycle status transition
   * @returns true if the transition is valid, false otherwise
   */
  public isValidTransition(currentStatus: FeatureLifecycleStatus, newStatus: FeatureLifecycleStatus): boolean {
    // Define valid transitions
    const validTransitions: Record<FeatureLifecycleStatus, FeatureLifecycleStatus[]> = {
      'pre-plan': ['plan', 'legacy'],
      'plan': ['implement', 'pre-plan', 'legacy'],
      'implement': ['wrap-up', 'plan', 'legacy'],
      'wrap-up': ['legacy'],
      'legacy': ['pre-plan'] // Can restart from legacy
    };

    const allowedTransitions = validTransitions[currentStatus] || [];
    return allowedTransitions.includes(newStatus);
  }

  /**
   * Get the next expected lifecycle status based on current status
   */
  public getNextExpectedStatus(currentStatus: FeatureLifecycleStatus): FeatureLifecycleStatus | null {
    const nextStatus: Record<FeatureLifecycleStatus, FeatureLifecycleStatus | null> = {
      'pre-plan': 'plan',
      'plan': 'implement',
      'implement': 'wrap-up',
      'wrap-up': null, // No next status after wrap-up
      'legacy': 'pre-plan'
    };

    return nextStatus[currentStatus];
  }
}
