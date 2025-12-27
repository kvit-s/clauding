/**
 * Maps lifecycle status to corresponding emoji icons
 */
export function getLifecycleIcon(status: string): string {
  const iconMap: Record<string, string> = {
    'pre-plan': '💡',
    'plan': '📋',
    'implement': '🔨',
    'wrap-up': '📦',
    'legacy': '📁'
  };

  return iconMap[status] || '';
}

/**
 * Returns a description for each lifecycle status
 */
export function getLifecycleDescription(status: string): string {
  const descriptionMap: Record<string, string> = {
    'pre-plan': 'Pre-Planning: Initial exploration and requirement gathering',
    'plan': 'Planning: Creating implementation plan',
    'implement': 'Implementation: Writing and testing code',
    'wrap-up': 'Wrap-Up: Final testing and preparation for merge',
    'legacy': 'Legacy: Feature from before lifecycle status tracking'
  };

  return descriptionMap[status] || 'Unknown status';
}
