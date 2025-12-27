import * as fs from 'fs';
import * as vscode from 'vscode';
import { LLMService, LLMMessage } from './LLMService';
import {
  getFeaturesMetaPath,
  getProjectRoot,
  ensureFeaturesFolderExists,
  META_FILES
} from '../utils/featureMetaPaths';

export interface ProjectContext {
  readme?: string;
  architecture?: string;
}

export interface ClassificationMetadata {
  timestamp: string;
  featureName: string;
  classification: {
    result: 'lightweight' | 'standard';
    confidence: string;
    llmRawResponse: string;
  };
  llm: {
    provider: string;
    baseURL: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  prompt: {
    system: string;
    user: string;
    contextIncluded: {
      readme: boolean;
      architecture: boolean;
    };
  };
  response: {
    raw: string;
    parsed: 'lightweight' | 'standard';
    receivedAt: string;
  };
  userChoice: string | null;
  userChoiceTimestamp?: string;
  commitHash: string | null;
}

export interface ClassificationResult {
  classification: {
    result: 'lightweight' | 'standard';
    confidence: string;
    llmRawResponse: string;
  };
  metadata: ClassificationMetadata;
}

/**
 * Service for classifying features as lightweight or standard using an external LLM
 */
export class FeatureClassificationService {
  private llmService: LLMService;
  private worktreePath: string;

