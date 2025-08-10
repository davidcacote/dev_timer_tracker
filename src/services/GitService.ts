import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

/**
 * Git service interface for repository operations
 */
export interface IGitService {
    /**
     * Get the current active branch
     * @returns Current branch name or null if not in a git repository
     */
    getCurrentBranch(): Promise<string | null>;

    /**
     * Watch for branch changes
     * @param callback Function to call when branch changes
     * @returns Disposable to stop watching
     */
    watchBranchChanges(callback: (branch: string) => void): vscode.Disposable;

    /**
     * Check if the current workspace is a valid git repository
     * @returns True if valid git repository
     */
    isValidRepository(): Promise<boolean>;

    /**
     * Get list of recent branches
     * @returns Array of branch names
     */
    getBranchHistory(): Promise<string[]>;

    /**
     * Initialize the git service
     * @param workspaceFolder The workspace folder to monitor
     */
    initialize(workspaceFolder: vscode.WorkspaceFolder): Promise<void>;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Git operation error
 */
export class GitError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly stderr?: string
    ) {
        super(message);
        this.name = 'GitError';
    }
}

/**
 * Git service events
 */
export interface GitServiceEvents {
    /** Emitted when branch changes */
    branchChanged: (newBranch: string, oldBranch: string | null) => void;
    /** Emitted when git operation fails */
    error: (error: GitError) => void;
}

/**
 * Retry configuration for git operations
 */
interface RetryConfig {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffFactor: number;
}

/**
 * Git service implementation with enhanced error handling and retry mechanisms
 */
export class GitService implements IGitService {
    private workspaceFolder: vscode.WorkspaceFolder | null = null;
    private gitHeadWatcher: vscode.FileSystemWatcher | null = null;
    private gitRefsWatcher: vscode.FileSystemWatcher | null = null;
    private gitIndexWatcher: vscode.FileSystemWatcher | null = null;
    private branchChangeCallbacks: Array<(branch: string) => void> = [];
    private currentBranch: string | null = null;
    private isDisposed = false;
    private repositoryValid = false;
    private branchHistory: string[] = [];
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastBranchCheckTime = 0;
    private pollingInterval: NodeJS.Timeout | null = null;

    private readonly retryConfig: RetryConfig = {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 2000,
        backoffFactor: 2
    };

    private readonly debounceDelay = 300; // 300ms debounce
    private readonly pollingIntervalMs = 5000; // 5 second polling fallback

    /**
     * Initialize the git service with a workspace folder
     */
    async initialize(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
        if (this.isDisposed) {
            throw new Error('GitService has been disposed');
        }

        this.workspaceFolder = workspaceFolder;
        
        // Validate repository
        this.repositoryValid = await this.isValidRepository();
        
        if (this.repositoryValid) {
            // Get initial branch
            this.currentBranch = await this.getCurrentBranch();
            
            // Load branch history
            await this.loadBranchHistory();
            
            // Set up enhanced file system watchers
            this.setupEnhancedWatchers();
            
            // Set up polling fallback for external git operations
            this.setupPollingFallback();
        }
    }

    /**
     * Get the current active branch with retry logic
     */
    async getCurrentBranch(): Promise<string | null> {
        if (!this.workspaceFolder || !this.repositoryValid) {
            return null;
        }

        return this.executeGitCommand(['branch', '--show-current'])
            .then(output => {
                const branch = output.trim();
                return branch || 'main'; // Default to 'main' if empty
            })
            .catch(error => {
                console.error('Error getting current git branch:', error);
                return null;
            });
    }

    /**
     * Check if the current workspace is a valid git repository
     */
    async isValidRepository(): Promise<boolean> {
        if (!this.workspaceFolder) {
            return false;
        }

        try {
            // Check if .git directory exists
            const gitDir = path.join(this.workspaceFolder.uri.fsPath, '.git');
            const gitDirExists = await this.fileExists(gitDir);
            
            if (!gitDirExists) {
                return false;
            }

            // Verify with git command
            await this.executeGitCommand(['rev-parse', '--git-dir']);
            return true;
        } catch (error) {
            console.error('Repository validation failed:', error);
            return false;
        }
    }

