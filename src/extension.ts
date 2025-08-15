import * as vscode from 'vscode';
import { 
    ServiceContainer, 
    IServiceContainer, 
    ServiceType,
    ITrackingEngine,
    IConfigurationManager,
    IGitService,
    IStorageService
} from './services';
import { createDefaultFilters } from './models/StatisticsFilters';
import { StatusBarView } from './views/StatusBarView';
import { StatisticsWebview } from './views/StatisticsWebview';
import { SettingsPanel } from './views/SettingsPanel';
import { TrackingState } from './services/TrackingEngine';
import { StatusBarData } from './models';

/**
 * Extension interface for testing and external access
 */
export interface BranchTimeTrackerExtension {
    /**
     * Get the service container
     */
    getServiceContainer(): IServiceContainer;

    /**
     * Get current tracking state
     */
    getTrackingState(): TrackingState;

    /**
     * Force update current branch time
     */
    updateBranchTime(): void;

    /**
     * Update status bar display
     */
    updateStatusBar(): void;

    /**
     * Dispose extension resources
     */
    dispose(): void;
}

/**
 * Extension state
 */
interface ExtensionState {
    serviceContainer: IServiceContainer;
    statusBarView: StatusBarView;
    statisticsWebview: StatisticsWebview | null;
    settingsPanel: SettingsPanel | null;
    disposables: vscode.Disposable[];
    isActivated: boolean;
    uiRefreshTimer?: NodeJS.Timeout | null;
}

let extensionState: ExtensionState | null = null;

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<BranchTimeTrackerExtension> {
    console.log('Branch Time Tracker v0.4.0 activating...');

    try {
        // Initialize service container
        const serviceContainer = new ServiceContainer();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        await serviceContainer.initialize(context, workspaceFolder);

        // Create UI components
        const statusBarView = new StatusBarView();
        const statisticsWebview = new StatisticsWebview(context);
        const settingsPanel = new SettingsPanel(context);

        // Initialize extension state
        extensionState = {
            serviceContainer,
            statusBarView,
            statisticsWebview,
            settingsPanel,
            disposables: [],
            isActivated: false
        };

        // Set up extension
        await setupExtension(context, extensionState);

        console.log('Branch Time Tracker v0.4.0 activated successfully');

        return createExtensionAPI(extensionState);

    } catch (error) {
        console.error('Failed to activate Branch Time Tracker:', error);
        
        // Clean up on activation failure
        if (extensionState) {
            cleanupExtension(extensionState);
            extensionState = null;
        }

        // Show error to user
        vscode.window.showErrorMessage(
            `Failed to activate Branch Time Tracker: ${error instanceof Error ? error.message : 'Unknown error'}`
        );

        throw error;
    }
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
    console.log('Branch Time Tracker deactivating...');

    if (extensionState) {
        cleanupExtension(extensionState);
        extensionState = null;
    }

    console.log('Branch Time Tracker deactivated');
}

/**
 * Set up the extension with services and UI
 */
async function setupExtension(context: vscode.ExtensionContext, state: ExtensionState): Promise<void> {
    // Get services from container
    const trackingEngine = state.serviceContainer.get<ITrackingEngine>(ServiceType.TrackingEngine);
    const configManager = state.serviceContainer.get<IConfigurationManager>(ServiceType.ConfigurationManager);
    const gitService = state.serviceContainer.get<IGitService>(ServiceType.GitService);
    const storageService = state.serviceContainer.get<IStorageService>(ServiceType.StorageService);

    // Initialize UI components
    await state.statusBarView.initialize();
    if (state.statisticsWebview) {
        await state.statisticsWebview.initialize();
        // Forward webview user actions (e.g., togglePause) to engine and refresh UI
        state.statisticsWebview.setExternalMessageHandler((message: any) => {
            try {
                if (!message || !message.command) return;
                switch (message.command) {
                    case 'togglePause': {
                        const current = trackingEngine.getTrackingState();
                        if (current.isPaused) {
                            trackingEngine.resumeTracking();
                            vscode.window.showInformationMessage('Branch time tracking resumed');
                        } else {
                            trackingEngine.pauseTracking();
                            vscode.window.showInformationMessage('Branch time tracking paused');
                        }
                        // Ensure both views refresh immediately
                        updateUI(state, trackingEngine);
                        break;
                    }
                    case 'exportData':
                    case 'importData':
                    case 'setAutoRefresh':
                        // These are handled via dedicated commands/UI flows; ignore here for now
                        break;
                    default:
                        break;
                }
            } catch (err) {
                console.error('Error handling webview message:', err);
            }
        });
    }
    if (state.settingsPanel) {
        await state.settingsPanel.initialize();
    }

    // Set up event handlers
    setupEventHandlers(state, trackingEngine, configManager);

    // Register commands
    registerCommands(context, state, trackingEngine, configManager);

    // Set up workspace change handling
    setupWorkspaceHandling(state);

    // Initial UI update
    updateUI(state, trackingEngine);

    // Fallback UI refresh to ensure live counter updates
    // This complements the engine's internal tick and guarantees rendering
    state.uiRefreshTimer = setInterval(() => {
        try {
            updateUI(state, trackingEngine);
        } catch (e) {
            console.error('Status bar refresh failed:', e);
        }
    }, 1000);

    state.isActivated = true;
}

