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

    // Initialize extension
    async function initialize(): Promise<void> {
        workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            console.log('No workspace folder open');
            return;
        }

        loadBranchTimes();
        await handleBranchChange();

        // Set up periodic branch checking
        const config = vscode.workspace.getConfiguration('branchTimeTracker');
        const updateInterval = config.get<number>('updateInterval', DEFAULT_UPDATE_INTERVAL);
        
        currentTimer = setInterval(async () => {
            await handleBranchChange();
        }, updateInterval);

        // Set up event listeners
        vscode.workspace.onDidChangeWorkspaceFolders(async () => {
            workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                await handleBranchChange();
            }
        });
    }

    // Format time in a human-readable format
    function formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        
        const parts: string[] = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
        parts.push(`${remainingSeconds}s`);
        
        return parts.join(' ');
    }

    // Show branch time statistics
    function showBranchStats(): void {
        if (branchTimes.size === 0) {
            vscode.window.showInformationMessage('No branch time data available yet.');
            return;
        }

        const stats = Array.from(branchTimes.entries())
            .sort((a, b) => b[1].seconds - a[1].seconds)
            .map(([branch, time]) => {
                return `${branch}: ${formatTime(time.seconds)}`;
            });

        const message = `Branch Time Statistics:\n\n${stats.join('\n')}`;
        vscode.window.showInformationMessage(message);
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
        }
    };
}

export function deactivate() {}