    /**
     * Get list of recent branches
     */
    async getBranchHistory(): Promise<string[]> {
        if (!this.workspaceFolder || !this.repositoryValid) {
            return [];
        }

        try {
            // Get all branches sorted by last commit date
            const output = await this.executeGitCommand([
                'for-each-ref',
                '--sort=-committerdate',
                '--format=%(refname:short)',
                'refs/heads/'
            ]);

            const branches = output
                .split('\n')
                .map(branch => branch.trim())
                .filter(branch => branch.length > 0)
                .slice(0, 20); // Limit to 20 most recent branches

            this.branchHistory = branches;
            return branches;
        } catch (error) {
            console.error('Error getting branch history:', error);
            return this.branchHistory; // Return cached history on error
        }
    }

    /**
     * Watch for branch changes
     */
    watchBranchChanges(callback: (branch: string) => void): vscode.Disposable {
        this.branchChangeCallbacks.push(callback);

        return new vscode.Disposable(() => {
            const index = this.branchChangeCallbacks.indexOf(callback);
            if (index !== -1) {
                this.branchChangeCallbacks.splice(index, 1);
            }
        });
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.isDisposed = true;
        
        // Dispose all watchers
        if (this.gitHeadWatcher) {
            this.gitHeadWatcher.dispose();
            this.gitHeadWatcher = null;
        }
        
        if (this.gitRefsWatcher) {
            this.gitRefsWatcher.dispose();
            this.gitRefsWatcher = null;
        }
        
        if (this.gitIndexWatcher) {
            this.gitIndexWatcher.dispose();
            this.gitIndexWatcher = null;
        }

        // Clear timers
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }

