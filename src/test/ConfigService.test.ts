import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as sinon from 'sinon';
import { ConfigService } from '../services/ConfigService';
import * as vscode from 'vscode';

suite('ConfigService Test Suite', () => {
  let testConfigDir: string;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    // Create a temporary directory for testing
    testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clauding-config-test-'));
  });

  teardown(() => {
    // Clean up test directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    sandbox.restore();
  });

  test('should create default config file if it does not exist', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const configService = new ConfigService(testConfigDir);
    const configPath = path.join(testConfigDir, 'settings.json');

    assert.ok(fs.existsSync(configPath));
  });

  test('should return default config values', () => {
    const configService = new ConfigService(testConfigDir);
    const config = configService.getConfig();

    assert.strictEqual(config.testCommand, 'npm test');
    assert.strictEqual(config.commitMessagePrefix, 'feat');
    assert.strictEqual(config.autoCommitAfterAgent, true);
    assert.strictEqual(config.mainBranch, 'main');
    assert.strictEqual(config.branchPrefix, 'feature/');
    assert.strictEqual(config.agentExecutable, 'claude');
    assert.strictEqual(config.agentFlags, '--dangerously-skip-permissions');
  });

  test('should load existing config file', () => {
    // Create a config file with custom values
    const configPath = path.join(testConfigDir, 'settings.json');
    const customConfig = {
      testCommand: 'pytest',
      commitMessagePrefix: 'fix',
      autoCommitAfterAgent: false,
      mainBranch: 'master',
      branchPrefix: 'dev/',
      agentExecutable: 'custom-agent',
      agentFlags: '--verbose'
    };
    fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2));

    const configService = new ConfigService(testConfigDir);
    const config = configService.getConfig();

    assert.strictEqual(config.testCommand, 'pytest');
    assert.strictEqual(config.commitMessagePrefix, 'fix');
    assert.strictEqual(config.autoCommitAfterAgent, false);
    assert.strictEqual(config.mainBranch, 'master');
    assert.strictEqual(config.branchPrefix, 'dev/');
    assert.strictEqual(config.agentExecutable, 'custom-agent');
    assert.strictEqual(config.agentFlags, '--verbose');
  });

  test('should merge with defaults if config file has missing keys', () => {
    // Create a config file with only some values
    const configPath = path.join(testConfigDir, 'settings.json');
    const partialConfig = {
      testCommand: 'cargo test',
      mainBranch: 'develop'
    };
    fs.writeFileSync(configPath, JSON.stringify(partialConfig, null, 2));

    const configService = new ConfigService(testConfigDir);
    const config = configService.getConfig();

    assert.strictEqual(config.testCommand, 'cargo test');
    assert.strictEqual(config.mainBranch, 'develop');
    // These should be defaults
    assert.strictEqual(config.commitMessagePrefix, 'feat');
    assert.strictEqual(config.autoCommitAfterAgent, true);
    assert.strictEqual(config.branchPrefix, 'feature/');
  });

  test('should update config and persist to file', () => {
    const configService = new ConfigService(testConfigDir);

    configService.updateConfig({
      testCommand: 'go test',
      mainBranch: 'trunk'
    });

    const config = configService.getConfig();
    assert.strictEqual(config.testCommand, 'go test');
    assert.strictEqual(config.mainBranch, 'trunk');

    // Verify it was persisted to file
    const configPath = path.join(testConfigDir, 'settings.json');
    const fileContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(fileContent.testCommand, 'go test');
    assert.strictEqual(fileContent.mainBranch, 'trunk');
  });

  test('should return immutable config copy', () => {
    const configService = new ConfigService(testConfigDir);
    const config1 = configService.getConfig();
    const config2 = configService.getConfig();

    assert.notStrictEqual(config1, config2); // Different objects

    // Modifying returned config should not affect internal state
    config1.testCommand = 'modified';
    const config3 = configService.getConfig();
    assert.strictEqual(config3.testCommand, 'npm test');
  });

  test('should handle corrupted config file gracefully', () => {
    // Stub console.error to suppress expected error logs
    sandbox.stub(console, 'error');

    // Create a corrupted config file
    const configPath = path.join(testConfigDir, 'settings.json');
    fs.writeFileSync(configPath, '{ invalid json }');

    const configService = new ConfigService(testConfigDir);
    const config = configService.getConfig();

    // Should fall back to defaults
    assert.strictEqual(config.testCommand, 'npm test');
    assert.strictEqual(config.mainBranch, 'main');
  });

  test('should load defaultPrompt and prompts from config file', () => {
    const configPath = path.join(testConfigDir, 'settings.json');
    const customCommand = {
      name: 'testCommand',
      path: '.',
      prompt: 'Original prompt',
      outputFilePrefix: 'test',
      defaultPrompt: 'System base prompt',
      prompts: { agentA: 'Prompt for agentA', agentB: 'Prompt for agentB' }
    };
    fs.writeFileSync(configPath, JSON.stringify({ agentCommands: [customCommand] }, null, 2));

    const configService = new ConfigService(testConfigDir);
    const commands = configService.getConfig().agentCommands || [];
    assert.strictEqual(commands.length, 1);
    const cmd = commands[0];
    assert.strictEqual(cmd.defaultPrompt, 'System base prompt');
    assert.deepStrictEqual(cmd.prompts, { agentA: 'Prompt for agentA', agentB: 'Prompt for agentB' });
  });

  test('should load defaultPrompt and prompts from VSCode settings', () => {
    const fakeCmd = {
      name: 'vsCommand',
      path: '.',
      prompt: 'VS prompt',
      outputFilePrefix: 'vs',
      defaultPrompt: 'VS system prompt',
      prompts: { vsAgent: 'VS agent prompt' }
    };
    const stubConfig = sandbox.stub(vscode.workspace, 'getConfiguration')
      .withArgs('clauding')
      .returns({ get: (key: string) => key === 'agentCommands' ? [fakeCmd] : undefined } as any);

    const configService2 = new ConfigService(testConfigDir);
    const commands2 = configService2.getConfig().agentCommands || [];
    assert.strictEqual(commands2.length, 1);
    const cmd2 = commands2[0];
    assert.strictEqual(cmd2.defaultPrompt, 'VS system prompt');
    assert.deepStrictEqual(cmd2.prompts, { vsAgent: 'VS agent prompt' });
    stubConfig.restore();
  });
});
