import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

export class IntegrationTestHelpers {
  static createRealGitRepo(): { path: string; cleanup: () => void } {
    const testRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'clauding-integration-'));

    execSync('git init', { cwd: testRepo });
    execSync('git config user.email "test@example.com"', { cwd: testRepo });
    execSync('git config user.name "Test User"', { cwd: testRepo });
    fs.writeFileSync(path.join(testRepo, 'README.md'), '# Test');
    execSync('git add .', { cwd: testRepo });
    execSync('git commit -m "Initial commit"', { cwd: testRepo });

    return {
      path: testRepo,
      cleanup: () => {
        if (fs.existsSync(testRepo)) {
          fs.rmSync(testRepo, { recursive: true, force: true });
        }
      }
    };
  }
}
