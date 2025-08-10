import * as fs from 'fs';
import * as path from 'path';
import { validateBranchTimeData } from '../utils/validationUtils';

/**
 * Backup manager interface for data protection
 */
export interface IBackupManager {
    /**
     * Create automatic backup
     * @param data Data to backup
     * @returns Path to backup file
     */
    createBackup(data: any): Promise<string>;

    /**
     * Restore from backup
     * @param backupPath Optional specific backup path
     * @returns Restored data or null if failed
     */
    restoreFromBackup(backupPath?: string): Promise<any>;

    /**
     * List available backups
     * @returns Array of backup information
     */
    listBackups(): Promise<BackupInfo[]>;

    /**
     * Delete old backups based on retention policy
     * @returns Number of backups deleted
     */
    cleanupOldBackups(): Promise<number>;

    /**
     * Validate backup file
     * @param backupPath Path to backup file
     * @returns True if backup is valid
     */
    validateBackup(backupPath: string): Promise<boolean>;

    /**
     * Get backup statistics
     * @returns Backup usage statistics
     */
    getBackupStats(): Promise<BackupStats>;

    /**
     * Initialize backup manager
     * @param backupDirectory Directory for backups
     * @param maxBackups Maximum number of backups to keep
     */
    initialize(backupDirectory: string, maxBackups: number): Promise<void>;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Backup information
 */
export interface BackupInfo {
    /** Backup file path */
    path: string;
    /** Backup creation timestamp */
    createdAt: Date;
    /** Backup file size in bytes */
    size: number;
    /** Whether backup is valid */
    isValid: boolean;
    /** Backup description */
    description?: string;
}

/**
 * Backup statistics
 */
export interface BackupStats {
    /** Total number of backups */
    totalBackups: number;
    /** Total backup size in bytes */
    totalSize: number;
    /** Oldest backup date */
    oldestBackup: Date | null;
    /** Newest backup date */
    newestBackup: Date | null;
    /** Average backup size */
    averageSize: number;
}

/**
 * Backup configuration
 */
export interface BackupConfig {
    /** Maximum number of backups to keep */
    maxBackups: number;
    /** Backup retention period in days */
    retentionDays: number;
    /** Whether to compress backups */
    compress: boolean;
    /** Backup file prefix */
    filePrefix: string;
}

/**
 * Backup operation error
 */
export class BackupError extends Error {
    constructor(
        message: string,
        public readonly operation: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'BackupError';
    }
}

/**
 * Backup manager implementation
 */
export class BackupManager implements IBackupManager {
    private backupDirectory: string = '';
    private config: BackupConfig;
    private isInitialized: boolean = false;

    constructor(config?: Partial<BackupConfig>) {
        this.config = {
            maxBackups: 10,
            retentionDays: 30,
            compress: false,
            filePrefix: 'backup',
            ...config
        };
    }

    /**
     * Initialize backup manager
     */
    async initialize(backupDirectory: string, maxBackups: number): Promise<void> {
        try {
            this.backupDirectory = backupDirectory;
            this.config.maxBackups = maxBackups;

            // Ensure backup directory exists
            await fs.promises.mkdir(backupDirectory, { recursive: true });

            this.isInitialized = true;

            // Perform initial cleanup
            await this.cleanupOldBackups();
        } catch (error) {
            throw new BackupError(
                'Failed to initialize backup manager',
                'initialize',
                error as Error
            );
        }
    }

