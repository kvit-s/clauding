import * as fs from 'fs';
import * as vscode from 'vscode';
import { OutputStage, ProcessingContext } from '../OutputProcessingPipeline';

/**
 * Stage that reads and parses the output file content
 */
export class ParsingStage implements OutputStage {
	public readonly name = 'Parsing';
	private logger: vscode.LogOutputChannel;

	constructor(logger: vscode.LogOutputChannel) {
		this.logger = logger;
	}

	public async process(context: ProcessingContext): Promise<ProcessingContext> {
		this.logger.trace(`[${this.name}] Parsing file: ${context.filePath}`);

		// Check if file exists
		if (!fs.existsSync(context.filePath)) {
			this.logger.error(`[${this.name}] File not found: ${context.filePath}`);
			throw new Error(`File not found: ${context.filePath}`);
		}

		try {
			// Read file content
			const content = fs.readFileSync(context.filePath, 'utf-8');
			this.logger.trace(
				`[${this.name}] Read ${content.length} bytes from ${context.filePath}`
			);

			return {
				...context,
				content,
				metadata: {
					...context.metadata,
					contentLength: content.length,
					parsedAt: new Date().toISOString()
				}
			};
		} catch (error) {
			this.logger.error(`[${this.name}] Failed to read file: ${error}`);
			throw error;
		}
	}
}
