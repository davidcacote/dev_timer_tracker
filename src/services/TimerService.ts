/**
 * Timer service interface for time tracking
 */
export interface ITimerService {
    /**
     * Start tracking time for a branch
     * @param branch Branch name to track
     */
    startTracking(branch: string): void;

    /**
     * Stop tracking time
     */
    stopTracking(): void;

    /**
     * Pause time tracking
     */
    pauseTracking(): void;

    /**
     * Resume time tracking
     */
    resumeTracking(): void;

    /**
     * Get current elapsed time for a branch
     * @param branch Branch name
     * @returns Elapsed seconds
     */
    getCurrentTime(branch: string): number;

    /**
     * Check if tracking is currently paused
     * @returns True if paused
     */
    isTrackingPaused(): boolean;

    /**
     * Get the currently tracked branch
     * @returns Current branch name or null
     */
    getCurrentBranch(): string | null;

    /**
     * Reset timer for a specific branch
     * @param branch Branch name to reset
     */
    resetBranchTimer(branch: string): void;

    /**
     * Get session count for a branch
     * @param branch Branch name
     * @returns Number of sessions
     */
    getSessionCount(branch: string): number;

    /**
     * Get average session time for a branch
     * @param branch Branch name
     * @returns Average session time in seconds
     */
    getAverageSessionTime(branch: string): number;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Timer state information
 */
export interface TimerState {
    /** Currently tracked branch */
    currentBranch: string | null;
    /** Whether tracking is paused */
    isPaused: boolean;
    /** Start time of current session */
    sessionStartTime: number | null;
    /** Total elapsed time in current session */
    sessionElapsed: number;
}

/**
 * Session tracking data
 */
export interface SessionData {
    /** Branch name */
    branch: string;
    /** Session start time */
    startTime: number;
    /** Session end time */
    endTime: number;
    /** Session duration in seconds */
    duration: number;
}