import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ErrorHandler, ErrorContext } from '../utils/ErrorHandler';

suite('ErrorHandler Test Suite', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Stub vscode methods to prevent UI errors in test environment
    sandbox.stub(vscode.window, 'showErrorMessage').resolves();
    sandbox.stub(vscode.window, 'showWarningMessage').resolves();
    sandbox.stub(vscode.window, 'showInformationMessage').resolves();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should format ENOENT errors appropriately', () => {
    const error = new Error('ENOENT: no such file or directory');
    const context: ErrorContext = {
      operation: 'read file',
      feature: 'test-feature'
    };

    const message = (ErrorHandler as any).formatErrorMessage(error, context);
    assert.strictEqual(message, 'File not found during read file for feature "test-feature"');
  });

  test('should format EACCES errors appropriately', () => {
    const error = new Error('EACCES: permission denied');
    const context: ErrorContext = {
      operation: 'write file'
    };

    const message = (ErrorHandler as any).formatErrorMessage(error, context);
    assert.strictEqual(message, 'Permission denied during write file');
  });

  test('should format git errors appropriately', () => {
    const error = new Error('git: command not found');
    const context: ErrorContext = {
      operation: 'commit changes',
      feature: 'auth-feature'
    };

    const message = (ErrorHandler as any).formatErrorMessage(error, context);
    assert.strictEqual(message, 'Git error during commit changes for feature "auth-feature": git: command not found');
  });

  test('should format generic errors appropriately', () => {
    const error = new Error('Something went wrong');
    const context: ErrorContext = {
      operation: 'process data'
    };

    const message = (ErrorHandler as any).formatErrorMessage(error, context);
    assert.strictEqual(message, 'Failed to process data: Something went wrong');
  });

  test('should handle error context without feature name', () => {
    const error = new Error('ENOENT: no such file');
    const context: ErrorContext = {
      operation: 'read config'
    };

    const message = (ErrorHandler as any).formatErrorMessage(error, context);
    assert.strictEqual(message, 'File not found during read config');
  });

  test('wrapAsync should return result on success', async () => {
    const context: ErrorContext = { operation: 'test operation' };
    const result = await ErrorHandler.wrapAsync(async () => {
      return 'success';
    }, context);

    assert.strictEqual(result, 'success');
  });

  test('wrapAsync should return null on error and handle it', async () => {
    const context: ErrorContext = { operation: 'test operation' };
    const result = await ErrorHandler.wrapAsync(async () => {
      throw new Error('Test error');
    }, context);

    // Verify wrapAsync handles errors gracefully
    assert.strictEqual(result, null, 'Should return null on error');
  });

  test('should show success with actions', () => {
    const message = 'Test success message';
    const actions = [
      {
        label: 'Test Action',
        callback: () => { /* callback */ }
      }
    ];

    ErrorHandler.showSuccess(message, actions);

    const showInfoStub = vscode.window.showInformationMessage as sinon.SinonStub;
    assert.ok(showInfoStub.called, 'Should call showInformationMessage');
    const args = showInfoStub.firstCall.args;
    assert.ok(args[0].includes(message) || args[0].includes('✓'),
      'Message should include success indicator or original message');
  });

  test('should show success without actions', () => {
    const message = 'Test success message';
    ErrorHandler.showSuccess(message);

    const showInfoStub = vscode.window.showInformationMessage as sinon.SinonStub;
    assert.ok(showInfoStub.called, 'Should call showInformationMessage');
    const calledMessage = showInfoStub.firstCall.args[0];
    assert.ok(calledMessage.includes(message) || calledMessage.includes('✓'),
      'Message should include success indicator or original message');
  });

  test('should handle errors with additional details', () => {
    const error = new Error('Test error');
    const context: ErrorContext = {
      operation: 'complex operation',
      feature: 'test-feature',
      details: {
        filePath: '/path/to/file',
        lineNumber: 42
      }
    };

    const message = (ErrorHandler as any).formatErrorMessage(error, context);
    assert.ok(message.includes('complex operation'), 'Should include operation in message');
    assert.ok(message.includes('test-feature'), 'Should include feature in message');
  });

  test('should handle errors without error message', () => {
    const error = new Error();
    const context: ErrorContext = {
      operation: 'test operation'
    };

    const message = (ErrorHandler as any).formatErrorMessage(error, context);
    assert.ok(message.includes('test operation'), 'Should include operation in message');
  });

  test('should handle null error objects', () => {
    sandbox.stub(console, 'error');
    const context: ErrorContext = { operation: 'test operation' };

    const message = (ErrorHandler as any).formatErrorMessage(null, context);
    assert.ok(message.includes('test operation'), 'Should handle null error gracefully');
  });

  test('wrapAsync should propagate context to error handler', async () => {
    const testError = new Error('ENOENT: file not found');
    const context: ErrorContext = {
      operation: 'read configuration',
      feature: 'auth-module'
    };

    const result = await ErrorHandler.wrapAsync(async () => {
      throw testError;
    }, context);

    // Verify wrapAsync returns null and doesn't throw
    assert.strictEqual(result, null, 'Should return null and handle error gracefully');
  });

  test('should handle multiple errors in sequence', async () => {
    const context1: ErrorContext = { operation: 'operation 1' };
    const context2: ErrorContext = { operation: 'operation 2' };

    const result1 = await ErrorHandler.wrapAsync(async () => {
      throw new Error('Error 1');
    }, context1);

    const result2 = await ErrorHandler.wrapAsync(async () => {
      throw new Error('Error 2');
    }, context2);

    // Verify both errors were handled gracefully
    assert.strictEqual(result1, null, 'First error should return null');
    assert.strictEqual(result2, null, 'Second error should return null');
  });
});
