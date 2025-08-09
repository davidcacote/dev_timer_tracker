import { GlobalSettings, WorkspaceSettings, Settings, ConfigScope } from '../models/Settings';
import { TrackingPreset } from '../models/TrackingPreset';

/**
 * Configuration manager interface
 */
export interface IConfigurationManager {
    /**
     * Get global settings
     * @returns Global settings
     */
    getGlobalSettings(): GlobalSettings;

    /**
     * Get workspace-specific settings
     * @returns Workspace settings
     */
    getWorkspaceSettings(): WorkspaceSettings | null;

    /**
     * Get effective settings (workspace overrides global)
     * @returns Combined settings
     */
    getEffectiveSettings(): Settings;

    /**
     * Save settings
     * @param settings Settings to save
     * @param scope Configuration scope
     */
    saveSettings(settings: Partial<Settings>, scope: ConfigScope): Promise<void>;

    /**
     * Get active preset
     * @returns Active preset or null
     */
    getActivePreset(): TrackingPreset | null;

    /**
     * Apply a preset
     * @param preset Preset to apply
     */
    applyPreset(preset: TrackingPreset): Promise<void>;

    /**
     * Get preset manager
     * @returns Preset manager instance
     */
    getPresetManager(): IPresetManager;

    /**
     * Initialize configuration manager
     * @param workspaceFolder Current workspace folder
     */
    initialize(workspaceFolder?: string): Promise<void>;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Preset manager interface
 */
export interface IPresetManager {
    /**
     * Get all available presets
     * @returns Array of presets
     */
    getAllPresets(): TrackingPreset[];

    /**
     * Get preset by ID
     * @param id Preset ID
     * @returns Preset or null if not found
     */
    getPreset(id: string): TrackingPreset | null;

    /**
     * Create a new preset
     * @param preset Preset data
     * @returns Created preset
     */
    createPreset(preset: Omit<TrackingPreset, 'id' | 'createdAt'>): Promise<TrackingPreset>;

    /**
     * Update existing preset
     * @param id Preset ID
     * @param updates Partial preset updates
     * @returns Updated preset
     */
    updatePreset(id: string, updates: Partial<TrackingPreset>): Promise<TrackingPreset>;

    /**
     * Delete preset
     * @param id Preset ID
     */
    deletePreset(id: string): Promise<void>;

    /**
     * Duplicate preset
     * @param id Preset ID to duplicate
     * @param newName Name for the duplicate
     * @returns Duplicated preset
     */
    duplicatePreset(id: string, newName: string): Promise<TrackingPreset>;

    /**
     * Validate preset
     * @param preset Preset to validate
     * @returns Validation result
     */
    validatePreset(preset: Partial<TrackingPreset>): { isValid: boolean; errors: string[] };
}

/**
 * Configuration change event
 */
export interface ConfigurationChangeEvent {
    /** Configuration scope that changed */
    scope: ConfigScope;
    /** Changed setting keys */
    changedKeys: string[];
    /** Previous settings */
    previousSettings: Settings;
    /** New settings */
    newSettings: Settings;
}