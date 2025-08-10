import * as vscode from 'vscode';
import { GlobalSettings, WorkspaceSettings, Settings, ConfigScope } from '../models/Settings';
import { TrackingPreset, createTrackingPreset, clonePreset, updatePresetLastUsed } from '../models/TrackingPreset';
import { validateSettings, validateTrackingPreset } from '../utils/validationUtils';

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

    /**
     * Register configuration change listener
     * @param listener Configuration change listener
     * @returns Disposable to unregister the listener
     */
    onConfigurationChanged(listener: (event: ConfigurationChangeEvent) => void): vscode.Disposable;
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

/**
 * Default global settings
 */
const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
    updateInterval: 1000,
    autoRefreshEnabled: true,
    defaultExportFormat: 'json',
    backupEnabled: true,
    maxBackups: 5,
    theme: 'auto'
};

/**
 * Configuration manager implementation
 */
export class ConfigurationManager implements IConfigurationManager {
    private globalSettings: GlobalSettings;
    private workspaceSettings: WorkspaceSettings | null = null;
    private activePreset: TrackingPreset | null = null;
    private presetManager: PresetManager;
    private context: vscode.ExtensionContext;
    private workspaceFolder?: string;
    private configurationChangeEmitter = new vscode.EventEmitter<ConfigurationChangeEvent>();
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS };
        this.presetManager = new PresetManager(context);
        
        // Listen for VS Code configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(this.handleVSCodeConfigurationChange.bind(this))
        );
    }

    async initialize(workspaceFolder?: string): Promise<void> {
        this.workspaceFolder = workspaceFolder;
        
        // Load global settings
        await this.loadGlobalSettings();
        
        // Load workspace settings if workspace is available
        if (workspaceFolder) {
            await this.loadWorkspaceSettings(workspaceFolder);
        }
        
        // Initialize preset manager
        await this.presetManager.initialize();
        
        // Load active preset
        await this.loadActivePreset();
    }

    getGlobalSettings(): GlobalSettings {
        return { ...this.globalSettings };
    }

    getWorkspaceSettings(): WorkspaceSettings | null {
        return this.workspaceSettings ? { ...this.workspaceSettings } : null;
    }

    getEffectiveSettings(): Settings {
        const effective: Settings = { ...this.globalSettings };
        
        if (this.workspaceSettings) {
            // Apply workspace overrides
            Object.keys(this.workspaceSettings).forEach(key => {
                if (key !== 'workspaceId' && key !== 'projectName' && key !== 'customPresets' && key !== 'trackingEnabled') {
                    const value = (this.workspaceSettings as any)[key];
                    if (value !== undefined) {
                        (effective as any)[key] = value;
                    }
                }
            });
            
            effective.workspace = {
                workspaceId: this.workspaceSettings.workspaceId,
                projectName: this.workspaceSettings.projectName,
                customPresets: [...this.workspaceSettings.customPresets],
                trackingEnabled: this.workspaceSettings.trackingEnabled
            };
        }
        
        return effective;
    }

    async saveSettings(settings: Partial<Settings>, scope: ConfigScope): Promise<void> {
        const previousSettings = this.getEffectiveSettings();
        
        if (scope === 'global') {
            await this.saveGlobalSettings(settings);
        } else {
            await this.saveWorkspaceSettings(settings);
        }
        
        const newSettings = this.getEffectiveSettings();
        const changedKeys = this.getChangedKeys(previousSettings, newSettings);
        
        if (changedKeys.length > 0) {
            this.configurationChangeEmitter.fire({
                scope,
                changedKeys,
                previousSettings,
                newSettings
            });
        }
    }

    getActivePreset(): TrackingPreset | null {
        return this.activePreset ? { ...this.activePreset } : null;
    }

    async applyPreset(preset: TrackingPreset): Promise<void> {
        // Validate preset before applying
        const validation = this.presetManager.validatePreset(preset);
        if (!validation.isValid) {
            throw new Error(`Invalid preset: ${validation.errors.join(', ')}`);
        }
        
        // Update preset last used timestamp
        const updatedPreset = updatePresetLastUsed(preset);
        await this.presetManager.updatePreset(preset.id, { lastUsed: updatedPreset.lastUsed });
        
        // Apply preset settings to current configuration
        const settingsToApply: Partial<Settings> = {
            updateInterval: preset.settings.updateInterval,
            autoRefreshEnabled: preset.settings.autoRefresh
        };
        
        // Determine scope based on current context
        const scope: ConfigScope = this.workspaceFolder ? 'workspace' : 'global';
        await this.saveSettings(settingsToApply, scope);
        
        this.activePreset = updatedPreset;
        await this.saveActivePreset();
    }

    getPresetManager(): IPresetManager {
        return this.presetManager;
    }

    onConfigurationChanged(listener: (event: ConfigurationChangeEvent) => void): vscode.Disposable {
        return this.configurationChangeEmitter.event(listener);
    }

    /**
     * Switch to a different workspace
     * @param workspaceFolder New workspace folder path
     */
    async switchWorkspace(workspaceFolder?: string): Promise<void> {
        const previousSettings = this.getEffectiveSettings();
        
        // Clear current workspace settings
        this.workspaceSettings = null;
        this.workspaceFolder = workspaceFolder;
        
        // Load new workspace settings
        if (workspaceFolder) {
            await this.loadWorkspaceSettings(workspaceFolder);
        }
        
        const newSettings = this.getEffectiveSettings();
        const changedKeys = this.getChangedKeys(previousSettings, newSettings);
        
        if (changedKeys.length > 0) {
            this.configurationChangeEmitter.fire({
                scope: 'workspace',
                changedKeys,
                previousSettings,
                newSettings
            });
        }
    }

    /**
     * Get current workspace information
     * @returns Workspace info or null if no workspace
     */
    getCurrentWorkspaceInfo(): { 
        workspaceFolder?: string; 
        workspaceId?: string; 
        projectName?: string; 
        hasCustomSettings: boolean;
    } | null {
        if (!this.workspaceFolder) {
            return null;
        }
        
        return {
            workspaceFolder: this.workspaceFolder,
            workspaceId: this.workspaceSettings?.workspaceId,
            projectName: this.workspaceSettings?.projectName,
            hasCustomSettings: this.workspaceSettings !== null
        };
    }

    /**
     * Reset workspace settings to defaults
     * @returns Promise that resolves when reset is complete
     */
    async resetWorkspaceSettings(): Promise<void> {
        if (!this.workspaceFolder || !this.context.workspaceState) {
            return;
        }
        
        const previousSettings = this.getEffectiveSettings();
        const workspaceId = this.generateWorkspaceId(this.workspaceFolder);
        
        this.workspaceSettings = this.createDefaultWorkspaceSettings(workspaceId);
        await this.context.workspaceState.update('branchTimeTracker.workspaceSettings', this.workspaceSettings);
        
        const newSettings = this.getEffectiveSettings();
        const changedKeys = this.getChangedKeys(previousSettings, newSettings);
        
        if (changedKeys.length > 0) {
            this.configurationChangeEmitter.fire({
                scope: 'workspace',
                changedKeys,
                previousSettings,
                newSettings
            });
        }
    }

    /**
     * Check if current workspace has custom settings
     * @returns True if workspace has custom settings
     */
    hasWorkspaceCustomSettings(): boolean {
        if (!this.workspaceSettings) {
            return false;
        }
        
        // Check if any global settings are overridden
        const globalKeys: (keyof GlobalSettings)[] = [
            'updateInterval', 'autoRefreshEnabled', 'defaultExportFormat',
            'backupEnabled', 'maxBackups', 'theme'
        ];
        
        return globalKeys.some(key => (this.workspaceSettings as any)[key] !== undefined) ||
               (this.workspaceSettings.projectName !== undefined) ||
               (this.workspaceSettings.customPresets.length > 0);
    }

    /**
     * Export workspace configuration
     * @returns Workspace configuration as JSON string
     */
    exportWorkspaceConfiguration(): string | null {
        if (!this.workspaceSettings) {
            return null;
        }
        
        const exportData = {
            version: '0.4.0',
            exportedAt: new Date().toISOString(),
            workspaceSettings: this.workspaceSettings,
            customPresets: this.workspaceSettings.customPresets.map(id => 
                this.presetManager.getPreset(id)
            ).filter(preset => preset !== null)
        };
        
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Import workspace configuration
     * @param configJson JSON string containing workspace configuration
     * @returns Promise that resolves when import is complete
     */
    async importWorkspaceConfiguration(configJson: string): Promise<void> {
        if (!this.workspaceFolder || !this.context.workspaceState) {
            throw new Error('No active workspace for configuration import');
        }
        
        try {
            const importData = JSON.parse(configJson);
            
            if (!importData.workspaceSettings) {
                throw new Error('Invalid workspace configuration format');
            }
            
            // Validate workspace settings
            const validation = validateSettings(importData.workspaceSettings);
            if (!validation.isValid) {
                throw new Error(`Invalid workspace settings: ${validation.errors.join(', ')}`);
            }
            
            const previousSettings = this.getEffectiveSettings();
            
            // Update workspace ID to current workspace
            const workspaceId = this.generateWorkspaceId(this.workspaceFolder);
            importData.workspaceSettings.workspaceId = workspaceId;
            
            // Import custom presets if any
            if (importData.customPresets && Array.isArray(importData.customPresets)) {
                const importedPresetIds: string[] = [];
                
                for (const preset of importData.customPresets) {
                    if (preset) {
                        try {
                            const imported = await this.presetManager.createPreset({
                                name: `${preset.name} (Imported)`,
                                description: preset.description,
                                settings: preset.settings,
                                lastUsed: preset.lastUsed
                            });
                            importedPresetIds.push(imported.id);
                        } catch (error) {
                            console.warn(`Failed to import preset ${preset.name}:`, error);
                        }
                    }
                }
                
                importData.workspaceSettings.customPresets = importedPresetIds;
            }
            
            this.workspaceSettings = importData.workspaceSettings;
            await this.context.workspaceState.update('branchTimeTracker.workspaceSettings', this.workspaceSettings);
            
            const newSettings = this.getEffectiveSettings();
            const changedKeys = this.getChangedKeys(previousSettings, newSettings);
            
            if (changedKeys.length > 0) {
                this.configurationChangeEmitter.fire({
                    scope: 'workspace',
                    changedKeys,
                    previousSettings,
                    newSettings
                });
            }
            
        } catch (error) {
            throw new Error(`Failed to import workspace configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    dispose(): void {
        this.configurationChangeEmitter.dispose();
        this.disposables.forEach(d => d.dispose());
        this.presetManager.dispose();
    }

    private async loadGlobalSettings(): Promise<void> {
        const stored = this.context.globalState.get<GlobalSettings>('branchTimeTracker.globalSettings');
        if (stored) {
            // Validate and merge with defaults
            const validation = validateSettings(stored);
            if (validation.isValid) {
                this.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS, ...stored };
            } else {
                console.warn('Invalid global settings found, using defaults:', validation.errors);
                this.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS };
            }
        }
    }

    private async saveGlobalSettings(settings: Partial<Settings>): Promise<void> {
        // Extract only global settings
        const globalUpdates: Partial<GlobalSettings> = {};
        const globalKeys: (keyof GlobalSettings)[] = [
            'updateInterval', 'autoRefreshEnabled', 'defaultExportFormat',
            'backupEnabled', 'maxBackups', 'theme'
        ];
        
        globalKeys.forEach(key => {
            if (settings[key] !== undefined) {
                (globalUpdates as any)[key] = settings[key];
            }
        });
        
        this.globalSettings = { ...this.globalSettings, ...globalUpdates };
        await this.context.globalState.update('branchTimeTracker.globalSettings', this.globalSettings);
    }

    private async loadWorkspaceSettings(workspaceFolder: string): Promise<void> {
        if (!this.context.workspaceState) {
            return;
        }
        
        const workspaceId = this.generateWorkspaceId(workspaceFolder);
        const stored = this.context.workspaceState.get<WorkspaceSettings>('branchTimeTracker.workspaceSettings');
        
        if (stored && stored.workspaceId === workspaceId) {
            const validation = validateSettings(stored);
            if (validation.isValid) {
                this.workspaceSettings = stored;
            } else {
                console.warn('Invalid workspace settings found, creating new:', validation.errors);
                this.workspaceSettings = this.createDefaultWorkspaceSettings(workspaceId);
            }
        } else {
            this.workspaceSettings = this.createDefaultWorkspaceSettings(workspaceId);
        }
    }

    private async saveWorkspaceSettings(settings: Partial<Settings>): Promise<void> {
        if (!this.context.workspaceState || !this.workspaceSettings) {
            return;
        }
        
        // Extract workspace-specific settings
        const workspaceUpdates: Partial<WorkspaceSettings> = {};
        
        // Copy global setting overrides
        const globalKeys: (keyof GlobalSettings)[] = [
            'updateInterval', 'autoRefreshEnabled', 'defaultExportFormat',
            'backupEnabled', 'maxBackups', 'theme'
        ];
        
        globalKeys.forEach(key => {
            if (settings[key] !== undefined) {
                (workspaceUpdates as any)[key] = settings[key];
            }
        });
        
        // Copy workspace-specific settings
        if (settings.workspace) {
            if (settings.workspace.projectName !== undefined) {
                workspaceUpdates.projectName = settings.workspace.projectName;
            }
            if (settings.workspace.customPresets !== undefined) {
                workspaceUpdates.customPresets = [...settings.workspace.customPresets];
            }
            if (settings.workspace.trackingEnabled !== undefined) {
                workspaceUpdates.trackingEnabled = settings.workspace.trackingEnabled;
            }
        }
        
        this.workspaceSettings = { ...this.workspaceSettings, ...workspaceUpdates };
        await this.context.workspaceState.update('branchTimeTracker.workspaceSettings', this.workspaceSettings);
    }

    private async loadActivePreset(): Promise<void> {
        const presetId = this.context.globalState.get<string>('branchTimeTracker.activePresetId');
        if (presetId) {
            this.activePreset = this.presetManager.getPreset(presetId);
        }
    }

    private async saveActivePreset(): Promise<void> {
        const presetId = this.activePreset?.id || null;
        await this.context.globalState.update('branchTimeTracker.activePresetId', presetId);
    }

    private createDefaultWorkspaceSettings(workspaceId: string): WorkspaceSettings {
        return {
            workspaceId,
            customPresets: [],
            trackingEnabled: true
        };
    }

    private generateWorkspaceId(workspaceFolder: string): string {
        // Create a stable ID based on workspace folder path
        return Buffer.from(workspaceFolder).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    }

    private getChangedKeys(previous: Settings, current: Settings): string[] {
        const changed: string[] = [];
        
        // Check global settings
        Object.keys(DEFAULT_GLOBAL_SETTINGS).forEach(key => {
            if ((previous as any)[key] !== (current as any)[key]) {
                changed.push(key);
            }
        });
        
        // Check workspace settings
        const prevWorkspace = previous.workspace;
        const currWorkspace = current.workspace;
        
        if (prevWorkspace !== currWorkspace) {
            if (!prevWorkspace || !currWorkspace) {
                changed.push('workspace');
            } else {
                Object.keys(currWorkspace).forEach(key => {
                    if ((prevWorkspace as any)[key] !== (currWorkspace as any)[key]) {
                        changed.push(`workspace.${key}`);
                    }
                });
            }
        }
        
        return changed;
    }

    private async handleVSCodeConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
        if (event.affectsConfiguration('branchTimeTracker')) {
            // Reload settings from VS Code configuration
            await this.loadGlobalSettings();
            if (this.workspaceFolder) {
                await this.loadWorkspaceSettings(this.workspaceFolder);
            }
        }
    }
}

/**
 * Preset manager implementation
 */
class PresetManager implements IPresetManager {
    private presets: Map<string, TrackingPreset> = new Map();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async initialize(): Promise<void> {
        await this.loadPresets();
    }

    getAllPresets(): TrackingPreset[] {
        return Array.from(this.presets.values()).map(preset => ({ ...preset }));
    }

    getPreset(id: string): TrackingPreset | null {
        const preset = this.presets.get(id);
        return preset ? { ...preset } : null;
    }

    async createPreset(presetData: Omit<TrackingPreset, 'id' | 'createdAt'>): Promise<TrackingPreset> {
        const preset = createTrackingPreset(presetData.name, presetData.description);
        preset.settings = { ...presetData.settings };
        preset.lastUsed = presetData.lastUsed;
        
        // Validate preset
        const validation = this.validatePreset(preset);
        if (!validation.isValid) {
            throw new Error(`Invalid preset: ${validation.errors.join(', ')}`);
        }
        
        this.presets.set(preset.id, preset);
        await this.savePresets();
        
        return { ...preset };
    }

    async updatePreset(id: string, updates: Partial<TrackingPreset>): Promise<TrackingPreset> {
        const existing = this.presets.get(id);
        if (!existing) {
            throw new Error(`Preset with ID ${id} not found`);
        }
        
        const updated = { ...existing, ...updates };
        
        // Validate updated preset
        const validation = this.validatePreset(updated);
        if (!validation.isValid) {
            throw new Error(`Invalid preset update: ${validation.errors.join(', ')}`);
        }
        
        this.presets.set(id, updated);
        await this.savePresets();
        
        return { ...updated };
    }

    async deletePreset(id: string): Promise<void> {
        if (!this.presets.has(id)) {
            throw new Error(`Preset with ID ${id} not found`);
        }
        
        this.presets.delete(id);
        await this.savePresets();
    }

    async duplicatePreset(id: string, newName: string): Promise<TrackingPreset> {
        const existing = this.presets.get(id);
        if (!existing) {
            throw new Error(`Preset with ID ${id} not found`);
        }
        
        const duplicate = clonePreset(existing, newName);
        this.presets.set(duplicate.id, duplicate);
        await this.savePresets();
        
        return { ...duplicate };
    }

    validatePreset(preset: Partial<TrackingPreset>): { isValid: boolean; errors: string[] } {
        return validateTrackingPreset(preset);
    }

    /**
     * Get presets sorted by last used (most recent first)
     * @returns Sorted array of presets
     */
    getPresetsSortedByLastUsed(): TrackingPreset[] {
        return this.getAllPresets().sort((a, b) => 
            new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
        );
    }

    /**
     * Get presets sorted by name
     * @returns Sorted array of presets
     */
    getPresetsSortedByName(): TrackingPreset[] {
        return this.getAllPresets().sort((a, b) => 
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
    }

    /**
     * Search presets by name or description
     * @param query Search query
     * @returns Matching presets
     */
    searchPresets(query: string): TrackingPreset[] {
        const lowerQuery = query.toLowerCase();
        return this.getAllPresets().filter(preset =>
            preset.name.toLowerCase().includes(lowerQuery) ||
            preset.description.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Check if preset name is unique
     * @param name Preset name to check
     * @param excludeId Optional preset ID to exclude from check
     * @returns True if name is unique
     */
    isPresetNameUnique(name: string, excludeId?: string): boolean {
        const trimmedName = name.trim().toLowerCase();
        return !Array.from(this.presets.values()).some(preset =>
            preset.id !== excludeId && preset.name.trim().toLowerCase() === trimmedName
        );
    }

    /**
     * Get preset statistics
     * @returns Preset usage statistics
     */
    getPresetStatistics(): {
        totalPresets: number;
        mostRecentlyUsed: TrackingPreset | null;
        oldestPreset: TrackingPreset | null;
        averageSettingsValues: {
            updateInterval: number;
            autoRefresh: number; // percentage
            trackingEnabled: number; // percentage
        };
    } {
        const presets = this.getAllPresets();
        
        if (presets.length === 0) {
            return {
                totalPresets: 0,
                mostRecentlyUsed: null,
                oldestPreset: null,
                averageSettingsValues: {
                    updateInterval: 0,
                    autoRefresh: 0,
                    trackingEnabled: 0
                }
            };
        }

        const sortedByLastUsed = presets.sort((a, b) => 
            new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
        );
        
        const sortedByCreated = presets.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        const avgUpdateInterval = presets.reduce((sum, p) => sum + p.settings.updateInterval, 0) / presets.length;
        const autoRefreshCount = presets.filter(p => p.settings.autoRefresh).length;
        const trackingEnabledCount = presets.filter(p => p.settings.trackingEnabled).length;

        return {
            totalPresets: presets.length,
            mostRecentlyUsed: sortedByLastUsed[0],
            oldestPreset: sortedByCreated[0],
            averageSettingsValues: {
                updateInterval: Math.round(avgUpdateInterval),
                autoRefresh: Math.round((autoRefreshCount / presets.length) * 100),
                trackingEnabled: Math.round((trackingEnabledCount / presets.length) * 100)
            }
        };
    }

    dispose(): void {
        this.presets.clear();
    }

    private async loadPresets(): Promise<void> {
        const stored = this.context.globalState.get<TrackingPreset[]>('branchTimeTracker.presets', []);
        
        this.presets.clear();
        stored.forEach(preset => {
            const validation = this.validatePreset(preset);
            if (validation.isValid) {
                this.presets.set(preset.id, preset);
            } else {
                console.warn(`Invalid preset found and skipped: ${preset.name}`, validation.errors);
            }
        });
    }

    private async savePresets(): Promise<void> {
        const presetsArray = Array.from(this.presets.values());
        await this.context.globalState.update('branchTimeTracker.presets', presetsArray);
    }
}