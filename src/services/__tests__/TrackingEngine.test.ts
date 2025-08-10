import { TrackingEngine, ITrackingEngine, TrackingState } from '../TrackingEngine';
import { ITimerService } from '../TimerService';
import { IGitService } from '../GitService';
import { IStorageService } from '../StorageService';
import { IExportImportService } from '../ExportImportService';
import { ExportFormat } from '../../models/ExportData';
import { BranchTime, BranchStatistics } from '../../models';
import { GlobalSettings } from '../../models/Settings';
import { createBranchTime } from '../../utils/timeUtils';

// Mock the dependencies
const mockTimerService: jest.Mocked<ITimerService> = {
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
    pauseTracking: jest.fn(),
    resumeTracking: jest.fn(),
    getCurrentTime: jest.fn(),
    isTrackingPaused: jest.fn(),
    getCurrentBranch: jest.fn(),
    getSessionStartTime: jest.fn(),
    getCurrentSessionStats: jest.fn(),
    updateCurrentBranchTime: jest.fn(),
    updateBranchTimes: jest.fn(),
    dispose: jest.fn()
};

const mockGitService: jest.Mocked<IGitService> = {
    getCurrentBranch: jest.fn(),
    watchBranchChanges: jest.fn(),
    isValidRepository: jest.fn(),
    getBranchHistory: jest.fn(),
    initialize: jest.fn(),
    dispose: jest.fn()
};

const mockStorageService: jest.Mocked<IStorageService> = {
    loadBranchTimes: jest.fn(),
    saveBranchTimes: jest.fn(),
    createBackup: jest.fn(),
    restoreFromBackup: jest.fn(),
    validateData: jest.fn(),
    getStorageStats: jest.fn(),
    initialize: jest.fn(),
    dispose: jest.fn()
};

const mockExportImportService: jest.Mocked<IExportImportService> = {
    exportToCSV: jest.fn(),
    exportToJSON: jest.fn(),
    importFromCSV: jest.fn(),
    importFromJSON: jest.fn(),
    validateImportData: jest.fn(),
    getSupportedFormats: jest.fn(),
    generateExportFilename: jest.fn(),
    prepareExportData: jest.fn()
};

// Mock vscode module
jest.mock('vscode', () => ({
    Disposable: jest.fn().mockImplementation((callback) => ({ dispose: callback }))
}));

