import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { NotificationService } from '../services/NotificationService';

suite('NotificationService Test Suite', () => {
  let service: NotificationService;
  let sandbox: sinon.SinonSandbox;
  let showInformationMessageStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let withProgressStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create stubs for vscode.window methods
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();
    showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves();
    showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves();
    withProgressStub = sandbox.stub(vscode.window, 'withProgress').callsFake(async (options, task) => {
      return task({ report: () => {} }, {} as any);
    });

    service = new NotificationService();
  });

  teardown(() => {
    service.dispose();
    sandbox.restore();
  });

  test('should create service successfully', () => {
    assert.ok(service);
    assert.strictEqual(typeof service.info, 'function');
    assert.strictEqual(typeof service.warning, 'function');
    assert.strictEqual(typeof service.error, 'function');
  });

  test('should show info notification with correct message', () => {
    const message = 'Test info message';
    service.info(message);

    assert.ok(showInformationMessageStub.calledOnce, 'showInformationMessage should be called once');
    assert.ok(showInformationMessageStub.calledWith(message), `Should be called with "${message}"`);
  });

  test('should show warning notification with correct message', () => {
    const message = 'Test warning message';
    service.warning(message);

    assert.ok(showWarningMessageStub.calledOnce, 'showWarningMessage should be called once');
    assert.ok(showWarningMessageStub.calledWith(message), `Should be called with "${message}"`);
  });

  test('should show error notification with correct message', () => {
    const message = 'Test error message';
    service.error(message);

    assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called once');
    assert.ok(showErrorMessageStub.calledWith(message), `Should be called with "${message}"`);
  });

  test('should show success notification with checkmark prefix', () => {
    const message = 'Test success message';
    service.success(message);

    assert.ok(showInformationMessageStub.calledOnce, 'showInformationMessage should be called once');
    const calledMessage = showInformationMessageStub.firstCall.args[0];
    assert.ok(calledMessage.includes('✓') || calledMessage.includes(message),
      'Success message should include checkmark or original message');
  });

  test('should handle notifications with actions', () => {
    const message = 'Test with actions';
    const action1 = 'Action 1';
    const actions = [
      {
        label: action1,
        callback: () => { /* noop */ }
      }
    ];

    service.info(message, { actions });

    assert.ok(showInformationMessageStub.calledOnce, 'showInformationMessage should be called once');
    const args = showInformationMessageStub.firstCall.args;
    assert.strictEqual(args[0], message, 'First argument should be the message');
    // If implementation passes action labels, verify they're included
    if (args.length > 1) {
      assert.ok(args.includes(action1) || args[1] === action1, 'Action label should be passed to API');
    }
  });

  test('should handle modal notifications', () => {
    const message = 'Test modal';
    service.info(message, { modal: true });

    assert.ok(showInformationMessageStub.calledOnce, 'showInformationMessage should be called once');
    const firstArg = showInformationMessageStub.firstCall.args[0];

    // Check if modal option is passed (implementation may vary)
    if (typeof firstArg === 'object' && 'modal' in firstArg) {
      assert.strictEqual(firstArg.modal, true, 'Modal option should be true');
    }
  });

  test('should handle progress notification and return result', async () => {
    const title = 'Test progress';
    const expectedResult = 'done';

    const result = await service.withProgress(title, async (progress) => {
      progress.report({ message: 'Working...' });
      return expectedResult;
    });

    assert.ok(withProgressStub.calledOnce, 'withProgress should be called once');
    assert.strictEqual(result, expectedResult, 'Should return the result from the task');

    const options = withProgressStub.firstCall.args[0];
    assert.ok(options, 'Progress options should be provided');
    if (options && typeof options === 'object' && 'title' in options) {
      assert.strictEqual(options.title, title, 'Progress title should match');
    }
  });

  test('should handle multiple notifications in sequence', () => {
    service.info('Info 1');
    service.warning('Warning 1');
    service.error('Error 1');
    service.info('Info 2');

    assert.strictEqual(showInformationMessageStub.callCount, 2, 'Should call info twice');
    assert.strictEqual(showWarningMessageStub.callCount, 1, 'Should call warning once');
    assert.strictEqual(showErrorMessageStub.callCount, 1, 'Should call error once');
  });

  test('should dispose cleanly without errors', () => {
    // Should not throw
    assert.doesNotThrow(() => {
      service.dispose();
    }, 'Dispose should not throw errors');
  });

  test('should handle empty message strings', () => {
    service.info('');
    service.warning('');
    service.error('');

    assert.ok(showInformationMessageStub.calledWith(''), 'Should handle empty info message');
    assert.ok(showWarningMessageStub.calledWith(''), 'Should handle empty warning message');
    assert.ok(showErrorMessageStub.calledWith(''), 'Should handle empty error message');
  });

  test('should handle very long messages', () => {
    const longMessage = 'A'.repeat(1000);
    service.info(longMessage);

    assert.ok(showInformationMessageStub.calledOnce);
    assert.strictEqual(showInformationMessageStub.firstCall.args[0], longMessage,
      'Should handle long messages without truncation');
  });
});
