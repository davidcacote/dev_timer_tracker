/**
 * Represents time tracking data for a specific branch
 */
/**
 * Represents a single tracking session
 */
export interface TrackingSession {
    /** Session start time (ISO string) */
    start: string;
    /** Session end time (ISO string, null if ongoing) */
    end: string | null;
    /** Duration in seconds (calculated if end is not null) */
    duration?: number;
    /** Whether the session was paused during tracking */
    wasPaused: boolean;
    /** Total paused time in seconds */
    pausedTime: number;
}

/**
 * Time distribution data for a branch
 */
export interface TimeDistribution {
    /** Time spent in morning (6:00-12:00) in seconds */
    morning: number;
    /** Time spent in afternoon (12:00-18:00) in seconds */
    afternoon: number;
    /** Time spent in evening (18:00-22:00) in seconds */
    evening: number;
    /** Time spent at night (22:00-6:00) in seconds */
    night: number;
}

/**
 * Daily statistics for a branch
 */
export interface DailyStats {
    /** Day of week (0-6, where 0 is Sunday) */
    day: number;
    /** Total time spent on this day in seconds */
    totalTime: number;
    /** Number of sessions on this day */
    sessionCount: number;
}

/**
 * Represents time tracking data for a specific branch
 */
export interface BranchTime {
    /** Total seconds spent on this branch */
    seconds: number;
    /** ISO timestamp of last update */
    lastUpdated: string;
    /** ISO timestamp of first session */
    firstSessionDate?: string;
    /** Number of tracking sessions on this branch */
    sessionCount: number;
    /** Average time per session in seconds */
    averageSessionTime: number;
    /** Detailed session history */
    sessions?: TrackingSession[];
    /** Time distribution across day parts */
    timeDistribution?: TimeDistribution;
    /** Daily statistics */
    dailyStats?: DailyStats[];
    /** Branch switching frequency (sessions per day) */
    switchingFrequency?: number;
    /** Whether this branch is currently active */
    isActive?: boolean;
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