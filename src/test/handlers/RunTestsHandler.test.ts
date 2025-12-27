import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { RunTestsHandler } from '../../providers/sidebar/handlers/RunTestsHandler';
import { FeatureService } from '../../services/FeatureService';
import { MessageService } from '../../services/MessageService';

suite('RunTestsHandler Test Suite', () => {
  let handler: RunTestsHandler;
  let featureService: FeatureService;
  let messageService: MessageService;
  let onWebviewUpdate: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock objects with the methods that will be stubbed
    featureService = {
      runTests: async () => {}
    } as any;
    messageService = {} as any;
    onWebviewUpdate = sandbox.stub();

    handler = new RunTestsHandler(
      featureService,
      messageService,
      onWebviewUpdate
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('handle', () => {
    test('should run tests successfully', async () => {
      // Arrange
      const message = { command: 'runTests' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      const runTestsStub = sandbox.stub(featureService, 'runTests').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(runTestsStub.calledOnce);
      assert.strictEqual(runTestsStub.firstCall.args[0], 'test-feature');
      assert.strictEqual(runTestsStub.firstCall.args[1], undefined);
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should handle feature not found', async () => {
      // Arrange
      const message = { command: 'runTests' as const, featureName: 'nonexistent' };
      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(null);
      const runTestsStub = sandbox.stub(featureService, 'runTests');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(runTestsStub.notCalled);
      assert.ok(onWebviewUpdate.notCalled);
    });

    test('should open test output file when callback is invoked', async () => {
      // Arrange
      const message = { command: 'runTests' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const outputFile = '/path/to/output.txt';
      const mockDocument = {} as vscode.TextDocument;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);

      let callback: ((outputFile: string) => Promise<void>) | undefined;
      sandbox.stub(featureService, 'runTests').callsFake(async (_name, _filter, cb) => {
        callback = cb as any;
      });

      const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockDocument);
      const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves();

      // Act
      await handler.handle(message);
      assert.ok(callback, 'Callback should be defined');
      await callback(outputFile);

      // Assert
      assert.ok(openTextDocumentStub.calledOnce);
      assert.ok(showTextDocumentStub.calledOnce);
      assert.strictEqual(onWebviewUpdate.callCount, 2); // Once after runTests, once in callback
    });

    test('should handle test execution errors', async () => {
      // Arrange
      const message = { command: 'runTests' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const error = new Error('Test execution failed');

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      sandbox.stub(featureService, 'runTests').rejects(error);
      const handleErrorStub = sandbox.stub(handler as any, 'handleError');

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(handleErrorStub.calledOnceWith(error, 'Test execution', 'test-feature'));
      assert.ok(onWebviewUpdate.calledOnce);
    });

    test('should handle file opening errors in callback', async () => {
      // Arrange
      const message = { command: 'runTests' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const outputFile = '/path/to/output.txt';
      const error = new Error('File not found');

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);

      let callback: ((outputFile: string) => Promise<void>) | undefined;
      sandbox.stub(featureService, 'runTests').callsFake(async (_name, _filter, cb) => {
        callback = cb as any;
      });

      const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').rejects(error);

      // Act
      await handler.handle(message);
      assert.ok(callback, 'Callback should be defined');
      await callback(outputFile);

      // Assert
      // Verify that openTextDocument was called (error is logged but not verified in test)
      assert.ok(openTextDocumentStub.calledOnce);
    });

    test('should pass callback to runTests', async () => {
      // Arrange
      const message = { command: 'runTests' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      const runTestsStub = sandbox.stub(featureService, 'runTests').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(runTestsStub.calledOnce);
      const callbackArg = runTestsStub.firstCall.args[2];
      assert.strictEqual(typeof callbackArg, 'function');
    });

    test('should update UI before and after test completion', async () => {
      // Arrange
      const message = { command: 'runTests' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;
      const outputFile = '/path/to/output.txt';

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);

      let callback: ((outputFile: string) => Promise<void>) | undefined;
      sandbox.stub(featureService, 'runTests').callsFake(async (_name, _filter, cb) => {
        callback = cb as any;
      });

      sandbox.stub(vscode.workspace, 'openTextDocument').resolves({} as vscode.TextDocument);
      sandbox.stub(vscode.window, 'showTextDocument').resolves();

      // Act
      await handler.handle(message);
      const callCountAfterHandle = onWebviewUpdate.callCount;

      assert.ok(callback, 'Callback should be defined');
      await callback(outputFile);

      // Assert
      assert.strictEqual(callCountAfterHandle, 1, 'Should update UI after starting tests');
      assert.strictEqual(onWebviewUpdate.callCount, 2, 'Should update UI after tests complete');
    });

    test('should handle undefined filter parameter', async () => {
      // Arrange
      const message = { command: 'runTests' as const, featureName: 'test-feature' };
      const feature = { name: 'test-feature', worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      const runTestsStub = sandbox.stub(featureService, 'runTests').resolves();

      // Act
      await handler.handle(message);

      // Assert
      const filterArg = runTestsStub.firstCall.args[1];
      assert.strictEqual(filterArg, undefined);
    });

    test('should call runTests with correct feature name', async () => {
      // Arrange
      const featureName = 'my-special-feature';
      const message = { command: 'runTests' as const, featureName };
      const feature = { name: featureName, worktreePath: '/path/to/worktree' } as any;

      sandbox.stub(handler as any, 'getFeatureOrShowError').returns(feature);
      const runTestsStub = sandbox.stub(featureService, 'runTests').resolves();

      // Act
      await handler.handle(message);

      // Assert
      assert.ok(runTestsStub.calledOnce);
      assert.strictEqual(runTestsStub.firstCall.args[0], featureName);
    });
  });
});
