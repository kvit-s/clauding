/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { GitService } from '../../services/GitService';
import { TimelogService } from '../../services/TimelogService';
import { FeatureService } from '../../services/FeatureService';
import { ConfigService } from '../../services/ConfigService';

/**
 * Factory for creating mock objects commonly used in tests
 */
export class MockFactory {
	/**
	 * Creates a mock VSCode Extension Context
	 * @param overrides Optional properties to override
	 * @returns Mock extension context
	 */
	static createMockContext(overrides?: Partial<vscode.ExtensionContext>): vscode.ExtensionContext {
		const context: any = {
			subscriptions: [],
			workspaceState: MockFactory.createMockMemento(),
			globalState: MockFactory.createMockMemento(),
			extensionPath: '/mock/extension/path',
			storagePath: '/mock/storage/path',
			globalStoragePath: '/mock/global/storage/path',
			logPath: '/mock/log/path',
			extensionUri: vscode.Uri.file('/mock/extension/path'),
			environmentVariableCollection: {} as any,
			extensionMode: vscode.ExtensionMode.Test,
			storageUri: vscode.Uri.file('/mock/storage/path'),
			globalStorageUri: vscode.Uri.file('/mock/global/storage/path'),
			logUri: vscode.Uri.file('/mock/log/path'),
			asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
			...overrides
		};
		return context;
	}

	/**
	 * Creates a mock VSCode Memento (state storage)
	 * @returns Mock memento
	 */
	static createMockMemento(): vscode.Memento {
		const storage = new Map<string, any>();

		return {
			keys: () => Array.from(storage.keys()),
			get: <T>(key: string, defaultValue?: T): T => {
				return storage.has(key) ? storage.get(key) : defaultValue!;
			},
			update: async (key: string, value: any): Promise<void> => {
				storage.set(key, value);
			}
		};
	}

	/**
	 * Creates a mock VSCode Webview
	 * @returns Mock webview with sinon stubs
	 */
	static createMockWebview(): any {
		return {
			html: '',
			options: {},
			postMessage: sinon.stub().resolves(true),
			asWebviewUri: sinon.stub().callsFake((uri: vscode.Uri) => uri),
			cspSource: 'mock-csp-source',
			onDidReceiveMessage: sinon.stub()
		};
	}

	/**
	 * Creates a mock VSCode WebviewPanel
	 * @returns Mock webview panel
	 */
	static createMockWebviewPanel(): any {
		return {
			webview: MockFactory.createMockWebview(),
			visible: true,
			active: true,
			viewColumn: vscode.ViewColumn.One,
			title: 'Mock Panel',
			iconPath: undefined,
			options: {},
			onDidDispose: sinon.stub(),
			onDidChangeViewState: sinon.stub(),
			reveal: sinon.stub(),
			dispose: sinon.stub()
		};
	}

	/**
	 * Creates a mock VSCode OutputChannel
	 * @returns Mock output channel
	 */
	static createMockOutputChannel(): any {
		return {
			name: 'Mock Channel',
			append: sinon.stub(),
			appendLine: sinon.stub(),
			replace: sinon.stub(),
			clear: sinon.stub(),
			show: sinon.stub(),
			hide: sinon.stub(),
			dispose: sinon.stub()
		};
	}

	/**
	 * Creates a mock VSCode TextDocument
	 * @param uri Document URI
	 * @param content Document content
	 * @returns Mock text document
	 */
	static createMockTextDocument(uri?: vscode.Uri, content: string = ''): any {
		return {
			uri: uri || vscode.Uri.file('/mock/file.txt'),
			fileName: uri?.fsPath || '/mock/file.txt',
			isUntitled: false,
			languageId: 'plaintext',
			version: 1,
			isDirty: false,
			isClosed: false,
			eol: vscode.EndOfLine.LF,
			lineCount: content.split('\n').length,
			save: sinon.stub().resolves(true),
			getText: sinon.stub().returns(content),
			getWordRangeAtPosition: sinon.stub(),
			validateRange: sinon.stub(),
			validatePosition: sinon.stub(),
			offsetAt: sinon.stub(),
			positionAt: sinon.stub(),
			lineAt: sinon.stub()
		};
	}

	/**
	 * Creates a mock VSCode TextEditor
	 * @returns Mock text editor
	 */
	static createMockTextEditor(): any {
		return {
			document: MockFactory.createMockTextDocument(),
			selection: new vscode.Selection(0, 0, 0, 0),
			selections: [new vscode.Selection(0, 0, 0, 0)],
			visibleRanges: [],
			options: {},
			viewColumn: vscode.ViewColumn.One,
			edit: sinon.stub(),
			insertSnippet: sinon.stub(),
			setDecorations: sinon.stub(),
			revealRange: sinon.stub(),
			show: sinon.stub(),
			hide: sinon.stub()
		};
	}

