/**
 * Configuration scope
 */
export type ConfigScope = 'global' | 'workspace';

/**
 * Global extension settings
 */
export interface GlobalSettings {
    /** Update interval in milliseconds */
    updateInterval: number;
    /** Whether auto-refresh is enabled */
    autoRefreshEnabled: boolean;
    /** Default export format */
    defaultExportFormat: 'csv' | 'json';
    /** Whether backup is enabled */
    backupEnabled: boolean;
    /** Maximum number of backups to keep */
    maxBackups: number;
    /** UI theme preference */
    theme: 'auto' | 'light' | 'dark';
}

/**
 * Workspace-specific settings (extends global settings)
 */
export interface WorkspaceSettings extends Partial<GlobalSettings> {
    /** Workspace identifier */
    workspaceId: string;
    /** Optional project name */
    projectName?: string;
    /** Custom presets for this workspace */
    customPresets: string[];
    /** Whether tracking is enabled for this workspace */
    trackingEnabled: boolean;
}

/**
 * Combined settings (workspace overrides global)
 */
export interface Settings extends GlobalSettings {
    /** Workspace-specific overrides */
    workspace?: Partial<WorkspaceSettings>;
}