    /**
     * Create automatic backup
     */
    async createBackup(data: any): Promise<string> {
        this.ensureInitialized();

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${this.config.filePrefix}-${timestamp}.json`;
            const backupPath = path.join(this.backupDirectory, filename);

            // Add backup metadata
            const backupData = {
                version: '0.4.0',
                createdAt: new Date().toISOString(),
                data: data,
                metadata: {
                    backupType: 'automatic',
                    dataSize: JSON.stringify(data).length
                }
            };

            // Write backup file
            const jsonData = JSON.stringify(backupData, null, 2);
            await fs.promises.writeFile(backupPath, jsonData, 'utf8');

            // Cleanup old backups after creating new one
            await this.cleanupOldBackups();

            return backupPath;
        } catch (error) {
            throw new BackupError(
                'Failed to create backup',
                'createBackup',
                error as Error
            );
        }
    }

    /**
     * Restore from backup
     */
    async restoreFromBackup(backupPath?: string): Promise<any> {
        this.ensureInitialized();

        try {
            let targetBackupPath = backupPath;

            // If no specific backup path provided, use the most recent backup
            if (!targetBackupPath) {
                const backups = await this.listBackups();
                if (backups.length === 0) {
                    return null;
                }
                
                // Sort by creation date (newest first) and take the first valid backup
                const validBackups = backups.filter(b => b.isValid);
                if (validBackups.length === 0) {
                    return null;
                }
                
                validBackups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                targetBackupPath = validBackups[0].path;
            }

            // Validate backup before restoring
            if (!(await this.validateBackup(targetBackupPath))) {
                throw new BackupError(
                    'Backup file is invalid or corrupted',
                    'restoreFromBackup'
                );
            }

            // Read and parse backup file
            const backupContent = await fs.promises.readFile(targetBackupPath, 'utf8');
            const backupData = JSON.parse(backupContent);

            // Extract the actual data from backup structure
            return backupData.data || backupData;
        } catch (error) {
            if (error instanceof BackupError) {
                throw error;
            }
            throw new BackupError(
                'Failed to restore from backup',
                'restoreFromBackup',
                error as Error
            );
        }
    }

    /**
     * List available backups
     */
    async listBackups(): Promise<BackupInfo[]> {
        this.ensureInitialized();

        try {
            const files = await fs.promises.readdir(this.backupDirectory);
            const backupFiles = files.filter(file => 
                file.startsWith(this.config.filePrefix) && file.endsWith('.json')
            );

            const backups: BackupInfo[] = [];

            for (const file of backupFiles) {
                const filePath = path.join(this.backupDirectory, file);
                const stats = await fs.promises.stat(filePath);
                const isValid = await this.validateBackup(filePath);

                // Extract timestamp from filename
                const timestampMatch = file.match(/backup-(.+)\.json$/);
                const createdAt = timestampMatch 
                    ? new Date(timestampMatch[1].replace(/-/g, ':').replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3'))
                    : stats.birthtime;

                backups.push({
                    path: filePath,
                    createdAt,
                    size: stats.size,
                    isValid,
                    description: `Backup created on ${createdAt.toLocaleString()}`
                });
            }

            // Sort by creation date (newest first)
            backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            return backups;
        } catch (error) {
            throw new BackupError(
                'Failed to list backups',
                'listBackups',
                error as Error
            );
        }
    }

    /**
     * Delete old backups based on retention policy
     */
    async cleanupOldBackups(): Promise<number> {
        this.ensureInitialized();

        try {
            const backups = await this.listBackups();
            let deletedCount = 0;

            // Delete backups exceeding max count
            if (backups.length > this.config.maxBackups) {
                const backupsToDelete = backups.slice(this.config.maxBackups);
                for (const backup of backupsToDelete) {
                    await fs.promises.unlink(backup.path);
                    deletedCount++;
                }
            }

            // Delete backups older than retention period
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

            const remainingBackups = backups.slice(0, this.config.maxBackups);
            for (const backup of remainingBackups) {
                if (backup.createdAt < cutoffDate) {
                    await fs.promises.unlink(backup.path);
                    deletedCount++;
                }
            }

            return deletedCount;
        } catch (error) {
            throw new BackupError(
                'Failed to cleanup old backups',
                'cleanupOldBackups',
                error as Error
            );
        }
    }

    /**
     * Validate backup file
     */
    async validateBackup(backupPath: string): Promise<boolean> {
        try {
            if (!fs.existsSync(backupPath)) {
                return false;
            }

            const content = await fs.promises.readFile(backupPath, 'utf8');
            const backupData = JSON.parse(content);

            // Check if backup has the expected structure
            const data = backupData.data || backupData;
            
            // Validate that the data contains valid branch time entries
            if (!data || typeof data !== 'object') {
                return false;
            }

            // Check if all values are valid BranchTime objects
            return Object.values(data).every((value: any) => {
                return validateBranchTimeData(value);
            });
        } catch {
            return false;
        }
    }

    /**
     * Get backup statistics
     */
    async getBackupStats(): Promise<BackupStats> {
        this.ensureInitialized();

        try {
            const backups = await this.listBackups();
            
            if (backups.length === 0) {
                return {
                    totalBackups: 0,
                    totalSize: 0,
                    oldestBackup: null,
                    newestBackup: null,
                    averageSize: 0
                };
            }

            const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
            const sortedByDate = [...backups].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            return {
                totalBackups: backups.length,
                totalSize,
                oldestBackup: sortedByDate[0].createdAt,
                newestBackup: sortedByDate[sortedByDate.length - 1].createdAt,
                averageSize: Math.round(totalSize / backups.length)
            };
        } catch (error) {
            throw new BackupError(
                'Failed to get backup statistics',
                'getBackupStats',
                error as Error
            );
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.isInitialized = false;
    }

    /**
     * Ensure backup manager is initialized
     */
    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new BackupError(
                'Backup manager not initialized',
                'ensureInitialized'
            );
        }
    }
}