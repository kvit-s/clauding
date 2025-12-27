import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { WebviewUpdater } from '../../providers/sidebar/WebviewUpdater';
import { FeatureService } from '../../services/FeatureService';
import { TimelogService } from '../../services/TimelogService';
import { SidebarViewState } from '../../providers/sidebar/SidebarViewState';

suite('WebviewUpdater Test Suite', () => {
  let updater: WebviewUpdater;
  let featureService: FeatureService;
  let timelogService: TimelogService;
  let viewState: SidebarViewState;
  let webview: vscode.Webview;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create mock objects with the methods that will be stubbed
    featureService = {
      getFeatures: () => [],
      getFeature: () => null,
      getArchivedFeatures: () => []
    } as any;
    timelogService = {
      getEntries: () => []
    } as any;
    viewState = {
      getSelectedFeatureName: () => null,
      setSelectedFeatureName: () => {},
      getSortOrder: () => 'chronological',
      getViewMode: () => 'active',
      getSearchState: () => ({ isActive: false, query: '' })
    } as any;
    webview = { postMessage: sandbox.stub() } as unknown as vscode.Webview;

    
    const configService = {
      getMergedCommands: () => [],
      getAgents: () => [],
      getConfig: () => ({})
    } as any;
    const searchService = { searchFeatures: async () => [] } as any;
    updater = new WebviewUpdater(featureService, timelogService, viewState, configService, searchService);
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('sendUpdate', () => {
    test('should send update with all features', () => {
      // Arrange
      const features = [
        { name: 'feature1', worktreePath: '/path/1' } as any as any,
        { name: 'feature2', worktreePath: '/path/2' } as any as any
      ];
      sandbox.stub(featureService, 'getFeatures').returns(features);
      sandbox.stub(viewState, 'getSelectedFeatureName').returns(null);

      // Act
      updater.sendUpdate(webview);

      // Assert
      assert.ok((webview.postMessage as sinon.SinonStub).calledOnce);
      const message = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(message.type, 'update');
      assert.strictEqual(message.features, features);
    });

    test('should include selected feature when one is selected', () => {
      // Arrange
      const features = [{ name: 'feature1', worktreePath: '/path/1' } as any as any];
      const selectedFeature = { name: 'feature1', worktreePath: '/path/1' } as any as any;

      sandbox.stub(featureService, 'getFeatures').returns(features);
      sandbox.stub(viewState, 'getSelectedFeatureName').returns('feature1');
      sandbox.stub(featureService, 'getFeature').returns(selectedFeature);
      sandbox.stub(timelogService, 'getEntries').returns([]);

      // Act
      updater.sendUpdate(webview);

      // Assert
      const message = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(message.selectedFeature, selectedFeature);
    });

    test('should include timelog for selected feature', () => {
      // Arrange
      const features = [{ name: 'feature1', worktreePath: '/path/1' } as any as any];
      const selectedFeature = { name: 'feature1', worktreePath: '/path/1' } as any as any;
      const timelog = [{ timestamp: '2024-01-01', action: 'Test' } as any];

      sandbox.stub(featureService, 'getFeatures').returns(features);
      sandbox.stub(viewState, 'getSelectedFeatureName').returns('feature1');
      sandbox.stub(featureService, 'getFeature').returns(selectedFeature);
      sandbox.stub(timelogService, 'getEntries').returns(timelog);

      // Act
      updater.sendUpdate(webview);

      // Assert
      const message = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(message.timelog, timelog);
    });

    test('should send empty timelog when no feature selected', () => {
      // Arrange
      const features = [{ name: 'feature1', worktreePath: '/path/1' } as any as any];
      sandbox.stub(featureService, 'getFeatures').returns(features);
      sandbox.stub(viewState, 'getSelectedFeatureName').returns(null);

      // Act
      updater.sendUpdate(webview);

      // Assert
      const message = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.deepStrictEqual(message.timelog, []);
    });

    test('should handle null selected feature', async () => {
      // Arrange
      const features = [{ name: 'feature1', worktreePath: '/path/1' } as any as any];
      sandbox.stub(featureService, 'getFeatures').returns(features);
      sandbox.stub(viewState, 'getSelectedFeatureName').returns('nonexistent');
      sandbox.stub(featureService, 'getFeature').returns(null);

      // Act
      await updater.sendUpdate(webview);

      // Assert
      const message = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(message.selectedFeature, null);
      assert.deepStrictEqual(message.timelog, []);
    });

    test('should call getEntries with correct worktree path', () => {
      // Arrange
      const selectedFeature = { name: 'feature1', worktreePath: '/path/to/worktree' } as any as any;
      sandbox.stub(featureService, 'getFeatures').returns([]);
      sandbox.stub(viewState, 'getSelectedFeatureName').returns('feature1');
      sandbox.stub(featureService, 'getFeature').returns(selectedFeature);
      const getEntriesStub = sandbox.stub(timelogService, 'getEntries').returns([]);

      // Act
      updater.sendUpdate(webview);

      // Assert
      assert.ok(getEntriesStub.calledOnceWith('/path/to/worktree'));
    });

    test('should send update message with correct structure', () => {
      // Arrange
      const features = [{ name: 'feature1', worktreePath: '/path/1' } as any as any];
      sandbox.stub(featureService, 'getFeatures').returns(features);
      sandbox.stub(viewState, 'getSelectedFeatureName').returns(null);

      // Act
      updater.sendUpdate(webview);

      // Assert
      const message = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.ok(Object.prototype.hasOwnProperty.call(message, 'type'));
      assert.ok(Object.prototype.hasOwnProperty.call(message, 'features'));
      assert.ok(Object.prototype.hasOwnProperty.call(message, 'selectedFeature'));
      assert.ok(Object.prototype.hasOwnProperty.call(message, 'timelog'));
    });

    test('should handle empty features list', () => {
      // Arrange
      sandbox.stub(featureService, 'getFeatures').returns([]);
      sandbox.stub(viewState, 'getSelectedFeatureName').returns(null);

      // Act
      updater.sendUpdate(webview);

      // Assert
      const message = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.deepStrictEqual(message.features, []);
    });
  });

  suite('sendFileTreeRefresh', () => {
    test('should send file tree refresh message', () => {
      // Arrange
      const featureName = 'test-feature';

      // Act
      updater.sendFileTreeRefresh(webview, featureName);

      // Assert
      assert.ok((webview.postMessage as sinon.SinonStub).calledOnce);
      const message = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(message.type, 'refreshFileTree');
      assert.strictEqual(message.featureName, featureName);
    });

    test('should send correct feature name', () => {
      // Arrange
      const featureName = 'my-special-feature';

      // Act
      updater.sendFileTreeRefresh(webview, featureName);

      // Assert
      const message = (webview.postMessage as sinon.SinonStub).firstCall.args[0];
      assert.strictEqual(message.featureName, featureName);
    });
  });
});
