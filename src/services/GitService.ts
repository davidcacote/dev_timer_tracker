import * as vscode from 'vscode';

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