import * as vscode from 'vscode';
import { BranchTime, BranchStatistics, StatusBarData } from '../models';
import { GlobalSettings } from '../models/Settings';
import { ITimerService } from './TimerService';
import { IGitService } from './GitService';
import { IStorageService } from './StorageService';
import { IExportImportService } from './ExportImportService';
import { ExportFormat } from '../models/ExportData';
import { getCurrentTimestamp, calculateTimePercentage } from '../utils/timeUtils';
import { createBranchTime } from '../utils/timeUtils';

/**
 * Tracking engine interface for main workflow coordination
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
     * Update current branch time (for periodic saves)
     */
    updateCurrentBranchTime(): void;

    /**
     * Get branch statistics
     * @returns Calculated statistics
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
     * Start tracking
     */
    startTracking(): Promise<void>;

    /**
     * Stop tracking
     */
    stopTracking(): void;

    /**
     * Pause tracking
     */
    pauseTracking(): void;

    /**
     * Resume tracking
     */
    resumeTracking(): void;

    /**
     * Get current tracking state
     */
    getTrackingState(): TrackingState;

    /**
     * Get all branch times
     */
    getBranchTimes(): Map<string, BranchTime>;

    /**
     * Force save current data
     */
    forceSave(): Promise<void>;

    /**
     * Register state change callback
     */
    onStateChange(callback: (state: TrackingState) => void): vscode.Disposable;

    /**
     * Register time update callback
     */
    onTimeUpdate(callback: (branch: string, time: number) => void): vscode.Disposable;

    /**
     * Register branch change callback
     */
    onBranchChange(callback: (newBranch: string, oldBranch: string | null) => void): vscode.Disposable;

    /**
     * Register error callback
     */
    onError(callback: (error: Error) => void): vscode.Disposable;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Tracking state information
 */
export interface TrackingState {
    /** Whether tracking is active */
    isActive: boolean;
    /** Whether tracking is paused */
    isPaused: boolean;
    /** Current branch being tracked */
    currentBranch: string | null;
    /** Current session time in seconds */
    currentSessionTime: number;
    /** Total time for current branch */
    currentBranchTime: number;
    /** Last update timestamp */
    lastUpdate: string;
    /** Error message if any */
    error: string | null;
}

/**
 * Tracking engine events
 */
export interface TrackingEngineEvents {
    /** Emitted when tracking state changes */
    stateChanged: (state: TrackingState) => void;
    /** Emitted when branch time is updated */
    timeUpdated: (branch: string, time: number) => void;
    /** Emitted when branch changes */
    branchChanged: (newBranch: string, oldBranch: string | null) => void;
    /** Emitted when error occurs */
    error: (error: Error) => void;
}

/**
 * Main tracking engine that orchestrates all services
 */
export class TrackingEngine implements ITrackingEngine {
    private timerService: ITimerService;
    private gitService: IGitService;
    private storageService: IStorageService;
    private exportImportService: IExportImportService;
    
    private branchTimes: Map<string, BranchTime> = new Map();
    private isInitialized: boolean = false;
    private isDisposed: boolean = false;
    private currentBranch: string | null = null;
    private lastError: string | null = null;
    
    // Event callbacks
    private stateChangeCallbacks: Array<(state: TrackingState) => void> = [];
    private timeUpdateCallbacks: Array<(branch: string, time: number) => void> = [];
    private branchChangeCallbacks: Array<(newBranch: string, oldBranch: string | null) => void> = [];
    private errorCallbacks: Array<(error: Error) => void> = [];
    
    // Auto-save timer
    private autoSaveTimer: NodeJS.Timeout | null = null;
    private readonly autoSaveInterval = 30000; // 30 seconds

    constructor(
        timerService: ITimerService,
        gitService: IGitService,
        storageService: IStorageService,
        exportImportService: IExportImportService
    ) {
        this.timerService = timerService;
        this.gitService = gitService;
        this.storageService = storageService;
        this.exportImportService = exportImportService;
    }

    /**
     * Initialize the tracking engine
     */
    async initialize(): Promise<void> {
        if (this.isInitialized || this.isDisposed) {
            return;
        }

        try {
            // Load existing branch times from storage
            this.branchTimes = await this.storageService.loadBranchTimes();
            
            // Update timer service with loaded data
            this.timerService.updateBranchTimes(this.branchTimes);

            // Set up git service branch change monitoring
            this.gitService.watchBranchChanges(async (newBranch: string) => {
                await this.handleBranchChange(newBranch);
            });

            // Get current branch and start tracking
            const currentBranch = await this.gitService.getCurrentBranch();
            if (currentBranch) {
                await this.handleBranchChange(currentBranch);
            }

            // Set up auto-save timer
            this.setupAutoSave();

            this.isInitialized = true;
            this.notifyStateChange();

        } catch (error) {
            this.lastError = `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
            throw error;
        }
    }

    /**
     * Handle branch change event
     */
    async handleBranchChange(newBranch: string): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        try {
            const oldBranch = this.currentBranch;
            
            // Skip if same branch
            if (newBranch === oldBranch) {
                return;
            }

            this.currentBranch = newBranch;

            // Initialize branch time if it doesn't exist
            if (!this.branchTimes.has(newBranch)) {
                this.branchTimes.set(newBranch, createBranchTime());
            }

            // Start tracking the new branch
            this.timerService.startTracking(newBranch);

            // Save data after branch change
            await this.saveBranchTimes();

            // Notify callbacks
            this.notifyBranchChange(newBranch, oldBranch);
            this.notifyStateChange();

            this.lastError = null; // Clear any previous errors

        } catch (error) {
            this.lastError = `Branch change failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
        }
    }

