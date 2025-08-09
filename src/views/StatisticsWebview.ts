import * as vscode from 'vscode';
import { StatisticsData, StatisticsFilters } from '../models';

/**
 * Statistics webview interface
 */
export interface IStatisticsWebview {
    /**
     * Show the webview panel
     */
    show(): Promise<void>;

    /**
     * Update webview with new data
     * @param data Statistics data
     */
    update(data: StatisticsData): void;

    /**
     * Apply filters to the display
     * @param filters Statistics filters
     */
    applyFilters(filters: StatisticsFilters): void;

    /**
     * Handle user actions from webview
     */
    handleUserActions(): void;

    /**
     * Refresh the webview content
     */
    refresh(): void;

    /**
     * Check if webview is visible
     * @returns True if visible
     */
    isVisible(): boolean;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Webview message types
 */
export type WebviewMessage = 
    | { command: 'refresh' }
    | { command: 'setAutoRefresh'; enabled: boolean; interval: number }
    | { command: 'togglePause' }
    | { command: 'exportData'; format: 'csv' | 'json' }
    | { command: 'importData' }
    | { command: 'applyFilters'; filters: StatisticsFilters }
    | { command: 'resetFilters' }
    | { command: 'sortBy'; field: string; order: 'asc' | 'desc' };

/**
 * Webview configuration
 */
export interface WebviewConfig {
    /** Webview title */
    title: string;
    /** View column */
    viewColumn: vscode.ViewColumn;
    /** Enable scripts */
    enableScripts: boolean;
    /** Retain context when hidden */
    retainContextWhenHidden: boolean;
    /** Local resource roots */
    localResourceRoots?: vscode.Uri[];
}

/**
 * Webview theme
 */
export interface WebviewTheme {
    /** Primary color */
    primaryColor: string;
    /** Secondary color */
    secondaryColor: string;
    /** Background color */
    backgroundColor: string;
    /** Text color */
    textColor: string;
    /** Border color */
    borderColor: string;
}