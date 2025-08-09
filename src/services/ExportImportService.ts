import { BranchTime, ExportData, ExportFormat, ImportValidationResult } from '../models';

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