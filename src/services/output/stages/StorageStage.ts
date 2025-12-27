import * as vscode from 'vscode';
import { OutputStage, ProcessingContext, ProcessedOutput } from '../OutputProcessingPipeline';

/**
 * Stage that stores the processed output result
 * This is typically the final stage in the pipeline
 */
export class StorageStage implements OutputStage {
	public readonly name = 'Storage';
	private logger: vscode.LogOutputChannel;

	constructor(logger: vscode.LogOutputChannel) {
		this.logger = logger;
	}

	public async process(context: ProcessingContext): Promise<ProcessingContext> {
		this.logger.trace(`[${this.name}] Storing processed output`);

		// Check if content is valid
		const isValid = context.metadata.isValid === true;
		if (!isValid) {
			this.logger.warn(
				`[${this.name}] Content validation failed, storing with error flag`
			);
		}

		// Create processed output result
		const result: ProcessedOutput = {
			success: isValid,
			filePath: context.filePath,
			content: context.content || undefined,
			error: isValid ? undefined : 'Content validation failed',
			metadata: {
				...context.metadata,
				storedAt: new Date().toISOString()
			}
		};

		this.logger.trace(
			`[${this.name}] Stored output: ${result.success ? 'success' : 'failed'}`
		);

		return {
			...context,
			result,
			shouldStop: true // Stop pipeline after storage
		};
	}
}