  constructor(worktreePath?: string) {
    this.llmService = new LLMService();
    this.worktreePath = worktreePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  /**
   * Build the classification prompt
   */
  private buildClassificationPrompt(
    featurePrompt: string,
    context?: ProjectContext
  ): { systemPrompt: string; userPrompt: string; contextIncluded: { readme: boolean; architecture: boolean } } {
    const systemPrompt = `You are an expert software architect. Classify software features as 'lightweight' or 'standard' based on complexity.

Lightweight features:
- Simple UI changes (button text, colors, layouts)
- Configuration additions
- Small refactors or renaming
- Documentation updates
- Minor bug fixes
- Adding simple validation
- Estimated implementation: < 3 hours

Standard features:
- New API endpoints or services
- Database schema changes
- Complex business logic
- Authentication/authorization changes
- Third-party integrations
- Performance optimizations requiring profiling
- Estimated implementation: >= 3 hours

Respond with ONLY one word: 'lightweight' or 'standard'.`;

    let userPrompt = `Feature: Classification Request

Description:
${featurePrompt}`;

    const contextIncluded = { readme: false, architecture: false };

    if (context?.readme) {
      userPrompt += `\n\nProject README:
${context.readme}`;
      contextIncluded.readme = true;
    }

    if (context?.architecture) {
      userPrompt += `\n\nArchitecture:
${context.architecture}`;
      contextIncluded.architecture = true;
    }

    userPrompt += '\n\nClassification:';

    return { systemPrompt, userPrompt, contextIncluded };
  }

  /**
   * Parse the LLM response to extract classification
   */
  private parseClassificationResponse(response: string): 'lightweight' | 'standard' {
    if (!response) {
      console.warn('Empty classification response, defaulting to standard');
      return 'standard';
    }

    const cleaned = response.toLowerCase().trim();

    // Look for the keywords in the response
    if (cleaned.includes('lightweight')) {
      return 'lightweight';
    } else if (cleaned.includes('standard')) {
      return 'standard';
    }

    // Default to standard if ambiguous (safer choice)
    console.warn('Ambiguous classification response, defaulting to standard:', response);
    return 'standard';
  }

  /**
   * Determine confidence based on response clarity
   */
  private determineConfidence(response: string): string {
    if (!response) {
      return 'low';
    }

    const cleaned = response.toLowerCase().trim();

    // High confidence: single word response
    if (cleaned === 'lightweight' || cleaned === 'standard') {
      return 'high';
    }

    // Medium confidence: contains the keyword clearly
    if (cleaned.startsWith('lightweight') || cleaned.startsWith('standard')) {
      return 'medium';
    }

    // Low confidence: keyword is buried in text
    return 'low';
  }

  /**
   * Classify a feature using the LLM
   */
  async classifyFeature(
    featureName: string,
    prompt: string,
    projectContext?: ProjectContext
  ): Promise<ClassificationResult> {
    if (!this.llmService.isConfigured()) {
      throw new Error('LLM not configured. Please set API key in settings.');
    }

    const timestamp = new Date().toISOString();
    const { systemPrompt, userPrompt, contextIncluded } = this.buildClassificationPrompt(prompt, projectContext);

    // Override temperature and maxTokens for classification
    const vsConfig = vscode.workspace.getConfiguration('clauding.llm');
    const baseURL = vsConfig.get<string>('baseURL', 'https://openrouter.ai/api/v1');
    const model = vsConfig.get<string>('model', 'anthropic/claude-3.5-sonnet');

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.llmService.chat(messages);
    const receivedAt = new Date().toISOString();

    const parsed = this.parseClassificationResponse(response.content);
    const confidence = this.determineConfidence(response.content);

    const metadata: ClassificationMetadata = {
      timestamp,
      featureName,
      classification: {
        result: parsed,
        confidence,
        llmRawResponse: response.content,
      },
      llm: {
        provider: baseURL.includes('openrouter') ? 'openrouter' : 'custom',
        baseURL,
        model: response.model || model,
        temperature: 0.3, // Fixed for classification
        maxTokens: 500, // Fixed for classification
      },
      prompt: {
        system: systemPrompt,
        user: userPrompt,
        contextIncluded,
      },
      response: {
        raw: response.content,
        parsed,
        receivedAt,
      },
      userChoice: null,
      commitHash: null,
    };

    // Save metadata to file
    await this.saveClassificationMetadata(featureName, metadata);

    return {
      classification: {
        result: parsed,
        confidence,
        llmRawResponse: response.content,
      },
      metadata,
    };
  }

  /**
   * Save classification metadata to file (in features folder)
   */
  async saveClassificationMetadata(
    featureName: string,
    metadata: ClassificationMetadata | Partial<ClassificationMetadata>
  ): Promise<void> {
    const projectRoot = getProjectRoot(this.worktreePath);

    // Ensure features folder exists
    ensureFeaturesFolderExists(projectRoot, featureName);

    const classificationPath = getFeaturesMetaPath(projectRoot, featureName, META_FILES.CLASSIFICATION);

    // Check if there's existing metadata with user choice
    const existingMetadata = await this.loadClassificationMetadata(featureName);
    if (existingMetadata && existingMetadata.userChoice && !metadata.userChoice) {
      // Preserve existing user choice and timestamp if new metadata doesn't have it
      metadata.userChoice = existingMetadata.userChoice;
      metadata.userChoiceTimestamp = existingMetadata.userChoiceTimestamp;
    }

    fs.writeFileSync(classificationPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load classification metadata from file (from features folder)
   */
  async loadClassificationMetadata(featureName: string): Promise<ClassificationMetadata | null> {
    const projectRoot = getProjectRoot(this.worktreePath);
    const classificationPath = getFeaturesMetaPath(projectRoot, featureName, META_FILES.CLASSIFICATION);

    if (fs.existsSync(classificationPath)) {
      const content = fs.readFileSync(classificationPath, 'utf-8');
      return JSON.parse(content) as ClassificationMetadata;
    }

    return null;
  }

  /**
   * Update classification metadata with user choice
   */
  async updateUserChoice(
    featureName: string,
    userChoice: string
  ): Promise<void> {
    const metadata = await this.loadClassificationMetadata(featureName);

    if (!metadata) {
      // If classification doesn't exist yet, create a minimal metadata file with just user choice
      const minimalMetadata: Partial<ClassificationMetadata> = {
        featureName,
        userChoice,
        userChoiceTimestamp: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        commitHash: null,
      };

      const projectRoot = getProjectRoot(this.worktreePath);

      // Ensure features folder exists
      ensureFeaturesFolderExists(projectRoot, featureName);

      const classificationPath = getFeaturesMetaPath(projectRoot, featureName, META_FILES.CLASSIFICATION);
      fs.writeFileSync(classificationPath, JSON.stringify(minimalMetadata, null, 2));
      return;
    }

    metadata.userChoice = userChoice;
    metadata.userChoiceTimestamp = new Date().toISOString();

    await this.saveClassificationMetadata(featureName, metadata);
  }

  /**
   * Check if classification metadata has only user choice (no LLM classification)
   */
  async hasUserChoiceOnly(featureName: string): Promise<boolean> {
    const metadata = await this.loadClassificationMetadata(featureName);

    if (!metadata) {
      return false;
    }

    // Check if metadata has userChoice but no classification result
    return metadata.userChoice !== null && metadata.userChoice !== undefined && !metadata.classification;
  }

  /**
   * Merge user choice that was recorded before classification completed
   */
  async mergeUserChoiceWithClassification(featureName: string): Promise<void> {
    const metadata = await this.loadClassificationMetadata(featureName);

    if (!metadata) {
      return; // Nothing to merge
    }

    // Check if we have user choice stored separately
    const hasUserChoice = metadata.userChoice !== null && metadata.userChoice !== undefined;
    const hasClassification = metadata.classification !== null && metadata.classification !== undefined;

    if (hasUserChoice && hasClassification) {
      // Both exist, already merged - nothing to do
      return;
    }

    if (!hasUserChoice || hasClassification) {
      // Either no user choice to merge, or already has classification - nothing to do
      return;
    }

    // If we get here, we have user choice but no classification yet
    // This shouldn't happen after classification completes, but we handle it gracefully
    // The classification will be added by the normal flow
  }

  /**
   * Update classification metadata with commit hash
   */
  async updateCommitHash(
    featureName: string,
    commitHash: string
  ): Promise<void> {
    const metadata = await this.loadClassificationMetadata(featureName);

    if (!metadata) {
      throw new Error(`No classification metadata found for feature: ${featureName}`);
    }

    metadata.commitHash = commitHash;

    await this.saveClassificationMetadata(featureName, metadata);
  }
}
