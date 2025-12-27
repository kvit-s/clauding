import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { openSettingsCommand } from '../commands/settingsCommand';

suite('settingsCommand Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let openTextDocumentStub: sinon.SinonStub;
  let showTextDocumentStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let openExternalStub: sinon.SinonStub;
  let mockDocument: any;

  setup(() => {
    sandbox = sinon.createSandbox();

    mockDocument = {
      uri: vscode.Uri.file('/test/workspace/.clauding/config/settings.json')
    };

    openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockDocument);
    showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves();
    showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
    openExternalStub = sandbox.stub(vscode.env, 'openExternal').resolves(true);
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('Opening Settings', () => {
    test('should open settings file at correct path', async () => {
      showInformationMessageStub.resolves(undefined);

      await openSettingsCommand('/test/workspace');

      assert.ok(openTextDocumentStub.calledOnce);
      assert.strictEqual(
        openTextDocumentStub.firstCall.args[0],
        '/test/workspace/.clauding/config/settings.json'
      );
    });

    test('should show the settings document in editor', async () => {
      showInformationMessageStub.resolves(undefined);

      await openSettingsCommand('/test/workspace');

      assert.ok(showTextDocumentStub.calledOnce);
      assert.strictEqual(showTextDocumentStub.firstCall.args[0], mockDocument);
    });

    test('should display information message with Learn More option', async () => {
      showInformationMessageStub.resolves(undefined);

      await openSettingsCommand('/test/workspace');

      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Edit settings and save'));
      assert.strictEqual(showInformationMessageStub.firstCall.args[1], 'Learn More');
    });

    test('should open documentation when user clicks Learn More', async () => {
      showInformationMessageStub.resolves('Learn More');

      await openSettingsCommand('/test/workspace');

      // Wait for promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(openExternalStub.calledOnce);
      const uri = openExternalStub.firstCall.args[0];
      assert.ok(uri.toString().includes('github.com'));
      assert.ok(uri.toString().includes('clauding'));
    });

    test('should not open documentation when user dismisses message', async () => {
      showInformationMessageStub.resolves(undefined);

      await openSettingsCommand('/test/workspace');

      // Wait for promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(openExternalStub.notCalled);
    });
  });

  suite('Error Handling', () => {
    test('should show error message when file cannot be opened', async () => {
      openTextDocumentStub.rejects(new Error('File not found'));

      await openSettingsCommand('/test/workspace');

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Failed to open settings'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('File not found'));
    });

    test('should show error message when document cannot be shown', async () => {
      showTextDocumentStub.rejects(new Error('Editor error'));

      await openSettingsCommand('/test/workspace');

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Failed to open settings'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Editor error'));
    });

    test('should handle permission errors', async () => {
      openTextDocumentStub.rejects(new Error('EACCES: permission denied'));

      await openSettingsCommand('/test/workspace');

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Failed to open settings'));
    });

    test('should handle missing directory errors', async () => {
      openTextDocumentStub.rejects(new Error('ENOENT: no such file or directory'));

      await openSettingsCommand('/test/workspace');

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Failed to open settings'));
    });
  });
});
