import * as fs from 'fs';
import * as path from 'path';
import { TmuxTerminal } from './TmuxTerminal';
import { ITerminal } from '../ITerminalProvider';

/**
 * Options for buffer capture
 */
export interface BufferCaptureOptions {
	/**
	 * Capture interval in milliseconds
	 * Default: 1000ms (1 second)
	 */
	captureInterval?: number;

	/**
	 * Whether to include history in the capture
	 * Default: true
	 */
	includeHistory?: boolean;

	/**
	 * Whether to save to file
	 * Default: false
	 */
	saveToFile?: boolean;

	/**
	 * File path to save the output (only used if saveToFile is true)
	 */
	outputFilePath?: string;

	/**
	 * Whether to append to file (vs overwrite)
	 * Default: false (overwrite)
	 */
	appendToFile?: boolean;
}

/**
 * Result of buffer capture
 */
export interface BufferCaptureResult {
	/**
	 * The captured buffer content
	 */
	content: string;

	/**
	 * Path to the output file (if saveToFile was true)
	 */
	outputFilePath?: string;

	/**
	 * Number of lines captured
	 */
	lineCount: number;

	/**
	 * Size of the captured content in bytes
	 */
	sizeBytes: number;
}

/**
 * Helper class for capturing tmux buffer output
 *
 * This provides buffer-based output capture as an alternative to
 * file-based capture using `script`/`tee` commands.
 */
export class TmuxBufferCapture {
	private captureInterval: NodeJS.Timeout | null = null;
	private lastCapturedContent = '';
	private isCapturing = false;

	constructor(
		private terminal: TmuxTerminal,
		private options: BufferCaptureOptions = {}
	) {
		// Set defaults
		this.options.captureInterval = options.captureInterval ?? 1000;
		this.options.includeHistory = options.includeHistory ?? true;
		this.options.saveToFile = options.saveToFile ?? false;
		this.options.appendToFile = options.appendToFile ?? false;
	}

	/**
	 * Start continuous buffer capture
	 * This will capture the buffer at regular intervals and save to file
	 */
	async startCapture(): Promise<void> {
		if (this.isCapturing) {
			return;
		}

		this.isCapturing = true;

		// Do an immediate capture
		await this.captureOnce();

		// Start periodic capture
		this.captureInterval = setInterval(async () => {
			try {
				await this.captureOnce();
			} catch (error) {
				console.error('[TmuxBufferCapture] Error during periodic capture:', error);
			}
		}, this.options.captureInterval);
	}

	/**
	 * Stop continuous buffer capture
	 */
	stopCapture(): void {
		if (this.captureInterval) {
			clearInterval(this.captureInterval);
			this.captureInterval = null;
		}
		this.isCapturing = false;
	}

	/**
	 * Capture buffer once and optionally save to file
	 */
	async captureOnce(): Promise<BufferCaptureResult> {
		if (!this.terminal.getBuffer) {
			throw new Error('Terminal does not support buffer reading');
		}

		// Capture the buffer
		const content = await this.terminal.getBuffer();

		// Calculate stats
		const lineCount = content.split('\n').length;
		const sizeBytes = Buffer.byteLength(content, 'utf8');

		// Save to file if requested
		let outputFilePath: string | undefined;
		if (this.options.saveToFile && this.options.outputFilePath) {
			outputFilePath = this.options.outputFilePath;

			// Ensure directory exists
			const dir = path.dirname(outputFilePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Write or append to file
			if (this.options.appendToFile) {
				// Only write new content (diff from last capture)
				const newContent = this.getNewContent(content);
				if (newContent) {
					fs.appendFileSync(outputFilePath, newContent, 'utf8');
				}
			} else {
				// Overwrite entire file
				fs.writeFileSync(outputFilePath, content, 'utf8');
			}
		}

		// Update last captured content
		this.lastCapturedContent = content;

		return {
			content,
			outputFilePath,
			lineCount,
			sizeBytes
		};
	}

	/**
	 * Get the new content since last capture
	 */
	private getNewContent(currentContent: string): string {
		if (!this.lastCapturedContent) {
			return currentContent;
		}

		// If current content starts with last captured content, return the new part
		if (currentContent.startsWith(this.lastCapturedContent)) {
			return currentContent.slice(this.lastCapturedContent.length);
		}

		// If content has changed completely, return all of it
		return currentContent;
	}

	/**
	 * Get the last captured content
	 */
	getLastCapturedContent(): string {
		return this.lastCapturedContent;
	}

	/**
	 * Check if capture is running
	 */
	isRunning(): boolean {
		return this.isCapturing;
	}

	/**
	 * Dispose the capture
	 */
	dispose(): void {
		this.stopCapture();
		this.lastCapturedContent = '';
	}
}

/**
 * Helper function to capture buffer from any terminal that supports it
 */
export async function captureTerminalBuffer(
	terminal: ITerminal,
	options: BufferCaptureOptions = {}
): Promise<BufferCaptureResult> {
	// Check if terminal is a TmuxTerminal
	if (terminal instanceof TmuxTerminal) {
		const capture = new TmuxBufferCapture(terminal, options);
		return await capture.captureOnce();
	}

	// Check if terminal has getBuffer method (duck typing)
	if ('getBuffer' in terminal && typeof (terminal as any).getBuffer === 'function') {
		const content = await (terminal as any).getBuffer();
		const lineCount = content.split('\n').length;
		const sizeBytes = Buffer.byteLength(content, 'utf8');

		// Save to file if requested
		let outputFilePath: string | undefined;
		if (options.saveToFile && options.outputFilePath) {
			outputFilePath = options.outputFilePath;
			const dir = path.dirname(outputFilePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(outputFilePath, content, 'utf8');
		}

		return {
			content,
			outputFilePath,
			lineCount,
			sizeBytes
		};
	}

	throw new Error('Terminal does not support buffer reading');
}
