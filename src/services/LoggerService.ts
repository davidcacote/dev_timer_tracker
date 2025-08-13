import * as vscode from 'vscode';

export type LogLevel = 'info' | 'warn' | 'error';

export interface ILoggerService {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, details?: string): void;
  showError(userMessage: string, details?: string): Promise<void>;
  showWarning(userMessage: string): Promise<void>;
  showInfo(userMessage: string): Promise<void>;
}

export class LoggerService implements ILoggerService {
  private readonly channel: vscode.OutputChannel;

  constructor(name: string = 'Branch Time Tracker') {
    this.channel = vscode.window.createOutputChannel(name);
  }

  private log(level: LogLevel, message: string, details?: string) {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    if (details) {
      this.channel.appendLine(details);
    }
    if (level === 'error') {
      this.channel.show(true);
    }
  }

  info(message: string): void { this.log('info', message); }
  warn(message: string): void { this.log('warn', message); }
  error(message: string, details?: string): void { this.log('error', message, details); }

  async showError(userMessage: string, details?: string): Promise<void> {
    const copy = 'Copy details';
    const open = 'Open logs';
    const selection = await vscode.window.showErrorMessage(userMessage, copy, open);
    if (selection === copy && details) {
      await vscode.env.clipboard.writeText(details);
      vscode.window.showInformationMessage('Error details copied to clipboard');
    }
    if (selection === open) {
      this.channel.show(true);
    }
  }

  async showWarning(userMessage: string): Promise<void> {
    await vscode.window.showWarningMessage(userMessage);
  }

  async showInfo(userMessage: string): Promise<void> {
    await vscode.window.showInformationMessage(userMessage);
  }
}
