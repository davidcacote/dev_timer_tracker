import { BranchTime, StatusBarData } from '../models';
import { getCurrentTimestamp, getTimeDifference, updateBranchTimeWithSession, createBranchTime } from '../utils/timeUtils';

/**
 * Timer service interface for accurate time tracking
 */
export interface ITimerService {
    startTracking(branch: string): void;
    stopTracking(): void;
    pauseTracking(): void;
    resumeTracking(): void;
    getCurrentTime(branch: string): number;
    isTrackingPaused(): boolean;
    getCurrentBranch(): string | null;
    getSessionStartTime(): string | null;
    getCurrentSessionStats(): {
        sessionTime: number;
        totalPausedTime: number;
        isActive: boolean;
    };
    updateCurrentBranchTime(): void;
    updateBranchTimes(branchTimes: Map<string, BranchTime>): void;
    dispose(): void;
}

/**
 * Timer tracking state
 */
interface TimerState {
    currentBranch: string | null;
    sessionStartTime: string | null;
    isPaused: boolean;
    pausedAt: string | null;
    totalPausedTime: number; // Total paused time in current session (seconds)
}

/**
 * Timer service for accurate time tracking with pause/resume functionality
 */
export class TimerService implements ITimerService {
    private state: TimerState;
    private branchTimes: Map<string, BranchTime>;
    private onTimeUpdateCallback?: (branch: string, time: number) => void;
    private onStateChangeCallback?: (state: StatusBarData) => void;

    constructor(
        branchTimes: Map<string, BranchTime>,
        onTimeUpdate?: (branch: string, time: number) => void,
        onStateChange?: (state: StatusBarData) => void
    ) {
        this.branchTimes = branchTimes;
        this.onTimeUpdateCallback = onTimeUpdate;
        this.onStateChangeCallback = onStateChange;
        
        this.state = {
            currentBranch: null,
            sessionStartTime: null,
            isPaused: false,
            pausedAt: null,
            totalPausedTime: 0
        };
    }

    /**
     * Start tracking time for a specific branch
     */
    startTracking(branch: string): void {
        // If switching branches, finalize current session
        if (this.state.currentBranch && this.state.currentBranch !== branch) {
            this.finalizeCurrentSession();
        }

        // Initialize branch time if it doesn't exist
        if (!this.branchTimes.has(branch)) {
            this.branchTimes.set(branch, createBranchTime());
        }

        // Start new session
        this.state.currentBranch = branch;
        this.state.sessionStartTime = getCurrentTimestamp();
        this.state.isPaused = false;
        this.state.pausedAt = null;
        this.state.totalPausedTime = 0;

        this.notifyStateChange();
    }

    /**
     * Stop tracking time completely
     */
    stopTracking(): void {
        if (this.state.currentBranch) {
            this.finalizeCurrentSession();
        }

        this.resetState();
        this.notifyStateChange();
    }

    /**
     * Pause time tracking
     */
    pauseTracking(): void {
        if (!this.state.currentBranch || this.state.isPaused) {
            return;
        }

        this.state.isPaused = true;
        this.state.pausedAt = getCurrentTimestamp();
        this.notifyStateChange();
    }

    /**
     * Resume time tracking
     */
    resumeTracking(): void {
        if (!this.state.currentBranch || !this.state.isPaused || !this.state.pausedAt) {
            return;
        }

        // Calculate paused duration and add to total
        const pausedDuration = getTimeDifference(this.state.pausedAt, getCurrentTimestamp());
        this.state.totalPausedTime += pausedDuration;

        this.state.isPaused = false;
        this.state.pausedAt = null;
        this.notifyStateChange();
    }

    /**
     * Get current time for a specific branch (including active session)
     */
    getCurrentTime(branch: string): number {
        const branchTime = this.branchTimes.get(branch);
        let totalTime = branchTime ? branchTime.seconds : 0;

        // Add current session time if this is the active branch
        if (this.state.currentBranch === branch && this.state.sessionStartTime) {
            const sessionTime = this.calculateCurrentSessionTime();
            totalTime += sessionTime;
        }

        return totalTime;
    }

    /**
     * Check if tracking is currently paused
     */
    isTrackingPaused(): boolean {
        return this.state.isPaused;
    }

