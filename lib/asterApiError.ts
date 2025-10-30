/**
 * AsterDex API Error Class
 * Provides structured error handling with error codes
 */
export class AsterApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly httpStatus: number = 500
  ) {
    super(message);
    this.name = 'AsterApiError';
  }
}

