export class UserError extends Error {
  public readonly code: string;
  public readonly userMessage: string;
  public readonly details?: string;
  constructor(code: string, userMessage: string, details?: string, cause?: Error) {
    super(userMessage);
    this.name = 'UserError';
    this.code = code;
    this.userMessage = userMessage;
    this.details = details || (cause ? (cause.stack || cause.message) : undefined);
  }

  toReportString(): string {
    return [
      `Code: ${this.code}`,
      `Message: ${this.userMessage}`,
      this.details ? `Details: ${this.details}` : undefined,
    ].filter(Boolean).join('\n');
  }
}