        this.branchChangeCallbacks = [];
        this.workspaceFolder = null;
        this.currentBranch = null;
        this.repositoryValid = false;
        this.branchHistory = [];
    }

    /**
     * Execute git command with retry logic and error handling
     */
    private async executeGitCommand(args: string[]): Promise<string> {
        if (!this.workspaceFolder) {
            throw new GitError('No workspace folder available', 'NO_WORKSPACE');
        }

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
            try {
                const result = await this.runGitProcess(args);
                return result;
            } catch (error) {
                lastError = error as Error;
                
                // Don't retry for certain error types
                if (error instanceof GitError && this.isNonRetryableError(error.code)) {
                    throw error;
                }

                // Calculate delay for exponential backoff
                if (attempt < this.retryConfig.maxAttempts) {
                    const delay = Math.min(
                        this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt - 1),
                        this.retryConfig.maxDelay
                    );
                    
                    console.log(`Git command failed (attempt ${attempt}/${this.retryConfig.maxAttempts}), retrying in ${delay}ms...`);
                    await this.sleep(delay);
                }
            }
        }

        // All retries failed
        throw lastError || new GitError('Git command failed after all retries', 'RETRY_EXHAUSTED');
    }

    /**
     * Run git process and return output
     */
    private runGitProcess(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const gitProcess = spawn('git', args, {
                cwd: this.workspaceFolder!.uri.fsPath,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            gitProcess.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            gitProcess.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            gitProcess.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    const errorCode = this.getErrorCode(code, stderr);
                    reject(new GitError(
                        `Git command failed: ${args.join(' ')}`,
                        errorCode,
                        stderr
                    ));
                }
            });

            gitProcess.on('error', (error: Error) => {
                reject(new GitError(
                    `Failed to spawn git process: ${error.message}`,
                    'SPAWN_ERROR'
                ));
            });

            // Set timeout for git operations
            setTimeout(() => {
                if (!gitProcess.killed) {
                    gitProcess.kill();
                    reject(new GitError('Git command timed out', 'TIMEOUT'));
                }
            }, 10000); // 10 second timeout
        });
    }

    /**
     * Set up enhanced file system watchers for comprehensive git change detection
     */
    private setupEnhancedWatchers(): void {
        if (!this.workspaceFolder) {
            return;
        }

        const gitDir = path.join(this.workspaceFolder.uri.fsPath, '.git');
        
        try {
            // Watch .git/HEAD for branch switches
            const gitHeadPath = path.join(gitDir, 'HEAD');
            this.gitHeadWatcher = vscode.workspace.createFileSystemWatcher(gitHeadPath);
            
            this.gitHeadWatcher.onDidChange(() => this.debouncedBranchChange());
            this.gitHeadWatcher.onDidCreate(() => this.debouncedBranchChange());

            // Watch .git/refs/heads/* for branch creation/deletion
            const gitRefsPattern = path.join(gitDir, 'refs', 'heads', '*');
            this.gitRefsWatcher = vscode.workspace.createFileSystemWatcher(gitRefsPattern);
            
            this.gitRefsWatcher.onDidChange(() => this.debouncedBranchChange());
            this.gitRefsWatcher.onDidCreate(() => this.debouncedBranchChange());
            this.gitRefsWatcher.onDidDelete(() => this.debouncedBranchChange());

            // Watch .git/index for staging changes that might affect branch detection
            const gitIndexPath = path.join(gitDir, 'index');
            this.gitIndexWatcher = vscode.workspace.createFileSystemWatcher(gitIndexPath);
            
            this.gitIndexWatcher.onDidChange(() => this.debouncedBranchChange());

            console.log('Enhanced git watchers set up successfully');
        } catch (error) {
            console.error('Failed to set up enhanced git watchers:', error);
            // Fallback to basic HEAD watcher
            this.setupBasicHeadWatcher();
        }
    }

    /**
     * Set up basic HEAD watcher as fallback
     */
    private setupBasicHeadWatcher(): void {
        if (!this.workspaceFolder || this.gitHeadWatcher) {
            return;
        }

        const gitHeadPath = path.join(this.workspaceFolder.uri.fsPath, '.git', 'HEAD');
        
        try {
            this.gitHeadWatcher = vscode.workspace.createFileSystemWatcher(gitHeadPath);
            
            this.gitHeadWatcher.onDidChange(() => this.debouncedBranchChange());
            this.gitHeadWatcher.onDidCreate(() => this.debouncedBranchChange());
            
            console.log('Basic git HEAD watcher set up as fallback');
        } catch (error) {
            console.error('Failed to set up basic git HEAD watcher:', error);
        }
    }

    /**
     * Set up polling fallback to detect external git operations
     */
    private setupPollingFallback(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        this.pollingInterval = setInterval(async () => {
            // Only poll if we haven't detected changes recently via file watchers
            const timeSinceLastCheck = Date.now() - this.lastBranchCheckTime;
            if (timeSinceLastCheck > this.pollingIntervalMs - 1000) {
                await this.checkForBranchChange();
            }
        }, this.pollingIntervalMs);

        console.log(`Polling fallback set up with ${this.pollingIntervalMs}ms interval`);
    }

    /**
     * Debounced branch change handler to prevent excessive calls
     */
    private debouncedBranchChange(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
            await this.handleBranchChange();
        }, this.debounceDelay);
    }

    /**
     * Check for branch change without debouncing (used by polling)
     */
    private async checkForBranchChange(): Promise<void> {
        this.lastBranchCheckTime = Date.now();
        await this.handleBranchChange();
    }

    /**
     * Handle branch change detection with enhanced validation
     */
    private async handleBranchChange(): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        this.lastBranchCheckTime = Date.now();

        try {
            // Double-check repository validity
            if (!this.repositoryValid) {
                this.repositoryValid = await this.isValidRepository();
                if (!this.repositoryValid) {
                    return;
                }
            }

            const newBranch = await this.getCurrentBranch();
            
            // Validate branch change
            if (this.isValidBranchChange(newBranch)) {
                const oldBranch = this.currentBranch;
                this.currentBranch = newBranch;
                
                // Update branch history
                await this.updateBranchHistory(newBranch!);
                
                // Notify callbacks with error handling
                this.notifyBranchChangeCallbacks(newBranch!, oldBranch);

                console.log(`Branch changed from ${oldBranch || 'unknown'} to ${newBranch}`);
            }
        } catch (error) {
            console.error('Error handling branch change:', error);
            
            // Attempt to recover by re-validating repository
            try {
                this.repositoryValid = await this.isValidRepository();
            } catch (recoveryError) {
                console.error('Failed to recover from branch change error:', recoveryError);
            }
        }
    }

    /**
     * Validate if a branch change is legitimate
     */
    private isValidBranchChange(newBranch: string | null): boolean {
        // Branch must exist and be different from current
        if (!newBranch || newBranch === this.currentBranch) {
            return false;
        }

        // Additional validation: branch name should be reasonable
        if (newBranch.length > 255 || newBranch.includes('\0')) {
            console.warn(`Invalid branch name detected: ${newBranch}`);
            return false;
        }

        return true;
    }

    /**
     * Safely notify all branch change callbacks
     */
    private notifyBranchChangeCallbacks(newBranch: string, oldBranch: string | null): void {
        const callbacksCopy = [...this.branchChangeCallbacks];
        
        callbacksCopy.forEach((callback, index) => {
            try {
                callback(newBranch);
            } catch (error) {
                console.error(`Error in branch change callback ${index}:`, error);
                
                // Remove problematic callback to prevent future errors
                const callbackIndex = this.branchChangeCallbacks.indexOf(callback);
                if (callbackIndex !== -1) {
                    this.branchChangeCallbacks.splice(callbackIndex, 1);
                    console.warn(`Removed problematic branch change callback ${index}`);
                }
            }
        });
    }

    /**
     * Load branch history from git
     */
    private async loadBranchHistory(): Promise<void> {
        try {
            await this.getBranchHistory();
        } catch (error) {
            console.error('Failed to load branch history:', error);
        }
    }

    /**
     * Update branch history with new branch
     */
    private async updateBranchHistory(newBranch: string): Promise<void> {
        // Remove branch if it already exists and add to front
        this.branchHistory = this.branchHistory.filter(branch => branch !== newBranch);
        this.branchHistory.unshift(newBranch);
        
        // Keep only the most recent 20 branches
        this.branchHistory = this.branchHistory.slice(0, 20);
    }

    /**
     * Check if error code indicates a non-retryable error
     */
    private isNonRetryableError(code: string): boolean {
        const nonRetryableCodes = [
            'NOT_GIT_REPO',
            'INVALID_COMMAND',
            'SPAWN_ERROR'
        ];
        return nonRetryableCodes.includes(code);
    }

    /**
     * Get error code from git process exit code and stderr
     */
    private getErrorCode(exitCode: number | null, stderr: string): string {
        if (exitCode === 128) {
            if (stderr.includes('not a git repository')) {
                return 'NOT_GIT_REPO';
            }
            if (stderr.includes('unknown command')) {
                return 'INVALID_COMMAND';
            }
        }
        
        return `EXIT_CODE_${exitCode || 'UNKNOWN'}`;
    }

    /**
     * Check if file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Force refresh branch information (useful after external git operations)
     */
    async refreshBranchInfo(): Promise<void> {
        if (this.isDisposed || !this.repositoryValid) {
            return;
        }

        try {
            // Force a branch check
            await this.checkForBranchChange();
            
            // Refresh branch history
            await this.loadBranchHistory();
        } catch (error) {
            console.error('Error refreshing branch info:', error);
        }
    }

    /**
     * Get current repository status for debugging
     */
    async getRepositoryStatus(): Promise<{
        isValid: boolean;
        currentBranch: string | null;
        branchCount: number;
        lastCheckTime: number;
        watchersActive: boolean;
    }> {
        return {
            isValid: this.repositoryValid,
            currentBranch: this.currentBranch,
            branchCount: this.branchHistory.length,
            lastCheckTime: this.lastBranchCheckTime,
            watchersActive: !!(this.gitHeadWatcher || this.gitRefsWatcher || this.gitIndexWatcher)
        };
    }

    /**
     * Manually trigger branch change detection (for testing or external triggers)
     */
    async triggerBranchCheck(): Promise<void> {
        await this.debouncedBranchChange();
    }
}