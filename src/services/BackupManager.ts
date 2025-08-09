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