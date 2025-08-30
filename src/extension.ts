import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;
const DEFAULT_UPDATE_INTERVAL = 2 * ONE_MINUTE; // 2 minutes

// Export types for testing
export interface BranchTime {
    seconds: number;
    lastUpdated: string;
}

export interface BranchTimeTrackerExtension {
    updateBranchTime: () => void;
    updateStatusBar: () => void;
    dispose: () => void;
}

export function activate(context: vscode.ExtensionContext): BranchTimeTrackerExtension {
    const storagePath = context.globalStoragePath;
    const timerFile = path.join(storagePath, 'branch-timers.json');
    let currentBranch: string | null = null;
    let currentTimer: NodeJS.Timeout | null = null;
    let autoRefreshEnabled = true; // Enabled by default
    let autoRefreshInterval = 2 * ONE_MINUTE; // Default 2 minutes
    // Simple bus to manage refresh callbacks (minor refactor)
    class RefreshBus {
        private callbacks: Array<() => void> = [];
        on(cb: () => void): vscode.Disposable {
            this.callbacks.push(cb);
            return new vscode.Disposable(() => this.off(cb));
        }
        off(cb: () => void): void {
            const i = this.callbacks.indexOf(cb);
            if (i !== -1) this.callbacks.splice(i, 1);
        }
        emit(): void {
            // iterate over a copy to avoid mutation during emit
            [...this.callbacks].forEach(cb => {
                try { cb(); } catch (e) { console.error('Refresh callback error:', e); }
            });
        }
        clear(): void { this.callbacks = []; }
    }

    const refreshBus = new RefreshBus();
    let branchTimes: Map<string, BranchTime> = new Map();
    let workspaceFolder: vscode.WorkspaceFolder | undefined;
    let statusBarItem: vscode.StatusBarItem;
    let statusBarHighlightTimeout: NodeJS.Timeout | null = null;
    let statusBarUpdateTimeout: NodeJS.Timeout | null = null; // debounce handle
    let gitHeadWatcher: vscode.FileSystemWatcher | null = null;
    let isTrackingPaused: boolean = false;

    // Initialize branch times from storage
    function loadBranchTimes(): void {
        try {
            if (fs.existsSync(timerFile)) {
                const data = fs.readFileSync(timerFile, 'utf8');
                let savedTimes: any;
                try {
                    savedTimes = JSON.parse(data);
                } catch (parseError) {
                    throw new Error('Corrupted JSON');
                }
                // Validate structure: must be an object with { seconds: number, lastUpdated: string }
                const isValid = savedTimes && typeof savedTimes === 'object' &&
                    Object.values(savedTimes).every((v: any) =>
                        v && typeof v.seconds === 'number' && typeof v.lastUpdated === 'string');
                if (!isValid) {
                    throw new Error('Invalid data structure');
                }
                branchTimes = new Map<string, BranchTime>(Object.entries(savedTimes));
            }
        } catch (error: any) {
            console.error('Error loading branch times:', error);
            try {
                // Backup corrupted file before offering reset
                if (fs.existsSync(timerFile)) {
                    const ts = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupPath = timerFile + `.bak-${ts}.json`;
                    fs.copyFileSync(timerFile, backupPath);
                }
            } catch (backupErr) {
                console.warn('Failed to create backup of corrupted data:', backupErr);
            }

            vscode.window.showErrorMessage(
                'Failed to load branch time data: ' + error.message + '. A backup was created. Reset data?',
                'Reset Data'
            ).then(selection => {
                if (selection === 'Reset Data') {
                    try {
                        fs.writeFileSync(timerFile, '{}', 'utf8');
                        branchTimes = new Map();
                        vscode.window.showInformationMessage('Branch time data has been reset.');
                    } catch (resetError) {
                        vscode.window.showErrorMessage('Failed to reset branch time data. Please check file permissions.');
                    }
                }
            });
        }
    }

    // Save branch times to storage (atomic write)
    function saveBranchTimes(): void {
        try {
            const data = JSON.stringify(Object.fromEntries(branchTimes), null, 2);
            const dir = path.dirname(timerFile);
            fs.mkdirSync(dir, { recursive: true });
            const tmpPath = path.join(dir, `.${path.basename(timerFile)}.tmp`);
            fs.writeFileSync(tmpPath, data, 'utf8');
            fs.renameSync(tmpPath, timerFile); // atomic on most platforms
        } catch (error) {
            console.error('Error saving branch times:', error);
            vscode.window.showErrorMessage('Failed to save branch time data. Check your disk space and permissions.');
        }
    }

    // Get current git branch
    async function getCurrentGitBranch(): Promise<string | null> {
        if (!workspaceFolder) {
            return null;
        }

        return new Promise((resolve) => {
            const gitProcess = spawn('git', ['branch', '--show-current'], {
                cwd: workspaceFolder!.uri.fsPath
            });

            let output = '';
            let errorOutput = '';

            gitProcess.stdout?.on('data', (data: Buffer) => {
                output += data.toString();
            });

            gitProcess.stderr?.on('data', (data: Buffer) => {
                errorOutput += data.toString();
            });

            gitProcess.on('close', (code: number | null) => {
                if (code === 0) {
                    const branch = output.trim();
                    resolve(branch || 'main'); // Default to 'main' if empty
                } else {
                    console.error('Error getting git branch:', errorOutput);
                    vscode.window.showErrorMessage('Failed to get current git branch. Make sure this folder is a valid git repository.');
                    resolve(null);
                }
            });
        });
    }

    // Update time for current branch - FIXED LOGIC
    function updateBranchTime(): void {
        if (!currentBranch || isTrackingPaused) return;

        const now = new Date();
        const branchTime = branchTimes.get(currentBranch) || {
            seconds: 0,
            lastUpdated: now.toISOString()
        };

        const lastUpdate = new Date(branchTime.lastUpdated);
        const secondsElapsed = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
        
        // Only update if time has actually passed (avoid unnecessary updates)
        if (secondsElapsed > 0) {
            branchTime.seconds += secondsElapsed;
            branchTime.lastUpdated = now.toISOString();
            branchTimes.set(currentBranch, branchTime);
            saveBranchTimes();
        }
        updateStatusBar(); // Ensure status bar is updated after time update
    }

    // Handle branch change
    async function handleBranchChange(): Promise<void> {
        const newBranch = await getCurrentGitBranch();
        
        if (newBranch && newBranch !== currentBranch) {
            // Update time for previous branch
            if (currentBranch) {
                updateBranchTime();
            }
            
            // Switch to new branch
            currentBranch = newBranch;
            
            // Initialize branch time if it doesn't exist
            if (!branchTimes.has(currentBranch)) {
                branchTimes.set(currentBranch, {
                    seconds: 0,
                    lastUpdated: new Date().toISOString()
                });
                saveBranchTimes();
            } else {
                // Update lastUpdated to current time when switching to existing branch
                const branchTime = branchTimes.get(currentBranch)!;
                branchTime.lastUpdated = new Date().toISOString();
                branchTimes.set(currentBranch, branchTime);
                saveBranchTimes();
            }
            
            // Highlight status bar only (no notification)
            if (statusBarItem) {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                if (statusBarHighlightTimeout) clearTimeout(statusBarHighlightTimeout);
                statusBarHighlightTimeout = setTimeout(() => {
                    statusBarItem.backgroundColor = undefined;
                }, 2000);
            }
            updateStatusBar(); // Ensure status bar is updated after branch change
            console.log(`Switched to branch: ${currentBranch}`);
        }
    }

    // Update status bar with time spent on current branch (without seconds) with debounce
    function updateStatusBar(): void {
        if (statusBarUpdateTimeout) {
            clearTimeout(statusBarUpdateTimeout);
        }

        statusBarUpdateTimeout = setTimeout(() => {
        const getStatusIcon = () => {
            if (!workspaceFolder) return '$(error)';
            if (!currentBranch) return '$(error)';
            return isTrackingPaused ? '$(debug-pause)' : '$(watch)';
        };
        if (!statusBarItem) {
            statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
            statusBarItem.command = 'branch-time-tracker.showStats';
            statusBarItem.tooltip = 'Click to view branch time statistics';
            statusBarItem.show();
        }

        if (!workspaceFolder) {
            statusBarItem.text = '$(error) No workspace folder';
            statusBarItem.tooltip = 'Open a workspace with a Git repository to track branch time.';
            return;
        }

        if (!currentBranch) {
            statusBarItem.text = '$(error) No active branch';
            statusBarItem.tooltip = 'No active git branch detected.';
            return;
        }

        const branchTime = branchTimes.get(currentBranch);
        const timeSpent = branchTime ? branchTime.seconds : 0;
        const formattedTime = formatTime(timeSpent, false); // no seconds
        const lastUpdated = branchTime ? formatLastUpdated(branchTime.lastUpdated) : 'N/A';

        const icon = getStatusIcon();
        const pauseStatus = isTrackingPaused ? '[PAUSED] ' : '';
        statusBarItem.text = `${icon} ${pauseStatus}${formattedTime} on ${currentBranch}`;
        statusBarItem.tooltip = `${isTrackingPaused ? '⏸️ Tracking Paused\n' : ''}Spent ${formattedTime} on branch "${currentBranch}"
Last updated: ${lastUpdated}
Click for detailed statistics`;
            statusBarUpdateTimeout = null;
        }, 100);
    }

    // Format last updated timestamp for display
    function formatLastUpdated(isoString: string): string {
        try {
            const date = new Date(isoString);
            return date.toLocaleString();
        } catch (error) {
            return 'Unknown';
        }
    }

    // Export branch time data
    async function exportBranchData(): Promise<void> {
        try {
            // Prepare export data
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                branchTimes: Object.fromEntries(branchTimes),
                settings: {
                    autoRefreshEnabled,
                    autoRefreshInterval: autoRefreshInterval / ONE_MINUTE,
                    isTrackingPaused
                }
            };

            // Show save dialog
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (uri) {
                const jsonData = JSON.stringify(exportData, null, 2);
                await vscode.workspace.fs.writeFile(uri, Buffer.from(jsonData, 'utf8'));
                vscode.window.showInformationMessage(`Branch time data exported to ${uri.fsPath}`);
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            vscode.window.showErrorMessage('Failed to export branch time data.');
        }
    }

    // Import branch time data
    async function importBranchData(): Promise<void> {
        try {
            // Show open dialog
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (!uris || uris.length === 0) return;

            const uri = uris[0];
            const fileData = await vscode.workspace.fs.readFile(uri);
            const jsonData = fileData.toString();
            
            let importData: any;
            try {
                importData = JSON.parse(jsonData);
            } catch (parseError) {
                throw new Error('Invalid JSON file');
            }

            // Validate data structure
            if (!importData.branchTimes || typeof importData.branchTimes !== 'object') {
                throw new Error('Invalid data format: missing branchTimes');
            }

            // Show confirmation dialog
            const action = await vscode.window.showWarningMessage(
                'This will replace your current branch time data. Are you sure?',
                { modal: true },
                'Replace Data',
                'Cancel'
            );

            if (action === 'Replace Data') {
                // Import branch times
                branchTimes = new Map(Object.entries(importData.branchTimes));
                
                // Import settings if available
                if (importData.settings) {
                    autoRefreshEnabled = importData.settings.autoRefreshEnabled ?? autoRefreshEnabled;
                    autoRefreshInterval = (importData.settings.autoRefreshInterval ?? 2) * ONE_MINUTE;
                    isTrackingPaused = importData.settings.isTrackingPaused ?? isTrackingPaused;
                    
                    // Save settings
                    await context.globalState.update('branchTimeTracker.autoRefreshEnabled', autoRefreshEnabled);
                    await context.globalState.update('branchTimeTracker.autoRefreshInterval', autoRefreshInterval / ONE_MINUTE);
                    await context.globalState.update('branchTimeTracker.isPaused', isTrackingPaused);
                }

                // Save imported data
                saveBranchTimes();
                
                // Update UI
                updateStatusBar();
                setupAutoRefresh();
                
                vscode.window.showInformationMessage('Branch time data imported successfully.');
            }
        } catch (error: any) {
            console.error('Error importing data:', error);
            vscode.window.showErrorMessage(`Failed to import branch time data: ${error.message || 'Unknown error'}`);
        }
    }

    // Toggle pause/resume time tracking
    async function togglePauseTracking(): Promise<void> {
        isTrackingPaused = !isTrackingPaused;
        
        // Save current time before pausing
        if (isTrackingPaused) {
            updateBranchTime();
        } else {
            // Update lastUpdated when resuming to avoid counting paused time
            if (currentBranch) {
                const branchTime = branchTimes.get(currentBranch);
                if (branchTime) {
                    branchTime.lastUpdated = new Date().toISOString();
                    branchTimes.set(currentBranch, branchTime);
                }
            }
        }
        
        // Save pause state
        await context.globalState.update('branchTimeTracker.isPaused', isTrackingPaused);
        updateStatusBar();
    }

    // Initialize extension
    async function initialize(): Promise<void> {
        // Load pause state
        isTrackingPaused = context.globalState.get<boolean>('branchTimeTracker.isPaused', false);

        // Create status bar item
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.command = 'branch-time-tracker.showStats';
        statusBarItem.text = '$(loading~spin) Loading branch time...';
        statusBarItem.tooltip = 'Loading branch time data...';
        statusBarItem.show();

        workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            statusBarItem.text = '$(error) No workspace folder';
            statusBarItem.tooltip = 'Open a workspace with a Git repository to track branch time';
            console.log('No workspace folder open');
            return;
        }

        // Load settings from storage
        autoRefreshEnabled = context.globalState.get<boolean>('branchTimeTracker.autoRefreshEnabled', true);
        const savedIntervalMinutes = context.globalState.get<number>('branchTimeTracker.autoRefreshInterval', 2);
        autoRefreshInterval = Math.max(1, savedIntervalMinutes || 2) * ONE_MINUTE;

        loadBranchTimes();
        await handleBranchChange();
        updateStatusBar();

        // Set up git HEAD file watcher to detect branch changes
        setupGitHeadWatcher();

        // Set up the auto-refresh timer if enabled
        setupAutoRefresh();

        // Set up event listeners
        vscode.workspace.onDidChangeWorkspaceFolders(async () => {
            workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                setupGitHeadWatcher();
                await handleBranchChange();
                updateStatusBar();
                // Ensure auto-refresh timer reflects the new workspace context
                setupAutoRefresh();
            } else {
                statusBarItem.text = '$(error) No workspace folder';
                statusBarItem.tooltip = 'Open a workspace with a Git repository to track branch time';
                if (gitHeadWatcher) {
                    gitHeadWatcher.dispose();
                    gitHeadWatcher = null;
                }
                // Stop accrual when no workspace is available
                stopAutoRefresh();
            }
        });
    }

    // Escape HTML to prevent XSS
    function escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Format time in a human-readable format (without seconds for status bar)
    function formatTime(seconds: number, showSeconds: boolean = false): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        
        const parts: string[] = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
        if (showSeconds) parts.push(`${remainingSeconds}s`);
        
        return parts.length > 0 ? parts.join(' ') : '0m';
    }

    // Compute the effective refresh interval (enforce lower bound)
    function getEffectiveInterval(): number {
        return Math.max(ONE_MINUTE, autoRefreshInterval);
    }

    // Stop the global auto-refresh timer
    function stopAutoRefresh(): void {
        if (currentTimer) {
            clearInterval(currentTimer);
            currentTimer = null;
        }
    }

    // Set up or update the auto-refresh timer
    function setupAutoRefresh(): void {
        // Clear any existing timer first
        stopAutoRefresh();

        // Set up new timer if auto-refresh is enabled
        if (autoRefreshEnabled) {
            currentTimer = setInterval(() => {
                // Guard against accrual when paused or no workspace
                if (!isTrackingPaused && workspaceFolder) {
                    if (currentBranch) {
                        updateBranchTime();
                    }
                }

                // Always keep UI in sync
                updateStatusBar();

                // Notify all registered callbacks (e.g., webview panels)
                refreshBus.emit();

            }, getEffectiveInterval());
            
            console.log(`Auto-refresh enabled with ${autoRefreshInterval / ONE_MINUTE} minute interval`);
        }
    }

    // Register a callback to be called on each auto-refresh (delegates to RefreshBus)
    function registerRefreshCallback(callback: () => void): vscode.Disposable {
        return refreshBus.on(callback);
    }

    // Helpers: prepare data for stats view
    function getSortedBranches(): [string, BranchTime][] {
        return Array.from(branchTimes.entries()).sort((a, b) => b[1].seconds - a[1].seconds);
    }

    function getTotalSeconds(entries: [string, BranchTime][]): number {
        return entries.reduce((sum, [_, time]) => sum + time.seconds, 0);
    }

    // Show branch time statistics in a new tab
    async function showBranchStats(): Promise<void> {
        // Force refresh the current branch time before showing stats
        if (currentBranch) {
            updateBranchTime();
        }

        if (branchTimes.size === 0) {
            vscode.window.showInformationMessage('No branch time data available yet.');
            return;
        }

        // Sort branches and compute totals
        const sortedBranches = getSortedBranches();
        const totalSeconds = getTotalSeconds(sortedBranches);

        // Create and show a new webview panel
        const panel = vscode.window.createWebviewPanel(
            'branchTimeTracker',
            'Branch Time Stats',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Update panel content function
        const updatePanelContent = () => {
            const freshBranches = getSortedBranches();
            const freshTotal = getTotalSeconds(freshBranches);
            panel.webview.html = getBranchStatsHtml(freshBranches, freshTotal);
        };

        // Initial content
        updatePanelContent();

        // Handle messages from the webview
        const messageDisposable = panel.webview.onDidReceiveMessage(
            async message => {
                console.log('Received message:', message);
                switch (message.command) {
                    case 'refresh':
                        // Force refresh the stats and update status bar
                        if (currentBranch) {
                            updateBranchTime();
                        }
                        updatePanelContent();
                        updateStatusBar();
                        break;
                        
                    case 'setAutoRefresh':
                        // Update auto-refresh settings
                        const newEnabled = message.enabled;
                        const newIntervalMinutes = Math.max(1, message.interval || 2);
                        
                        // Update the module state
                        autoRefreshEnabled = newEnabled;
                        autoRefreshInterval = newIntervalMinutes * ONE_MINUTE;
                        
                        // Save settings
                        await context.globalState.update('branchTimeTracker.autoRefreshEnabled', newEnabled);
                        await context.globalState.update('branchTimeTracker.autoRefreshInterval', newIntervalMinutes);
                        
                        // Update the auto-refresh timer
                        setupAutoRefresh();
                        
                        // Update the panel to show the new settings
                        updatePanelContent();
                        break;
                        
                    case 'togglePause':
                        await togglePauseTracking();
                        updatePanelContent();
                        break;
                        
                    case 'exportData':
                        await exportBranchData();
                        break;
                        
                    case 'importData':
                        await importBranchData();
                        updatePanelContent();
                        updateStatusBar();
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        // Register for auto-refresh updates
        const refreshDisposable = registerRefreshCallback(updatePanelContent);

        // Panel-scoped live update timer to guarantee updates even if global auto-refresh is disabled
        let panelTimer: NodeJS.Timeout | null = null;

        function startPanelTimer() {
            if (panelTimer) return;
            const intervalMs = getEffectiveInterval(); // consistent interval policy
            panelTimer = setInterval(() => {
                if (!isTrackingPaused && workspaceFolder) {
                    if (currentBranch) {
                        updateBranchTime();
                    }
                    updatePanelContent();
                    updateStatusBar();
                }
            }, intervalMs);
        }

        function stopPanelTimer() {
            if (panelTimer) {
                clearInterval(panelTimer);
                panelTimer = null;
            }
        }

        // Start timer when panel is visible
        if (panel.visible) {
            startPanelTimer();
        }

        // Manage visibility changes
        const viewStateDisposable = panel.onDidChangeViewState(() => {
            if (panel.visible) {
                startPanelTimer();
            } else {
                stopPanelTimer();
            }
        });

        // Clean up when the panel is disposed
        panel.onDidDispose(() => {
            messageDisposable.dispose();
            refreshDisposable.dispose();
            viewStateDisposable.dispose();
            stopPanelTimer();
        });
    }

    // Set up file system watcher for .git/HEAD changes
    function setupGitHeadWatcher(): void {
        if (gitHeadWatcher) {
            gitHeadWatcher.dispose();
        }

        if (!workspaceFolder) return;

        const gitHeadPath = path.join(workspaceFolder.uri.fsPath, '.git', 'HEAD');
        
        gitHeadWatcher = vscode.workspace.createFileSystemWatcher(gitHeadPath);
        gitHeadWatcher.onDidChange(async () => {
            console.log('Git HEAD changed, updating branch...');
            await handleBranchChange();
        });

        gitHeadWatcher.onDidCreate(async () => {
            console.log('Git HEAD created, updating branch...');
            await handleBranchChange();
        });
    }

    // Get extension version from package.json
    const extensionVersion = context.extension.packageJSON.version;

    // FIXED: Generate HTML for the branch statistics view
    function getBranchStatsHtml(sortedBranches: [string, BranchTime][], totalSeconds: number): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Branch Time Tracker v${extensionVersion}</title>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function setupEventListeners() {
                        const refreshButton = document.getElementById('refresh-button');
                        if (refreshButton) {
                            refreshButton.onclick = () => {
                                vscode.postMessage({ command: 'refresh' });
                            };
                        }
                        
                        const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
                        const refreshInterval = document.getElementById('refresh-interval');
                        
                        if (autoRefreshToggle) {
                            autoRefreshToggle.onchange = (e) => {
                                const interval = refreshInterval ? parseInt(refreshInterval.value) : 2;
                                vscode.postMessage({ 
                                    command: 'setAutoRefresh', 
                                    enabled: e.target.checked,
                                    interval: interval
                                });
                            };
                        }
                        
                        if (refreshInterval) {
                            refreshInterval.onchange = (e) => {
                                const enabled = autoRefreshToggle ? autoRefreshToggle.checked : false;
                                vscode.postMessage({ 
                                    command: 'setAutoRefresh',
                                    enabled: enabled,
                                    interval: parseInt(e.target.value)
                                });
                            };
                        }
                        
                        const pauseButton = document.getElementById('pause-button');
                        if (pauseButton) {
                            pauseButton.onclick = () => {
                                vscode.postMessage({ command: 'togglePause' });
                            };
                        }
                        
                        const exportButton = document.getElementById('export-button');
                        if (exportButton) {
                            exportButton.onclick = () => {
                                vscode.postMessage({ command: 'exportData' });
                            };
                        }
                        
                        const importButton = document.getElementById('import-button');
                        if (importButton) {
                            importButton.onclick = () => {
                                vscode.postMessage({ command: 'importData' });
                            };
                        }
                    }
                    
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', setupEventListeners);
                    } else {
                        setupEventListeners();
                    }
                </script>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        line-height: 1.6;
                    }
                    
                    h1 {
                        color: var(--vscode-textLink-foreground);
                        margin-bottom: 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 10px;
                    }
                    
                    .version-info {
                        color: var(--vscode-comment-foreground);
                        font-size: 0.8em;
                        margin-bottom: 20px;
                    }
                    
                    .refresh-controls {
                        display: flex;
                        gap: 15px;
                        align-items: center;
                        margin-bottom: 20px;
                        padding: 15px;
                        background-color: var(--vscode-panel-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        flex-wrap: wrap;
                    }
                    
                    .data-controls {
                        display: flex;
                        gap: 10px;
                        align-items: center;
                    }
                    
                    .refresh-button {
                        padding: 8px 16px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 0.9em;
                    }
                    
                    .refresh-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    
                    .refresh-button.paused {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                    
                    .refresh-button.paused:hover {
                        background-color: var(--vscode-button-secondaryHoverBackground);
                    }
                    
                    .refresh-button.secondary {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        font-size: 0.85em;
                    }
                    
                    .refresh-button.secondary:hover {
                        background-color: var(--vscode-button-secondaryHoverBackground);
                    }
                    
                    .auto-refresh-controls {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    
                    .auto-refresh-controls label {
                        font-size: 0.9em;
                        color: var(--vscode-foreground);
                    }
                    
                    .auto-refresh-controls input[type="number"] {
                        width: 60px;
                        padding: 4px 6px;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 3px;
                    }
                    
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    
                    th, td {
                        text-align: left;
                        padding: 12px 8px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    
                    th {
                        background-color: var(--vscode-panelSectionHeader-background);
                        font-weight: 600;
                    }
                    
                    tr:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    
                    .current-branch {
                        font-weight: bold;
                        color: var(--vscode-textLink-activeForeground);
                    }
                    
                    .time {
                        font-family: var(--vscode-editor-font-family);
                        font-size: 0.95em;
                        white-space: nowrap;
                    }
                    
                    .percentage-bar {
                        height: 6px;
                        background-color: var(--vscode-progressBar-background);
                        border-radius: 3px;
                        margin-top: 4px;
                        overflow: hidden;
                    }
                    
                    .percentage-fill {
                        height: 100%;
                        background-color: var(--vscode-progressBar-background);
                        border-radius: 3px;
                        transition: width 0.3s ease;
                    }
                    
                    .summary {
                        margin-top: 20px;
                        padding: 15px;
                        background-color: var(--vscode-panel-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                    }
                    
                    .summary p {
                        margin: 8px 0;
                    }
                </style>
            </head>
            <body>
                <h1>Branch Time Tracker</h1>
                <p class="version-info">Version ${extensionVersion}</p>
                
                <div class="refresh-controls">
                    <button id="refresh-button" class="refresh-button">
                        🔄 Refresh Now
                    </button>
                    
                    <button id="pause-button" class="refresh-button ${isTrackingPaused ? 'paused' : ''}">
                        ${isTrackingPaused ? '▶️ Resume Tracking' : '⏸️ Pause Tracking'}
                    </button>
                    
                    <div class="data-controls">
                        <button id="export-button" class="refresh-button secondary">
                            📤 Export Data
                        </button>
                        
                        <button id="import-button" class="refresh-button secondary">
                            📥 Import Data
                        </button>
                    </div>
                    
                    <div class="auto-refresh-controls">
                        <label>
                            <input type="checkbox" id="auto-refresh-toggle" ${autoRefreshEnabled ? 'checked' : ''}>
                            Auto-refresh every
                        </label>
                        <input type="number" id="refresh-interval" min="1" max="60" value="${autoRefreshInterval / ONE_MINUTE}">
                        <label>minutes</label>
                    </div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Branch</th>
                            <th>Time Spent</th>
                            <th>Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedBranches.map(([branch, time], index) => {
                            const isCurrent = branch === currentBranch;
                            const percentage = totalSeconds > 0 ? (time.seconds / totalSeconds) * 100 : 0;
                            return `
                                <tr ${isCurrent ? 'class="current-branch"' : ''}>
                                    <td>${index + 1}</td>
                                    <td>${escapeHtml(branch)}${isCurrent ? ' 👈 (current)' : ''}</td>
                                    <td class="time">${formatTime(time.seconds, true)}</td>
                                    <td>
                                        ${percentage.toFixed(1)}%
                                        <div class="percentage-bar">
                                            <div class="percentage-fill" style="width: ${percentage}%; background-color: ${isCurrent ? 'var(--vscode-textLink-activeForeground)' : 'var(--vscode-progressBar-background)'}"></div>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>

                <div class="summary">
                    <p><strong>Summary:</strong></p>
                    <p>📊 Total time tracked: <strong>${formatTime(totalSeconds, true)}</strong></p>
                    <p>🌿 Active branch: <strong>${currentBranch || 'None'}</strong></p>
                    <p>📈 Total branches: <strong>${branchTimes.size}</strong></p>
                </div>
            </body>
            </html>
        `;
    }

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('branch-time-tracker.showStats', showBranchStats),
        vscode.commands.registerCommand('branch-time-tracker.togglePause', togglePauseTracking),
        vscode.commands.registerCommand('branch-time-tracker.exportData', exportBranchData),
        vscode.commands.registerCommand('branch-time-tracker.importData', importBranchData)
    );

    // Initialize and set up event listeners
    initialize();

    // Clean up on deactivation
    const extension: BranchTimeTrackerExtension = {
        updateBranchTime,
        updateStatusBar,
        dispose: () => {
            if (currentTimer) {
                clearInterval(currentTimer);
                currentTimer = null;
            }
            if (gitHeadWatcher) {
                gitHeadWatcher.dispose();
                gitHeadWatcher = null;
            }
            if (statusBarHighlightTimeout) {
                clearTimeout(statusBarHighlightTimeout);
                statusBarHighlightTimeout = null;
            }
            updateBranchTime(); // Save final time update
            statusBarItem?.dispose();
        }
    };
    
    return extension;
}

export function deactivate() {}