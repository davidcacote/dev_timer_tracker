import { BranchTime } from './BranchTime';

/**
 * Filters for statistics display
 */
export interface StatisticsFilters {
    /** Date range filter */
    dateRange?: {
        start: Date;
        end: Date;
    };
    /** Branch name pattern filter */
    branchPattern?: string;
    /** Minimum time threshold in seconds */
    minTime?: number;
    /** Maximum time threshold in seconds */
    maxTime?: number;
    /** Sort field */
    sortBy: 'time' | 'name' | 'lastUpdated' | 'sessionCount' | 'switchingFrequency';
    /** Sort order */
    sortOrder: 'asc' | 'desc';
}

/**
 * Statistics data for webview display
 */
export interface StatisticsData {
    /** Filtered branch data */
    branches: Array<{
        name: string;
        time: number;
        lastUpdated: string;
        sessionCount: number;
        averageSessionTime: number;
        percentage: number;
        switchingFrequency?: number;
        timeDistribution?: {
            morning: number;
            afternoon: number;
            evening: number;
            night: number;
        };
        firstSessionDate?: string;
        lastSessionDate?: string;
        dailyAverages?: Record<string, number>;
        sessions?: Array<{
            start: string;
            end?: string;
            duration: number;
        }>;
    }>;
    /** Total time for filtered data */
    totalTime: number;
    /** Applied filters */
    filters: StatisticsFilters;
    /** Whether data is loading */
    isLoading: boolean;
    /** Optional period comparisons when dateRange is set */
    comparisons?: {
        time?: { current: number; previous: number; percentageChange: number };
        sessions?: { current: number; previous: number; percentageChange: number };
        averageSessionTime?: { current: number; previous: number; percentageChange: number };
    };
}

/**
 * Create default statistics filters
 * @returns Default filter configuration
 */
export function createDefaultFilters(): StatisticsFilters {
    return {
        sortBy: 'time',
        sortOrder: 'desc'
    };
}

/**
 * Apply filters to branch time data
 * @param branchTimes Branch time data
 * @param filters Filters to apply
 * @returns Filtered and sorted statistics data
 */
