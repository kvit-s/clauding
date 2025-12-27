/**
 * Message model for feature-specific messages displayed in the message panel
 */
export interface FeatureMessage {
	/** Unique identifier for the message */
	id: string;

	/** Timestamp when the message was created (ISO 8601 format) */
	timestamp: string;

	/** The message text to display */
	text: string;

	/** Message type for styling and icons */
	type: 'info' | 'warning' | 'error' | 'success';

	/** Optional actions that can be triggered from the message */
	actions?: MessageAction[];

	/** Whether the message can be dismissed by the user */
	dismissible: boolean;
}

/**
 * Action that can be triggered from a message
 */
export interface MessageAction {
	/** Display label for the action button */
	label: string;

	/** Command to execute when the action is clicked */
	command: string;

	/** Optional arguments to pass to the command */
	args?: unknown[];
}

/**
 * Create a new feature message with generated ID and timestamp
 */
export function createFeatureMessage(
	text: string,
	type: FeatureMessage['type'],
	options: {
		actions?: MessageAction[];
		dismissible?: boolean;
	} = {}
): FeatureMessage {
	return {
		id: generateMessageId(),
		timestamp: new Date().toISOString(),
		text,
		type,
		actions: options.actions,
		dismissible: options.dismissible !== false, // Default to true
	};
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
	return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
