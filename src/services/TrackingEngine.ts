import { BranchStatistics, ExportFormat } from '../models';

/**
 * Main tracking engine interface
 */
export interface ITrackingEngine {
    /**
     * Initialize the tracking engine
     */
    initialize(): Promise<void>;

    /**
     * Handle branch change event
     * @param newBranch New branch name
     */
    handleBranchChange(newBranch: string): Promise<void>;

    /**
     * Update time for current branch
     */
    updateCurrentBranchTime(): void;

    /**
     * Get branch statistics
     * @returns Statistics data
     */
    getBranchStatistics(): BranchStatistics;

    /**
     * Export data in specified format
     * @param format Export format
     * @returns Exported data as string
     */
    exportData(format: ExportFormat): Promise<string>;

    /**
     * Import data from string
     * @param data Data to import
     * @param format Import format
     */
    importData(data: string, format: ExportFormat): Promise<void>;

    /**
     * Pause or resume tracking
     * @param paused Whether to pause tracking
     */
    setPaused(paused: boolean): Promise<void>;

    /**
     * Check if tracking is paused
     * @returns True if paused
     */
    isPaused(): boolean;

    /**
     * Get current branch name
     * @returns Current branch or null
     */
    getCurrentBranch(): string | null;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Tracking engine events
 */
export interface TrackingEngineEvents {
    /** Emitted when branch changes */
    branchChanged: (newBranch: string, oldBranch: string | null) => void;
    /** Emitted when time is updated */
    timeUpdated: (branch: string, totalTime: number) => void;
    /** Emitted when tracking is paused/resumed */
    pauseStateChanged: (isPaused: boolean) => void;
    /** Emitted when data is imported */
    dataImported: () => void;
    /** Emitted when error occurs */
    error: (error: Error) => void;
}