	/**
	 * Creates a mock GitService with stubbed methods
	 * @param sandbox Sinon sandbox for stub management
	 * @returns Mock git service
	 */
	static createMockGitService(sandbox: sinon.SinonSandbox): GitService {
		const service = new GitService();

		sandbox.stub(service, 'stageAll').resolves();
		sandbox.stub(service, 'commit').resolves('abc123');
		sandbox.stub(service, 'stageAndCommit').resolves('abc123');
		sandbox.stub(service, 'hasUncommittedChanges').resolves(false);
		sandbox.stub(service, 'getCurrentBranch').resolves('main');

		return service;
	}

	/**
	 * Creates a mock TimelogService with stubbed methods
	 * @param sandbox Sinon sandbox for stub management
	 * @returns Mock timelog service
	 */
	static createMockTimelogService(sandbox: sinon.SinonSandbox): TimelogService {
		const service = new TimelogService();

		sandbox.stub(service, 'addEntry').resolves();
		sandbox.stub(service, 'getEntries').returns([]);
		sandbox.stub(service, 'getLastEntry').returns(null);

		return service;
	}

	/**
	 * Creates a mock FeatureService with stubbed methods
	 * @param sandbox Sinon sandbox for stub management
	 * @param worktreesDir Worktrees directory path
	 * @param mainBranch Main branch name
	 * @param branchPrefix Branch prefix
	 * @returns Mock feature service
	 */
	static createMockFeatureService(
		sandbox: sinon.SinonSandbox,
		worktreesDir: string = '/tmp/worktrees',
		mainBranch: string = 'main',
		branchPrefix: string = 'feature/'
	): FeatureService {
		const service = new FeatureService(worktreesDir, mainBranch, branchPrefix);

		sandbox.stub(service, 'createFeature').resolves({} as any);
		sandbox.stub(service, 'getFeatures').returns([]);
		sandbox.stub(service, 'getFeature').returns(null);

		return service;
	}

	/**
	 * Creates a mock ConfigService with stubbed methods
	 * @param sandbox Sinon sandbox for stub management
	 * @param extensionPath Extension path
	 * @returns Mock config service
	 */
	static createMockConfigService(
		sandbox: sinon.SinonSandbox,
		extensionPath: string = '/tmp/extension'
	): ConfigService {
		const service = new ConfigService(extensionPath);

		sandbox.stub(service, 'getConfig').returns({} as any);

		return service;
	}

	/**
	 * Creates a mock VSCode Terminal
	 * @returns Mock terminal
	 */
	static createMockTerminal(): any {
		return {
			name: 'Mock Terminal',
			processId: Promise.resolve(12345),
			creationOptions: {},
			exitStatus: undefined,
			state: { isInteractedWith: false },
			sendText: sinon.stub(),
			show: sinon.stub(),
			hide: sinon.stub(),
			dispose: sinon.stub()
		};
	}

	/**
	 * Creates a mock VSCode QuickPick
	 * @returns Mock quick pick
	 */
	static createMockQuickPick(): any {
		return {
			value: '',
			placeholder: '',
			items: [],
			activeItems: [],
			selectedItems: [],
			enabled: true,
			busy: false,
			ignoreFocusOut: false,
			matchOnDescription: false,
			matchOnDetail: false,
			keepScrollPosition: false,
			title: '',
			step: undefined,
			totalSteps: undefined,
			buttons: [],
			show: sinon.stub(),
			hide: sinon.stub(),
			dispose: sinon.stub(),
			onDidChangeValue: sinon.stub(),
			onDidAccept: sinon.stub(),
			onDidHide: sinon.stub(),
			onDidTriggerButton: sinon.stub(),
			onDidChangeActive: sinon.stub(),
			onDidChangeSelection: sinon.stub()
		};
	}

	/**
	 * Creates a mock VSCode InputBox
	 * @returns Mock input box
	 */
	static createMockInputBox(): any {
		return {
			value: '',
			placeholder: '',
			password: false,
			enabled: true,
			busy: false,
			ignoreFocusOut: false,
			title: '',
			step: undefined,
			totalSteps: undefined,
			buttons: [],
			prompt: '',
			validationMessage: '',
			show: sinon.stub(),
			hide: sinon.stub(),
			dispose: sinon.stub(),
			onDidChangeValue: sinon.stub(),
			onDidAccept: sinon.stub(),
			onDidHide: sinon.stub(),
			onDidTriggerButton: sinon.stub()
		};
	}
}