    /**
     * Update current branch time (for periodic saves)
     */
    updateCurrentBranchTime(): void {
        if (this.isDisposed || !this.currentBranch) {
            return;
        }

        try {
            this.timerService.updateCurrentBranchTime();
            this.notifyStateChange();
        } catch (error) {
            this.lastError = `Time update failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
        }
    }

    /**
     * Get branch statistics
     */
    getBranchStatistics(): BranchStatistics {
        const totalTime = Array.from(this.branchTimes.values())
            .reduce((sum, branchTime) => sum + branchTime.seconds, 0);
        
        const branchCount = this.branchTimes.size;
        
        // Find most active branch
        let mostActiveBranch: string | null = null;
        let maxTime = 0;
        
        this.branchTimes.forEach((branchTime, branchName) => {
            if (branchTime.seconds > maxTime) {
                maxTime = branchTime.seconds;
                mostActiveBranch = branchName;
            }
        });

        // Calculate switching frequency (simplified - switches per day based on session count)
        const totalSessions = Array.from(this.branchTimes.values())
            .reduce((sum, branchTime) => sum + branchTime.sessionCount, 0);
        
        // Estimate switching frequency based on total sessions and time
        const switchingFrequency = totalTime > 0 ? (totalSessions / (totalTime / 86400)) : 0; // switches per day

        return {
            totalTime,
            branchCount,
            mostActiveBranch,
            switchingFrequency: Math.round(switchingFrequency * 100) / 100 // Round to 2 decimal places
        };
    }

    /**
     * Export data in specified format
     */
    async exportData(format: ExportFormat): Promise<string> {
        try {
            // Get current data including any active session time
            const currentData = new Map(this.branchTimes);
            
            // Add current session time if tracking is active
            if (this.currentBranch) {
                const currentTime = this.timerService.getCurrentTime(this.currentBranch);
                const branchTime = currentData.get(this.currentBranch) || createBranchTime();
                currentData.set(this.currentBranch, {
                    ...branchTime,
                    seconds: currentTime,
                    lastUpdated: getCurrentTimestamp()
                });
            }

            if (format === 'csv') {
                return this.exportImportService.exportToCSV(currentData);
            } else if (format === 'json') {
                // Use the service to prepare export data with proper structure
                const exportData = this.exportImportService.prepareExportData(currentData, {});
                return this.exportImportService.exportToJSON(exportData);
            } else {
                throw new Error(`Unsupported export format: ${format}`);
            }
        } catch (error) {
            this.lastError = `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
            throw error;
        }
    }

    /**
     * Import data from string
     */
    async importData(data: string, format: ExportFormat): Promise<void> {
        try {
            let importedBranchTimes: Map<string, BranchTime>;

            if (format === 'csv') {
                importedBranchTimes = await this.exportImportService.importFromCSV(data);
            } else if (format === 'json') {
                const importedData = await this.exportImportService.importFromJSON(data);
                importedBranchTimes = new Map(Object.entries(importedData.branchTimes));
            } else {
                throw new Error(`Unsupported import format: ${format}`);
            }

            // Replace current data with imported data
            this.branchTimes = importedBranchTimes;
            
            // Update timer service with new data
            this.timerService.updateBranchTimes(this.branchTimes);

            // Save imported data
            await this.saveBranchTimes();

            // Restart tracking with current branch if available
            if (this.currentBranch && this.branchTimes.has(this.currentBranch)) {
                this.timerService.startTracking(this.currentBranch);
            }

            this.notifyStateChange();
            this.lastError = null;

        } catch (error) {
            this.lastError = `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
            throw error;
        }
    }

    /**
     * Start tracking
     */
    async startTracking(): Promise<void> {
        try {
            if (!this.currentBranch) {
                const branch = await this.gitService.getCurrentBranch();
                if (branch) {
                    await this.handleBranchChange(branch);
                } else {
                    throw new Error('No active branch found');
                }
            } else {
                this.timerService.startTracking(this.currentBranch);
            }

            this.notifyStateChange();
            this.lastError = null;

        } catch (error) {
            this.lastError = `Start tracking failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
            throw error;
        }
    }

    /**
     * Stop tracking
     */
    stopTracking(): void {
        try {
            this.timerService.stopTracking();
            this.notifyStateChange();
            this.lastError = null;
        } catch (error) {
            this.lastError = `Stop tracking failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
        }
    }

    /**
     * Pause tracking
     */
    pauseTracking(): void {
        try {
            this.timerService.pauseTracking();
            this.notifyStateChange();
            this.lastError = null;
        } catch (error) {
            this.lastError = `Pause tracking failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
        }
    }

