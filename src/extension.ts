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

    // Update time for current branch - FIXED LOGIC
    function updateBranchTime(): void {
        if (!currentBranch) return;

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
        statusBarItem.text = `$(watch) ${formattedTime} on ${currentBranch}`;
        statusBarItem.tooltip = `Spent ${formattedTime} on branch "${currentBranch}". Click for details.`;
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

        // Load settings from storage
        autoRefreshEnabled = context.globalState.get<boolean>('branchTimeTracker.autoRefreshEnabled', true);
        const savedIntervalMinutes = context.globalState.get<number>('branchTimeTracker.autoRefreshInterval', 2);
        autoRefreshInterval = Math.max(1, savedIntervalMinutes || 2) * ONE_MINUTE;

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
            
            console.log(`Auto-refresh enabled with ${autoRefreshInterval / ONE_MINUTE} minute interval`);
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
            updateBranchTime();
        }

        if (branchTimes.size === 0) {
            vscode.window.showInformationMessage('No branch time data available yet.');
            return;
        }

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
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Update panel content function
        const updatePanelContent = () => {
            const freshBranches = Array.from(branchTimes.entries())
                .sort((a, b) => b[1].seconds - a[1].seconds);
            const freshTotal = freshBranches.reduce((sum, [_, time]) => sum + time.seconds, 0);
            
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
                }
            },
            undefined,
            context.subscriptions
        );
        
        // Register for auto-refresh updates
        const refreshDisposable = registerRefreshCallback(updatePanelContent);

        // Clean up when the panel is disposed
        panel.onDidDispose(() => {
            messageDisposable.dispose();
            refreshDisposable.dispose();
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