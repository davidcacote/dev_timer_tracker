/**
 * Event system types and interfaces
 */

/**
 * Generic event emitter interface
 */
export interface EventEmitter<T = any> {
    /**
     * Add event listener
     * @param event Event name
     * @param listener Event listener function
     */
    on<K extends keyof T>(event: K, listener: T[K]): void;

    /**
     * Remove event listener
     * @param event Event name
     * @param listener Event listener function
     */
    off<K extends keyof T>(event: K, listener: T[K]): void;

    /**
     * Emit event
     * @param event Event name
     * @param args Event arguments
     */
    emit<K extends keyof T>(event: K, ...args: Parameters<T[K] extends (...args: any[]) => any ? T[K] : never>): void;

    /**
     * Add one-time event listener
     * @param event Event name
     * @param listener Event listener function
     */
    once<K extends keyof T>(event: K, listener: T[K]): void;

    /**
     * Remove all listeners for an event
     * @param event Event name
     */
    removeAllListeners<K extends keyof T>(event?: K): void;
}

/**
 * Extension lifecycle events
 */
export interface ExtensionEvents {
    /** Extension activated */
    activated: () => void;
    /** Extension deactivated */
    deactivated: () => void;
    /** Configuration changed */
    configurationChanged: (changes: any) => void;
    /** Workspace changed */
    workspaceChanged: (workspaceFolder: string | null) => void;
}

/**
 * Tracking events
 */
export interface TrackingEvents {
    /** Branch changed */
    branchChanged: (newBranch: string, oldBranch: string | null) => void;
    /** Time updated */
    timeUpdated: (branch: string, totalTime: number) => void;
    /** Tracking paused */
    trackingPaused: () => void;
    /** Tracking resumed */
    trackingResumed: () => void;
    /** Session started */
    sessionStarted: (branch: string) => void;
    /** Session ended */
    sessionEnded: (branch: string, duration: number) => void;
}

/**
 * Data events
 */
export interface DataEvents {
    /** Data loaded */
    dataLoaded: (branchCount: number) => void;
    /** Data saved */
    dataSaved: () => void;
    /** Data imported */
    dataImported: (format: string, branchCount: number) => void;
    /** Data exported */
    dataExported: (format: string, filePath: string) => void;
    /** Backup created */
    backupCreated: (backupPath: string) => void;
    /** Data corrupted */
    dataCorrupted: (error: Error) => void;
}

/**
 * UI events
 */
export interface UIEvents {
    /** Status bar clicked */
    statusBarClicked: () => void;
    /** Statistics view opened */
    statisticsViewOpened: () => void;
    /** Statistics view closed */
    statisticsViewClosed: () => void;
    /** Settings panel opened */
    settingsPanelOpened: () => void;
    /** Settings panel closed */
    settingsPanelClosed: () => void;
    /** Filter applied */
    filterApplied: (filters: any) => void;
}

/**
 * Error events
 */
export interface ErrorEvents {
    /** Git error occurred */
    gitError: (error: Error) => void;
    /** Storage error occurred */
    storageError: (error: Error) => void;
    /** Configuration error occurred */
    configurationError: (error: Error) => void;
    /** Validation error occurred */
    validationError: (error: Error) => void;
    /** Import/Export error occurred */
    importExportError: (error: Error) => void;
}