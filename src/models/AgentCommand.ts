export interface RequiredFile {
  path: string;                    // File path or pattern
  type: 'exact' | 'pattern';      // File type determines behavior
  template?: string;               // Template content for exact files
  errorMessage?: string;           // Custom error for pattern files
}

export interface AgentCommand {
  name: string;                    // Unique identifier
  label?: string;                  // Display label (defaults to name)
  path: string;                    // Working directory: "." (root) or "{worktree}" (feature worktree)
  prompt: string;                  // Template with variables
  requiredFiles?: RequiredFile[];  // File specifications
  outputFilePrefix: string;        // Output file prefix
  preferredAgentId?: string;       // Optional agent ID override - if not specified, uses default agent
  defaultPrompt?: string;         // Base system prompt applied when no agent-specific override is provided
  prompts?: Record<string, string>; // Optional map from agentId to prompt text, allowing different system prompts for each agent executable
}

export const AGENT_COMMANDS: Record<string, AgentCommand> = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'Create Plan': {
    name: 'Create Plan',
    path: '{worktree}',
    prompt: 'Read ./.clauding/prompt.md and create a detailed implementation plan. Save the plan to ./.clauding/plan.md. You are working in an isolated git worktree at {working-directory} which contains the full codebase. ALL operations (reading files, searching, exploration, editing) MUST be performed within this worktree directory ONLY. When using the Task tool or any search tools, you MUST specify this path to ensure agents search in the correct location.',
    requiredFiles: [{
      path: 'prompt.md',
      type: 'exact',
      template: '# Feature Prompt\n\nDescribe your feature implementation requirements here.\n\n## Goals\n\n- Goal 1\n- Goal 2\n\n## Requirements\n\n- Requirement 1\n- Requirement 2\n'
    }],
    outputFilePrefix: 'create-plan'
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'Create Lightweight Plan': {
    name: 'Create Lightweight Plan',
    path: '{worktree}',
    prompt: 'Read ./.clauding/prompt.md and create a concise implementation plan focused on key steps. List only the essential files to modify and the main changes needed. Keep it brief and actionable. Save the plan to ./.clauding/plan.md. You are working in an isolated git worktree at {working-directory} which contains the full codebase. ALL operations (reading files, searching, exploration, editing) MUST be performed within this worktree directory ONLY. When using the Task tool or any search tools, you MUST specify this path to ensure agents search in the correct location.',
    requiredFiles: [{
      path: 'prompt.md',
      type: 'exact',
      template: '# Feature Prompt\n\nDescribe your feature implementation requirements here.\n\n## Goals\n\n- Goal 1\n- Goal 2\n\n## Requirements\n\n- Requirement 1\n- Requirement 2\n'
    }],
    outputFilePrefix: 'create-lightweight-plan'
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'Modify Plan': {
    name: 'Modify Plan',
    path: '{worktree}',
    prompt: 'Read ./.clauding/modify-prompt.md for modification instructions and ./.clauding/plan.md for current plan. Update plan.md based on the instructions. You are working in an isolated git worktree at {working-directory} which contains the full codebase. ALL operations (reading files, searching, exploration, editing) MUST be performed within this worktree directory ONLY. When using the Task tool or any search tools, you MUST specify this path to ensure agents search in the correct location.',
    requiredFiles: [
      {
        path: 'modify-prompt.md',
        type: 'exact',
        template: '# Plan Modification Instructions\n\nDescribe how you want to modify the current plan.\n\n## Changes Needed\n\n- Change 1\n- Change 2\n'
      },
      {
        path: 'plan.md',
        type: 'exact',
        template: '# Implementation Plan\n\nThis is your implementation plan.\n'
      }
    ],
    outputFilePrefix: 'modify-plan'
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'Implement Plan': {
    name: 'Implement Plan',
    path: '{worktree}',
    prompt: 'Read ./.clauding/plan.md and implement all the steps described in the plan. Make all necessary code changes. You are working in an isolated git worktree at {working-directory} which contains the full codebase. ALL operations (reading files, searching, exploration, editing) MUST be performed within this worktree directory ONLY. When using the Task tool or any search tools, you MUST specify this path to ensure agents search in the correct location.',
    requiredFiles: [{
      path: 'plan.md',
      type: 'exact',
      template: '# Implementation Plan\n\nThis is your implementation plan.\n'
    }],
    outputFilePrefix: 'implement-plan'
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'Fix All Tests': {
    name: 'Fix All Tests',
    path: '{worktree}',
    prompt: 'The tests are failing. Review the test output and fix all failing tests. Make necessary code changes. You are working in an isolated git worktree at {working-directory} which contains the full codebase. ALL operations (reading files, searching, exploration, editing) MUST be performed within this worktree directory ONLY. When using the Task tool or any search tools, you MUST specify this path to ensure agents search in the correct location.',
    requiredFiles: [], // Will be handled specially - requires test run files
    outputFilePrefix: 'fix-tests'
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'Resolve Conflicts': {
    name: 'Resolve Conflicts',
    path: '{worktree}',
    prompt: 'There are merge conflicts that need to be resolved. Read .clauding/plan.md to understand the feature context. Examine the conflicted files and resolve all conflicts intelligently based on the feature goals.',
    requiredFiles: [{
      path: 'plan.md',
      type: 'exact',
      template: '# Implementation Plan\n\nThis is your implementation plan.\n'
    }],
    outputFilePrefix: 'resolve-conflicts'
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'Generic Agent': {
    name: 'Generic Agent',
    path: '{worktree}',
    prompt: '', // No prompt - interactive mode
    requiredFiles: [],
    outputFilePrefix: 'agent-session'
  }
};

export interface AgentResult {
  success: boolean;
  output: string;
  outputFile: string;
  exitCode: number;
}
