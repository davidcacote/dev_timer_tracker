/**
 * Error handling utilities
 */

/**
 * Base error class for extension errors
 */
export abstract class ExtensionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Git operation error (utility version)
 */
export class GitOperationError extends ExtensionError {
  constructor(message: string, code: string, public readonly stderr?: string) {
    super(message, code);
  }
}

/**
 * Storage operation error (utility version)
 */
export class StorageOperationError extends ExtensionError {
  constructor(
    message: string,
    public readonly operation: string,
    cause?: Error
  ) {
    super(message, `STORAGE_${operation.toUpperCase()}`, cause);
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends ExtensionError {
  constructor(message: string, public readonly setting: string) {
    super(message, "CONFIGURATION_ERROR");
  }
}

/**
 * Validation error
 */
export class ValidationError extends ExtensionError {
  constructor(message: string, public readonly field: string) {
    super(message, "VALIDATION_ERROR");
  }
}

/**
 * Import/Export error
 */
export class ImportExportError extends ExtensionError {
  constructor(message: string, public readonly format: string, cause?: Error) {
    super(message, `IMPORT_EXPORT_${format.toUpperCase()}`, cause);
  }
}

/**
 * Error recovery strategy interface
 */
export interface ErrorRecoveryStrategy {
  /**
   * Check if this strategy can recover from the error
   * @param error Error to check
   * @returns True if can recover
   */
  canRecover(error: Error): boolean;

  /**
   * Attempt to recover from the error
   * @param error Error to recover from
   * @param context Additional context
   * @returns True if recovery was successful
   */
  recover(error: Error, context?: any): Promise<boolean>;

  /**
   * Fallback action when recovery fails
   * @param error Original error
   */
  fallback(error: Error): void;
}

/**
 * Error logger interface
 */
export interface ErrorLogger {
  /**
   * Log error with context
   * @param error Error to log
   * @param context Additional context
   */
  logError(error: Error, context?: any): void;

  /**
   * Log warning
   * @param message Warning message
   * @param context Additional context
   */
  logWarning(message: string, context?: any): void;

  /**
   * Log info message
   * @param message Info message
   * @param context Additional context
   */
  logInfo(message: string, context?: any): void;
}

/**
 * Create user-friendly error message
 * @param error Error object
 * @returns User-friendly message
 */
export function createUserFriendlyMessage(error: Error): string {
  if (error instanceof GitOperationError) {
    return `Git operation failed: ${error.message}. Please ensure you're in a valid Git repository.`;
  }

  if (error instanceof StorageOperationError) {
    return `Storage operation failed: ${error.message}. Please check file permissions and disk space.`;
  }

  if (error instanceof ConfigurationError) {
    return `Configuration error: ${error.message}. Please check your settings.`;
  }

  if (error instanceof ValidationError) {
    return `Validation error: ${error.message}. Please check your input.`;
  }

  if (error instanceof ImportExportError) {
    return `Import/Export error: ${error.message}. Please check the file format.`;
  }

  return `An unexpected error occurred: ${error.message}`;
}

/**
 * Extract error details for logging
 * @param error Error object
 * @returns Error details object
 */
export function extractErrorDetails(error: Error): any {
  const details: any = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof ExtensionError) {
    details.code = error.code;
    details.cause = error.cause;
  }

  if (error instanceof GitOperationError) {
    details.stderr = error.stderr;
  }

  if (error instanceof StorageOperationError) {
    details.operation = error.operation;
  }

  return details;
}

/**
 * Check if error is recoverable
 * @param error Error to check
 * @returns True if potentially recoverable
 */
export function isRecoverableError(error: Error): boolean {
  // Network errors, temporary file system issues, etc.
  return (
    error.message.includes("ENOENT") ||
    error.message.includes("EACCES") ||
    error.message.includes("timeout") ||
    error.message.includes("network")
  );
}

/**
 * Retry operation with exponential backoff
 * @param operation Operation to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns Promise that resolves with operation result
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries || !isRecoverableError(lastError)) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