/**
 * Set up event handlers for services
 */
function setupEventHandlers(
    state: ExtensionState,
    trackingEngine: ITrackingEngine,
    configManager: IConfigurationManager
): void {
    // Track tracking state changes
    state.disposables.push(
        trackingEngine.onStateChange((trackingState: TrackingState) => {
            updateStatusBarFromTrackingState(state, trackingState);
            
            // Update webview if open
            if (state.statisticsWebview) {
                state.statisticsWebview.updateData(createStatisticsDataForWebview(trackingEngine));
            }
        })
    );

    // Track time updates
    state.disposables.push(
        trackingEngine.onTimeUpdate((branch: string, time: number) => {
            console.debug(`Time updated for branch ${branch}: ${time}s`);
            
            // Update UI components that show time data
            if (state.statisticsWebview) {
                state.statisticsWebview.updateData(createStatisticsDataForWebview(trackingEngine));
            }
        })
    );

    // Track branch changes
    state.disposables.push(
        trackingEngine.onBranchChange((newBranch: string, oldBranch: string | null) => {
            console.log(`Branch changed from ${oldBranch || 'unknown'} to ${newBranch}`);
            
            // Highlight status bar briefly
            state.statusBarView.highlightBranchChange();
            
            // Update all UI components
            updateUI(state, trackingEngine);
        })
    );

    // Track errors
    state.disposables.push(
        trackingEngine.onError((error: Error) => {
            console.error('Tracking engine error:', error);
            
            // Show error in status bar
            state.statusBarView.showError(error.message);
            
            // Optionally show error message to user for critical errors
            if (error.message.includes('initialization') || error.message.includes('critical')) {
                vscode.window.showErrorMessage(`Branch Time Tracker: ${error.message}`);
            }
        })
    );

    // Track configuration changes
    state.disposables.push(
        configManager.onConfigurationChanged((event) => {
            console.log('Configuration changed:', event.changedKeys);
            
            // Update UI based on configuration changes
            if (event.changedKeys.includes('theme') || event.changedKeys.includes('displayFormat')) {
                updateUI(state, trackingEngine);
            }
        })
    );
}

/**
 * Register VS Code commands
 */
