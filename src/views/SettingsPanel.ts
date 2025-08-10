import * as vscode from "vscode";
import { Settings, TrackingPreset } from "../models";

/**
 * Settings panel interface
 */
export interface ISettingsPanel {
  initialize(): Promise<void>;
  show(): Promise<void>;
  updateSettings(settings: any): void;
  updatePresets(presets: TrackingPreset[]): void;
  onSettingsChange(
    handler: (settings: Partial<Settings>) => void
  ): vscode.Disposable;
  onPresetOperation(
    handler: (operation: PresetOperation) => void
  ): vscode.Disposable;
  showValidationErrors(errors: string[]): void;
  dispose(): void;
}

/**
 * Preset operation types
 */
export type PresetOperation =
  | { type: "create"; preset: Omit<TrackingPreset, "id" | "createdAt"> }
  | { type: "update"; id: string; updates: Partial<TrackingPreset> }
  | { type: "delete"; id: string }
  | { type: "duplicate"; id: string; newName: string }
  | { type: "apply"; id: string };

/**
 * Settings panel message types
 */
export type SettingsPanelMessage =
  | { command: "updateSettings"; settings: Partial<Settings> }
  | { command: "resetSettings"; scope: "global" | "workspace" }
  | { command: "exportSettings" }
  | { command: "importSettings" }
  | { command: "presetOperation"; operation: PresetOperation }
  | { command: "validatePreset"; preset: Partial<TrackingPreset> };

/**
 * Settings validation result
 */
export interface SettingsValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Settings panel configuration
 */
export interface SettingsPanelConfig {
  title: string;
  viewColumn: vscode.ViewColumn;
  enableScripts: boolean;
  retainContextWhenHidden: boolean;
}

/**
 * Enhanced settings panel for configuration management
 */
export class SettingsPanel implements ISettingsPanel {
  private panel: vscode.WebviewPanel | null = null;
  private config: SettingsPanelConfig;
  private currentSettings: Settings | null = null;
  private currentPresets: TrackingPreset[] = [];
  private validationErrors: string[] = [];
  private disposables: vscode.Disposable[] = [];

  private settingsChangeEmitter = new vscode.EventEmitter<Partial<Settings>>();
  private presetOperationEmitter = new vscode.EventEmitter<PresetOperation>();

  constructor(
    private context: vscode.ExtensionContext,
    config?: SettingsPanelConfig
  ) {
    this.config = config || DEFAULT_SETTINGS_PANEL_CONFIG;
  }

  public async initialize(): Promise<void> {
    // Settings panel initialization is done when show() is called
    // This method is here for consistency with other views
  }

  public async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(this.config.viewColumn);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "branchTimeTrackerSettings",
      this.config.title,
      this.config.viewColumn,
      {
        enableScripts: this.config.enableScripts,
        retainContextWhenHidden: this.config.retainContextWhenHidden,
      }
    );

    this.setupWebviewEventHandlers();
    this.updateWebviewContent();
  }

  public updateSettings(settings: any): void {
    this.currentSettings = settings;
    this.updateWebviewContent();
  }

  public updatePresets(presets: TrackingPreset[]): void {
    this.currentPresets = presets;
    this.updateWebviewContent();
  }

  public onSettingsChange(
    handler: (settings: Partial<Settings>) => void
  ): vscode.Disposable {
    return this.settingsChangeEmitter.event(handler);
  }

  public onPresetOperation(
    handler: (operation: PresetOperation) => void
  ): vscode.Disposable {
    return this.presetOperationEmitter.event(handler);
  }

  public showValidationErrors(errors: string[]): void {
    this.validationErrors = errors;
    this.updateWebviewContent();
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.settingsChangeEmitter.dispose();
    this.presetOperationEmitter.dispose();

    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }

  private setupWebviewEventHandlers(): void {
    if (!this.panel) return;

    const messageDisposable = this.panel.webview.onDidReceiveMessage(
      (message: SettingsPanelMessage) => {
        this.handleWebviewMessage(message);
      }
    );

    const disposeDisposable = this.panel.onDidDispose(() => {
      this.panel = null;
      this.dispose();
    });

    this.disposables.push(messageDisposable, disposeDisposable);
  }

  private handleWebviewMessage(message: SettingsPanelMessage): void {
    switch (message.command) {
      case "updateSettings":
        this.settingsChangeEmitter.fire(message.settings);
        break;
      case "presetOperation":
        this.presetOperationEmitter.fire(message.operation);
        break;
    }
  }

  private updateWebviewContent(): void {
    if (!this.panel) return;
    this.panel.webview.html = this.generateWebviewHtml();
  }

  private generateWebviewHtml(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${this.config.title}</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          .header h1 {
            color: var(--vscode-textLink-foreground);
          }
          .validation-errors {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
          }
          .validation-errors h3 {
            color: var(--vscode-errorForeground);
            margin: 0 0 10px 0;
          }
          .validation-errors li {
            color: var(--vscode-errorForeground);
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Branch Time Tracker Settings</h1>
        </div>
        ${this.generateValidationErrors()}
        <div>Settings panel content would go here...</div>
      </body>
      </html>
    `;
  }

  private generateValidationErrors(): string {
    if (this.validationErrors.length === 0) {
      return "";
    }

    const errorItems = this.validationErrors
      .map((error) => `<li>${this.escapeHtml(error)}</li>`)
      .join("");

    return `
      <div class="validation-errors">
        <h3>⚠️ Validation Errors</h3>
        <ul>
          ${errorItems}
        </ul>
      </div>
    `;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

/**
 * Default settings panel configuration
 */
export const DEFAULT_SETTINGS_PANEL_CONFIG: SettingsPanelConfig = {
  title: "Branch Time Tracker Settings",
  viewColumn: vscode.ViewColumn.One,
  enableScripts: true,
  retainContextWhenHidden: true,
};
