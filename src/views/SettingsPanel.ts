import * as vscode from 'vscode';
import { Settings, TrackingPreset } from '../models';

/**
 * Settings panel interface
 */
export interface ISettingsPanel {
    /**
     * Show the settings panel
     */
    show(): Promise<void>;

    /**
     * Update settings display
     * @param settings Current settings
     */
    updateSettings(settings: Settings): void;

    /**
     * Update presets display
     * @param presets Available presets
     */
    updatePresets(presets: TrackingPreset[]): void;

    /**
     * Handle settings changes
     * @param handler Settings change handler
     */
    onSettingsChange(handler: (settings: Partial<Settings>) => void): vscode.Disposable;

    /**
     * Handle preset operations
     * @param handler Preset operation handler
     */
    onPresetOperation(handler: (operation: PresetOperation) => void): vscode.Disposable;

    /**
     * Show validation errors
     * @param errors Array of error messages
     */
    showValidationErrors(errors: string[]): void;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Preset operation types
 */
export type PresetOperation = 
    | { type: 'create'; preset: Omit<TrackingPreset, 'id' | 'createdAt'> }
    | { type: 'update'; id: string; updates: Partial<TrackingPreset> }
    | { type: 'delete'; id: string }
    | { type: 'duplicate'; id: string; newName: string }
    | { type: 'apply'; id: string };

/**
 * Settings panel message types
 */
export type SettingsPanelMessage = 
    | { command: 'updateSettings'; settings: Partial<Settings> }
    | { command: 'resetSettings'; scope: 'global' | 'workspace' }
    | { command: 'exportSettings' }
    | { command: 'importSettings' }
    | { command: 'presetOperation'; operation: PresetOperation }
    | { command: 'validatePreset'; preset: Partial<TrackingPreset> };

/**
 * Settings validation result
 */
export interface SettingsValidationResult {
    /** Whether settings are valid */
    isValid: boolean;
    /** Validation errors */
    errors: string[];
    /** Validation warnings */
    warnings: string[];
}