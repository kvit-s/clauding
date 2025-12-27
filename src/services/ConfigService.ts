import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentCommand, AGENT_COMMANDS } from '../models/AgentCommand';

export interface AgentDefinition {
  id: string;           // Unique identifier used for both identification and display (e.g., "claude", "custom-agent")
  executable: string;   // Command to run (e.g., "claude")
  flags?: string;       // Optional flags to pass (e.g., "--dangerously-skip-permissions"). Defaults to empty string if not provided.
}

export interface ClaudingConfig {
  testCommand: string;
  commitMessagePrefix: string;
  autoCommitAfterAgent: boolean;
  mainBranch: string;
  branchPrefix: string;

  // NEW: Multiple agents support
  agents: AgentDefinition[];
  defaultAgentId?: string;

  // DEPRECATED: Keep for backward compatibility
  agentExecutable?: string;
  agentFlags?: string;

  preRunCommands: string[];
  autoCloseRunTerminal: boolean;
  agentCommands?: AgentCommand[];  // User-defined commands
}

const DEFAULT_CONFIG: ClaudingConfig = {
  testCommand: 'npm test',
  commitMessagePrefix: 'feat',
  autoCommitAfterAgent: true,
  mainBranch: 'main',
  branchPrefix: 'feature/',
  agents: [
    {
      id: 'claude',
      executable: 'claude',
      flags: '--dangerously-skip-permissions'
    }
  ],
  defaultAgentId: 'claude',
  preRunCommands: [],
  autoCloseRunTerminal: true,
  agentCommands: []
};

export class ConfigService {
  private configPath: string;
  private config: ClaudingConfig;

