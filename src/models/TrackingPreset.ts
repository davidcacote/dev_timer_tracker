/**
 * Represents a customizable tracking preset
 */
export interface TrackingPreset {
    /** Unique identifier for the preset */
    id: string;
    /** Human-readable name */
    name: string;
    /** Optional description */
    description: string;
    /** Preset settings */
    settings: PresetSettings;
    /** Creation timestamp */
    createdAt: string;
    /** Last used timestamp */
    lastUsed: string;
}

/**
 * Settings that can be configured in a preset
 */
export interface PresetSettings {
    /** Update interval in milliseconds */
    updateInterval: number;
    /** Whether auto-refresh is enabled */
    autoRefresh: boolean;
    /** Display format for time */
    displayFormat: string;
    /** Whether tracking is enabled */
    trackingEnabled: boolean;
}

/**
 * Preset validation result
 */
export interface PresetValidationResult {
    /** Whether the preset is valid */
    isValid: boolean;
    /** Validation errors if any */
    errors: string[];
}