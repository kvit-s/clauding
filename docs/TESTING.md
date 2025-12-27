# Testing Guide

This guide explains the testing structure and best practices for the Clauding project.

## Test Structure

The project uses a hybrid testing approach with both unit tests and integration tests:

- **Unit Tests**: Fast, isolated tests with mocked dependencies
- **Integration Tests**: Slower tests that verify real interactions between components

### Test Organization

```
src/test/
├── *.test.ts               # Service-level unit tests (root level)
├── handlers/               # Handler tests
├── providers/              # Provider tests
├── state/                  # State manager tests
├── events/                 # Event bus tests
├── ui/                     # UI coordinator tests
├── integration/            # Integration tests with real operations
│   ├── GitIntegration.test.ts
│   ├── WorktreeIntegration.test.ts
│   ├── FeatureWorkflowIntegration.test.ts
│   └── integrationTestHelpers.ts
├── utils/
│   └── mockHelpers.ts      # Reusable mock factories
├── helpers/                # Test helper utilities
│   ├── MockFactory.ts      # Comprehensive mock factory
│   ├── TempFileHelper.ts   # Temporary file utilities
│   └── GitTestHelper.ts    # Git-specific test helpers
└── suite/
    └── index.ts            # Test suite configuration
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Only Unit Tests (Fast)
```bash
npm run test:unit
# or
npm run test:fast
```

### Run Only Integration Tests
```bash
npm run test:integration
```

### Watch Mode (Unit Tests)
```bash
npm run test:watch
```

## Writing Tests

### Unit Tests

Unit tests should be fast (<10ms per test) and fully isolated using mocks.

**Example: Testing a Service**

```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import { GitService } from '../../services/GitService';

suite('GitService Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let gitService: GitService;
  let execAsyncStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock exec function
    execAsyncStub = sandbox.stub().resolves({ stdout: '', stderr: '' });
    // Inject mock into service
    gitService = new GitService(execAsyncStub);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should stage all changes', async () => {
    await gitService.stageAll('/mock/repo');

    assert.ok(execAsyncStub.calledOnce);
    assert.ok(execAsyncStub.calledWith('git add -A', { cwd: '/mock/repo' }));
  });
});
```

### Integration Tests

Integration tests should verify real behavior with actual file system and git operations.

**Example: Integration Test**

```typescript
import * as assert from 'assert';
import { GitService } from '../../services/GitService';
import { IntegrationTestHelpers } from '../integration/integrationTestHelpers';

suite('Git Integration Tests', function() {
  this.timeout(10000); // Longer timeout for real operations

  let testRepo: { path: string; cleanup: () => void };
  let gitService: GitService;

  setup(() => {
    testRepo = IntegrationTestHelpers.createRealGitRepo();
    gitService = new GitService();
  });

  teardown(() => {
    testRepo.cleanup();
  });

  test('should perform complete commit workflow', async () => {
    // Real git operations
    await gitService.stageAll(testRepo.path);
    const commitHash = await gitService.commit(testRepo.path, 'Test commit');

    assert.ok(commitHash);
    assert.strictEqual(commitHash.length, 7);
  });
});
```

## Mock Helpers

The project provides two sets of test utilities:

- **`utils/mockHelpers.ts`**: Basic reusable mock factories
- **`helpers/`**: Comprehensive test utilities including `MockFactory`, `TempFileHelper`, and `GitTestHelper`

### Basic Mock Helpers (utils/mockHelpers.ts)

### GitService Mocks

```typescript
import { MockHelpers } from '../utils/mockHelpers';

// Mock git exec commands
const execAsyncStub = MockHelpers.createGitExecAsyncMock();
const gitService = new GitService(execAsyncStub);

// Customize behavior
execAsyncStub.withArgs(sinon.match(/git status/)).resolves({
  stdout: 'M  file.txt\n',
  stderr: ''
});
```

### File System Mocks

```typescript
const fsMocks = MockHelpers.createFsMock(sandbox);

// Customize behavior
fsMocks.existsSync.withArgs('/specific/path').returns(true);
fsMocks.readFileSync.returns('file content');
```

### Git Repository State Mocks

```typescript
const repoState = MockHelpers.mockGitRepo({
  hasChanges: true,
  stagedFiles: ['file1.txt', 'file2.txt'],
  branch: 'main'
});

// Use state in tests
const status = repoState.getStatusOutput();
```

### Advanced Helpers (helpers/)

**MockFactory**: Comprehensive mock factory for complex test scenarios.

```typescript
import { MockFactory } from '../helpers/MockFactory';

