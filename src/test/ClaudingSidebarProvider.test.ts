import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ClaudingSidebarProvider } from '../providers/ClaudingSidebarProvider';
import { FeatureService } from '../services/FeatureService';
import { WorktreeService } from '../services/WorktreeService';
import { TimelogService } from '../services/TimelogService';
import { MessageService } from '../services/MessageService';
import { GitService } from '../services/GitService';
import { GitHistoryService } from '../services/GitHistoryService';
import { AgentService } from '../services/AgentService';
import { ITerminalProvider } from '../terminals/ITerminalProvider';
import { ConfigService } from '../services/ConfigService';
import { FeatureSearchService } from '../services/FeatureSearchService';

suite('ClaudingSidebarProvider Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockContext: vscode.ExtensionContext;
  let mockExtensionUri: vscode.Uri;
  let mockFeatureService: sinon.SinonStubbedInstance<FeatureService>;
  let mockWorktreeService: sinon.SinonStubbedInstance<WorktreeService>;
  let mockTimelogService: sinon.SinonStubbedInstance<TimelogService>;
  let mockMessageService: sinon.SinonStubbedInstance<MessageService>;
  let mockGitService: sinon.SinonStubbedInstance<GitService>;
  let mockGitHistoryService: sinon.SinonStubbedInstance<GitHistoryService>;
  let mockAgentService: sinon.SinonStubbedInstance<AgentService>;
  let mockTerminalProvider: ITerminalProvider;
  let mockConfigService: sinon.SinonStubbedInstance<ConfigService>;
  let mockSearchService: sinon.SinonStubbedInstance<FeatureSearchService>;
  let provider: ClaudingSidebarProvider;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockExtensionUri = vscode.Uri.file('/fake/extension/path');

    // Create mock context
    mockContext = {
      globalState: {
        get: sandbox.stub().returns(undefined),
        update: sandbox.stub().resolves()
      }
    } as any;

    // Create mock services
    mockFeatureService = sandbox.createStubInstance(FeatureService);
    mockWorktreeService = sandbox.createStubInstance(WorktreeService);
    mockTimelogService = sandbox.createStubInstance(TimelogService);
    mockMessageService = sandbox.createStubInstance(MessageService);
    mockGitService = sandbox.createStubInstance(GitService);
    mockGitHistoryService = sandbox.createStubInstance(GitHistoryService);
    mockAgentService = sandbox.createStubInstance(AgentService);
    mockConfigService = sandbox.createStubInstance(ConfigService);
    mockSearchService = sandbox.createStubInstance(FeatureSearchService);
    mockTerminalProvider = {} as any;

    provider = new ClaudingSidebarProvider(
      mockContext,
      mockExtensionUri,
      mockFeatureService as any,
      mockWorktreeService as any,
      mockTimelogService as any,
      mockGitService as any,
      mockMessageService as any,
      mockAgentService as any,
      mockTerminalProvider,
      mockConfigService as any,
      'feat',
      '/fake/project/root',
      mockSearchService as any
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('Message Handling', () => {
    test('should handle getFeatures message', async () => {
      const mockWebviewView = createMockWebviewView();
      const updateWebviewSpy = sandbox.spy(provider, 'updateWebview');

      // Resolve the webview
      provider.resolveWebviewView(mockWebviewView);

      // Simulate receiving getFeatures message
      const messageHandler = mockWebviewView.webview.onDidReceiveMessage.getCall(0)?.args[0];
      await messageHandler({ command: 'getFeatures' });

      // Should call updateWebview (called once in resolveWebviewView, once in message handler)
      assert.strictEqual(updateWebviewSpy.callCount, 2);
    });

    test('should handle promptForFeatureName message', async () => {
      const mockWebviewView = createMockWebviewView();
      const showInputBoxStub = sandbox.stub(vscode.window, 'showInputBox');
      showInputBoxStub.resolves('test-feature');

      mockFeatureService.createFeature.resolves({
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' }
      } as any);

      // Resolve the webview
      provider.resolveWebviewView(mockWebviewView);

      // Simulate receiving promptForFeatureName message
      const messageHandler = mockWebviewView.webview.onDidReceiveMessage.getCall(0)?.args[0];
      await messageHandler({ command: 'promptForFeatureName' });

      // Should show input box
      assert.ok(showInputBoxStub.calledOnce);
      assert.strictEqual(showInputBoxStub.getCall(0)?.args[0]?.prompt, 'Enter feature name');

      // Should create feature
      assert.ok(mockFeatureService.createFeature.calledOnce);
      assert.strictEqual(mockFeatureService.createFeature.getCall(0).args[0], 'test-feature');
    });

    test('should not create feature if user cancels input', async () => {
      const mockWebviewView = createMockWebviewView();
      const showInputBoxStub = sandbox.stub(vscode.window, 'showInputBox');
      showInputBoxStub.resolves(undefined); // User cancelled

      // Resolve the webview
      provider.resolveWebviewView(mockWebviewView);

      // Simulate receiving promptForFeatureName message
      const messageHandler = mockWebviewView.webview.onDidReceiveMessage.getCall(0)?.args[0];
      await messageHandler({ command: 'promptForFeatureName' });

      // Should show input box but not create feature
      assert.ok(showInputBoxStub.calledOnce);
      assert.ok(mockFeatureService.createFeature.notCalled);
    });

    test('should validate empty feature name', async () => {
      const mockWebviewView = createMockWebviewView();
      const showInputBoxStub = sandbox.stub(vscode.window, 'showInputBox');
      showInputBoxStub.resolves('test-feature');

      // Resolve the webview
      provider.resolveWebviewView(mockWebviewView);

      // Trigger the message to get the validation function
      const messageHandler = mockWebviewView.webview.onDidReceiveMessage.getCall(0)?.args[0];
      await messageHandler({ command: 'promptForFeatureName' });

      // Get the validation function
      const inputBoxOptions = showInputBoxStub.getCall(0)?.args[0];
      assert.ok(inputBoxOptions, 'Input box options should be defined');
      const validateInput = inputBoxOptions.validateInput!;

      // Test validation
      assert.strictEqual(validateInput(''), 'Empty feature name');
      assert.strictEqual(validateInput('   '), 'Invalid feature name: whitespace-only names are not allowed');
      assert.strictEqual(validateInput('valid-name'), null);
    });

    test('should trim whitespace from feature name', async () => {
      const mockWebviewView = createMockWebviewView();
      const showInputBoxStub = sandbox.stub(vscode.window, 'showInputBox');
      showInputBoxStub.resolves('  test-feature  '); // Name with whitespace

      mockFeatureService.createFeature.resolves({
        name: 'test-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/test-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' }
      } as any);

      // Resolve the webview
      provider.resolveWebviewView(mockWebviewView);

      // Simulate receiving promptForFeatureName message
      const messageHandler = mockWebviewView.webview.onDidReceiveMessage.getCall(0)?.args[0];
      await messageHandler({ command: 'promptForFeatureName' });

      // Should create feature with trimmed name
      assert.ok(mockFeatureService.createFeature.calledOnce);
      assert.strictEqual(mockFeatureService.createFeature.getCall(0).args[0], 'test-feature');
    });

    test('should handle createFeature message with name', async () => {
      const mockWebviewView = createMockWebviewView();

      mockFeatureService.createFeature.resolves({
        name: 'direct-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/direct-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' }
      } as any);

      // Resolve the webview
      provider.resolveWebviewView(mockWebviewView);

      // Simulate receiving createFeature message with name
      const messageHandler = mockWebviewView.webview.onDidReceiveMessage.getCall(0)?.args[0];
      await messageHandler({ command: 'createFeature', name: 'direct-feature' });

      // Should create feature
      assert.ok(mockFeatureService.createFeature.calledOnce);
      assert.strictEqual(mockFeatureService.createFeature.getCall(0).args[0], 'direct-feature');
    });

    test('should show error message if feature creation fails', async () => {
      const mockWebviewView = createMockWebviewView();
      const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');

      mockFeatureService.createFeature.rejects(new Error('Feature already exists'));

      // Resolve the webview
      provider.resolveWebviewView(mockWebviewView);

      // Simulate receiving createFeature message
      const messageHandler = mockWebviewView.webview.onDidReceiveMessage.getCall(0)?.args[0];
      await messageHandler({ command: 'createFeature', name: 'duplicate-feature' });

      // Should show error message
      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.getCall(0).args[0].includes('Feature already exists'));
    });

    test('should open prompt.md after feature creation', async () => {
      const mockWebviewView = createMockWebviewView();
      const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument');

      mockFeatureService.createFeature.resolves({
        name: 'new-feature',
        worktreePath: '/path/to/worktree',
        branchName: 'feature/new-feature',
        status: { type: 'just-created', message: 'Edit feature prompt' }
      } as any);

      // Resolve the webview
      provider.resolveWebviewView(mockWebviewView);

      // Simulate receiving createFeature message
      const messageHandler = mockWebviewView.webview.onDidReceiveMessage.getCall(0)?.args[0];
      await messageHandler({ command: 'createFeature', name: 'new-feature' });

      // Should open prompt.md
      assert.ok(showTextDocumentStub.calledOnce);
      const uri = showTextDocumentStub.getCall(0).args[0] as vscode.Uri;
      assert.ok(uri.fsPath.endsWith('prompt.md'));
    });
  });

  suite('Webview Updates', () => {
    test('should send features to webview on update', async () => {
      const mockWebviewView = createMockWebviewView();
      const mockFeatures = [
        {
          name: 'feature1',
          worktreePath: '/path/to/feature1',
          branchName: 'feature/feature1',
          status: { type: 'just-created', message: 'Edit feature prompt' }
        },
        {
          name: 'feature2',
          worktreePath: '/path/to/feature2',
          branchName: 'feature/feature2',
          status: { type: 'needs-plan', message: 'Create plan' }
        }
      ];

      mockFeatureService.getFeatures.returns(mockFeatures as any);

      // Resolve the webview
      provider.resolveWebviewView(mockWebviewView);

      // Wait for debounced update to complete
      await new Promise(resolve => setTimeout(resolve, 150));

      // Check that features were sent to webview
      const postMessageCalls = mockWebviewView.webview.postMessage.getCalls();
      assert.ok(postMessageCalls.length > 0);

      const lastCall = postMessageCalls[postMessageCalls.length - 1];
      assert.strictEqual(lastCall.args[0].type, 'update');
      assert.strictEqual(lastCall.args[0].features.length, 2);
      assert.strictEqual(lastCall.args[0].features[0].name, 'feature1');
    });
  });
});

/**
 * Helper function to create a mock WebviewView
 */
function createMockWebviewView(): any {
  const postMessageStub = sinon.stub();
  const onDidReceiveMessageStub = sinon.stub();

  return {
    webview: {
      options: {},
      html: '',
      postMessage: postMessageStub,
      onDidReceiveMessage: onDidReceiveMessageStub,
      asWebviewUri: (uri: vscode.Uri) => uri
    },
    visible: true,
    onDidDispose: sinon.stub(),
    onDidChangeVisibility: sinon.stub()
  };
}
