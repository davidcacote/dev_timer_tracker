import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';

interface BranchTime {
    branch: string;
    timeSpent: number; // in milliseconds
    lastActive: number; // timestamp
}

export function activate(context: vscode.ExtensionContext) {
    const storagePath = context.globalStoragePath;
    const timerFile = path.join(storagePath, 'branch-timers.json');
    let currentBranch: string | null = null;
    let currentTimer: NodeJS.Timeout | null = null;
    let branchTimes: Map<string, BranchTime> = new Map();

    // Initialize branch times from storage
    try {
        if (fs.existsSync(timerFile)) {
            const data = fs.readFileSync(timerFile, 'utf8');
            const savedTimes = JSON.parse(data);
            for (const [branch, timeObj] of Object.entries(savedTimes)) {
                branchTimes.set(branch, timeObj as BranchTime);
            }
        }
    } catch (error) {
        console.error('Error loading branch times:', error);
    }

    // Function to get current git branch
    async function getCurrentBranch(): Promise<string | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return null;

            const gitProcess = spawn('git', ['branch', '--show-current'], {
                cwd: workspaceFolder.uri.fsPath
            });

            return new Promise((resolve) => {
                let output = '';
                gitProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });
                gitProcess.on('close', () => {
                    resolve(output.trim());
                });
            });
        } catch (error) {
            console.error('Error getting branch:', error);
            return null;
        }
    }

    // Function to start/stop timer
    function updateTimer() {
        getCurrentBranch().then(branch => {
            if (!branch) return;

            if (currentBranch !== branch) {
                // Stop previous timer
                if (currentTimer) {
                    clearTimeout(currentTimer);
                    currentTimer = null;
                }

                // Save time for previous branch
                if (currentBranch) {
                    const time = branchTimes.get(currentBranch) || { branch: currentBranch, timeSpent: 0, lastActive: Date.now() };
                    time.timeSpent += Date.now() - time.lastActive;
                    branchTimes.set(currentBranch, time);
                    saveBranchTimes();
                }

                // Start new timer
                currentBranch = branch;
                const time = branchTimes.get(branch) || { branch, timeSpent: 0, lastActive: Date.now() };
                branchTimes.set(branch, time);
                currentTimer = setInterval(updateTimer, 1000);
            }
        });
    }

    // Function to save branch times
    function saveBranchTimes() {
        try {
            fs.writeFileSync(timerFile, JSON.stringify(Object.fromEntries(branchTimes), null, 2));
        } catch (error) {
            console.error('Error saving branch times:', error);
        }
    }

    // Register command to show stats
    const showStatsCommand = vscode.commands.registerCommand('branch-time-tracker.showStats', () => {
        const items: vscode.QuickPickItem[] = [];
        branchTimes.forEach((time, branch) => {
            const hours = Math.floor(time.timeSpent / 3600000);
            const minutes = Math.floor((time.timeSpent % 3600000) / 60000);
            items.push({
                label: `${branch} - ${hours}h ${minutes}m`,
                description: `Last active: ${new Date(time.lastActive).toLocaleString()}`
            });
        });

        vscode.window.showQuickPick(items, { canPickMany: false });
    });

    // Start tracking when extension activates
    updateTimer();

    // Register commands and disposables
    context.subscriptions.push(showStatsCommand);
}

export function deactivate() {}
