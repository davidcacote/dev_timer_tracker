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
    sortBy: 'time' | 'name' | 'lastUpdated' | 'sessionCount';
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
    }>;
    /** Total time for filtered data */
    totalTime: number;
    /** Applied filters */
    filters: StatisticsFilters;
    /** Whether data is loading */
    isLoading: boolean;
}