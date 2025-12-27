import * as fs from 'fs';

/**
 * Configuration for file stability checking
 */
export interface FileStabilityConfig {
	/** Maximum time to wait for stability (ms) */
	maxWaitTime: number;
	/** Interval between stability checks (ms) */
	checkInterval: number;
	/** Number of consecutive stable checks required */
	requiredStableChecks: number;
}

/**
 * Default configuration for file stability checking
 * Optimized based on empirical testing:
 * - Buffered data (~25KB) flushes within 50ms
 * - 3 consecutive checks at 50ms intervals = 150ms stability window
 * - 2000ms max wait is generous but prevents indefinite blocking
 */
export const DEFAULT_STABILITY_CONFIG: FileStabilityConfig = {
	maxWaitTime: 2000,
	checkInterval: 50,
	requiredStableChecks: 3
};

/**
 * Wait for a file to stabilize (size stops changing)
 *
 * This function monitors a file's size and waits until it remains constant
 * for a specified number of consecutive checks. This ensures that all data
 * has been flushed to disk before the file is processed.
 *
 * @param filePath - Absolute path to the file to monitor
 * @param config - Configuration for stability checking (optional)
 * @returns Promise that resolves when file is stable or timeout is reached
 *
 * @example
 * // Using default configuration
 * await waitForFileStability('/path/to/file.txt');
 *
 * @example
 * // Using custom configuration
 * await waitForFileStability('/path/to/file.txt', {
 *   maxWaitTime: 5000,
 *   checkInterval: 100,
 *   requiredStableChecks: 5
 * });
 */
export async function waitForFileStability(
	filePath: string,
	config: Partial<FileStabilityConfig> = {}
): Promise<void> {
	// Merge with defaults
	const finalConfig: FileStabilityConfig = {
		...DEFAULT_STABILITY_CONFIG,
		...config
	};

	// Check if file exists
	if (!fs.existsSync(filePath)) {
		console.log(`[fileStability] File does not exist: ${filePath}`);
		return;
	}

	const startTime = Date.now();
	let previousSize = -1;
	let stableCount = 0;

	while (Date.now() - startTime < finalConfig.maxWaitTime) {
		const stats = fs.statSync(filePath);
		const currentSize = stats.size;

		if (currentSize === previousSize) {
			stableCount++;
			if (stableCount >= finalConfig.requiredStableChecks) {
				// File size has been stable for required checks
				const waitTime = Date.now() - startTime;
				console.log(`[fileStability] File stable after ${waitTime}ms: ${filePath}`);
				return;
			}
		} else {
			// Size changed, reset counter
			stableCount = 0;
		}

		previousSize = currentSize;
		await new Promise(resolve => setTimeout(resolve, finalConfig.checkInterval));
	}

	// Max wait time reached, proceed anyway
	const waitTime = Date.now() - startTime;
	console.warn(
		`[fileStability] Stability timeout reached after ${waitTime}ms for ${filePath}, proceeding anyway`
	);
}

/**
 * Check if a file exists and has a non-zero size
 *
 * @param filePath - Absolute path to the file
 * @returns true if file exists and has content, false otherwise
 */
export function fileExistsAndHasContent(filePath: string): boolean {
	try {
		const stats = fs.statSync(filePath);
		return stats.size > 0;
	} catch {
		return false;
	}
}
