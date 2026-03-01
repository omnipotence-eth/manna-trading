/**
 * Validation utilities
 */

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate number is within range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Validate required fields in object
 */
export function hasRequiredFields<T extends Record<string, any>>(
  obj: T,
  requiredFields: (keyof T)[]
): boolean {
  return requiredFields.every(field => {
    const value = obj[field];
    return value !== undefined && value !== null && value !== '';
  });
}

/**
 * Sanitize string input
 * Removes HTML tags, javascript: protocol, and limits length
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .trim()
    .slice(0, maxLength); // Limit length
}

/**
 * Sanitize user input for display
 * More aggressive sanitization for user-generated content
 */
export function sanitizeUserInput(input: string, maxLength: number = 500): string {
  return sanitizeString(input, maxLength)
    .replace(/on\w+=/gi, '') // Remove event handlers
    .replace(/script/gi, ''); // Remove script tags
}

