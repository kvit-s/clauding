import * as fs from 'fs';
import * as path from 'path';
import { FeatureStatus } from '../models/Feature';
import { getAbsoluteMetaPath, META_FILES } from '../utils/featureMetaPaths';
import { MergeService } from './MergeService';
import { TestService } from './TestService';
import { GitService } from './GitService';

/**
 * Service responsible for determining feature status based on filesystem state.
 * Simplifies complex conditional logic and makes status rules testable and maintainable.
 */
export class FeatureStatusResolver {
  private mergeService?: MergeService;
  private testService?: TestService;
  private fsFn: typeof fs;

  constructor(fsOverride?: typeof fs) {
    this.fsFn = fsOverride ?? fs;
  }

  public setMergeService(mergeService: MergeService): void {
    this.mergeService = mergeService;
  }

  public setTestService(testService: TestService): void {
    this.testService = testService;
  }

  /**
   * Determine the current status of a feature based on filesystem state
   */
  public determineFeatureStatus(worktreePath: string): FeatureStatus {
    // Extract feature name from worktree path
    const featureName = path.basename(worktreePath);
    const promptPath = getAbsoluteMetaPath(worktreePath, featureName, META_FILES.PROMPT);
    const planPath = getAbsoluteMetaPath(worktreePath, featureName, META_FILES.PLAN);

    // Check for uncommitted changes (ready to merge)
    if (this.mergeService) {
      // We can't use async in this method, so we check synchronously
      const gitService = new GitService();
      try {
        const hasUncommitted = gitService.hasUncommittedChangesSync(worktreePath);
        if (!hasUncommitted) {
          return {
            type: 'ready-to-merge',
            message: 'Feature complete. Ready to [Merge]'
          };
        }
      } catch {
        // If we can't check git status, continue with other checks
      }
    }

    // Check test results (if test service available)
    if (this.testService) {
      const hasTests = this.testService.getMostRecentTestResult(worktreePath);
      if (hasTests) {
        const hasFailing = this.testService.hasFailingTests(worktreePath);
        if (hasFailing) {
          return {
            type: 'tests-failed',
            message: 'Tests failing. Review test output and run [Fix All Tests]'
          };
        } else {
          return {
            type: 'tests-passed',
            message: 'Tests passing. Review changes and [Commit]'
          };
        }
      }
    }

    // Check if implementation exists after plan
    if (this.fsFn.existsSync(planPath)) {
      const planMtime = this.fsFn.statSync(planPath).mtime;
      const hasImplementation = this.checkFilesModifiedAfter(worktreePath, planMtime);

      if (hasImplementation) {
        return {
          type: 'implementing',
          message: 'Run [Run Tests] to verify implementation'
        };
      } else {
        return {
          type: 'plan-created',
          message: 'Review plan and either [Modify Plan] or [Implement Plan]'
        };
      }
    }

    // Check if prompt exists and has content
    if (this.fsFn.existsSync(promptPath)) {
      const promptContent = this.fsFn.readFileSync(promptPath, 'utf-8').trim();

      if (promptContent.length === 0) {
        return {
          type: 'just-created',
          message: 'Edit feature prompt, save file and run [Create Plan]'
        };
      }

      // Check if plan exists
      if (!this.fsFn.existsSync(planPath)) {
        return {
          type: 'needs-plan',
          message: 'Review feature prompt and run [Create Plan]'
        };
      }
    }

    // Default: just created
    return {
      type: 'just-created',
      message: 'Edit feature prompt, save file and run [Create Plan]'
    };
  }

  /**
   * Check if any source files were modified after a given time
   */
  private checkFilesModifiedAfter(worktreePath: string, afterTime: Date): boolean {
    const walk = (dir: string): boolean => {
      try {
        const files = this.fsFn.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = this.fsFn.statSync(filePath);

          // Skip certain directories
          if (stat.isDirectory()) {
            if (file === 'outputs' || file === '.git' || file === 'node_modules' || file === '.clauding') {
              continue;
            }
            if (walk(filePath)) {
              return true;
            }
          } else {
            // Skip meta files (they're now in .clauding/)
            // Ignore these files when checking for uncommitted changes
            if (file === 'prompt.md' || file === 'plan.md' ||
                file === 'timelog.json' || file === 'pending-command.json' ||
                file === 'modify-prompt.md') {
              continue;
            }
            // Check if file was modified after the time
            if (stat.mtime > afterTime) {
              return true;
            }
          }
        }
      } catch {
        // Ignore permission errors
      }
      return false;
    };

    return walk(worktreePath);
  }
}
