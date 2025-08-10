import { BranchTime, ExportData, ExportFormat, ImportValidationResult, createExportData, branchTimesToCSV, csvToBranchTimes } from '../models';
import { validateBranchTimeData } from '../utils/validationUtils';
import { formatTime } from '../utils/timeUtils';

/**
 * Export/Import service interface
 */
export interface IExportImportService {
    /**
     * Export data to CSV format
     * @param data Branch time data
     * @returns CSV string
     */
    exportToCSV(data: Map<string, BranchTime>): string;

    /**
     * Export data to JSON format
     * @param data Complete export data
     * @returns JSON string
     */
    exportToJSON(data: ExportData): string;

    /**
     * Import data from CSV format
     * @param csvData CSV string
     * @returns Parsed branch time data
     */
    importFromCSV(csvData: string): Promise<Map<string, BranchTime>>;

    /**
     * Import data from JSON format
     * @param jsonData JSON string
     * @returns Parsed export data
     */
    importFromJSON(jsonData: string): Promise<ExportData>;

    /**
     * Validate import data
     * @param data Data to validate
     * @param format Expected format
     * @returns Validation result
     */
    validateImportData(data: any, format: ExportFormat): ImportValidationResult;

    /**
     * Get supported export formats
     * @returns Array of supported formats
     */
    getSupportedFormats(): ExportFormat[];

    /**
     * Generate export filename
     * @param format Export format
     * @param timestamp Optional timestamp
     * @returns Suggested filename
     */
    generateExportFilename(format: ExportFormat, timestamp?: Date): string;

    /**
     * Prepare export data
     * @param branchTimes Branch time data
     * @param settings Current settings
     * @returns Complete export data structure
     */
    prepareExportData(branchTimes: Map<string, BranchTime>, settings: any): ExportData;
}

/**
 * Export/Import operation result
 */
export interface ExportImportResult {
    /** Whether operation was successful */
    success: boolean;
    /** Result message */
    message: string;
    /** Error details if failed */
    error?: Error;
    /** Additional data */
    data?: any;
}

/**
 * CSV export options
 */
export interface CSVExportOptions {
    /** Include headers */
    includeHeaders: boolean;
    /** Field separator */
    separator: string;
    /** Date format */
    dateFormat: string;
    /** Time format */
    timeFormat: 'seconds' | 'human';
}

/**
 * JSON export options
 */
export interface JSONExportOptions {
    /** Pretty print JSON */
    prettyPrint: boolean;
    /** Include metadata */
    includeMetadata: boolean;
    /** Include settings */
    includeSettings: boolean;
}

/**
 * Export/Import operation error
 */
export class ExportImportError extends Error {
    constructor(
        message: string,
        public readonly operation: string,
        public readonly format: ExportFormat,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'ExportImportError';
    }
}

/**
 * Export/Import service implementation
 */
export class ExportImportService implements IExportImportService {
    private readonly supportedFormats: ExportFormat[] = ['csv', 'json'];

    /**
     * Export data to CSV format
     */
    exportToCSV(data: Map<string, BranchTime>, options?: CSVExportOptions): string {
        try {
            const opts: CSVExportOptions = {
                includeHeaders: true,
                separator: ',',
                dateFormat: 'iso',
                timeFormat: 'seconds',
                ...options
            };

            const headers = [
                'Branch Name',
                'Total Time (seconds)',
                opts.timeFormat === 'human' ? 'Total Time (human)' : null,
                'Last Updated',
                'Session Count',
                'Average Session Time (seconds)',
                'Percentage'
            ].filter(Boolean) as string[];

            const rows: string[] = [];
            
            if (opts.includeHeaders) {
                rows.push(headers.join(opts.separator));
            }

            const totalTime = Array.from(data.values()).reduce((sum, bt) => sum + bt.seconds, 0);

            // Sort branches by total time (descending)
            const sortedEntries = Array.from(data.entries())
                .sort((a, b) => b[1].seconds - a[1].seconds);

            for (const [branchName, branchTime] of sortedEntries) {
                const percentage = totalTime > 0 ? ((branchTime.seconds / totalTime) * 100).toFixed(2) : '0.00';
                
                const row = [
                    this.escapeCSVField(branchName),
                    branchTime.seconds.toString(),
                    opts.timeFormat === 'human' ? this.escapeCSVField(formatTime(branchTime.seconds)) : null,
                    this.escapeCSVField(this.formatDate(branchTime.lastUpdated, opts.dateFormat)),
                    branchTime.sessionCount.toString(),
                    branchTime.averageSessionTime.toString(),
                    percentage
                ].filter(field => field !== null);

                rows.push(row.join(opts.separator));
            }

            return rows.join('\n');
        } catch (error) {
            throw new ExportImportError(
                'Failed to export data to CSV',
                'exportToCSV',
                'csv',
                error as Error
            );
        }
    }

    /**
     * Export data to JSON format
     */
    exportToJSON(data: ExportData, options?: JSONExportOptions): string {
        try {
            const opts: JSONExportOptions = {
                prettyPrint: true,
                includeMetadata: true,
                includeSettings: true,
                ...options
            };

            // Create filtered export data based on options
            const exportData: Partial<ExportData> = {
                version: data.version,
                exportedAt: data.exportedAt,
                branchTimes: data.branchTimes
            };

            if (opts.includeMetadata) {
                exportData.metadata = data.metadata;
            }
            if (opts.includeSettings) {
                exportData.settings = data.settings;
            }

            return JSON.stringify(exportData, null, opts.prettyPrint ? 2 : 0);
        } catch (error) {
            throw new ExportImportError(
                'Failed to export data to JSON',
                'exportToJSON',
                'json',
                error as Error
            );
        }
    }

