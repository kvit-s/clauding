import * as assert from 'assert';
import { AGENT_COMMANDS } from '../models/AgentCommand';

suite('AgentCommand Test Suite', () => {
  test('should have all required agent commands', () => {
    const expectedCommands = [
      'Create Plan',
      'Modify Plan',
      'Implement Plan',
      'Fix All Tests',
      'Generic Agent'
    ];

    for (const commandName of expectedCommands) {
      assert.ok(AGENT_COMMANDS[commandName], `Missing command: ${commandName}`);
    }
  });

  test('Create Plan command should have correct structure', () => {
    const command = AGENT_COMMANDS['Create Plan'];

    assert.strictEqual(command.name, 'Create Plan');
    assert.ok(command.prompt.length > 0);
    assert.deepStrictEqual(command.requiredFiles, ['prompt.md']);
    assert.strictEqual(command.outputFilePrefix, 'create-plan');
  });

  test('Modify Plan command should have correct structure', () => {
    const command = AGENT_COMMANDS['Modify Plan'];

    assert.strictEqual(command.name, 'Modify Plan');
    assert.ok(command.prompt.length > 0);
    assert.deepStrictEqual(command.requiredFiles, ['modify-prompt.md', 'plan.md']);
    assert.strictEqual(command.outputFilePrefix, 'modify-plan');
  });

  test('Implement Plan command should have correct structure', () => {
    const command = AGENT_COMMANDS['Implement Plan'];

    assert.strictEqual(command.name, 'Implement Plan');
    assert.ok(command.prompt.length > 0);
    assert.deepStrictEqual(command.requiredFiles, ['plan.md']);
    assert.strictEqual(command.outputFilePrefix, 'implement-plan');
  });

  test('Fix All Tests command should have correct structure', () => {
    const command = AGENT_COMMANDS['Fix All Tests'];

    assert.strictEqual(command.name, 'Fix All Tests');
    assert.ok(command.prompt.length > 0);
    assert.deepStrictEqual(command.requiredFiles, []);
    assert.strictEqual(command.outputFilePrefix, 'fix-tests');
  });

  test('Generic Agent command should have empty prompt', () => {
    const command = AGENT_COMMANDS['Generic Agent'];

    assert.strictEqual(command.name, 'Generic Agent');
    assert.strictEqual(command.prompt, '');
    assert.deepStrictEqual(command.requiredFiles, []);
    assert.strictEqual(command.outputFilePrefix, 'agent-session');
  });

  test('all commands should have valid output file prefixes', () => {
    for (const commandName in AGENT_COMMANDS) {
      const command = AGENT_COMMANDS[commandName];
      assert.ok(command.outputFilePrefix.length > 0);
      assert.ok(/^[a-z-]+$/.test(command.outputFilePrefix),
        `Invalid output file prefix for ${commandName}: ${command.outputFilePrefix}`);
    }
  });

  test('all commands should have requiredFiles array', () => {
    for (const commandName in AGENT_COMMANDS) {
      const command = AGENT_COMMANDS[commandName];
      assert.ok(Array.isArray(command.requiredFiles));
    }
  });
});
