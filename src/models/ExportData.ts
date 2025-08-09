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