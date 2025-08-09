/**
 * Represents time tracking data for a specific branch
 */
export interface BranchTime {
    /** Total seconds spent on this branch */
    seconds: number;
    /** ISO timestamp of last update */
    lastUpdated: string;
    /** Number of tracking sessions on this branch */
    sessionCount: number;
    /** Average time per session in seconds */
    averageSessionTime: number;
}

/**
 * Statistics data for display purposes
 */
export interface BranchStatistics {
    /** Total time across all branches */
    totalTime: number;
    /** Number of branches tracked */
    branchCount: number;
    /** Most active branch */
    mostActiveBranch: string | null;
    /** Branch switching frequency per day */
    switchingFrequency: number;
}

/**
 * Status bar display data
 */
export interface StatusBarData {
    /** Current branch name */
    currentBranch: string | null;
    /** Time spent on current branch */
    currentTime: number;
    /** Whether tracking is paused */
    isPaused: boolean;
    /** Loading state */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
}