/**
 * Time utility functions
 */

/**
 * Format seconds into human-readable time string
 * @param seconds Total seconds
 * @param showSeconds Whether to include seconds in output
 * @returns Formatted time string
 */
export function formatTime(seconds: number, showSeconds: boolean = false): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    if (showSeconds) parts.push(`${remainingSeconds}s`);
    
    return parts.length > 0 ? parts.join(' ') : '0m';
}

/**
 * Format timestamp for display
 * @param isoString ISO timestamp string
 * @returns Formatted date string
 */
export function formatLastUpdated(isoString: string): string {
    try {
        const date = new Date(isoString);
        return date.toLocaleString();
    } catch (error) {
        return 'Unknown';
    }
}

/**
 * Calculate time difference in seconds
 * @param start Start timestamp
 * @param end End timestamp
 * @returns Difference in seconds
 */
export function getTimeDifference(start: string | Date, end: string | Date): number {
    const startTime = typeof start === 'string' ? new Date(start) : start;
    const endTime = typeof end === 'string' ? new Date(end) : end;
    return Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
}

/**
 * Get current ISO timestamp
 * @returns Current timestamp as ISO string
 */
export function getCurrentTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Check if timestamp is valid
 * @param timestamp Timestamp to validate
 * @returns True if valid
 */
export function isValidTimestamp(timestamp: string): boolean {
    try {
        const date = new Date(timestamp);
        return !isNaN(date.getTime());
    } catch {
        return false;
    }
}

/**
 * Convert milliseconds to seconds
 * @param milliseconds Milliseconds value
 * @returns Seconds value
 */
export function millisecondsToSeconds(milliseconds: number): number {
    return Math.floor(milliseconds / 1000);
}

/**
 * Convert seconds to milliseconds
 * @param seconds Seconds value
 * @returns Milliseconds value
 */
export function secondsToMilliseconds(seconds: number): number {
    return seconds * 1000;
}