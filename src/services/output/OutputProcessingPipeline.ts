import * as vscode from 'vscode';

/**
 * Processing context passed through pipeline stages
 */
export interface ProcessingContext {
	/** Path to the output file */
	filePath: string;
	/** File content (null until loaded) */
	content: string | null;
	/** Metadata collected during processing */
	metadata: Record<string, unknown>;
	/** Result of processing (null until complete) */
	result: ProcessedOutput | null;
	/** Flag to stop pipeline execution */
	shouldStop: boolean;
	/** Feature name */
	featureName?: string;
	/** Worktree path */
	worktreePath?: string;
}

/**
 * Processed output result
 */
export interface ProcessedOutput {
	/** Whether processing was successful */
	success: boolean;
	/** Output file path */
	filePath: string;
	/** Parsed content */
	content?: string;
	/** Any errors encountered */
	error?: string;
	/** Processing metadata */
	metadata: Record<string, unknown>;
}

/**
 * Base interface for pipeline stages
 */
export interface OutputStage {
	/** Name of the stage */
	readonly name: string;

	/** Process the context and return updated context */
	process(context: ProcessingContext): Promise<ProcessingContext>;
}

/**
 * Pipeline for processing agent output files
 * Provides structured, testable output processing
 */
export class OutputProcessingPipeline {
	private stages: OutputStage[] = [];
	private logger: vscode.LogOutputChannel;

	constructor(logger: vscode.LogOutputChannel) {
		this.logger = logger;
	}

	/**
	 * Add a stage to the pipeline
	 */
	public addStage(stage: OutputStage): void {
		this.stages.push(stage);
		this.logger.trace(`[OutputPipeline] Added stage: ${stage.name}`);
	}

	/**
	 * Remove a stage from the pipeline
	 */
	public removeStage(stageName: string): void {
		const index = this.stages.findIndex(s => s.name === stageName);
		if (index !== -1) {
			this.stages.splice(index, 1);
			this.logger.trace(`[OutputPipeline] Removed stage: ${stageName}`);
		}
	}

	/**
	 * Get all stages
	 */
	public getStages(): readonly OutputStage[] {
		return this.stages;
	}

	/**
	 * Process an output file through the pipeline
	 */
	public async process(
		outputFile: string,
		featureName?: string,
		worktreePath?: string
	): Promise<ProcessedOutput> {
		this.logger.info(
			`[OutputPipeline] Processing: ${outputFile}` +
			(featureName ? ` (feature: ${featureName})` : '')
		);

		// Initialize context
		let context: ProcessingContext = {
			filePath: outputFile,
			content: null,
			metadata: {},
			result: null,
			shouldStop: false,
			featureName,
			worktreePath
		};

		// Execute stages sequentially
		for (const stage of this.stages) {
			if (context.shouldStop) {
				this.logger.trace(
					`[OutputPipeline] Pipeline stopped at stage: ${stage.name}`
				);
				break;
			}

			try {
				this.logger.trace(`[OutputPipeline] Executing stage: ${stage.name}`);
				context = await stage.process(context);
			} catch (error) {
				this.logger.error(
					`[OutputPipeline] Stage failed: ${stage.name} - ${error}`
				);

				// Stop pipeline and return error
				return {
					success: false,
					filePath: outputFile,
					error: `Stage ${stage.name} failed: ${error}`,
					metadata: context.metadata
				};
			}
		}

		// Return final result
		if (context.result) {
			this.logger.info(
				`[OutputPipeline] Processing complete: ${context.result.success ? 'success' : 'failed'}`
			);
			return context.result;
		}

		// No result produced
		this.logger.warn('[OutputPipeline] No result produced by pipeline');
		return {
			success: false,
			filePath: outputFile,
			error: 'Pipeline did not produce a result',
			metadata: context.metadata
		};
	}

	/**
	 * Clear all stages
	 */
	public clear(): void {
		this.stages = [];
		this.logger.trace('[OutputPipeline] Cleared all stages');
	}
}
