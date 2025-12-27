/**
 * TUI Session Parser
 *
 * Parses TUI session output files and converts them to markdown and JSON formats.
 * Extracted from parse-tui/parse-tui-session.ts for integration into the extension.
 */

export interface SessionEvent {
  timestamp?: string;
  type: 'user_input' | 'system_response' | 'status' | 'prompt';
  content: string;
  raw?: string;
}

export class TUIParser {
  private events: SessionEvent[] = [];
  private lastContent = new Set<string>();

  /**
   * Remove ANSI escape codes from text
   */
  private stripAnsi(text: string): string {
    // Remove ANSI escape sequences
    /* eslint-disable no-control-regex */
    return text
      .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '') // CSI sequences
      .replace(/\x1B\][0-9;]*;[^\x07]*\x07/g, '') // OSC sequences
      .replace(/\x1B[PX^_]/g, '') // Other escape sequences
      .replace(/\[\?[0-9]+[hl]/g, '') // Private mode set/reset
      .trim();
    /* eslint-enable no-control-regex */
  }

  /**
   * Extract meaningful content from a frame
   */
  private extractContent(lines: string[]): string {
    const cleaned = lines
      .map(line => this.stripAnsi(line))
      .filter(line => {
        // Filter out common TUI elements that don't add value
        if (!line.trim()) {
          return false;
        }
        if (line.match(/^[╭╮╯╰│─┌┐└┘├┤┬┴┼]+$/)) {
          return false;
        }
        if (line.match(/^\s*>\s*$/)) {
          return false;
        }
        if (line.includes('shift+tab to cycle')) {
          return false;
        }
        return true;
      })
      .join('\n')
      .trim();

    return cleaned;
  }

  /**
   * Detect if this is a user input
   */
  private isUserInput(content: string): boolean {
    return content.match(/^>\s+[^\s]/) !== null;
  }

  /**
   * Detect if this is a status message (loading, processing, etc.)
   */
  private isStatusMessage(content: string): boolean {
    const statusPatterns = [
      /Elucidating/i,
      /Clauding/i,
      /Auto-updating/i,
      /esc to interrupt/i,
      /Press Ctrl-C/i,
    ];
    return statusPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Detect if this is a system response
   */
  private isSystemResponse(content: string): boolean {
    // Responses typically start with a bullet point or special character
    return content.match(/^[●✻*·✶✢]\s+/) !== null;
  }

  /**
   * Check if content is significantly different from what we've seen
   */
  private isNewContent(content: string): boolean {
    // Create a normalized version for comparison
    const normalized = content.replace(/[●✻*·✶✢]/g, '').trim();

    if (this.lastContent.has(normalized)) {
      return false;
    }

    // Keep last 10 contents in memory to avoid duplicates
    if (this.lastContent.size > 10) {
      const first = this.lastContent.values().next().value;
      if (first !== undefined) {
        this.lastContent.delete(first);
      }
    }

    this.lastContent.add(normalized);
    return true;
  }

  /**
   * Parse the entire session file
   */
  parse(content: string): SessionEvent[] {
    // Reset state for fresh parse
    this.events = [];
    this.lastContent.clear();

    const lines = content.split('\n');
    let sessionStartTime: string | undefined;

    // Extract session start time
    const startMatch = lines[0].match(/Script started on (.+?) \[/);
    if (startMatch) {
      sessionStartTime = startMatch[1];
    }

    // Extract Claude responses - look for blocks that start with colored bullet (●)
    // followed by indented continuation lines
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const stripped = this.stripAnsi(line);

      // Check for user input (lines starting with ">" AND having gray background)
      // Real user input has gray background: [48;2;55;55;55m
      // Partial typing frames don't have background color
      /* eslint-disable no-control-regex */
      const hasUserInputBackground = line.match(/\x1B\[48;2;55;55;55m/);
      /* eslint-enable no-control-regex */
      if (stripped.match(/^>\s+\S/) && hasUserInputBackground) {
        const inputLines: string[] = [];
        const firstLine = stripped.replace(/^>\s*/, '').trim();
        if (firstLine) {
          inputLines.push(firstLine);
        }

        // Check if the input continues on the next line(s)
        // User input that wraps will have the same background color pattern
        i++;
        let emptyLineCount = 0;
        while (i < lines.length) {
          const nextLine = lines[i];
          const nextStripped = this.stripAnsi(nextLine);

          // Stop if we hit a status line or new section
          if (nextLine.match(/\[38;2;215;119;87m[✻✽·]/)) {
            break;
          }

          // Check if this is a continuation (has the same background color or is highlighted text)
          if (nextLine.match(/\[48;2;55;55;55m/) && !nextStripped.match(/^>/)) {
            const continuationText = nextStripped.trim();
            if (continuationText) {
              inputLines.push(continuationText);
              emptyLineCount = 0; // Reset empty line counter when we find content
            } else {
              // Empty line within the input block - preserve as paragraph break
              emptyLineCount++;
              if (emptyLineCount > 2) {
                // Too many consecutive empty lines, probably end of input
                break;
              }
              inputLines.push(''); // Preserve empty line
            }
            i++;
          } else if (nextStripped.trim().length === 0) {
            // Empty line without background color might still be part of input
            emptyLineCount++;
            if (emptyLineCount > 2) {
              break;
            }
            i++;
          } else {
            break;
          }
        }

        // Join with newlines to preserve paragraph structure
        const userInput = inputLines.join('\n').trim();
        // Filter out placeholder suggestions (start with 'Try "')
        const isPlaceholderSuggestion = userInput.match(/^Try ["']/);
        if (userInput && userInput.length > 5 && !isPlaceholderSuggestion) {
          this.events.push({
            timestamp: sessionStartTime,
            type: 'user_input',
            content: userInput,
          });
        }
        continue;
      }

      // Check for Claude response (white bullet point ●)
      // The bullet is UTF-8 encoded as \u25CF or bytes 342 227 217
      // Only match white bullets [38;2;255;255;255m, not cyan [36m (feedback prompts)
      /* eslint-disable no-control-regex */
      const isWhiteBullet = line.match(/\x1B\[38;2;255;255;255m●\x1B\[39m/);
      const isCyanBullet = line.match(/\x1B\[36m●/);
      /* eslint-enable no-control-regex */

      // For lines without color codes (test fixtures), accept plain bullets
      const hasAnsiCodes = line.includes('\x1B[');
      const isPlainBullet = line.includes('\u25CF') && !hasAnsiCodes;

      if ((isWhiteBullet || isPlainBullet) && !isCyanBullet) {
        const responseLines: string[] = [];

        // Get the first line of the response
        const firstLine = this.stripAnsi(line).replace(/^●\s*/, '').trim();
        if (firstLine) {
          responseLines.push(firstLine);
        }

        // Collect continuation lines (lines starting with spaces)
        i++;
        let emptyLineCount = 0;
        while (i < lines.length) {
          const nextLine = lines[i];
          // Strip ANSI codes but preserve spacing for pattern matching
          /* eslint-disable no-control-regex */
          const nextStrippedPreserveSpaces = nextLine
            .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
            .replace(/\x1B\][0-9;]*;[^\x07]*\x07/g, '')
            .replace(/\x1B[PX^_]/g, '')
            .replace(/\[\?[0-9]+[hl]/g, '');
          /* eslint-enable no-control-regex */
          const nextStripped = nextStrippedPreserveSpaces.trim();

          // Stop if we hit a frame boundary or status line
          if (nextLine.match(/\[2K\[1A|\[?25[lh]|\[38;2;215;119;87m[✻✽·]/)) {
            break;
          }

          // Stop if we see a new prompt or command
          if (nextStripped.match(/^>/)) {
            break;
          }

          // Continue if line starts with spaces (indented continuation)
          // Allow digits, letters, dashes, or bullet points
          // Check the stripped line (with preserved spaces) to avoid ANSI codes interfering
          // Accept 2+ spaces for nested lists
          if (nextStrippedPreserveSpaces.match(/^ {2,}[-A-Za-z0-9•]/) && !nextStripped.includes('sk@Aorus') &&
              !nextStripped.includes('bypass permissions')) {
            if (nextStripped) {
              responseLines.push(nextStripped);
              emptyLineCount = 0; // Reset empty line counter
            }
          } else if (nextStripped.length === 0) {
            // Empty line might be part of the response, but stop after 2 consecutive
            emptyLineCount++;
            if (emptyLineCount > 2) {
              break;
            }
            i++;
            continue;
          } else {
            // Non-continuation line, stop collecting
            break;
          }

          i++;
        }

        // Combine the response lines
        const fullResponse = responseLines.join('\n').trim();
        if (fullResponse && fullResponse.length > 10) {
          this.events.push({
            timestamp: sessionStartTime,
            type: 'system_response',
            content: fullResponse,
          });
        }
        continue;
      }

      i++;
    }

    // Filter out duplicate consecutive events
    return this.events.filter((event, idx) => {
      if (idx === 0) {
        return true;
      }
      const prev = this.events[idx - 1];
      return event.content !== prev.content || event.type !== prev.type;
    });
  }

  /**
   * Convert parsed events to markdown
   */
  toMarkdown(events: SessionEvent[]): string {
    let markdown = '# TUI Session Log\n\n';

    if (events.length > 0 && events[0].timestamp) {
      markdown += `**Session started:** ${events[0].timestamp}\n\n`;
      markdown += '---\n\n';
    }

    for (const event of events) {
      switch (event.type) {
        case 'user_input': {
          const userInput = event.content.replace(/^>\s*/, '');
          markdown += `## User Input\n\n\`\`\`\n${userInput}\n\`\`\`\n\n`;
          break;
        }

        case 'system_response': {
          const response = event.content.replace(/^[●✻*·✶✢]\s*/, '');
          markdown += `## System Response\n\n${response}\n\n`;
          break;
        }

        case 'status':
          markdown += `*Status: ${event.content}*\n\n`;
          break;

        case 'prompt':
          // Only show significant prompt changes
          if (event.content.length > 5) {
            markdown += `${event.content}\n\n`;
          }
          break;
      }
    }

    return markdown;
  }

  /**
   * Generate a JSON representation of events
   */
  toJSON(events: SessionEvent[]): string {
    return JSON.stringify(events, null, 2);
  }
}

/**
 * Parse TUI session output to markdown
 */
export function parseToMarkdown(content: string): string {
  const parser = new TUIParser();
  const events = parser.parse(content);
  return parser.toMarkdown(events);
}

/**
 * Parse TUI session output to JSON
 */
export function parseToJSON(content: string): string {
  const parser = new TUIParser();
  const events = parser.parse(content);
  return parser.toJSON(events);
}

/**
 * Parse TUI session and return events
 */
export function parseTUISession(content: string): SessionEvent[] {
  const parser = new TUIParser();
  return parser.parse(content);
}

/**
 * Parse TUI session output to both markdown and JSON (efficient for generating both)
 * Returns an object with both formats to avoid parsing twice
 */
export function parseTUISessionToBoth(content: string): { markdown: string; json: string } {
  const parser = new TUIParser();
  const events = parser.parse(content);
  return {
    markdown: parser.toMarkdown(events),
    json: parser.toJSON(events),
  };
}
