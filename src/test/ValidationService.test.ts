import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { ValidationService } from '../utils/ValidationService';

suite('ValidationService Test Suite', () => {
  const testDir = path.join(__dirname, '../../test-temp/validation-' + Date.now());

  setup(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  teardown(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  suite('Feature Name Validation', () => {
    test('should accept valid feature name with single word', () => {
      const result = ValidationService.isValidFeatureName('feature');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    test('should accept valid feature name with dashes', () => {
      const result = ValidationService.isValidFeatureName('my-feature');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    test('should accept valid feature name: user-auth', () => {
      const result = ValidationService.isValidFeatureName('user-auth');
      assert.strictEqual(result.valid, true);
    });

    test('should accept valid feature name: api-client', () => {
      const result = ValidationService.isValidFeatureName('api-client');
      assert.strictEqual(result.valid, true);
    });

    test('should accept valid feature name with multiple dashes', () => {
      const result = ValidationService.isValidFeatureName('my-awesome-feature');
      assert.strictEqual(result.valid, true);
    });

    test('should reject empty feature name', () => {
      const result = ValidationService.isValidFeatureName('');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error);
    });

    test('should reject whitespace-only feature name', () => {
      const result = ValidationService.isValidFeatureName('   ');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error);
    });

    test('should reject feature name with uppercase letters', () => {
      const result = ValidationService.isValidFeatureName('MyFeature');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should reject feature name with mixed case', () => {
      const result = ValidationService.isValidFeatureName('myFeature');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should reject feature name with underscores', () => {
      const result = ValidationService.isValidFeatureName('my_feature');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should reject feature name with spaces', () => {
      const result = ValidationService.isValidFeatureName('my feature');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should reject feature name with leading dash', () => {
      const result = ValidationService.isValidFeatureName('-my-feature');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should reject feature name with trailing dash', () => {
      const result = ValidationService.isValidFeatureName('my-feature-');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should reject feature name with double dash', () => {
      const result = ValidationService.isValidFeatureName('my--feature');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should accept feature name with numbers', () => {
      const result = ValidationService.isValidFeatureName('feature-123');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    test('should accept feature name with numbers: my-feature-2', () => {
      const result = ValidationService.isValidFeatureName('my-feature-2');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    test('should accept feature name with numbers at end: feature2', () => {
      const result = ValidationService.isValidFeatureName('feature2');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    test('should accept feature name starting with number: 123feature', () => {
      const result = ValidationService.isValidFeatureName('123feature');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    test('should reject feature name with forward slash', () => {
      const result = ValidationService.isValidFeatureName('feature/name');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should reject feature name with backslash', () => {
      const result = ValidationService.isValidFeatureName('feature\\name');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should reject feature name starting with dot', () => {
      const result = ValidationService.isValidFeatureName('.hidden');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    test('should reject feature name with special characters', () => {
      const result = ValidationService.isValidFeatureName('my@feature');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });
  });

  suite('Git Availability', () => {
    test('should check if git is available', async () => {
      const result = await ValidationService.isGitAvailable();
      // Should return boolean
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  suite('Git Repository Check', () => {
    test('should detect git repository', () => {
      // Create .git directory
      const gitDir = path.join(testDir, '.git');
      fs.mkdirSync(gitDir);

      const result = ValidationService.isGitRepository(testDir);
      assert.strictEqual(result, true);
    });

    test('should detect non-git repository', () => {
      const result = ValidationService.isGitRepository(testDir);
      assert.strictEqual(result, false);
    });
  });

  suite('Claude Availability', () => {
    test('should check if claude executable is available', async () => {
      const result = await ValidationService.isClaudeAvailable('echo');
      // Should work with echo command
      assert.strictEqual(result, true);
    });

    test('should detect unavailable executable', async () => {
      const result = await ValidationService.isClaudeAvailable('nonexistent-command-12345');
      assert.strictEqual(result, false);
    });
  });

  suite('Workspace Validation', () => {
    test('should validate workspace without git', async () => {
      const result = await ValidationService.validateWorkspace(testDir);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    test('should validate workspace with git', async () => {
      // Create .git directory
      const gitDir = path.join(testDir, '.git');
      fs.mkdirSync(gitDir);

      const result = await ValidationService.validateWorkspace(testDir);
      // May still be invalid due to git not being installed in CI
      assert.ok(result.errors !== undefined);
    });
  });
});
