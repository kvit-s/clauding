/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Helper class for managing temporary files and directories in tests
 */
export class TempFileHelper {
	private static tempDirs: string[] = [];

	/**
	 * Creates a temporary directory with a unique name
	 * @param prefix Optional prefix for the directory name
	 * @returns Path to the created temporary directory
	 */
	static createTempDir(prefix: string = 'test-'): string {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
		this.tempDirs.push(tempDir);
		return tempDir;
	}

	/**
	 * Writes content to a file, creating parent directories if needed
	 * @param filePath Path to the file
	 * @param content Content to write
	 */
	static writeFile(filePath: string, content: string): void {
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(filePath, content, 'utf-8');
	}

	/**
	 * Writes JSON data to a file
	 * @param filePath Path to the file
	 * @param data Data to write as JSON
	 */
	static writeJson(filePath: string, data: any): void {
		this.writeFile(filePath, JSON.stringify(data, null, 2));
	}

	/**
	 * Reads content from a file
	 * @param filePath Path to the file
	 * @returns File content as string
	 */
	static readFile(filePath: string): string {
		return fs.readFileSync(filePath, 'utf-8');
	}

	/**
	 * Reads and parses JSON from a file
	 * @param filePath Path to the file
	 * @returns Parsed JSON data
	 */
	static readJson<T = any>(filePath: string): T {
		const content = this.readFile(filePath);
		return JSON.parse(content);
	}

	/**
	 * Creates a file with the specified content
	 * @param dirPath Directory where the file should be created
	 * @param fileName Name of the file
	 * @param content Content of the file
	 * @returns Full path to the created file
	 */
	static createFile(dirPath: string, fileName: string, content: string = ''): string {
		const filePath = path.join(dirPath, fileName);
		this.writeFile(filePath, content);
		return filePath;
	}

	/**
	 * Creates a directory structure
	 * @param basePath Base path
	 * @param structure Object representing the directory structure
	 * @example
	 * createStructure('/tmp/test', {
	 *   'src': {
	 *     'index.ts': 'console.log("hello");',
	 *     'utils': {
	 *       'helper.ts': 'export function help() {}'
	 *     }
	 *   }
	 * })
	 */
	static createStructure(basePath: string, structure: any): void {
		for (const [name, content] of Object.entries(structure)) {
			const fullPath = path.join(basePath, name);

			if (typeof content === 'string') {
				// It's a file
				this.writeFile(fullPath, content);
			} else if (typeof content === 'object') {
				// It's a directory
				if (!fs.existsSync(fullPath)) {
					fs.mkdirSync(fullPath, { recursive: true });
				}
				this.createStructure(fullPath, content);
			}
		}
	}

	/**
	 * Removes a directory and all its contents recursively
	 * @param dirPath Path to the directory to remove
	 */
	static cleanup(dirPath: string): void {
		if (fs.existsSync(dirPath)) {
			fs.rmSync(dirPath, { recursive: true, force: true });
		}

		// Remove from tracked temp dirs
		const index = this.tempDirs.indexOf(dirPath);
		if (index > -1) {
			this.tempDirs.splice(index, 1);
		}
	}

	/**
	 * Cleans up all temporary directories created by this helper
	 */
	static cleanupAll(): void {
		for (const tempDir of this.tempDirs) {
			if (fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		}
		this.tempDirs = [];
	}

	/**
	 * Checks if a file exists
	 * @param filePath Path to the file
	 * @returns True if the file exists
	 */
	static exists(filePath: string): boolean {
		return fs.existsSync(filePath);
	}

	/**
	 * Gets the size of a file in bytes
	 * @param filePath Path to the file
	 * @returns File size in bytes
	 */
	static getFileSize(filePath: string): number {
		return fs.statSync(filePath).size;
	}

	/**
	 * Lists all files in a directory (non-recursive)
	 * @param dirPath Path to the directory
	 * @returns Array of file names
	 */
	static listFiles(dirPath: string): string[] {
		if (!fs.existsSync(dirPath)) {
			return [];
		}
		return fs.readdirSync(dirPath).filter(file => {
			return fs.statSync(path.join(dirPath, file)).isFile();
		});
	}

	/**
	 * Lists all directories in a directory (non-recursive)
	 * @param dirPath Path to the directory
	 * @returns Array of directory names
	 */
	static listDirs(dirPath: string): string[] {
		if (!fs.existsSync(dirPath)) {
			return [];
		}
		return fs.readdirSync(dirPath).filter(file => {
			return fs.statSync(path.join(dirPath, file)).isDirectory();
		});
	}

	/**
	 * Copies a file from source to destination
	 * @param srcPath Source file path
	 * @param destPath Destination file path
	 */
	static copyFile(srcPath: string, destPath: string): void {
		const dir = path.dirname(destPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.copyFileSync(srcPath, destPath);
	}
}
