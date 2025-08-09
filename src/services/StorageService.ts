import { BranchTime } from '../models';

/**
 * Storage service interface for data persistence
 */
export interface IStorageService {
    /**
     * Load branch time data from storage
     * @returns Map of branch names to time data
     */
    loadBranchTimes(): Promise<Map<string, BranchTime>>;

    /**
     * Save branch time data to storage
     * @param data Map of branch names to time data
     */
    saveBranchTimes(data: Map<string, BranchTime>): Promise<void>;

    /**
     * Create a backup of current data
     * @returns Path to backup file
     */
    createBackup(): Promise<string>;

    /**
     * Restore data from backup
     * @param backupPath Optional specific backup to restore
     * @returns True if restoration was successful
     */
    restoreFromBackup(backupPath?: string): Promise<boolean>;

    /**
     * Validate data structure
     * @param data Data to validate
     * @returns True if data is valid
     */
    validateData(data: any): boolean;

    /**
     * Get storage statistics
     * @returns Storage usage information
     */
    getStorageStats(): Promise<StorageStats>;

    /**
     * Initialize storage service
     * @param storagePath Path to storage directory
     */
    initialize(storagePath: string): Promise<void>;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Storage statistics
 */
export interface StorageStats {
    /** Size of main data file in bytes */
    dataSize: number;
    /** Number of backup files */
    backupCount: number;
    /** Total backup size in bytes */
    backupSize: number;
    /** Last backup timestamp */
    lastBackup: string | null;
}

/**
 * Storage operation error
 */
export class StorageError extends Error {
    constructor(
        message: string,
        public readonly operation: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'StorageError';
    }
}