    /**
     * Get current branch being tracked
     */
    getCurrentBranch(): string | null {
        return this.state.currentBranch;
    }

    /**
     * Get session start time
     */
    getSessionStartTime(): string | null {
        return this.state.sessionStartTime;
    }

    /**
     * Calculate current session time (excluding paused time)
     */
    private calculateCurrentSessionTime(): number {
        if (!this.state.sessionStartTime) {
            return 0;
        }

        const now = getCurrentTimestamp();
        let sessionTime = getTimeDifference(this.state.sessionStartTime, now);

        // Subtract total paused time
        sessionTime -= this.state.totalPausedTime;

        // If currently paused, subtract time since pause started
        if (this.state.isPaused && this.state.pausedAt) {
            const currentPausedTime = getTimeDifference(this.state.pausedAt, now);
            sessionTime -= currentPausedTime;
        }

        return Math.max(0, sessionTime); // Ensure non-negative
    }

    /**
     * Finalize current tracking session and update branch time
     */
    private finalizeCurrentSession(): void {
        if (!this.state.currentBranch || !this.state.sessionStartTime) {
            return;
        }

        const sessionTime = this.calculateCurrentSessionTime();
        
        // Only update if session time is positive
        if (sessionTime > 0) {
            const currentBranchTime = this.branchTimes.get(this.state.currentBranch) || createBranchTime();
            const updatedBranchTime = updateBranchTimeWithSession(currentBranchTime, sessionTime);
            
            this.branchTimes.set(this.state.currentBranch, updatedBranchTime);
            
            // Notify callback of time update
            if (this.onTimeUpdateCallback) {
                this.onTimeUpdateCallback(this.state.currentBranch, updatedBranchTime.seconds);
            }
        }
    }

    /**
     * Reset timer state
     */
    private resetState(): void {
        this.state = {
            currentBranch: null,
            sessionStartTime: null,
            isPaused: false,
            pausedAt: null,
            totalPausedTime: 0
        };
    }

    /**
     * Notify state change callback
     */
    private notifyStateChange(): void {
        if (this.onStateChangeCallback) {
            const currentTime = this.state.currentBranch ? this.getCurrentTime(this.state.currentBranch) : 0;
            const statusData: StatusBarData = {
                currentBranch: this.state.currentBranch,
                currentTime: currentTime,
                isPaused: this.state.isPaused,
                isLoading: false,
                error: null
            };
            this.onStateChangeCallback(statusData);
        }
    }

    /**
     * Update branch times reference (for external updates)
     */
    updateBranchTimes(branchTimes: Map<string, BranchTime>): void {
        this.branchTimes = branchTimes;
    }

    /**
     * Get current session statistics
     */
    getCurrentSessionStats(): {
        sessionTime: number;
        totalPausedTime: number;
        isActive: boolean;
    } {
        return {
            sessionTime: this.calculateCurrentSessionTime(),
            totalPausedTime: this.state.totalPausedTime,
            isActive: this.state.currentBranch !== null && !this.state.isPaused
        };
    }

    /**
     * Force update current branch time (useful for periodic saves)
     */
    updateCurrentBranchTime(): void {
        if (this.state.currentBranch && this.state.sessionStartTime) {
            const sessionTime = this.calculateCurrentSessionTime();
            
            if (sessionTime > 0) {
                const currentBranchTime = this.branchTimes.get(this.state.currentBranch) || createBranchTime();
                
                // Create a temporary updated branch time without finalizing the session
                const tempUpdatedTime = {
                    ...currentBranchTime,
                    seconds: currentBranchTime.seconds + sessionTime,
                    lastUpdated: getCurrentTimestamp()
                };
                
                // Notify callback of time update
                if (this.onTimeUpdateCallback) {
                    this.onTimeUpdateCallback(this.state.currentBranch, tempUpdatedTime.seconds);
                }
            }
        }
    }

    /**
     * Dispose of the timer service
     */
    dispose(): void {
        // Finalize any active session
        if (this.state.currentBranch) {
            this.finalizeCurrentSession();
        }
        
        // Clear callbacks
        this.onTimeUpdateCallback = undefined;
        this.onStateChangeCallback = undefined;
        
        // Reset state
        this.resetState();
    }
}