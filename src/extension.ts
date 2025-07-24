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
    let refreshCallbacks: Array<() => void> = [];
    let branchTimes: Map<string, BranchTime> = new Map();
    let workspaceFolder: vscode.WorkspaceFolder | undefined;
    let statusBarItem: vscode.StatusBarItem;

    // Initialize branch times from storage
    function loadBranchTimes(): void {
        try {
            if (fs.existsSync(timerFile)) {
                const data = fs.readFileSync(timerFile, 'utf8');
                const savedTimes = JSON.parse(data) as Record<string, BranchTime>;
                branchTimes = new Map<string, BranchTime>(Object.entries(savedTimes));
            }
        } catch (error) {
            console.error('Error loading branch times:', error);
        }
    }

    // Save branch times to storage
    function saveBranchTimes(): void {
        try {
            const data = JSON.stringify(Object.fromEntries(branchTimes), null, 2);
            fs.mkdirSync(path.dirname(timerFile), { recursive: true });
            fs.writeFileSync(timerFile, data, 'utf8');
        } catch (error) {
            console.error('Error saving branch times:', error);
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
                    resolve(null);
                }
            });
        });
    }

    // Update time for current branch
    function updateBranchTime(): void {
        if (!currentBranch) return;

        const now = new Date();
        const branchTime = branchTimes.get(currentBranch) || {
            seconds: 0,
            lastUpdated: now.toISOString()
        };

        // Always update the lastUpdated time to ensure we track the current time
        const lastUpdate = new Date(branchTime.lastUpdated);
        const secondsElapsed = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
        
        // Always update the lastUpdated time, even if no time has passed
        branchTime.lastUpdated = now.toISOString();
        
        // Only increment the seconds if time has actually passed
        if (secondsElapsed > 0) {
            branchTime.seconds += secondsElapsed;
        }
        
        branchTimes.set(currentBranch, branchTime);
        saveBranchTimes();
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
            }
            
            console.log(`Switched to branch: ${currentBranch}`);
        }
    }

    // Update status bar with time spent on current branch (without seconds)
    function updateStatusBar(): void {
        if (!statusBarItem) {
            statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
            statusBarItem.command = 'branch-time-tracker.showStats';
            statusBarItem.tooltip = 'Click to view branch time statistics';
            statusBarItem.show();
        }

        if (!currentBranch) {
            statusBarItem.text = '$(watch) No active branch';
            return;
        }

        const branchTime = branchTimes.get(currentBranch);
        const timeSpent = branchTime ? branchTime.seconds : 0;
        const formattedTime = formatTime(timeSpent, false);
        
        // Show just the time with a clock icon (no seconds)
        statusBarItem.text = `$(watch) ${formattedTime} on branch`;
        statusBarItem.tooltip = `Spent ${formattedTime} on current branch. Click for details.`;
    }

    // Initialize extension
    async function initialize(): Promise<void> {
        // Create status bar item
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.command = 'branch-time-tracker.showStats';
        statusBarItem.text = '$(loading~spin) Loading branch time...';
        statusBarItem.show();

        workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            statusBarItem.text = '$(error) No workspace folder';
            statusBarItem.tooltip = 'Open a workspace with a Git repository to track branch time';
            console.log('No workspace folder open');
            return;
        }

        // Get saved auto-refresh settings (use local variables to avoid shadowing)
        const savedAutoRefresh = context.globalState.get<boolean>('branchTimeTracker.autoRefreshEnabled', true);
        // Get interval in minutes from storage, default to 2 minutes if not set
        const savedIntervalMinutes = context.globalState.get<number>('branchTimeTracker.autoRefreshInterval', 2);

        // Update the module state with saved values
        autoRefreshEnabled = savedAutoRefresh;
        // Ensure we have a valid interval (minimum 1 minute, default 2 minutes)
        const validatedInterval = Math.max(1, savedIntervalMinutes || 2);
        autoRefreshInterval = validatedInterval * ONE_MINUTE; // Convert minutes to ms
        loadBranchTimes();
        await handleBranchChange();
        updateStatusBar();

        // Set up the auto-refresh timer if enabled
        setupAutoRefresh();

        // Set up event listeners
        vscode.workspace.onDidChangeWorkspaceFolders(async () => {
            workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                await handleBranchChange();
                updateStatusBar();
            } else {
                statusBarItem.text = '$(error) No workspace folder';
                statusBarItem.tooltip = 'Open a workspace with a Git repository to track branch time';
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

    // Set up or update the auto-refresh timer
    function setupAutoRefresh(): void {
        // Clear any existing timer
        if (currentTimer) {
            clearInterval(currentTimer);
            currentTimer = null;
        }

        // Set up new timer if auto-refresh is enabled
        if (autoRefreshEnabled) {
            currentTimer = setInterval(() => {
                // Update branch time
                if (currentBranch) {
                    updateBranchTime();
                }
                
                // Update status bar
                updateStatusBar();
                
                // Notify all registered callbacks (e.g., webview panels)
                refreshCallbacks.forEach(callback => callback());
                
            }, autoRefreshInterval);
            
            console.log(`Auto-refresh enabled with ${autoRefreshInterval / 1000} second interval`);
        }
    }

    // Register a callback to be called on each auto-refresh
    function registerRefreshCallback(callback: () => void): vscode.Disposable {
        refreshCallbacks.push(callback);
        
        return new vscode.Disposable(() => {
            const index = refreshCallbacks.indexOf(callback);
            if (index !== -1) {
                refreshCallbacks.splice(index, 1);
            }
        });
    }

    // Show branch time statistics in a new tab
    async function showBranchStats(): Promise<void> {
        // Force refresh the current branch time before showing stats
        if (currentBranch) {
            await updateBranchTime();
        }

        if (branchTimes.size === 0) {
            vscode.window.showInformationMessage('No branch time data available yet.');
            return;
        }
        
        // Get saved auto-refresh settings (use local variables to avoid shadowing)
        const savedAutoRefresh = context.globalState.get<boolean>('branchTimeTracker.autoRefreshEnabled', true);
        const savedInterval = context.globalState.get<number>('branchTimeTracker.autoRefreshInterval', 2);

        // Sort branches by time spent (descending)
        const sortedBranches = Array.from(branchTimes.entries())
            .sort((a, b) => b[1].seconds - a[1].seconds);

        // Calculate total time across all branches
        const totalSeconds = sortedBranches.reduce((sum, [_, time]) => sum + time.seconds, 0);

        // Create and show a new webview panel
        const panel = vscode.window.createWebviewPanel(
            'branchTimeTracker',
            'Branch Time Stats',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true, // Enable scripts for refresh functionality
                retainContextWhenHidden: true
            }
        );

        // Generate HTML content with current settings
        panel.webview.html = getBranchStatsHtml(
            sortedBranches, 
            totalSeconds, 
            false, 
            autoRefreshEnabled, 
            autoRefreshInterval
        );

        // Update the panel when the active branch changes
        const disposable = vscode.window.onDidChangeActiveTextEditor(() => {
            if (panel.visible) {
                panel.webview.html = getBranchStatsHtml(sortedBranches, totalSeconds);
            }
        });

        // Update panel content function with proper typing
        const updatePanelContent = (panel: vscode.WebviewPanel, branches: [string, BranchTime][], total: number) => {
            // Always get fresh data for the panel
            const freshBranches = Array.from(branchTimes.entries())
                .sort((a, b) => b[1].seconds - a[1].seconds);
            const freshTotal = freshBranches.reduce((sum, [_, time]) => sum + time.seconds, 0);
            
            panel.webview.html = getBranchStatsHtml(
                freshBranches, 
                freshTotal, 
                true, 
                savedAutoRefresh, 
                savedInterval // Already in seconds
            );
        };

        // Handle messages from the webview
        const messageDisposable = panel.webview.onDidReceiveMessage(
            async message => {
                console.log('Received message:', message);
                switch (message.command) {
                    case 'refresh':
                        // Force refresh the stats and update status bar
                        await updateBranchTime();
                        updatePanelContent(panel, sortedBranches, totalSeconds);
                        updateStatusBar(); // Update status bar on manual refresh
                        break;
                        
                    case 'setAutoRefresh':
                        // Update auto-refresh settings
                        const newEnabled = message.enabled;
                        // Ensure we have a valid interval (minimum 1 minute, default 2 minutes)
                        const newIntervalMinutes = Math.max(1, message.interval || 2);
                        const newIntervalMs = newIntervalMinutes * ONE_MINUTE;
                        
                        // Update the module state
                        autoRefreshEnabled = newEnabled;
                        autoRefreshInterval = newIntervalMs;
                        
                        // Save settings (store in minutes for consistency)
                        await context.globalState.update('branchTimeTracker.autoRefreshEnabled', newEnabled);
                        await context.globalState.update('branchTimeTracker.autoRefreshInterval', newIntervalMinutes);
                        
                        // Update the auto-refresh timer
                        setupAutoRefresh();
                        
                        // Update the panel to show the new settings
                        updatePanelContent(panel, sortedBranches, totalSeconds);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
        
        // Register for auto-refresh updates
        const refreshDisposable = registerRefreshCallback(() => updatePanelContent(panel, sortedBranches, totalSeconds));

        // Clean up when the panel is disposed
        panel.onDidDispose(() => {
            disposable.dispose();
            messageDisposable.dispose();
            refreshDisposable.dispose();
        });
    }

    // Get extension version from package.json
    const extensionVersion = context.extension.packageJSON.version;

    // Generate HTML for the branch statistics view
    function getBranchStatsHtml(
        sortedBranches: [string, BranchTime][], 
        totalSeconds: number, 
        isPartialUpdate: boolean = false,
        autoRefreshEnabled: boolean = true,
        autoRefreshInterval: number = DEFAULT_UPDATE_INTERVAL
    ): string {
        // Generate the rows for the branches table
        const rows = sortedBranches.map(([branch, time], index) => {
            const percentage = totalSeconds > 0 ? (time.seconds / totalSeconds) * 100 : 0;
            const isCurrent = branch === currentBranch;
            
            return `
                <tr${isCurrent ? ' class="current-branch"' : ''}>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(branch)}${isCurrent ? ' <span class="codicon codicon-arrow-right"></span>' : ''}</td>
                    <td class="time">${formatTime(time.seconds, true)}</td>
                    <td>
                        <div>${percentage.toFixed(1)}%</div>
                        <div class="percentage-bar">
                            <div class="percentage-fill" style="width: ${percentage}%"></div>
                        </div>
                    </td>
                </tr>`;
        }).join('');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Branch Time Tracker v${extensionVersion}</title>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // Function to set up event listeners
                    function setupEventListeners() {
                        // Handle refresh button click
                        const refreshButton = document.getElementById('refresh-button');
                        if (refreshButton) {
                            refreshButton.onclick = () => {
                                vscode.postMessage({ command: 'refresh' });
                            };
                        }
                        
                        // Handle auto-refresh toggle
                        const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
                        const refreshInterval = document.getElementById('refresh-interval');
                        
                        if (autoRefreshToggle) {
                            autoRefreshToggle.onchange = (e) => {
                                const interval = refreshInterval ? parseInt(refreshInterval.value) : 5;
                                vscode.postMessage({ 
                                    command: 'setAutoRefresh', 
                                    enabled: e.target.checked,
                                    interval: interval
                                });
                            };
                        }
                        
                        // Handle interval input change
                        if (refreshInterval) {
                            refreshInterval.onchange = (e) => {
                                const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
                                if (autoRefreshToggle && autoRefreshToggle.checked) {
                                    vscode.postMessage({ 
                                        command: 'setAutoRefresh',
                                        enabled: true,
                                        interval: parseInt(e.target.value)
                                    });
                                }
                            };
                        }
                    }
                    
                    // Initialize event listeners when the DOM is loaded
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', setupEventListeners);
                    } else {
                        setupEventListeners();
                    }
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'updateStats') {
                            // Update only the stats table, not the header/version
                            const statsTable = document.getElementById('stats-table');
                            if (statsTable) {
                                statsTable.innerHTML = message.content;
                                // Re-attach event listeners after content update
                                setupEventListeners();
                            }
                        }
                    });
                </script>
                <style>
                    .version-info {
                        color: var(--vscode-comment-foreground);
                        font-size: 0.8em;
                        margin-bottom: 10px;
                    }
                    
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
                    }
                    tr:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .current-branch {
                        font-weight: bold;
                        color: var(--vscode-textLink-activeForeground);
                    }
                    .summary {
                        margin-top: 20px;
                        padding: 15px;
                        background-color: var(--vscode-panelSectionHeader-background);
                        border-radius: 3px;
                    }
                    .time {
                        font-family: var(--vscode-editor-font-family);
                        font-size: 0.95em;
                        white-space: nowrap;
                    }
                    .percentage-bar {
                        height: 8px;
                        background-color: var(--vscode-progressBar-background);
                        border-radius: 4px;
                        margin-top: 4px;
                        overflow: hidden;
                    }
                    .percentage-fill {
                        height: 100%;
                        background-color: var(--vscode-textLink-foreground);
                        border-radius: 4px;
                    }
                    
                    /* Refresh controls */
                    .refresh-controls {
                        display: flex;
                        gap: 15px;
                        align-items: center;
                        margin-bottom: 20px;
                        padding: 10px;
                        background-color: var(--vscode-panelSectionHeader-background);
                        border-radius: 4px;
                    }
                    
                    .refresh-button {
                        padding: 5px 12px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 2px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    }
                    
                    .refresh-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    
                    .refresh-button:active {
                        background-color: var(--vscode-button-background);
                    }
                    
                    .auto-refresh-controls {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        margin-left: 10px;
                    }
                    
                    .auto-refresh-controls label {
                        font-size: 0.9em;
                        color: var(--vscode-foreground);
                    }
                    
                    .auto-refresh-controls input[type="number"] {
                        width: 50px;
                        padding: 3px 5px;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 2px;
                    }
                    
                    .auto-refresh-controls input[type="checkbox"] {
                        margin: 0;
                    }
                </style>
            </head>
            <body>
                <h1>Branch Time Tracker</h1>
                <p class="version-info">Version ${extensionVersion}</p>
                <div class="stats-container">
                    <div class="refresh-controls">
                            <th>Branch</th>
                            <th>Time Spent</th>
                            <th>Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedBranches.map(([branch, time], index) => {
                            const isCurrent = branch === currentBranch;
                            const percentage = totalSeconds > 0 ? (time.seconds / totalSeconds) * 100 : 0;
                            const formattedPercentage = percentage.toFixed(1);
                            return `
                                <tr class="${isCurrent ? 'current-branch' : ''}">
                                    <td>${index + 1}</td>
                                    <td>${branch}${isCurrent ? ' (current)' : ''}</td>
                                    <td class="time">${formatTime(time.seconds, true)}</td>
                                    <td>
                                        ${formattedPercentage}%
                                        <div class="percentage-bar">
                                            <div class="percentage-fill" style="width: ${percentage}%"></div>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>

                <div class="summary">
                    <p>Total time tracked: <strong>${formatTime(totalSeconds, true)}</strong></p>
                    <p>Active branch: <strong>${currentBranch || 'None'}</strong></p>
                    <p>Total branches: <strong>${branchTimes.size}</strong></p>
                </div>
            </div>
        </body>
                    <p>Total time tracked: <strong>${formatTime(totalSeconds, true)}</strong></p>
                    <p>Active branch: <strong>${currentBranch || 'None'}</strong></p>
                    <p>Total branches: <strong>${branchTimes.size}</strong></p>
                </div>
            </body>
            </html>
        `;
    }

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('branch-time-tracker.showStats', showBranchStats)
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
            updateBranchTime(); // Save final time update
            statusBarItem?.dispose();
        }
    };
    
    return extension;
}

export function deactivate() {}
