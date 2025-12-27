import * as vscode from 'vscode';
import { OutputStage, ProcessingContext } from '../OutputProcessingPipeline';

/**
 * Stage that validates the parsed content
 */
export class ValidationStage implements OutputStage {
	public readonly name = 'Validation';
	private logger: vscode.LogOutputChannel;

	constructor(logger: vscode.LogOutputChannel) {
		this.logger = logger;
	}

	public async process(context: ProcessingContext): Promise<ProcessingContext> {
		this.logger.trace(`[${this.name}] Validating content`);

		// Check if content was parsed
		if (context.content === null) {
			this.logger.error(`[${this.name}] No content to validate`);
			throw new Error('No content to validate');
		}

		// Basic validation: check if content is not empty
		if (context.content.length === 0) {
			this.logger.warn(`[${this.name}] Content is empty`);
			return {
				...context,
				metadata: {
					...context.metadata,
					validationWarning: 'Content is empty',
					isValid: false
				}
			};
		}

		// Additional validation can be added here
		// For now, we just mark as valid if content exists and is not empty
		this.logger.trace(`[${this.name}] Content validated successfully`);

		return {
			...context,
			metadata: {
				...context.metadata,
				isValid: true,
				validatedAt: new Date().toISOString()
			}
		};
	}
}
