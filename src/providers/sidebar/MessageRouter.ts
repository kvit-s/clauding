import { MessageHandler } from './MessageHandler';

/**
 * Routes messages from the webview to appropriate handlers
 */
export class MessageRouter {
  private handlers: Map<string, MessageHandler<unknown>> = new Map();

  /**
   * Register a handler for a specific command
   * @param command The command name
   * @param handler The handler instance
   */
  registerHandler(command: string, handler: MessageHandler<unknown>): void {
    this.handlers.set(command, handler);
  }

  /**
   * Route a message to the appropriate handler
   * @param message The message from the webview
   */
  async route(message: { command: string; [key: string]: unknown }): Promise<void> {
    console.log('Received message from webview:', message);

    const handler = this.handlers.get(message.command);
    if (handler) {
      await handler.handle(message);
    } else {
      console.warn(`No handler registered for command: ${message.command}`);
    }
  }

  /**
   * Check if a handler is registered for a command
   * @param command The command name
   * @returns True if a handler is registered
   */
  hasHandler(command: string): boolean {
    return this.handlers.has(command);
  }

  /**
   * Get all registered command names
   * @returns Array of command names
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}
