import * as fs from 'fs';
import * as path from 'path';
import { BranchTime } from '../models';
import { validateBranchTimeData } from '../utils/validationUtils';
import { IBackupManager } from './BackupManager';

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

/**
 * Enhanced storage service implementation
 */
export class StorageService implements IStorageService {
    private storagePath: string = '';
    private dataFilePath: string = '';
    private backupManager: IBackupManager | null = null;
    private isInitialized: boolean = false;

    constructor(backupManager?: IBackupManager) {
        this.backupManager = backupManager || null;
    }

    /**
     * Initialize storage service
     */
    async initialize(storagePath: string): Promise<void> {
        try {
            this.storagePath = storagePath;
            this.dataFilePath = path.join(storagePath, 'branch-timers.json');

            // Ensure storage directory exists
            await this.ensureDirectoryExists(storagePath);

            // Initialize backup manager if provided
            if (this.backupManager) {
                const backupDir = path.join(storagePath, 'backups');
                await this.backupManager.initialize(backupDir, 10); // Keep 10 backups
            }

            this.isInitialized = true;
        } catch (error) {
            throw new StorageError(
                'Failed to initialize storage service',
                'initialize',
                error as Error
            );
        }
    }

    /**
     * Load branch time data from storage
     */
    async loadBranchTimes(): Promise<Map<string, BranchTime>> {
        this.ensureInitialized();

        try {
            if (!fs.existsSync(this.dataFilePath)) {
                return new Map<string, BranchTime>();
            }

            const data = await fs.promises.readFile(this.dataFilePath, 'utf8');
            let parsedData: any;

            try {
                parsedData = JSON.parse(data);
            } catch (parseError) {
                throw new StorageError(
                    'Corrupted JSON data',
                    'loadBranchTimes',
                    parseError as Error
                );
            }

            // Validate data structure
            if (!this.validateData(parsedData)) {
                throw new StorageError(
                    'Invalid data structure',
                    'loadBranchTimes'
                );
            }

            // Convert to Map and migrate data if needed
            const branchTimeMap = new Map<string, BranchTime>();
            Object.entries(parsedData).forEach(([branchName, branchTime]: [string, any]) => {
                // Migrate old format to new format if needed
                const migratedBranchTime = this.migrateBranchTimeData(branchTime);
                branchTimeMap.set(branchName, migratedBranchTime);
            });

            return branchTimeMap;
        } catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError(
                'Failed to load branch times',
                'loadBranchTimes',
                error as Error
            );
        }
    }

    /**
     * Save branch time data to storage
     */
    async saveBranchTimes(data: Map<string, BranchTime>): Promise<void> {
        this.ensureInitialized();

        try {
            // Create backup before saving if backup manager is available
            if (this.backupManager && fs.existsSync(this.dataFilePath)) {
                await this.createBackup();
            }

            // Convert Map to object for JSON serialization
            const dataObject: Record<string, BranchTime> = {};
            data.forEach((branchTime, branchName) => {
                // Validate each branch time entry
                if (!validateBranchTimeData(branchTime)) {
                    throw new StorageError(
                        `Invalid branch time data for branch: ${branchName}`,
                        'saveBranchTimes'
                    );
                }
                dataObject[branchName] = branchTime;
            });

            // Write data to file
            const jsonData = JSON.stringify(dataObject, null, 2);
            await fs.promises.writeFile(this.dataFilePath, jsonData, 'utf8');

        } catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError(
                'Failed to save branch times',
                'saveBranchTimes',
                error as Error
            );
        }
    }

    /**
     * Create a backup of current data
     */
    async createBackup(): Promise<string> {
        this.ensureInitialized();

        try {
            if (!this.backupManager) {
                throw new StorageError(
                    'Backup manager not available',
                    'createBackup'
                );
            }

            if (!fs.existsSync(this.dataFilePath)) {
                throw new StorageError(
                    'No data file to backup',
                    'createBackup'
                );
            }

            const data = await fs.promises.readFile(this.dataFilePath, 'utf8');
            const parsedData = JSON.parse(data);
            
            return await this.backupManager.createBackup(parsedData);
        } catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError(
                'Failed to create backup',
                'createBackup',
                error as Error
            );
        }
    }

    /**
     * Restore data from backup
     */
    async restoreFromBackup(backupPath?: string): Promise<boolean> {
        this.ensureInitialized();

        try {
            if (!this.backupManager) {
                throw new StorageError(
                    'Backup manager not available',
                    'restoreFromBackup'
                );
            }

            const restoredData = await this.backupManager.restoreFromBackup(backupPath);
            if (!restoredData) {
                return false;
            }

            // Validate restored data
            if (!this.validateData(restoredData)) {
                throw new StorageError(
                    'Restored data is invalid',
                    'restoreFromBackup'
                );
            }

            // Save restored data
            const jsonData = JSON.stringify(restoredData, null, 2);
            await fs.promises.writeFile(this.dataFilePath, jsonData, 'utf8');

            return true;
        } catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError(
                'Failed to restore from backup',
                'restoreFromBackup',
                error as Error
            );
        }
    }

    /**
     * Validate data structure
     */
    validateData(data: any): boolean {
        if (!data || typeof data !== 'object') {
            return false;
        }

        // Check if all values are valid BranchTime objects
        return Object.values(data).every((value: any) => {
            return validateBranchTimeData(value);
        });
    }

    /**
     * Get storage statistics
     */
    async getStorageStats(): Promise<StorageStats> {
        this.ensureInitialized();

        try {
            let dataSize = 0;
            let lastBackup: string | null = null;

            // Get main data file size
            if (fs.existsSync(this.dataFilePath)) {
                const stats = await fs.promises.stat(this.dataFilePath);
                dataSize = stats.size;
            }

            let backupCount = 0;
            let backupSize = 0;

            // Get backup statistics if backup manager is available
            if (this.backupManager) {
                const backupStats = await this.backupManager.getBackupStats();
                backupCount = backupStats.totalBackups;
                backupSize = backupStats.totalSize;
                lastBackup = backupStats.newestBackup?.toISOString() || null;
            }

            return {
                dataSize,
                backupCount,
                backupSize,
                lastBackup
            };
        } catch (error) {
            throw new StorageError(
                'Failed to get storage statistics',
                'getStorageStats',
                error as Error
            );
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.backupManager) {
            this.backupManager.dispose();
        }
        this.isInitialized = false;
    }

    /**
     * Ensure storage service is initialized
     */
    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new StorageError(
                'Storage service not initialized',
                'ensureInitialized'
            );
        }
    }

    /**
     * Ensure directory exists
     */
    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            await fs.promises.mkdir(dirPath, { recursive: true });
        } catch (error) {
            throw new StorageError(
                `Failed to create directory: ${dirPath}`,
                'ensureDirectoryExists',
                error as Error
            );
        }
    }

    /**
     * Migrate old branch time data format to new format
     */
    private migrateBranchTimeData(branchTime: any): BranchTime {
        // Handle migration from v0.3.3 format to v0.4.0 format
        if (branchTime.sessionCount === undefined) {
            branchTime.sessionCount = 1; // Default to 1 session for existing data
        }
        if (branchTime.averageSessionTime === undefined) {
            branchTime.averageSessionTime = branchTime.seconds; // Use total time as average for single session
        }

        return {
            seconds: branchTime.seconds || 0,
            lastUpdated: branchTime.lastUpdated || new Date().toISOString(),
            sessionCount: branchTime.sessionCount || 1,
            averageSessionTime: branchTime.averageSessionTime || branchTime.seconds || 0
        };
    }
}