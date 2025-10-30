/**
 * Confidence Color Utility
 * Provides consistent color coding for confidence levels across the app
 */

export interface ConfidenceColor {
  text: string;
  bg: string;
  border: string;
  label: string;
}

/**
 * Get color classes based on confidence percentage
 * @param confidence - Confidence value (0-1 or 0-100)
 * @returns Object with Tailwind CSS classes and label
 */
export function getConfidenceColor(confidence: number): ConfidenceColor {
  // Normalize to percentage if needed
  const percent = confidence > 1 ? confidence : confidence * 100;
  
  if (percent >= 70) {
    return {
      text: 'text-green-500',
      bg: 'bg-green-500/20',
      border: 'border-green-500',
      label: 'HIGH'
    };
  } else if (percent >= 45) {
    return {
      text: 'text-yellow-500',
      bg: 'bg-yellow-500/20',
      border: 'border-yellow-500',
      label: 'MEDIUM'
    };
  } else {
    return {
      text: 'text-red-500',
      bg: 'bg-red-500/20',
      border: 'border-red-500',
      label: 'LOW'
    };
  }
}

/**
 * Get confidence percentage display
 * @param confidence - Confidence value (0-1 or 0-100)
 * @returns Formatted percentage string
 */
export function formatConfidence(confidence: number): string {
  const percent = confidence > 1 ? confidence : confidence * 100;
  return `${Math.round(percent)}%`;
}

/**
 * Check if confidence is tradeable (≥45%)
 * @param confidence - Confidence value (0-1 or 0-100)
 * @returns Boolean indicating if confidence meets trading threshold
 */
export function isTradeable(confidence: number): boolean {
  const percent = confidence > 1 ? confidence : confidence * 100;
  return percent >= 45;
}

