import * as vscode from 'vscode';
import { StatusBarData } from '../models';
import { formatTime } from '../utils';

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

/**
 * Enhanced status bar view implementation with improved UX
 */
export class StatusBarView implements IStatusBarView {
    private statusBarItem: vscode.StatusBarItem;
    private config: StatusBarConfig;
    private theme: StatusBarTheme;
    private highlightTimeout: NodeJS.Timeout | null = null;
    private updateDebounceTimeout: NodeJS.Timeout | null = null;
    private lastUpdateData: StatusBarData | null = null;
    private clickHandler: (() => void) | null = null;

    constructor(config: StatusBarConfig, theme?: StatusBarTheme) {
        this.config = config;
        this.theme = theme || {};
        
        this.statusBarItem = vscode.window.createStatusBarItem(
            config.alignment,
            config.priority
        );
        
        this.statusBarItem.command = config.command;
        this.setupInitialState();
    }

    /**
     * Set up initial status bar state
     */
    private setupInitialState(): void {
        this.statusBarItem.backgroundColor = this.theme.normalBackground;
        this.statusBarItem.show();
    }

    /**
     * Update status bar with new data (with debouncing)
     */
    public update(data: StatusBarData): void {
        // Clear any pending update
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
        }

        // Debounce updates to prevent excessive re-renders
        this.updateDebounceTimeout = setTimeout(() => {
            this.performUpdate(data);
        }, 100);
    }

    /**
     * Perform the actual status bar update
     */
    private performUpdate(data: StatusBarData): void {
        // Skip update if data hasn't changed
        if (this.lastUpdateData && this.isDataEqual(data, this.lastUpdateData)) {
            return;
        }

        this.lastUpdateData = { ...data };

        if (data.isLoading) {
            this.showLoadingState();
            return;
        }

        if (data.error) {
            this.showErrorState(data.error);
            return;
        }

        this.showNormalState(data);
    }

    /**
     * Show loading state
     */
    public showLoading(): void {
        this.showLoadingState();
    }

    /**
     * Show loading state implementation
     */
    private showLoadingState(): void {
        this.statusBarItem.text = '$(loading~spin) Loading branch time...';
        this.statusBarItem.tooltip = 'Loading branch time data...';
        this.statusBarItem.backgroundColor = this.theme.normalBackground;
    }

    /**
     * Show error state
     */
    public showError(message: string): void {
        this.showErrorState(message);
    }

    /**
     * Show error state implementation
     */
    private showErrorState(message: string): void {
        const icon = '$(error)';
        this.statusBarItem.text = `${icon} ${message}`;
        this.statusBarItem.tooltip = `Error: ${message}\nClick for more details`;
        this.statusBarItem.backgroundColor = this.theme.errorBackground;
    }

    /**
     * Show normal tracking state
     */
    private showNormalState(data: StatusBarData): void {
        if (!data.currentBranch) {
            this.statusBarItem.text = '$(error) No active branch';
            this.statusBarItem.tooltip = 'No active git branch detected.';
            this.statusBarItem.backgroundColor = this.theme.warningBackground;
            return;
        }

        const icon = this.getStatusIcon(data);
        const formattedTime = formatTime(data.currentTime, this.config.showSeconds);
        const pauseStatus = data.isPaused && this.config.showPauseIndicator ? '[PAUSED] ' : '';
        
        this.statusBarItem.text = `${icon} ${pauseStatus}${formattedTime} on ${data.currentBranch}`;
        this.statusBarItem.tooltip = this.buildTooltip(data, formattedTime);
        this.statusBarItem.backgroundColor = data.isPaused ? 
            this.theme.warningBackground : 
            this.theme.normalBackground;
    }

    /**
     * Get appropriate status icon based on state
     */
    private getStatusIcon(data: StatusBarData): string {
        if (data.isPaused) {
            return '$(debug-pause)';
        }
        return '$(watch)';
    }

    /**
     * Build comprehensive tooltip
     */
    private buildTooltip(data: StatusBarData, formattedTime: string): string {
        const lines: string[] = [];
        
        if (data.isPaused) {
            lines.push('⏸️ Tracking Paused');
        }
        
        lines.push(`Spent ${formattedTime} on branch "${data.currentBranch}"`);
        lines.push('Click for detailed statistics');
        
        return lines.join('\n');
    }

    /**
     * Check if two StatusBarData objects are equal
     */
    private isDataEqual(a: StatusBarData, b: StatusBarData): boolean {
        return (
            a.currentBranch === b.currentBranch &&
            a.currentTime === b.currentTime &&
            a.isPaused === b.isPaused &&
            a.isLoading === b.isLoading &&
            a.error === b.error
        );
    }

    /**
     * Show the status bar item
     */
    public show(): void {
        this.statusBarItem.show();
    }

    /**
     * Hide the status bar item
     */
    public hide(): void {
        this.statusBarItem.hide();
    }

    /**
     * Set click handler for status bar item
     */
    public setClickHandler(handler: () => void): void {
        this.clickHandler = handler;
        // Note: VS Code handles clicks through the command property
        // This is kept for potential future use or testing
    }

    /**
     * Highlight status bar temporarily
     */
    public highlight(duration: number = 2000): void {
        // Clear any existing highlight
        if (this.highlightTimeout) {
            clearTimeout(this.highlightTimeout);
        }

        // Apply highlight
        this.statusBarItem.backgroundColor = this.theme.highlightBackground || 
            new vscode.ThemeColor('statusBarItem.warningBackground');

        // Remove highlight after duration
        this.highlightTimeout = setTimeout(() => {
            this.statusBarItem.backgroundColor = this.theme.normalBackground;
            this.highlightTimeout = null;
        }, duration);
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        if (this.highlightTimeout) {
            clearTimeout(this.highlightTimeout);
            this.highlightTimeout = null;
        }

        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
            this.updateDebounceTimeout = null;
        }

        this.statusBarItem.dispose();
    }
}

/**
 * Default status bar configuration
 */
export const DEFAULT_STATUS_BAR_CONFIG: StatusBarConfig = {
    alignment: vscode.StatusBarAlignment.Left,
    priority: 100,
    command: 'branch-time-tracker.showStats',
    showSeconds: false,
    showPauseIndicator: true
};

/**
 * Default status bar theme
 */
export const DEFAULT_STATUS_BAR_THEME: StatusBarTheme = {
    normalBackground: undefined,
    highlightBackground: new vscode.ThemeColor('statusBarItem.warningBackground'),
    errorBackground: new vscode.ThemeColor('statusBarItem.errorBackground'),
    warningBackground: new vscode.ThemeColor('statusBarItem.warningBackground')
};