export function applyFilters(branchTimes: Map<string, BranchTime>, filters: StatisticsFilters): StatisticsData {
    let filteredBranches = Array.from(branchTimes.entries()).map(([name, branchTime]) => {
        // derive daily averages if available
        const dailyAverages = branchTime.dailyStats
            ? branchTime.dailyStats.reduce<Record<string, number>>((acc, d) => {
                acc[String(d.day)] = d.sessionCount > 0 ? Math.floor(d.totalTime / d.sessionCount) : 0;
                return acc;
            }, {})
            : undefined;
        // map sessions to simplified shape with computed duration in seconds
        const sessions = branchTime.sessions?.map(s => {
            const startMs = Date.parse(s.start);
            const endMs = s.end ? Date.parse(s.end) : NaN;
            const duration = typeof s.duration === 'number'
                ? s.duration
                : (Number.isFinite(endMs) ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : 0);
            return {
                start: s.start,
                end: s.end ?? undefined,
                duration
            };
        });
        return {
            name,
            time: branchTime.seconds,
            lastUpdated: branchTime.lastUpdated,
            sessionCount: branchTime.sessionCount,
            averageSessionTime: branchTime.averageSessionTime,
            percentage: 0, // Will be calculated after filtering
            switchingFrequency: branchTime.switchingFrequency,
            timeDistribution: branchTime.timeDistribution,
            firstSessionDate: branchTime.firstSessionDate,
            lastSessionDate: branchTime.lastUpdated,
            dailyAverages,
            sessions
        };
    });
    
    // Apply date range filter
    if (filters.dateRange) {
        filteredBranches = filteredBranches.filter(branch => {
            const lastUpdated = new Date(branch.lastUpdated);
            return lastUpdated >= filters.dateRange!.start && lastUpdated <= filters.dateRange!.end;
        });
    }
    
    // Apply branch pattern filter (supports wildcards)
    if (filters.branchPattern) {
        filteredBranches = filteredBranches.filter(branch =>
            matchesBranchPattern(branch.name, filters.branchPattern!)
        );
    }
    
    // Apply time threshold filters
    if (filters.minTime !== undefined) {
        filteredBranches = filteredBranches.filter(branch => branch.time >= filters.minTime!);
    }
    
    if (filters.maxTime !== undefined) {
        filteredBranches = filteredBranches.filter(branch => branch.time <= filters.maxTime!);
    }
    
    // Calculate total time for percentage calculation
    const totalTime = filteredBranches.reduce((sum, branch) => sum + branch.time, 0);
    
    // Calculate percentages
    filteredBranches.forEach(branch => {
        branch.percentage = totalTime > 0 ? Math.round((branch.time / totalTime) * 100 * 100) / 100 : 0;
    });
    
    // Apply sorting
    filteredBranches.sort((a, b) => {
        let comparison = 0;
        
        switch (filters.sortBy) {
            case 'time':
                comparison = a.time - b.time;
                break;
            case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
            case 'lastUpdated':
                comparison = new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime();
                break;
            case 'sessionCount':
                comparison = a.sessionCount - b.sessionCount;
                break;
            case 'switchingFrequency':
                comparison = (a.switchingFrequency ?? 0) - (b.switchingFrequency ?? 0);
                break;
        }
        
        return filters.sortOrder === 'desc' ? -comparison : comparison;
    });
    
    // Compute period comparisons if a date range is provided
    let comparisons: StatisticsData['comparisons'] | undefined;
    if (filters.dateRange) {
        const range = filters.dateRange;
        const lenMs = range.end.getTime() - range.start.getTime();
        const prevEnd = new Date(range.start.getTime());
        const prevStart = new Date(range.start.getTime() - lenMs);

        // Build previous period branches using same mapping logic
        let prevBranches = Array.from(branchTimes.entries()).map(([name, bt]) => ({
            name,
            time: bt.seconds,
            lastUpdated: bt.lastUpdated,
            sessionCount: bt.sessionCount,
            averageSessionTime: bt.averageSessionTime,
            percentage: 0
        }));
        prevBranches = prevBranches.filter(b => {
            const d = new Date(b.lastUpdated);
            return d >= prevStart && d <= prevEnd;
        });
        const prevTotalTime = prevBranches.reduce((s, b) => s + b.time, 0);
        const prevSessions = prevBranches.reduce((s, b) => s + (b.sessionCount || 0), 0);
        const curSessions = filteredBranches.reduce((s, b) => s + (b.sessionCount || 0), 0);
        const curAvgSession = curSessions > 0 ? Math.floor(totalTime / curSessions) : 0;
        const prevAvgSession = prevSessions > 0 ? Math.floor(prevTotalTime / prevSessions) : 0;

        const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
        comparisons = {
            time: { current: totalTime, previous: prevTotalTime, percentageChange: pct(totalTime, prevTotalTime) },
            sessions: { current: curSessions, previous: prevSessions, percentageChange: pct(curSessions, prevSessions) },
            averageSessionTime: { current: curAvgSession, previous: prevAvgSession, percentageChange: pct(curAvgSession, prevAvgSession) }
        };
    }

    return {
        branches: filteredBranches,
        totalTime,
        filters,
        isLoading: false,
        comparisons
    };
}

/**
 * Check if a branch matches the given pattern
 * @param branchName Branch name to check
 * @param pattern Pattern to match (supports wildcards)
 * @returns True if branch matches pattern
 */
export function matchesBranchPattern(branchName: string, pattern: string): boolean {
    if (!pattern) return true;
    
    // Convert simple wildcard pattern to regex
    const regexPattern = pattern
        .toLowerCase()
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    
    try {
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(branchName.toLowerCase());
    } catch {
        // If regex is invalid, fall back to simple includes
        return branchName.toLowerCase().includes(pattern.toLowerCase());
    }
}

/**
 * Validate date range filter
 * @param dateRange Date range to validate
 * @returns True if valid
 */
export function isValidDateRange(dateRange: { start: Date; end: Date }): boolean {
    return dateRange.start <= dateRange.end;
}

/**
 * Create date range for common periods
 * @param period Period type
 * @returns Date range object
 */
export function createDateRangeForPeriod(period: 'today' | 'week' | 'month' | 'year'): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date();
    
    switch (period) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            break;
        case 'week':
            start.setDate(now.getDate() - 7);
            break;
        case 'month':
            start.setMonth(now.getMonth() - 1);
            break;
        case 'year':
            start.setFullYear(now.getFullYear() - 1);
            break;
    }
    
    return { start, end: now };
}

/**
 * Clone filters object
 * @param filters Filters to clone
 * @returns Cloned filters
 */
export function cloneFilters(filters: StatisticsFilters): StatisticsFilters {
    return {
        ...filters,
        dateRange: filters.dateRange ? {
            start: new Date(filters.dateRange.start),
            end: new Date(filters.dateRange.end)
        } : undefined
    };
}