    /**
     * Import data from CSV format
     */
    async importFromCSV(csvData: string): Promise<Map<string, BranchTime>> {
        try {
            const branchTimeMap = csvToBranchTimes(csvData);
            
            if (!branchTimeMap) {
                throw new ExportImportError(
                    'Invalid CSV format or corrupted data',
                    'importFromCSV',
                    'csv'
                );
            }

            // Validate imported data
            const validation = this.validateImportData(
                Object.fromEntries(branchTimeMap),
                'csv'
            );

            if (!validation.isValid) {
                throw new ExportImportError(
                    `CSV validation failed: ${validation.errors.join(', ')}`,
                    'importFromCSV',
                    'csv'
                );
            }

            return branchTimeMap;
        } catch (error) {
            if (error instanceof ExportImportError) {
                throw error;
            }
            throw new ExportImportError(
                'Failed to import data from CSV',
                'importFromCSV',
                'csv',
                error as Error
            );
        }
    }

    /**
     * Import data from JSON format
     */
    async importFromJSON(jsonData: string): Promise<ExportData> {
        try {
            let parsedData: any;
            
            try {
                parsedData = JSON.parse(jsonData);
            } catch (parseError) {
                throw new ExportImportError(
                    'Invalid JSON format',
                    'importFromJSON',
                    'json',
                    parseError as Error
                );
            }

            // Validate imported data
            const validation = this.validateImportData(parsedData, 'json');
            
            if (!validation.isValid) {
                throw new ExportImportError(
                    `JSON validation failed: ${validation.errors.join(', ')}`,
                    'importFromJSON',
                    'json'
                );
            }

            // Ensure required fields exist
            const exportData: ExportData = {
                version: parsedData.version || '0.4.0',
                exportedAt: parsedData.exportedAt || new Date().toISOString(),
                branchTimes: parsedData.branchTimes || {},
                settings: parsedData.settings || {},
                metadata: parsedData.metadata || {
                    totalBranches: Object.keys(parsedData.branchTimes || {}).length,
                    totalTime: 0,
                    exportFormat: 'json' as ExportFormat,
                    extensionVersion: '0.4.0'
                }
            };

            return exportData;
        } catch (error) {
            if (error instanceof ExportImportError) {
                throw error;
            }
            throw new ExportImportError(
                'Failed to import data from JSON',
                'importFromJSON',
                'json',
                error as Error
            );
        }
    }

    /**
     * Validate import data
     */
    validateImportData(data: any, format: ExportFormat): ImportValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!data || typeof data !== 'object') {
            errors.push('Data must be an object');
            return { isValid: false, errors, warnings };
        }

        if (format === 'json') {
            // Validate JSON export data structure
            if (!data.branchTimes) {
                errors.push('Missing branchTimes field');
            } else if (typeof data.branchTimes !== 'object') {
                errors.push('branchTimes must be an object');
            } else {
                // Validate each branch time entry
                Object.entries(data.branchTimes).forEach(([branchName, branchTime]) => {
                    if (!validateBranchTimeData(branchTime)) {
                        errors.push(`Invalid branch time data for branch: ${branchName}`);
                    }
                });
            }

            // Check for optional fields and warn if missing
            if (!data.version) {
                warnings.push('Missing version field, using default');
            }
            if (!data.exportedAt) {
                warnings.push('Missing exportedAt field, using current timestamp');
            }
            if (!data.metadata) {
                warnings.push('Missing metadata field, will be generated');
            }
        } else if (format === 'csv') {
            // For CSV, data should be the parsed branch times object
            Object.entries(data).forEach(([branchName, branchTime]) => {
                if (!validateBranchTimeData(branchTime)) {
                    errors.push(`Invalid branch time data for branch: ${branchName}`);
                }
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get supported export formats
     */
    getSupportedFormats(): ExportFormat[] {
        return [...this.supportedFormats];
    }

    /**
     * Generate export filename
     */
    generateExportFilename(format: ExportFormat, timestamp?: Date): string {
        const date = timestamp || new Date();
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
        
        return `branch-time-export-${dateStr}-${timeStr}.${format}`;
    }

    /**
     * Prepare export data
     */
    prepareExportData(branchTimes: Map<string, BranchTime>, settings: any): ExportData {
        return createExportData(branchTimes, settings, 'json', '0.4.0');
    }

    /**
     * Escape CSV field if it contains special characters
     */
    private escapeCSVField(field: string): string {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
    }

    /**
     * Format date according to specified format
     */
    private formatDate(isoString: string, format: string): string {
        try {
            const date = new Date(isoString);
            
            switch (format) {
                case 'iso':
                    return date.toISOString();
                case 'locale':
                    return date.toLocaleString();
                case 'date':
                    return date.toLocaleDateString();
                default:
                    return date.toISOString();
            }
        } catch {
            return isoString; // Return original if parsing fails
        }
    }
}