describe('TrackingEngine', () => {
    let trackingEngine: ITrackingEngine;
    let branchChangeCallback: (branch: string) => void;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Set up default mock returns
        mockStorageService.loadBranchTimes.mockResolvedValue(new Map());
        mockGitService.getCurrentBranch.mockResolvedValue('main');
        mockGitService.watchBranchChanges.mockImplementation((callback) => {
            branchChangeCallback = callback;
            return { dispose: jest.fn() } as any;
        });
        mockTimerService.getCurrentSessionStats.mockReturnValue({
            sessionTime: 0,
            totalPausedTime: 0,
            isActive: false
        });
        mockTimerService.getCurrentTime.mockReturnValue(0);
        mockTimerService.getCurrentBranch.mockReturnValue(null);
        mockTimerService.isTrackingPaused.mockReturnValue(false);

        trackingEngine = new TrackingEngine(
            mockTimerService,
            mockGitService,
            mockStorageService,
            mockExportImportService
        );
    });

    afterEach(() => {
        trackingEngine.dispose();
    });

    describe('initialize', () => {
        it('should initialize successfully', async () => {
            await trackingEngine.initialize();

            expect(mockStorageService.loadBranchTimes).toHaveBeenCalled();
            expect(mockTimerService.updateBranchTimes).toHaveBeenCalled();
            expect(mockGitService.watchBranchChanges).toHaveBeenCalled();
            expect(mockGitService.getCurrentBranch).toHaveBeenCalled();
        });

        it('should handle initialization with existing branch', async () => {
            mockGitService.getCurrentBranch.mockResolvedValue('feature-branch');

            await trackingEngine.initialize();

            expect(mockTimerService.startTracking).toHaveBeenCalledWith('feature-branch');
        });

        it('should load existing branch times from storage', async () => {
            const existingBranchTimes = new Map([
                ['main', createBranchTime(1800)],
                ['feature', createBranchTime(900)]
            ]);
            mockStorageService.loadBranchTimes.mockResolvedValue(existingBranchTimes);

            await trackingEngine.initialize();

            expect(mockTimerService.updateBranchTimes).toHaveBeenCalledWith(existingBranchTimes);
        });

        it('should handle initialization errors', async () => {
            const error = new Error('Storage initialization failed');
            mockStorageService.loadBranchTimes.mockRejectedValue(error);

            await expect(trackingEngine.initialize()).rejects.toThrow(error);
        });
    });

    describe('handleBranchChange', () => {
        beforeEach(async () => {
            await trackingEngine.initialize();
        });

        it('should handle branch change to new branch', async () => {
            await trackingEngine.handleBranchChange('feature-branch');

            expect(mockTimerService.startTracking).toHaveBeenCalledWith('feature-branch');
            expect(mockStorageService.saveBranchTimes).toHaveBeenCalled();
        });

        it('should create branch time for new branch', async () => {
            await trackingEngine.handleBranchChange('new-branch');

            const branchTimes = trackingEngine.getBranchTimes();
            expect(branchTimes.has('new-branch')).toBe(true);
        });

        it('should skip if same branch', async () => {
            await trackingEngine.handleBranchChange('main');
            mockTimerService.startTracking.mockClear();
            
            await trackingEngine.handleBranchChange('main');

            expect(mockTimerService.startTracking).not.toHaveBeenCalled();
        });

        it('should handle branch change via git service callback', async () => {
            await trackingEngine.initialize();
            
            // Simulate git service calling the callback
            await branchChangeCallback('feature-branch');

            expect(mockTimerService.startTracking).toHaveBeenCalledWith('feature-branch');
        });
    });

    describe('tracking control', () => {
        beforeEach(async () => {
            await trackingEngine.initialize();
        });

        it('should start tracking', async () => {
            await trackingEngine.startTracking();

            expect(mockTimerService.startTracking).toHaveBeenCalledWith('main');
        });

        it('should start tracking with git branch lookup if no current branch', async () => {
            mockGitService.getCurrentBranch.mockResolvedValue('develop');
            
            // Create new engine without current branch
            const newEngine = new TrackingEngine(
                mockTimerService,
                mockGitService,
                mockStorageService,
                mockExportImportService
            );
            
            await newEngine.startTracking();

            expect(mockGitService.getCurrentBranch).toHaveBeenCalled();
            expect(mockTimerService.startTracking).toHaveBeenCalledWith('develop');
            
            newEngine.dispose();
        });

        it('should stop tracking', () => {
            trackingEngine.stopTracking();

            expect(mockTimerService.stopTracking).toHaveBeenCalled();
        });

        it('should pause tracking', () => {
            trackingEngine.pauseTracking();

            expect(mockTimerService.pauseTracking).toHaveBeenCalled();
        });

        it('should resume tracking', () => {
            trackingEngine.resumeTracking();

            expect(mockTimerService.resumeTracking).toHaveBeenCalled();
        });
    });

    describe('statistics', () => {
        beforeEach(async () => {
            // Set up branch times
            const branchTimes = new Map([
                ['main', { seconds: 3600, lastUpdated: '2023-01-01T10:00:00Z', sessionCount: 2, averageSessionTime: 1800 }],
                ['feature', { seconds: 1800, lastUpdated: '2023-01-01T11:00:00Z', sessionCount: 1, averageSessionTime: 1800 }],
                ['bugfix', { seconds: 900, lastUpdated: '2023-01-01T12:00:00Z', sessionCount: 1, averageSessionTime: 900 }]
            ]);
            mockStorageService.loadBranchTimes.mockResolvedValue(branchTimes);
            
            await trackingEngine.initialize();
        });

        it('should calculate branch statistics correctly', () => {
            const stats = trackingEngine.getBranchStatistics();

            expect(stats.totalTime).toBe(6300); // 3600 + 1800 + 900
            expect(stats.branchCount).toBe(3);
            expect(stats.mostActiveBranch).toBe('main');
            expect(stats.switchingFrequency).toBeGreaterThan(0);
        });

        it('should handle empty branch times', () => {
            const emptyEngine = new TrackingEngine(
                mockTimerService,
                mockGitService,
                mockStorageService,
                mockExportImportService
            );

            const stats = emptyEngine.getBranchStatistics();

            expect(stats.totalTime).toBe(0);
            expect(stats.branchCount).toBe(0);
            expect(stats.mostActiveBranch).toBeNull();
            expect(stats.switchingFrequency).toBe(0);
            
            emptyEngine.dispose();
        });
    });

    describe('export/import', () => {
        beforeEach(async () => {
            const branchTimes = new Map([
                ['main', createBranchTime(1800)]
            ]);
            mockStorageService.loadBranchTimes.mockResolvedValue(branchTimes);
            await trackingEngine.initialize();
        });

        it('should export data in CSV format', async () => {
            const csvData = 'branch,time,sessions\nmain,1800,1';
            mockExportImportService.exportToCSV.mockReturnValue(csvData);

            const result = await trackingEngine.exportData('csv');

            expect(result).toBe(csvData);
            expect(mockExportImportService.exportToCSV).toHaveBeenCalled();
        });

        it('should export data in JSON format', async () => {
            const jsonData = '{"version":"0.4.0","branchTimes":{"main":{"seconds":1800}}}';
            mockExportImportService.exportToJSON.mockReturnValue(jsonData);

            const result = await trackingEngine.exportData('json');

            expect(result).toBe(jsonData);
            expect(mockExportImportService.exportToJSON).toHaveBeenCalled();
        });

        it('should import data from CSV format', async () => {
            const csvData = 'branch,time,sessions\nfeature,900,1';
            const importedData = new Map([['feature', createBranchTime(900)]]);
            mockExportImportService.importFromCSV.mockResolvedValue(importedData);

            await trackingEngine.importData(csvData, 'csv');

            expect(mockExportImportService.importFromCSV).toHaveBeenCalledWith(csvData);
            expect(mockStorageService.saveBranchTimes).toHaveBeenCalled();
            expect(mockTimerService.updateBranchTimes).toHaveBeenCalledWith(importedData);
        });

        it('should import data from JSON format', async () => {
            const jsonData = '{"branchTimes":{"feature":{"seconds":900}}}';
            const importedData = { 
                version: '0.4.0',
                exportedAt: '2023-01-01T10:00:00Z',
                branchTimes: { feature: createBranchTime(900) },
                settings: {
                    updateInterval: 30000,
                    autoRefreshEnabled: true,
                    defaultExportFormat: 'json',
                    backupEnabled: true,
                    maxBackups: 10,
                    theme: 'auto'
                } as GlobalSettings,
                metadata: {
                    totalBranches: 1,
                    totalTime: 900,
                    exportFormat: 'json' as ExportFormat,
                    extensionVersion: '0.4.0'
                }
            };
            mockExportImportService.importFromJSON.mockResolvedValue(importedData);

            await trackingEngine.importData(jsonData, 'json');

            expect(mockExportImportService.importFromJSON).toHaveBeenCalledWith(jsonData);
            expect(mockStorageService.saveBranchTimes).toHaveBeenCalled();
        });

        it('should handle unsupported export format', async () => {
            await expect(trackingEngine.exportData('xml' as ExportFormat))
                .rejects.toThrow('Unsupported export format: xml');
        });

        it('should handle unsupported import format', async () => {
            await expect(trackingEngine.importData('data', 'xml' as ExportFormat))
                .rejects.toThrow('Unsupported import format: xml');
        });
    });

    describe('tracking state', () => {
        beforeEach(async () => {
            await trackingEngine.initialize();
        });

        it('should return current tracking state', () => {
            mockTimerService.getCurrentSessionStats.mockReturnValue({
                sessionTime: 300,
                totalPausedTime: 60,
                isActive: true
            });
            mockTimerService.getCurrentTime.mockReturnValue(1800);
            mockTimerService.isTrackingPaused.mockReturnValue(false);

            const state = trackingEngine.getTrackingState();

            expect(state.isActive).toBe(true);
            expect(state.isPaused).toBe(false);
            expect(state.currentBranch).toBe('main');
            expect(state.currentSessionTime).toBe(300);
            expect(state.currentBranchTime).toBe(1800);
            expect(state.error).toBeNull();
        });

        it('should return paused state', () => {
            mockTimerService.isTrackingPaused.mockReturnValue(true);
            mockTimerService.getCurrentSessionStats.mockReturnValue({
                sessionTime: 300,
                totalPausedTime: 60,
                isActive: false
            });

            const state = trackingEngine.getTrackingState();

            expect(state.isPaused).toBe(true);
            expect(state.isActive).toBe(false);
        });
    });

    describe('force save', () => {
        beforeEach(async () => {
            await trackingEngine.initialize();
        });

        it('should force save data', async () => {
            await trackingEngine.forceSave();

            expect(mockStorageService.saveBranchTimes).toHaveBeenCalled();
        });

        it('should handle save errors', async () => {
            const error = new Error('Save failed');
            mockStorageService.saveBranchTimes.mockRejectedValue(error);

            await expect(trackingEngine.forceSave()).rejects.toThrow(error);
        });
    });

    describe('dispose', () => {
        it('should dispose all services and clean up', async () => {
            await trackingEngine.initialize();
            
            trackingEngine.dispose();

            expect(mockTimerService.dispose).toHaveBeenCalled();
            expect(mockGitService.dispose).toHaveBeenCalled();
            expect(mockStorageService.dispose).toHaveBeenCalled();
        });

        it('should handle multiple dispose calls', async () => {
            await trackingEngine.initialize();
            
            trackingEngine.dispose();
            trackingEngine.dispose(); // Should not throw

            expect(mockTimerService.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('event callbacks', () => {
        beforeEach(async () => {
            // Ensure saveBranchTimes doesn't fail
            mockStorageService.saveBranchTimes.mockResolvedValue();
            await trackingEngine.initialize();
        });

        it('should register and call state change callbacks', () => {
            const callback = jest.fn();
            const disposable = trackingEngine.onStateChange(callback);

            trackingEngine.pauseTracking(); // This should trigger state change

            expect(callback).toHaveBeenCalled();
            
            disposable.dispose();
        });

        it('should register and call branch change callbacks', async () => {
            const callback = jest.fn();
            const disposable = trackingEngine.onBranchChange(callback);

            // First, let's establish a known state by changing to 'develop'
            await trackingEngine.handleBranchChange('develop');
            
            // Clear any previous calls
            callback.mockClear();
            
            // Now change to 'feature-branch' - this should trigger the callback
            await trackingEngine.handleBranchChange('feature-branch');

            // The callback should be called with the new branch and old branch
            expect(callback).toHaveBeenCalledWith('feature-branch', 'develop');
            
            disposable.dispose();
        });

        it('should register and call error callbacks', async () => {
            const callback = jest.fn();
            const disposable = trackingEngine.onError(callback);

            // Force an error by making storage fail
            const error = new Error('Storage error');
            mockStorageService.saveBranchTimes.mockRejectedValue(error);

            await trackingEngine.handleBranchChange('feature-branch');

            expect(callback).toHaveBeenCalledWith(error);
            
            disposable.dispose();
        });
    });
});