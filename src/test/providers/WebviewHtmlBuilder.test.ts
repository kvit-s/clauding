import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { WebviewHtmlBuilder } from '../../providers/sidebar/WebviewHtmlBuilder';

suite('WebviewHtmlBuilder Test Suite', () => {
  let builder: WebviewHtmlBuilder;
  let extensionUri: vscode.Uri;
  let webview: vscode.Webview;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    extensionUri = vscode.Uri.file('/extension/path');
    webview = {
      asWebviewUri: sandbox.stub().returnsArg(0),
      cspSource: 'vscode-webview://test'
    } as unknown as vscode.Webview;

    builder = new WebviewHtmlBuilder(extensionUri);
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('getHtmlForWebview', () => {
    test('should return valid HTML', () => {
      // Act
      const html = builder.getHtmlForWebview(webview);

      // Assert
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('<html lang="en">'));
      assert.ok(html.includes('</html>'));
    });

    test('should include CSP header', () => {
      // Act
      const html = builder.getHtmlForWebview(webview);

      // Assert
      assert.ok(html.includes('Content-Security-Policy'));
      assert.ok(html.includes(webview.cspSource));
    });

    test('should include script tag', () => {
      // Act
      const html = builder.getHtmlForWebview(webview);

      // Assert
      assert.ok(html.includes('<script src='));
      assert.ok(html.includes('webview.js'));
    });

    test('should include root div', () => {
      // Act
      const html = builder.getHtmlForWebview(webview);

      // Assert
      assert.ok(html.includes('<div id="root"></div>'));
    });

    test('should include styles', () => {
      // Act
      const html = builder.getHtmlForWebview(webview);

      // Assert
      assert.ok(html.includes('<style>'));
      assert.ok(html.includes('</style>'));
      assert.ok(html.includes('body {'));
    });

    test('should include viewport meta tag', () => {
      // Act
      const html = builder.getHtmlForWebview(webview);

      // Assert
      assert.ok(html.includes('<meta name="viewport"'));
      assert.ok(html.includes('width=device-width'));
    });

    test('should include charset meta tag', () => {
      // Act
      const html = builder.getHtmlForWebview(webview);

      // Assert
      assert.ok(html.includes('<meta charset="UTF-8">'));
    });

    test('should include title', () => {
      // Act
      const html = builder.getHtmlForWebview(webview);

      // Assert
      assert.ok(html.includes('<title>Clauding</title>'));
    });

    test('should call asWebviewUri for script path', () => {
      // Arrange
      const asWebviewUriStub = webview.asWebviewUri as sinon.SinonStub;

      // Act
      builder.getHtmlForWebview(webview);

      // Assert - Called twice: once for script, once for codicon CSS
      assert.ok(asWebviewUriStub.calledTwice);
    });
  });
});
