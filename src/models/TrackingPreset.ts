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

/**
 * Create a new TrackingPreset with default values
 * @param name Preset name
 * @param description Optional description
 * @returns New TrackingPreset object
 */
export function createTrackingPreset(name: string, description: string = ''): TrackingPreset {
    return {
        id: generatePresetId(),
        name: name.trim(),
        description: description.trim(),
        settings: createDefaultPresetSettings(),
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
    };
}

/**
 * Create default preset settings
 * @returns Default PresetSettings object
 */
export function createDefaultPresetSettings(): PresetSettings {
    return {
        updateInterval: 1000, // 1 second
        autoRefresh: true,
        displayFormat: 'hm', // hours and minutes
        trackingEnabled: true
    };
}

/**
 * Compare two presets for equality
 * @param preset1 First preset
 * @param preset2 Second preset
 * @returns True if presets are equivalent
 */
export function comparePresets(preset1: TrackingPreset, preset2: TrackingPreset): boolean {
    return (
        preset1.name === preset2.name &&
        preset1.description === preset2.description &&
        comparePresetSettings(preset1.settings, preset2.settings)
    );
}

/**
 * Compare two preset settings for equality
 * @param settings1 First settings
 * @param settings2 Second settings
 * @returns True if settings are equivalent
 */
export function comparePresetSettings(settings1: PresetSettings, settings2: PresetSettings): boolean {
    return (
        settings1.updateInterval === settings2.updateInterval &&
        settings1.autoRefresh === settings2.autoRefresh &&
        settings1.displayFormat === settings2.displayFormat &&
        settings1.trackingEnabled === settings2.trackingEnabled
    );
}

/**
 * Merge preset settings with overrides
 * @param baseSettings Base settings
 * @param overrides Settings to override
 * @returns Merged settings
 */
export function mergePresetSettings(baseSettings: PresetSettings, overrides: Partial<PresetSettings>): PresetSettings {
    return {
        updateInterval: overrides.updateInterval ?? baseSettings.updateInterval,
        autoRefresh: overrides.autoRefresh ?? baseSettings.autoRefresh,
        displayFormat: overrides.displayFormat ?? baseSettings.displayFormat,
        trackingEnabled: overrides.trackingEnabled ?? baseSettings.trackingEnabled
    };
}

/**
 * Clone a tracking preset
 * @param preset Preset to clone
 * @param newName Optional new name for the clone
 * @returns Cloned preset with new ID
 */
export function clonePreset(preset: TrackingPreset, newName?: string): TrackingPreset {
    return {
        id: generatePresetId(),
        name: newName || `${preset.name} (Copy)`,
        description: preset.description,
        settings: { ...preset.settings },
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
    };
}

/**
 * Update preset last used timestamp
 * @param preset Preset to update
 * @returns Updated preset
 */
export function updatePresetLastUsed(preset: TrackingPreset): TrackingPreset {
    return {
        ...preset,
        lastUsed: new Date().toISOString()
    };
}

/**
 * Serialize preset to JSON string
 * @param preset Preset to serialize
 * @returns JSON string
 */
export function serializePreset(preset: TrackingPreset): string {
    return JSON.stringify(preset, null, 2);
}

/**
 * Deserialize preset from JSON string
 * @param jsonString JSON string to deserialize
 * @returns Parsed preset or null if invalid
 */
export function deserializePreset(jsonString: string): TrackingPreset | null {
    try {
        const parsed = JSON.parse(jsonString);
        // Basic validation - full validation should use validateTrackingPreset
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.name && parsed.settings) {
            return parsed as TrackingPreset;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Generate a unique preset ID
 * @returns Unique ID string
 */
function generatePresetId(): string {
    return `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}