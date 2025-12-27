import * as fs from 'fs';
import { FeatureMessage, createFeatureMessage, MessageAction } from '../models/FeatureMessage';
import { getFeaturesMetaPath, getProjectRoot, ensureFeaturesFolderExists } from '../utils/featureMetaPaths';

/**
 * Service for managing feature-specific messages displayed in the message panel
 * Messages are stored in {projectRoot}/.clauding/features/{feature-name}/messages.json
 */
export class MessageService {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	private static readonly MESSAGES_FILE = 'messages.json';

	/**
	 * Add a message to a feature's message panel
	 */
	addMessage(
		worktreePath: string,
		featureName: string,
		text: string,
		type: FeatureMessage['type'],
		options: {
			actions?: MessageAction[];
			dismissible?: boolean;
		} = {}
	): void {
		const message = createFeatureMessage(text, type, options);
		const messages = this.getMessages(worktreePath, featureName);
		messages.push(message);
		this.saveMessages(worktreePath, featureName, messages);
	}

	/**
	 * Dismiss (remove) a specific message by ID
	 */
	dismissMessage(worktreePath: string, featureName: string, messageId: string): void {
		const messages = this.getMessages(worktreePath, featureName);
		const filtered = messages.filter(m => m.id !== messageId);
		this.saveMessages(worktreePath, featureName, filtered);
	}

	/**
	 * Clear all messages for a feature
	 */
	clearMessages(worktreePath: string, featureName: string): void {
		this.saveMessages(worktreePath, featureName, []);
	}

	/**
	 * Get all messages for a feature
	 */
	getMessages(worktreePath: string, featureName: string): FeatureMessage[] {
		try {
			const projectRoot = getProjectRoot(worktreePath);
			const messagesPath = getFeaturesMetaPath(projectRoot, featureName, MessageService.MESSAGES_FILE);

			if (!fs.existsSync(messagesPath)) {
				return [];
			}

			const content = fs.readFileSync(messagesPath, 'utf-8');
			return JSON.parse(content) as FeatureMessage[];
		} catch (error) {
			console.error('Error reading messages:', error);
			return [];
		}
	}

	/**
	 * Save messages to disk in features folder
	 */
	private saveMessages(worktreePath: string, featureName: string, messages: FeatureMessage[]): void {
		try {
			const projectRoot = getProjectRoot(worktreePath);
			const messagesPath = getFeaturesMetaPath(projectRoot, featureName, MessageService.MESSAGES_FILE);

			// Ensure features folder exists
			ensureFeaturesFolderExists(projectRoot, featureName);

			fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
		} catch (error) {
			console.error('Error saving messages:', error);
		}
	}
}
