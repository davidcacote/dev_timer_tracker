import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

interface BranchTime {
    seconds: number;
    lastUpdated: string;
}

const ONE_SECOND = 1000;
const DEFAULT_UPDATE_INTERVAL = 30 * ONE_SECOND; // 30 seconds

export function activate(context: vscode.ExtensionContext) {
    const storagePath = context.globalStoragePath;
    const timerFile = path.join(storagePath, 'branch-timers.json');
    let currentBranch: string | null = null;
    let currentTimer: NodeJS.Timeout | null = null;
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

        // Calculate time since last update
        const lastUpdate = new Date(branchTime.lastUpdated);
        const secondsElapsed = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
        
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

        loadBranchTimes();
        await handleBranchChange();
        updateStatusBar();

        // Set up periodic branch checking
        const config = vscode.workspace.getConfiguration('branchTimeTracker');
        const updateInterval = config.get<number>('updateInterval', DEFAULT_UPDATE_INTERVAL);
        
        currentTimer = setInterval(async () => {
            await handleBranchChange();
            updateStatusBar();
        }, updateInterval);

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
                enableScripts: false,
                retainContextWhenHidden: true
            }
        );

        // Generate HTML content
        panel.webview.html = getBranchStatsHtml(sortedBranches, totalSeconds);

        // Update the panel when the active branch changes
        const disposable = vscode.window.onDidChangeActiveTextEditor(() => {
            if (panel.visible) {
                panel.webview.html = getBranchStatsHtml(sortedBranches, totalSeconds);
            }
        });

        // Clean up the event listener when the panel is disposed
        panel.onDidDispose(() => {
            disposable.dispose();
        });
    }

    // Generate HTML for the branch statistics view
    function getBranchStatsHtml(sortedBranches: [string, BranchTime][], totalSeconds: number): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Branch Time Tracker</title>
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
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    th, td {
                        text-align: left;
                        padding: 8px 12px;
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
                </style>
            </head>
            <body>
                <h1>Branch Time Tracker</h1>
                
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
    return {
        dispose: () => {
            if (currentTimer) {
                clearInterval(currentTimer);
                currentTimer = null;
            }
            updateBranchTime(); // Save final time update
            statusBarItem?.dispose();
        }
    };
}

export function deactivate() {}