function registerCommands(
    context: vscode.ExtensionContext,
    state: ExtensionState,
    trackingEngine: ITrackingEngine,
    configManager: IConfigurationManager
): void {
    // Show statistics command
    const showStatsCommand = vscode.commands.registerCommand(
        'branch-time-tracker.showStats',
        async () => {
            try {
                if (state.statisticsWebview) {
                    await state.statisticsWebview.show();
                    
                    // Update with formatted data
                    state.statisticsWebview.updateData(createStatisticsDataForWebview(trackingEngine));
                }
            } catch (error) {
                console.error('Error showing statistics:', error);
                vscode.window.showErrorMessage('Failed to show branch time statistics');
            }
        }
    );

    // Show settings command
    const showSettingsCommand = vscode.commands.registerCommand(
        'branch-time-tracker.showSettings',
        async () => {
            try {
                if (state.settingsPanel) {
                    await state.settingsPanel.show();
                    
                    // Update with current settings
                    state.settingsPanel.updateSettings({
                        globalSettings: configManager.getGlobalSettings(),
                        workspaceSettings: configManager.getWorkspaceSettings(),
                        effectiveSettings: configManager.getEffectiveSettings(),
                        presets: configManager.getPresetManager().getAllPresets(),
                        activePreset: configManager.getActivePreset()
                    });
                }
            } catch (error) {
                console.error('Error showing settings:', error);
                vscode.window.showErrorMessage('Failed to show branch time settings');
            }
        }
    );

    // Pause/Resume tracking command
    const togglePauseCommand = vscode.commands.registerCommand(
        'branch-time-tracker.togglePause',
        async () => {
            try {
                const currentState = trackingEngine.getTrackingState();
                
                if (currentState.isPaused) {
                    trackingEngine.resumeTracking();
                    vscode.window.showInformationMessage('Branch time tracking resumed');
                } else {
                    trackingEngine.pauseTracking();
                    vscode.window.showInformationMessage('Branch time tracking paused');
                }
            } catch (error) {
                console.error('Error toggling pause:', error);
                vscode.window.showErrorMessage('Failed to toggle tracking pause');
            }
        }
    );

    // Export data command
    const exportDataCommand = vscode.commands.registerCommand(
        'branch-time-tracker.exportData',
        async () => {
            try {
                const format = await vscode.window.showQuickPick(
                    [
                        { label: 'JSON', description: 'Complete data with metadata', value: 'json' },
                        { label: 'CSV', description: 'Simple tabular format', value: 'csv' }
                    ],
                    { placeHolder: 'Select export format' }
                );

                if (!format) return;

                const uri = await vscode.window.showSaveDialog({
                    filters: {
                        [format.label]: [format.value]
                    },
                    defaultUri: vscode.Uri.file(`branch-times.${format.value}`)
                });

                if (!uri) return;

                const exportData = await trackingEngine.exportData(format.value as 'json' | 'csv');
                await vscode.workspace.fs.writeFile(uri, Buffer.from(exportData, 'utf8'));

                vscode.window.showInformationMessage(`Branch time data exported to ${uri.fsPath}`);
            } catch (error) {
                console.error('Error exporting data:', error);
                vscode.window.showErrorMessage('Failed to export branch time data');
            }
        }
    );

    // Import data command
    const importDataCommand = vscode.commands.registerCommand(
        'branch-time-tracker.importData',
        async () => {
            try {
                const uris = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        'JSON Files': ['json'],
                        'CSV Files': ['csv']
                    }
                });

                if (!uris || uris.length === 0) return;

                const uri = uris[0];
                const fileExtension = uri.fsPath.split('.').pop()?.toLowerCase();
                
                if (!fileExtension || !['json', 'csv'].includes(fileExtension)) {
                    vscode.window.showErrorMessage('Unsupported file format. Please select a JSON or CSV file.');
                    return;
                }

                const confirmation = await vscode.window.showWarningMessage(
                    'This will replace your current branch time data. Are you sure?',
                    { modal: true },
                    'Import Data',
                    'Cancel'
                );

                if (confirmation !== 'Import Data') return;

                const fileData = await vscode.workspace.fs.readFile(uri);
                const dataString = fileData.toString();

                await trackingEngine.importData(dataString, fileExtension as 'json' | 'csv');

                vscode.window.showInformationMessage('Branch time data imported successfully');
                
                // Update UI after import
                updateUI(state, trackingEngine);
            } catch (error) {
                console.error('Error importing data:', error);
                vscode.window.showErrorMessage(`Failed to import branch time data: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    );

    // Force save command
    const forceSaveCommand = vscode.commands.registerCommand(
        'branch-time-tracker.forceSave',
        async () => {
            try {
                await trackingEngine.forceSave();
                vscode.window.showInformationMessage('Branch time data saved');
            } catch (error) {
                console.error('Error saving data:', error);
                vscode.window.showErrorMessage('Failed to save branch time data');
            }
        }
    );

    // Refresh data command
    const refreshCommand = vscode.commands.registerCommand(
        'branch-time-tracker.refresh',
        async () => {
            try {
                // Update current branch time
                trackingEngine.updateCurrentBranchTime();
                
                // Force save
                await trackingEngine.forceSave();
                
                // Update UI
                updateUI(state, trackingEngine);
                
                vscode.window.showInformationMessage('Branch time data refreshed');
            } catch (error) {
                console.error('Error refreshing data:', error);
                vscode.window.showErrorMessage('Failed to refresh branch time data');
            }
        }
    );

    // Register all commands
    context.subscriptions.push(
        showStatsCommand,
        showSettingsCommand,
        togglePauseCommand,
        exportDataCommand,
        importDataCommand,
        forceSaveCommand,
        refreshCommand
    );

    state.disposables.push(
        showStatsCommand,
        showSettingsCommand,
        togglePauseCommand,
        exportDataCommand,
        importDataCommand,
        forceSaveCommand,
        refreshCommand
    );
}

/**
 * Set up workspace change handling
 */
function setupWorkspaceHandling(state: ExtensionState): void {
    // Handle workspace folder changes
    const workspaceChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
        try {
            const newWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
            
            console.log('Workspace folders changed, switching to:', newWorkspaceFolder?.uri.fsPath || 'none');
            
            // Switch workspace in service container
            await state.serviceContainer.switchWorkspace(newWorkspaceFolder);
            
            // Update UI
            const trackingEngine = state.serviceContainer.get<ITrackingEngine>(ServiceType.TrackingEngine);
            updateUI(state, trackingEngine);
            
        } catch (error) {
            console.error('Error handling workspace change:', error);
            vscode.window.showErrorMessage('Failed to switch workspace for branch time tracking');
        }
    });

    state.disposables.push(workspaceChangeDisposable);
}

/**
 * Create statistics data for webview
 */
function createStatisticsDataForWebview(trackingEngine: ITrackingEngine): any {
    const branchTimes = trackingEngine.getBranchTimes();
    const statistics = trackingEngine.getBranchStatistics();
    
    return {
        branches: Array.from(branchTimes.entries()).map(([name, branchTime]) => ({
            name,
            time: branchTime.seconds,
            lastUpdated: branchTime.lastUpdated,
            sessionCount: branchTime.sessionCount,
            averageSessionTime: branchTime.averageSessionTime,
            percentage: statistics.totalTime > 0 ? (branchTime.seconds / statistics.totalTime) * 100 : 0
        })).sort((a, b) => b.time - a.time), // Sort by time descending
        totalTime: statistics.totalTime,
        filters: createDefaultFilters(),
        isLoading: false
    };
}

/**
 * Update all UI components
 */
function updateUI(state: ExtensionState, trackingEngine: ITrackingEngine): void {
    const trackingState = trackingEngine.getTrackingState();
    
    // Update status bar
    updateStatusBarFromTrackingState(state, trackingState);
    
    // Update webview if open
    if (state.statisticsWebview) {
        state.statisticsWebview.updateData(createStatisticsDataForWebview(trackingEngine));
    }
}

/**
 * Update status bar from tracking state
 */
function updateStatusBarFromTrackingState(state: ExtensionState, trackingState: TrackingState): void {
    const statusBarData: StatusBarData = {
        currentBranch: trackingState.currentBranch,
        currentTime: trackingState.currentBranchTime,
        isPaused: trackingState.isPaused,
        isLoading: false,
        error: trackingState.error
    };

    state.statusBarView.update(statusBarData);
}

/**
 * Create extension API for external access
 */
function createExtensionAPI(state: ExtensionState): BranchTimeTrackerExtension {
    return {
        getServiceContainer(): IServiceContainer {
            return state.serviceContainer;
        },

        getTrackingState(): TrackingState {
            const trackingEngine = state.serviceContainer.get<ITrackingEngine>(ServiceType.TrackingEngine);
            return trackingEngine.getTrackingState();
        },

        updateBranchTime(): void {
            const trackingEngine = state.serviceContainer.get<ITrackingEngine>(ServiceType.TrackingEngine);
            trackingEngine.updateCurrentBranchTime();
        },

        updateStatusBar(): void {
            const trackingEngine = state.serviceContainer.get<ITrackingEngine>(ServiceType.TrackingEngine);
            updateUI(state, trackingEngine);
        },

        dispose(): void {
            if (extensionState) {
                cleanupExtension(extensionState);
                extensionState = null;
            }
        }
    };
}

/**
 * Clean up extension resources
 */
function cleanupExtension(state: ExtensionState): void {
    try {
        // Dispose all disposables
        state.disposables.forEach(disposable => {
            try {
                disposable.dispose();
            } catch (error) {
                console.error('Error disposing resource:', error);
            }
        });
        state.disposables = [];

        // Clear UI refresh timer
        if (state.uiRefreshTimer) {
            clearInterval(state.uiRefreshTimer);
            state.uiRefreshTimer = null;
        }

        // Dispose UI components
        if (state.statusBarView) {
            state.statusBarView.dispose();
        }
        if (state.statisticsWebview) {
            state.statisticsWebview.dispose();
        }
        if (state.settingsPanel) {
            state.settingsPanel.dispose();
        }

        // Dispose service container (this will dispose all services)
        state.serviceContainer.dispose();

        state.isActivated = false;
    } catch (error) {
        console.error('Error during extension cleanup:', error);
    }
}

/**
 * Get extension state for testing
 */
export function getExtensionState(): ExtensionState | null {
    return extensionState;
}