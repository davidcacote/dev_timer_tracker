import { BranchTime } from './BranchTime';
import { GlobalSettings } from './Settings';

/**
 * Supported export/import formats
 */
export type ExportFormat = 'csv' | 'json';

/**
 * Complete export data structure
 */
export interface ExportData {
    /** Data format version */
    version: string;
    /** Export timestamp */
    exportedAt: string;
    /** Branch time data */
    branchTimes: Record<string, BranchTime>;
    /** Settings at time of export */
    settings: GlobalSettings;
    /** Export metadata */
    metadata: ExportMetadata;
}

/**
 * Export metadata
 */
export interface ExportMetadata {
    /** Total number of branches */
    totalBranches: number;
    /** Total time across all branches */
    totalTime: number;
    /** Export format used */
    exportFormat: ExportFormat;
    /** Extension version that created the export */
    extensionVersion: string;
}

/**
 * Import validation result
 */
export interface ImportValidationResult {
    /** Whether the import data is valid */
    isValid: boolean;
    /** Validation errors if any */
    errors: string[];
    /** Warnings that don't prevent import */
    warnings: string[];
}

/**
 * Create export data structure
 * @param branchTimes Branch time data
 * @param settings Current settings
 * @param format Export format
 * @param extensionVersion Extension version
 * @returns Complete export data
 */
export function createExportData(
    branchTimes: Map<string, BranchTime>,
    settings: GlobalSettings,
    format: ExportFormat,
    extensionVersion: string
): ExportData {
    const branchTimesRecord: Record<string, BranchTime> = {};
    let totalTime = 0;
    
    branchTimes.forEach((branchTime, branchName) => {
        branchTimesRecord[branchName] = branchTime;
        totalTime += branchTime.seconds;
    });
    
    return {
        version: '0.4.0',
        exportedAt: new Date().toISOString(),
        branchTimes: branchTimesRecord,
        settings,
        metadata: {
            totalBranches: branchTimes.size,
            totalTime,
            exportFormat: format,
            extensionVersion
        }
    };
}

/**
 * Convert ExportData to Map format
 * @param exportData Export data to convert
 * @returns Map of branch times
 */
export function exportDataToBranchTimeMap(exportData: ExportData): Map<string, BranchTime> {
    const branchTimeMap = new Map<string, BranchTime>();
    
    Object.entries(exportData.branchTimes).forEach(([branchName, branchTime]) => {
        branchTimeMap.set(branchName, branchTime);
    });
    
    return branchTimeMap;
}

/**
 * Convert branch time data to CSV format
 * @param branchTimes Branch time data
 * @returns CSV string
 */
export function branchTimesToCSV(branchTimes: Map<string, BranchTime>): string {
    const headers = ['Branch Name', 'Total Time (seconds)', 'Last Updated', 'Session Count', 'Average Session Time (seconds)', 'Percentage'];
    const rows: string[] = [headers.join(',')];
    
    const totalTime = Array.from(branchTimes.values()).reduce((sum, bt) => sum + bt.seconds, 0);
    
    branchTimes.forEach((branchTime, branchName) => {
        const percentage = totalTime > 0 ? ((branchTime.seconds / totalTime) * 100).toFixed(2) : '0.00';
        const row = [
            `"${branchName.replace(/"/g, '""')}"`, // Escape quotes in branch names
            branchTime.seconds.toString(),
            `"${branchTime.lastUpdated}"`,
            branchTime.sessionCount.toString(),
            branchTime.averageSessionTime.toString(),
            percentage
        ];
        rows.push(row.join(','));
    });
    
    return rows.join('\n');
}

/**
 * Parse CSV data to branch time map
 * @param csvData CSV string data
 * @returns Parsed branch time map or null if invalid
 */
export function csvToBranchTimes(csvData: string): Map<string, BranchTime> | null {
    try {
        const lines = csvData.trim().split('\n');
        if (lines.length < 2) return null; // Need at least header and one data row
        
        const branchTimeMap = new Map<string, BranchTime>();
        
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = parseCSVLine(line);
            if (values.length < 5) continue; // Need at least 5 columns
            
            const branchName = values[0];
            const seconds = parseInt(values[1], 10);
            const lastUpdated = values[2];
            const sessionCount = parseInt(values[3], 10);
            const averageSessionTime = parseInt(values[4], 10);
            
            if (isNaN(seconds) || isNaN(sessionCount) || isNaN(averageSessionTime)) {
                continue; // Skip invalid rows
            }
            
            branchTimeMap.set(branchName, {
                seconds,
                lastUpdated,
                sessionCount,
                averageSessionTime
            });
        }
        
        return branchTimeMap;
    } catch {
        return null;
    }
}

/**
 * Parse a single CSV line handling quoted values
 * @param line CSV line to parse
 * @returns Array of values
 */
function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i += 2;
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
                i++;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            values.push(current);
            current = '';
            i++;
        } else {
            current += char;
            i++;
        }
    }
    
    // Add the last field
    values.push(current);
    
    return values;
}

/**
 * Merge two export data structures
 * @param base Base export data
 * @param overlay Overlay export data
 * @returns Merged export data
 */
export function mergeExportData(base: ExportData, overlay: ExportData): ExportData {
    const mergedBranchTimes: Record<string, BranchTime> = { ...base.branchTimes };
    
    // Merge branch times, overlay takes precedence
    Object.entries(overlay.branchTimes).forEach(([branchName, branchTime]) => {
        if (mergedBranchTimes[branchName]) {
            // Merge existing branch data
            const existing = mergedBranchTimes[branchName];
            mergedBranchTimes[branchName] = {
                seconds: existing.seconds + branchTime.seconds,
                lastUpdated: branchTime.lastUpdated > existing.lastUpdated ? branchTime.lastUpdated : existing.lastUpdated,
                sessionCount: existing.sessionCount + branchTime.sessionCount,
                averageSessionTime: Math.floor((existing.seconds + branchTime.seconds) / (existing.sessionCount + branchTime.sessionCount))
            };
        } else {
            mergedBranchTimes[branchName] = branchTime;
        }
    });
    
    const totalBranches = Object.keys(mergedBranchTimes).length;
    const totalTime = Object.values(mergedBranchTimes).reduce((sum, bt) => sum + bt.seconds, 0);
    
    return {
        version: overlay.version,
        exportedAt: new Date().toISOString(),
        branchTimes: mergedBranchTimes,
        settings: overlay.settings, // Use overlay settings
        metadata: {
            totalBranches,
            totalTime,
            exportFormat: overlay.metadata.exportFormat,
            extensionVersion: overlay.metadata.extensionVersion
        }
    };
}