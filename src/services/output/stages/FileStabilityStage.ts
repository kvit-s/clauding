import * as fs from 'fs';
import * as vscode from 'vscode';
import { OutputStage, ProcessingContext } from '../OutputProcessingPipeline';
import {
	waitForFileStability,
	FileStabilityConfig as SharedFileStabilityConfig,
	DEFAULT_STABILITY_CONFIG
} from '../../../utils/fileStability';

/**
 * Re-export the shared configuration interface for backward compatibility
 */
export type FileStabilityConfig = SharedFileStabilityConfig;

/**
 * Stage that waits for file to stabilize (size stops changing)
 * This ensures all data has been flushed to disk before processing
 *
 * This stage now uses the shared file stability utility from
 * src/utils/fileStability.ts for consistency across the codebase.
 */
export class FileStabilityStage implements OutputStage {
	public readonly name = 'FileStability';
	private logger: vscode.LogOutputChannel;
	private config: FileStabilityConfig;

	constructor(
		logger: vscode.LogOutputChannel,
		config: FileStabilityConfig = DEFAULT_STABILITY_CONFIG
	) {
		this.logger = logger;
		this.config = config;
	}

	public async process(context: ProcessingContext): Promise<ProcessingContext> {
		this.logger.trace(`[${this.name}] Waiting for file stability: ${context.filePath}`);

		if (!fs.existsSync(context.filePath)) {
			this.logger.warn(`[${this.name}] File does not exist: ${context.filePath}`);
			return {
				...context,
				metadata: {
					...context.metadata,
					fileExists: false
				}
			};
		}

		const startTime = Date.now();

		// Use shared utility for file stability checking
		await waitForFileStability(context.filePath, this.config);

		const stats = fs.statSync(context.filePath);
		const waitTime = Date.now() - startTime;

		this.logger.trace(
			`[${this.name}] File stable after ${waitTime}ms`
		);

		return {
			...context,
			metadata: {
				...context.metadata,
				fileExists: true,
				fileSize: stats.size,
				stabilityWaitTime: waitTime,
				stabilityTimeout: waitTime >= this.config.maxWaitTime
			}
		};
	}
}
