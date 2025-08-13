import { BranchTime, TrackingSession, TimeDistribution } from '../models/BranchTime';
import { StatisticsData, StatisticsFilters } from '../models/StatisticsFilters';

export interface BranchActivity {
    name: string;
    time: number;
    sessionCount: number;
    averageSessionTime: number;
    lastUpdated: string;
    switchingFrequency?: number;
    timeDistribution?: TimeDistribution;
    dailyAverages?: {
        [key: string]: number; // Key is day of week, value is average time in seconds
    };
}

export interface TimePeriodComparison {
    current: number;
    previous: number;
    percentageChange: number;
}

export interface BranchActivityPatterns {
    mostActiveTime: string;
    leastActiveTime: string;
    mostActiveDay: string;
    averageDailyTime: number;
    consistencyScore: number; // 0-100 score of how consistent the activity is
}

export class StatisticsService {
    /**
     * Calculate advanced metrics for branch statistics
     */
    calculateAdvancedMetrics(
        branchTimes: Map<string, BranchTime>,
        filters: StatisticsFilters = { sortBy: 'time', sortOrder: 'desc' }
    ): StatisticsData {
        const branches = Array.from(branchTimes.entries())
            .map(([name, branchTime]) => this.enrichBranchData(name, branchTime, branchTimes));

        // Calculate total time for percentage calculation
        const totalTime = branches.reduce((sum, branch) => sum + branch.time, 0);

        // Calculate percentages
        const branchesWithPercentage = branches.map(branch => ({
            ...branch,
            percentage: totalTime > 0 ? (branch.time / totalTime) * 100 : 0
        }));

        // Apply sorting
        const sortedBranches = this.sortBranches(branchesWithPercentage, filters);

        return {
            branches: sortedBranches,
            totalTime,
            filters,
            isLoading: false
        };
    }

    /**
     * Enrich branch data with advanced metrics
     */
    private enrichBranchData(name: string, branchTime: BranchTime, allBranches: Map<string, BranchTime>): BranchActivity {
        const enrichedData: BranchActivity = {
            name,
            time: branchTime.seconds,
            sessionCount: branchTime.sessionCount,
            averageSessionTime: branchTime.averageSessionTime,
            lastUpdated: branchTime.lastUpdated
        };

        // Calculate switching frequency (sessions per day)
        if (branchTime.firstSessionDate) {
            const daysTracked = this.calculateDaysBetween(
                new Date(branchTime.firstSessionDate),
                new Date(branchTime.lastUpdated)
            ) || 1; // Avoid division by zero
            
            enrichedData.switchingFrequency = branchTime.sessionCount / daysTracked;
        }

        // Calculate time distribution
        if (branchTime.sessions) {
            enrichedData.timeDistribution = this.calculateTimeDistribution(branchTime.sessions);
            enrichedData.dailyAverages = this.calculateDailyAverages(branchTime.sessions);
        }

        return enrichedData;
    }

    /**
     * Calculate time distribution across different periods of the day
     */
    private calculateTimeDistribution(sessions: TrackingSession[]): TimeDistribution {
        const distribution: TimeDistribution = {
            morning: 0,    // 6:00 - 12:00
            afternoon: 0,  // 12:00 - 18:00
            evening: 0,    // 18:00 - 22:00
            night: 0       // 22:00 - 6:00
        };

        for (const session of sessions) {
            const start = new Date(session.start);
            const end = session.end ? new Date(session.end) : new Date();
            const duration = (end.getTime() - start.getTime()) / 1000; // in seconds
            
            // Determine which time period the session falls into
            const startHour = start.getHours();
            const period = this.getTimePeriod(startHour) as keyof TimeDistribution;
            distribution[period] += duration;
        }

        return distribution;
    }

    /**
     * Calculate daily averages for the branch
     */
    private calculateDailyAverages(sessions: TrackingSession[]): { [key: string]: number } {
        const days: { [key: string]: { totalTime: number; count: number } } = {};
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        
        // Initialize days object
        dayNames.forEach(day => {
            days[day] = { totalTime: 0, count: 0 };
        });

        for (const session of sessions) {
            if (!session.end) continue; // Skip ongoing sessions for daily averages
            
            const start = new Date(session.start);
            const end = new Date(session.end);
            const duration = (end.getTime() - start.getTime()) / 1000; // in seconds
            const dayName = dayNames[start.getDay()];
            
            days[dayName].totalTime += duration;
            days[dayName].count++;
        }

        // Calculate averages
        const averages: { [key: string]: number } = {};
        for (const [day, data] of Object.entries(days)) {
            averages[day] = data.count > 0 ? data.totalTime / data.count : 0;
        }

        return averages;
    }

    /**
     * Compare current period with previous period
     */
    comparePeriods(
        currentData: StatisticsData,
        previousData: StatisticsData,
        metric: 'time' | 'sessions' | 'averageSessionTime'
    ): TimePeriodComparison {
        const currentValue = this.calculateMetric(currentData, metric);
        const previousValue = this.calculateMetric(previousData, metric);
        const percentageChange = previousValue > 0 
            ? ((currentValue - previousValue) / previousValue) * 100 
            : currentValue > 0 ? 100 : 0;

        return {
            current: currentValue,
            previous: previousValue,
            percentageChange
        };
    }

    /**
     * Calculate a specific metric from statistics data
     */
    private calculateMetric(data: StatisticsData, metric: 'time' | 'sessions' | 'averageSessionTime'): number {
        if (data.branches.length === 0) return 0;
        
        switch (metric) {
            case 'time':
                return data.totalTime;
            case 'sessions':
                return data.branches.reduce((sum, branch) => sum + (branch.sessionCount || 0), 0);
            case 'averageSessionTime':
                const totalSessions = data.branches.reduce((sum, branch) => sum + (branch.sessionCount || 0), 0);
                return totalSessions > 0 ? data.totalTime / totalSessions : 0;
            default:
                return 0;
        }
    }

    /**
     * Sort branches based on filters
     */
    private sortBranches<T extends { [key: string]: any }>(
        branches: T[], 
        filters: StatisticsFilters
    ): T[] {
        return [...branches].sort((a, b) => {
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
                    comparison = (a.sessionCount || 0) - (b.sessionCount || 0);
                    break;
                // Add sorting for new metrics
                case 'switchingFrequency':
                    comparison = (a.switchingFrequency || 0) - (b.switchingFrequency || 0);
                    break;
                default:
                    comparison = 0;
            }
            
            return filters.sortOrder === 'desc' ? -comparison : comparison;
        });
    }

    /**
     * Calculate days between two dates
     */
    private calculateDaysBetween(startDate: Date, endDate: Date): number {
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * Get time period of day from hour
     */
    private getTimePeriod(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
        if (hour >= 6 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 18) return 'afternoon';
        if (hour >= 18 && hour < 22) return 'evening';
        return 'night';
    }
}