const mocks = MockFactory.createServiceMocks();
```

**TempFileHelper**: Utilities for creating temporary files and directories.

```typescript
import { TempFileHelper } from '../helpers/TempFileHelper';

const tempDir = TempFileHelper.createTempDir();
// ... use tempDir
TempFileHelper.cleanup(tempDir);
```

**GitTestHelper**: Git-specific test utilities for setting up test repositories.

```typescript
import { GitTestHelper } from '../helpers/GitTestHelper';

const testRepo = GitTestHelper.createTestRepo();
// ... run tests
testRepo.cleanup();
```

## Best Practices

### 1. Use Dependency Injection

Services should accept dependencies via constructor parameters:

```typescript
export class GitService {
  constructor(
    private execAsync: (cmd: string, opts: any) => Promise<any> = promisify(exec)
  ) {}
}
```

This makes testing easier:

```typescript
const mockExec = sinon.stub();
const gitService = new GitService(mockExec);
```

### 2. Keep Unit Tests Fast

- Mock all external dependencies (file system, git, network)
- Avoid real file I/O
- Aim for <10ms per test
- Use `sandbox.stub()` for proper cleanup

### 3. Use Integration Tests Sparingly

- Only for critical workflows (~5-10% of tests)
- Test scenarios difficult to mock accurately
- Verify real interactions work as expected

### 4. Proper Test Isolation

```typescript
setup(() => {
  sandbox = sinon.createSandbox();
  // Setup test state
});

teardown(() => {
  sandbox.restore(); // Clean up all stubs
  // Clean up test resources
});
```

### 5. Clear Test Names

```typescript
// Good
test('should stage all changes when stageAll is called', async () => {

// Bad
test('test staging', async () => {
```

### 6. Test Behavior, Not Implementation

```typescript
// Good - tests behavior
test('should commit changes with provided message', async () => {
  const hash = await gitService.stageAndCommit(path, 'feat: Add feature');
  assert.ok(hash);
});

// Bad - tests implementation details
test('should call execAsync with specific arguments', async () => {
  await gitService.stageAndCommit(path, 'message');
  assert.ok(execStub.calledWith('git commit -m "message"'));
});
```

## Performance Guidelines

### Target Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Total test time | <10s | ~35s |
| Unit test time | <5s | ~30s |
| Integration test time | <5s | ~5s |
| Per unit test | <10ms | <5ms |
| Per integration test | <1s | <500ms |

### Improving Test Performance

1. **Use mocks instead of real operations**
   ```typescript
   // Slow (integration)
   const result = execSync('git status', { cwd: repo });

   // Fast (unit with mock)
   execStub.withArgs('git status').resolves({ stdout: '' });
   ```

2. **Minimize file I/O**
   ```typescript
   // Slow
   fs.writeFileSync(path, content);

   // Fast
   writeStub.returns(undefined);
   ```

3. **Batch related tests**
   ```typescript
   suite('Multiple related tests', () => {
     setup(() => {
       // Shared expensive setup
     });

     test('test 1', () => {});
     test('test 2', () => {});
   });
   ```

## Debugging Tests

### Run Specific Test
```bash
# Run tests matching pattern
npm test -- --grep "GitService.*should stage"
```

### VS Code Debugging

1. Set breakpoints in test files
2. Press F5 or use "Run and Debug"
3. Select "Extension Tests" configuration

### Common Issues

**Tests timing out:**
- Increase timeout: `this.timeout(10000)`
- Check for infinite loops or hanging promises

**Flaky tests:**
- Use proper async/await
- Clean up resources in `teardown()`
- Avoid race conditions

**Mocks not working:**
- Ensure sandbox.restore() in teardown
- Check stub is created before usage
- Verify correct import paths

## Test Coverage

While we don't enforce coverage metrics, aim for:

- Critical paths: 100%
- Services: >90%
- Handlers: >80%
- Utilities: >85%

## Continuous Integration

Tests run automatically on:
- Every commit (pre-commit hook)
- Pull requests
- Main branch merges

CI must pass before merging PRs.

## Additional Resources

- [Mocha Documentation](https://mochajs.org/)
- [Sinon Documentation](https://sinonjs.org/)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)

## Questions?

If you have questions about testing, please:
1. Check this guide first
2. Look at existing test files for examples
3. Ask in the project's discussion forum