    /**
     * Resume tracking
     */
    resumeTracking(): void {
        try {
            this.timerService.resumeTracking();
            this.notifyStateChange();
            this.lastError = null;
        } catch (error) {
            this.lastError = `Resume tracking failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
        }
    }

    /**
     * Get current tracking state
     */
    getTrackingState(): TrackingState {
        const sessionStats = this.timerService.getCurrentSessionStats();
        const currentBranchTime = this.currentBranch ? this.timerService.getCurrentTime(this.currentBranch) : 0;

        return {
            isActive: this.currentBranch !== null && sessionStats.isActive,
            isPaused: this.timerService.isTrackingPaused(),
            currentBranch: this.currentBranch,
            currentSessionTime: sessionStats.sessionTime,
            currentBranchTime: currentBranchTime,
            lastUpdate: getCurrentTimestamp(),
            error: this.lastError
        };
    }

    /**
     * Get all branch times
     */
    getBranchTimes(): Map<string, BranchTime> {
        return new Map(this.branchTimes);
    }

    /**
     * Force save current data
     */
    async forceSave(): Promise<void> {
        try {
            await this.saveBranchTimes();
            this.lastError = null;
        } catch (error) {
            this.lastError = `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.notifyError(error as Error);
            throw error;
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;

        // Clear auto-save timer
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }

        // Dispose services
        this.timerService.dispose();
        this.gitService.dispose();
        this.storageService.dispose();

        // Clear callbacks
        this.stateChangeCallbacks = [];
        this.timeUpdateCallbacks = [];
        this.branchChangeCallbacks = [];
        this.errorCallbacks = [];

        this.isInitialized = false;
    }

    /**
     * Register state change callback
     */
    onStateChange(callback: (state: TrackingState) => void): vscode.Disposable {
        this.stateChangeCallbacks.push(callback);
        return new vscode.Disposable(() => {
            const index = this.stateChangeCallbacks.indexOf(callback);
            if (index !== -1) {
                this.stateChangeCallbacks.splice(index, 1);
            }
        });
    }

    /**
     * Register time update callback
     */
    onTimeUpdate(callback: (branch: string, time: number) => void): vscode.Disposable {
        this.timeUpdateCallbacks.push(callback);
        return new vscode.Disposable(() => {
            const index = this.timeUpdateCallbacks.indexOf(callback);
            if (index !== -1) {
                this.timeUpdateCallbacks.splice(index, 1);
            }
        });
    }

    /**
     * Register branch change callback
     */
    onBranchChange(callback: (newBranch: string, oldBranch: string | null) => void): vscode.Disposable {
        this.branchChangeCallbacks.push(callback);
        return new vscode.Disposable(() => {
            const index = this.branchChangeCallbacks.indexOf(callback);
            if (index !== -1) {
                this.branchChangeCallbacks.splice(index, 1);
            }
        });
    }

    /**
     * Register error callback
     */
    onError(callback: (error: Error) => void): vscode.Disposable {
        this.errorCallbacks.push(callback);
        return new vscode.Disposable(() => {
            const index = this.errorCallbacks.indexOf(callback);
            if (index !== -1) {
                this.errorCallbacks.splice(index, 1);
            }
        });
    }

    /**
     * Set up auto-save timer
     */
    private setupAutoSave(): void {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        this.autoSaveTimer = setInterval(async () => {
            try {
                await this.saveBranchTimes();
            } catch (error) {
                console.error('Auto-save failed:', error);
                // Don't notify error for auto-save failures to avoid spam
            }
        }, this.autoSaveInterval);
    }

    /**
     * Save branch times to storage
     */
    private async saveBranchTimes(): Promise<void> {
        await this.storageService.saveBranchTimes(this.branchTimes);
    }

    /**
     * Notify state change callbacks
     */
    private notifyStateChange(): void {
        const state = this.getTrackingState();
        this.stateChangeCallbacks.forEach(callback => {
            try {
                callback(state);
            } catch (error) {
                console.error('Error in state change callback:', error);
            }
        });
    }

    /**
     * Notify time update callbacks
     */
    private notifyTimeUpdate(branch: string, time: number): void {
        this.timeUpdateCallbacks.forEach(callback => {
            try {
                callback(branch, time);
            } catch (error) {
                console.error('Error in time update callback:', error);
            }
        });
    }

    /**
     * Notify branch change callbacks
     */
    private notifyBranchChange(newBranch: string, oldBranch: string | null): void {
        this.branchChangeCallbacks.forEach(callback => {
            try {
                callback(newBranch, oldBranch);
            } catch (error) {
                console.error('Error in branch change callback:', error);
            }
        });
    }

    /**
     * Notify error callbacks
     */
    private notifyError(error: Error): void {
        this.errorCallbacks.forEach(callback => {
            try {
                callback(error);
            } catch (callbackError) {
                console.error('Error in error callback:', callbackError);
            }
        });
    }
}