import * as vscode from 'vscode';
import { StatusBarData } from '../models';

/**
 * Status bar view interface
 */
export interface IStatusBarView {
    /**
     * Update status bar with new data
     * @param data Status bar data
     */
    update(data: StatusBarData): void;

    /**
     * Show the status bar item
     */
    show(): void;

    /**
     * Hide the status bar item
     */
    hide(): void;

    /**
     * Set click handler for status bar item
     * @param handler Click handler function
     */
    setClickHandler(handler: () => void): void;

    /**
     * Show loading state
     */
    showLoading(): void;

    /**
     * Show error state
     * @param message Error message
     */
    showError(message: string): void;

    /**
     * Highlight status bar temporarily
     * @param duration Highlight duration in milliseconds
     */
    highlight(duration?: number): void;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Status bar configuration
 */
export interface StatusBarConfig {
    /** Status bar alignment */
    alignment: vscode.StatusBarAlignment;
    /** Priority for positioning */
    priority: number;
    /** Command to execute on click */
    command: string;
    /** Show seconds in time display */
    showSeconds: boolean;
    /** Show pause indicator */
    showPauseIndicator: boolean;
}

/**
 * Status bar theme colors
 */
export interface StatusBarTheme {
    /** Normal background color */
    normalBackground?: vscode.ThemeColor;
    /** Highlight background color */
    highlightBackground?: vscode.ThemeColor;
    /** Error background color */
    errorBackground?: vscode.ThemeColor;
    /** Warning background color */
    warningBackground?: vscode.ThemeColor;
}