  constructor(configDir: string) {
    this.configPath = path.join(configDir, 'settings.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): ClaudingConfig {
    // Load from file system (project-specific settings)
    const fileConfig = this.loadFileConfig();

    // Load from VS Code workspace configuration (global settings)
    const vscodeConfig = this.loadVSCodeConfig();

    // Merge: VS Code settings take precedence over file settings
    const mergedConfig = { ...DEFAULT_CONFIG, ...fileConfig, ...vscodeConfig };

    // Migration: Convert old agentExecutable/agentFlags to new agents format
    return this.migrateAgentConfig(mergedConfig);
  }

  /**
   * Migrates old agentExecutable/agentFlags config to new agents format
   * Ensures backward compatibility
   */
  private migrateAgentConfig(config: ClaudingConfig): ClaudingConfig {
    // If agents array is empty or undefined, but old config exists, migrate it
    if ((!config.agents || config.agents.length === 0) && config.agentExecutable) {
      config.agents = [
        {
          id: config.agentExecutable,  // Use executable as id (e.g., "claude")
          executable: config.agentExecutable,
          flags: config.agentFlags || ''
        }
      ];
      config.defaultAgentId = config.agentExecutable;
    }

    // If agents array is still empty, use hardcoded default
    if (!config.agents || config.agents.length === 0) {
      config.agents = DEFAULT_CONFIG.agents;
      config.defaultAgentId = DEFAULT_CONFIG.defaultAgentId;
    }

    // Ensure defaultAgentId is set
    if (!config.defaultAgentId && config.agents.length > 0) {
      config.defaultAgentId = config.agents[0].id;
    }

    return config;
  }

  private loadFileConfig(): Partial<ClaudingConfig> {
    if (!fs.existsSync(this.configPath)) {
      // Create default config file if it doesn't exist
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.saveConfig(DEFAULT_CONFIG);
      return {};
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to load file config:', error);
      return {};
    }
  }

  private loadVSCodeConfig(): Partial<ClaudingConfig> {
    const config = vscode.workspace.getConfiguration('clauding');

    // Only load properties that are explicitly set in VS Code settings
    const vscodeConfig: Partial<ClaudingConfig> = {};

    // Load new agent configuration
    const agents = config.get<AgentDefinition[]>('agents');
    if (agents !== undefined && agents.length > 0) {
      vscodeConfig.agents = agents;
    }

    const defaultAgentId = config.get<string>('defaultAgentId');
    if (defaultAgentId !== undefined) {
      vscodeConfig.defaultAgentId = defaultAgentId;
    }

    // Load legacy agent configuration for backward compatibility
    const agentExecutable = config.get<string>('agentExecutable');
    if (agentExecutable !== undefined) {
      vscodeConfig.agentExecutable = agentExecutable;
    }

    const agentFlags = config.get<string>('agentFlags');
    if (agentFlags !== undefined) {
      vscodeConfig.agentFlags = agentFlags;
    }

    // For agentCommands specifically (this is what users want to set globally)
    const agentCommands = config.get<AgentCommand[]>('agentCommands');
    if (agentCommands !== undefined && agentCommands.length > 0) {
      vscodeConfig.agentCommands = agentCommands;
    }

    return vscodeConfig;
  }

  private saveConfig(config: ClaudingConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  public getConfig(): ClaudingConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<ClaudingConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig(this.config);
  }

  /**
   * Reload configuration from both file and VS Code settings
   * Useful when settings change
   */
  public reloadConfig(): void {
    this.config = this.loadConfig();
  }

  /**
   * Watch for configuration changes and trigger callback when changes occur
   * @param callback Function to call when configuration changes
   * @returns Disposable to stop watching
   */
  public watchConfiguration(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(event => {
      // Only reload if clauding configuration changed
      if (event.affectsConfiguration('clauding')) {
        this.reloadConfig();
        callback();
      }
    });
  }

  /**
   * Validates an agent command configuration
   * @param command The command to validate
   * @returns Array of validation error messages (empty if valid)
   */
  public validateAgentCommand(command: AgentCommand): string[] {
    const errors: string[] = [];

    // Check required properties
    if (!command.name || typeof command.name !== 'string') {
      errors.push('Command must have a valid "name" property');
    }
    if (!command.path || typeof command.path !== 'string') {
      errors.push('Command must have a valid "path" property');
    } else if (command.path !== '.' && command.path !== '{worktree}') {
      errors.push('Command "path" must be either "." or "{worktree}"');
    }
    if (typeof command.prompt !== 'string') {
      errors.push('Command must have a valid "prompt" property');
    }
    if (!command.outputFilePrefix || typeof command.outputFilePrefix !== 'string') {
      errors.push('Command must have a valid "outputFilePrefix" property');
    }

    // Validate requiredFiles if present
    if (command.requiredFiles) {
      if (!Array.isArray(command.requiredFiles)) {
        errors.push('Command "requiredFiles" must be an array');
      } else {
        command.requiredFiles.forEach((file, index) => {
          if (!file.path || typeof file.path !== 'string') {
            errors.push(`Required file at index ${index} must have a valid "path" property`);
          }
          if (file.type !== 'exact' && file.type !== 'pattern') {
            errors.push(`Required file at index ${index} must have type "exact" or "pattern"`);
          }
        });
      }
    }

    return errors;
  }

  /**
   * Merges default commands with user-defined commands
   * User commands with the same name as default commands will override the defaults
   * @returns Array of merged commands
   */
  public getMergedCommands(): AgentCommand[] {
    const defaultCommands = Object.values(AGENT_COMMANDS);
    const userCommands = this.config.agentCommands || [];

    // Create a map of commands by name for easy merging
    const commandMap = new Map<string, AgentCommand>();

    // Add default commands first
    defaultCommands.forEach(cmd => {
      commandMap.set(cmd.name, cmd);
    });

    // Override with user commands (and validate them)
    userCommands.forEach(cmd => {
      const errors = this.validateAgentCommand(cmd);
      if (errors.length === 0) {
        commandMap.set(cmd.name, cmd);
      } else {
        console.error(`Invalid user command "${cmd.name}":`, errors);
      }
    });

    return Array.from(commandMap.values());
  }

  /**
   * Returns list of configured agents
   */
  public getAgents(): AgentDefinition[] {
    return [...this.config.agents];
  }

  /**
   * Returns the default agent
   */
  public getDefaultAgent(): AgentDefinition {
    const defaultId = this.config.defaultAgentId || this.config.agents[0]?.id;
    const agent = this.getAgentById(defaultId);
    if (!agent) {
      // Fallback to first agent if default not found
      return this.config.agents[0] || DEFAULT_CONFIG.agents[0];
    }
    return agent;
  }

  /**
   * Get specific agent by ID
   */
  public getAgentById(id: string): AgentDefinition | undefined {
    return this.config.agents.find(agent => agent.id === id);
  }

  /**
   * Validates an agent definition
   * @param agent The agent to validate
   * @returns Array of validation error messages (empty if valid)
   */
  public validateAgentDefinition(agent: AgentDefinition): string[] {
    const errors: string[] = [];

    if (!agent.id || typeof agent.id !== 'string') {
      errors.push('Agent must have a valid "id" property');
    }
    if (!agent.executable || typeof agent.executable !== 'string') {
      errors.push('Agent must have a valid "executable" property');
    }
    // flags is now optional, so only validate type if provided
    if (agent.flags !== undefined && typeof agent.flags !== 'string') {
      errors.push('Agent "flags" must be a string if provided');
    }

    return errors;
  }
}
