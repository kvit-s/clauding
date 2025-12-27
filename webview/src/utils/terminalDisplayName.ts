/**
 * Extracts the display name from a terminal name.
 * For terminal names in the format "clauding: {feature}-{command}",
 * returns only the command name part.
 *
 * @param terminalName - The full terminal name
 * @returns The display name (command name only)
 *
 * @example
 * getDisplayName("clauding: improve-terminal-labels-Explore") // Returns "Explore"
 * getDisplayName("clauding: feature-name-Agent Name") // Returns "Agent Name"
 * getDisplayName("my-terminal") // Returns "my-terminal" (fallback)
 */
export function getDisplayName(terminalName: string): string {
  // Extract command name from "clauding: {feature}-{command}" format
  if (terminalName.startsWith('clauding: ')) {
    const afterPrefix = terminalName.substring('clauding: '.length);
    const lastDashIndex = afterPrefix.lastIndexOf('-');
    if (lastDashIndex !== -1) {
      return afterPrefix.substring(lastDashIndex + 1);
    }
  }
  return terminalName; // fallback to full name
}
