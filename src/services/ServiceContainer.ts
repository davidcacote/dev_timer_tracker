import * as vscode from 'vscode';
import { IGitService, GitService } from './GitService';
import { IStorageService, StorageService } from './StorageService';
import { ITimerService, TimerService } from './TimerService';
import { ITrackingEngine, TrackingEngine } from './TrackingEngine';
import { IConfigurationManager, ConfigurationManager } from './ConfigurationManager';
import { IExportImportService, ExportImportService } from './ExportImportService';
import { IBackupManager, BackupManager } from './BackupManager';
import { BranchTime, StatusBarData } from '../models';
import { ILoggerService, LoggerService } from './LoggerService';

/**
 * Service container interface for dependency injection
 */
export interface IServiceContainer {
    /**
     * Initialize all services
     * @param context VS Code extension context
     * @param workspaceFolder Current workspace folder
     */
    initialize(context: vscode.ExtensionContext, workspaceFolder?: vscode.WorkspaceFolder): Promise<void>;

    /**
     * Get service by type
     * @param serviceType Service type identifier
     */
    get<T>(serviceType: ServiceType): T;

    /**
     * Check if service is registered
     * @param serviceType Service type identifier
     */
    has(serviceType: ServiceType): boolean;

    /**
     * Register service instance
     * @param serviceType Service type identifier
     * @param instance Service instance
     */
    register<T>(serviceType: ServiceType, instance: T): void;

    /**
     * Dispose all services
     */
    dispose(): void;

    /**
     * Get initialization status
     */
    isInitialized(): boolean;

    /**
     * Switch to a different workspace
     * @param workspaceFolder New workspace folder
     */
    switchWorkspace(workspaceFolder?: vscode.WorkspaceFolder): Promise<void>;
}

/**
 * Service type identifiers
 */
export enum ServiceType {
    GitService = 'GitService',
    StorageService = 'StorageService',
    TimerService = 'TimerService',
    TrackingEngine = 'TrackingEngine',
    ConfigurationManager = 'ConfigurationManager',
    ExportImportService = 'ExportImportService',
    BackupManager = 'BackupManager',
    LoggerService = 'LoggerService'
}

/**
 * Service lifecycle interface
 */
export interface IServiceLifecycle {
    /**
     * Initialize the service
     */
    initialize(...args: any[]): Promise<void>;

    /**
     * Dispose of service resources
     */
    dispose(): void;
}

/**
 * Service registration information
 */
interface ServiceRegistration {
    instance: any;
    initialized: boolean;
    dependencies: ServiceType[];
}

/**
 * Service container implementation with dependency injection
 */
export class ServiceContainer implements IServiceContainer {
    private services = new Map<ServiceType, ServiceRegistration>();
    private context: vscode.ExtensionContext | null = null;
    private workspaceFolder: vscode.WorkspaceFolder | null = null;
    private initialized = false;
    private initializationPromise: Promise<void> | null = null;
    private logger: ILoggerService | null = null;

    /**
     * Initialize all services with proper dependency order
     */
    async initialize(context: vscode.ExtensionContext, workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.doInitialize(context, workspaceFolder);
        return this.initializationPromise;
    }

    private async doInitialize(context: vscode.ExtensionContext, workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
        try {
            this.context = context;
            this.workspaceFolder = workspaceFolder || null;

            // Register all services first
            await this.registerServices();

            // Initialize services in dependency order
            await this.initializeServicesInOrder();

            this.initialized = true;
        } catch (error) {
            if (this.logger) {
                const err = error as Error;
                this.logger.error('Service container initialization failed', err?.stack || err?.message);
                await this.logger.showError('Branch Time Tracker failed to initialize. See logs for details.', err?.stack || err?.message);
            } else {
                console.error('Service container initialization failed:', error);
            }
            // Clean up any partially initialized services
            this.dispose();
            throw error;
        }
    }

    /**
     * Register all services with their dependencies
     */
    private async registerServices(): Promise<void> {
        if (!this.context) {
            throw new Error('Extension context not available');
        }

        // Create service instances
        const logger = new LoggerService('Branch Time Tracker');
        this.logger = logger;
        const backupManager = new BackupManager();
        const storageService = new StorageService(backupManager);
        const exportImportService = new ExportImportService();
        const configurationManager = new ConfigurationManager(this.context);
        const gitService = new GitService();
        
        // Timer service needs callbacks for time updates and state changes
        const branchTimes = new Map<string, BranchTime>();
        const timerService = new TimerService(
            branchTimes,
            this.createTimeUpdateCallback(),
            this.createStateChangeCallback()
        );

        const trackingEngine = new TrackingEngine(
            timerService,
            gitService,
            storageService,
            exportImportService
        );

        // Register services with their dependencies
        this.registerService(ServiceType.LoggerService, logger, []);
        this.registerService(ServiceType.BackupManager, backupManager, []);
        this.registerService(ServiceType.StorageService, storageService, [ServiceType.BackupManager]);
        this.registerService(ServiceType.ExportImportService, exportImportService, []);
        this.registerService(ServiceType.ConfigurationManager, configurationManager, []);
        this.registerService(ServiceType.GitService, gitService, []);
        this.registerService(ServiceType.TimerService, timerService, []);
        this.registerService(ServiceType.TrackingEngine, trackingEngine, [
            ServiceType.TimerService,
            ServiceType.GitService,
            ServiceType.StorageService,
            ServiceType.ExportImportService
        ]);
    }

    /**
     * Initialize services in proper dependency order
     */
    private async initializeServicesInOrder(): Promise<void> {
        if (!this.context) {
            throw new Error('Extension context not available');
        }

        const initializationOrder: ServiceType[] = [
            ServiceType.BackupManager,
            ServiceType.StorageService,
            ServiceType.ExportImportService,
            ServiceType.ConfigurationManager,
            ServiceType.GitService,
            ServiceType.TimerService,
            ServiceType.TrackingEngine
        ];

        for (const serviceType of initializationOrder) {
            await this.initializeService(serviceType);
        }
    }

    /**
     * Initialize a specific service
     */
    private async initializeService(serviceType: ServiceType): Promise<void> {
        const registration = this.services.get(serviceType);
        if (!registration) {
            throw new Error(`Service ${serviceType} not registered`);
        }

        if (registration.initialized) {
            return;
        }

        // Initialize dependencies first
        for (const dependency of registration.dependencies) {
            await this.initializeService(dependency);
        }

        // Initialize the service
        try {
            await this.initializeServiceInstance(serviceType, registration.instance);
            registration.initialized = true;
        } catch (error) {
            const msg = `Failed to initialize ${serviceType}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            if (this.logger) {
                this.logger.error(msg, (error as Error)?.stack);
            }
            throw new Error(msg);
        }
    }

    /**
     * Initialize a specific service instance based on its type
     */
    private async initializeServiceInstance(serviceType: ServiceType, instance: any): Promise<void> {
        if (!this.context) {
            throw new Error('Extension context not available');
        }

        switch (serviceType) {
            case ServiceType.BackupManager:
                // BackupManager will be initialized by StorageService
                break;

            case ServiceType.StorageService:
                await (instance as IStorageService).initialize(this.context.globalStoragePath);
                break;

            case ServiceType.ExportImportService:
                // ExportImportService doesn't need initialization
                break;

            case ServiceType.ConfigurationManager:
                await (instance as IConfigurationManager).initialize(this.workspaceFolder?.uri.fsPath);
                break;

            case ServiceType.GitService:
                if (this.workspaceFolder) {
                    await (instance as IGitService).initialize(this.workspaceFolder);
                }
                break;

            case ServiceType.TimerService:
                // TimerService doesn't need explicit initialization
                break;

            case ServiceType.TrackingEngine:
                await (instance as ITrackingEngine).initialize();
                break;

            default:
                throw new Error(`Unknown service type: ${serviceType}`);
        }
    }

    /**
     * Register a service with its dependencies
     */
    private registerService<T>(serviceType: ServiceType, instance: T, dependencies: ServiceType[]): void {
        this.services.set(serviceType, {
            instance,
            initialized: false,
            dependencies
        });
    }

    /**
     * Get service by type
     */
    get<T>(serviceType: ServiceType): T {
        const registration = this.services.get(serviceType);
        if (!registration) {
            throw new Error(`Service ${serviceType} not registered`);
        }

        if (!registration.initialized) {
            throw new Error(`Service ${serviceType} not initialized`);
        }

        return registration.instance as T;
    }

    /**
     * Check if service is registered
     */
    has(serviceType: ServiceType): boolean {
        return this.services.has(serviceType);
    }

    /**
     * Register external service instance
     */
    register<T>(serviceType: ServiceType, instance: T): void {
        if (this.initialized) {
            throw new Error('Cannot register services after initialization');
        }

        this.services.set(serviceType, {
            instance,
            initialized: true,
            dependencies: []
        });
    }

    /**
     * Get initialization status
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Dispose all services in reverse dependency order
     */
    dispose(): void {
        const disposalOrder: ServiceType[] = [
            ServiceType.TrackingEngine,
            ServiceType.TimerService,
            ServiceType.GitService,
            ServiceType.ConfigurationManager,
            ServiceType.ExportImportService,
            ServiceType.StorageService,
            ServiceType.BackupManager
        ];

        for (const serviceType of disposalOrder) {
            const registration = this.services.get(serviceType);
            if (registration && registration.initialized) {
                try {
                    if (registration.instance && typeof registration.instance.dispose === 'function') {
                        registration.instance.dispose();
                    }
                    registration.initialized = false;
                } catch (error) {
                    if (this.logger) {
                        const err = error as Error;
                        this.logger.error(`Error disposing ${serviceType}`, err?.stack || err?.message);
                    } else {
                        console.error(`Error disposing ${serviceType}:`, error);
                    }
                }
            }
        }

        this.services.clear();
        this.context = null;
        this.workspaceFolder = null;
        this.initialized = false;
        this.initializationPromise = null;
    }

    /**
     * Handle workspace folder changes
     */
    async switchWorkspace(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
        if (!this.initialized) {
            throw new Error('Service container not initialized');
        }

        this.workspaceFolder = workspaceFolder || null;

        // Reinitialize services that depend on workspace
        const workspaceDependentServices = [
            ServiceType.GitService,
            ServiceType.ConfigurationManager
        ];

        for (const serviceType of workspaceDependentServices) {
            const registration = this.services.get(serviceType);
            if (registration && registration.initialized) {
                try {
                    // Dispose current instance
                    if (registration.instance && typeof registration.instance.dispose === 'function') {
                        registration.instance.dispose();
                    }

                    // Reinitialize with new workspace
                    await this.initializeServiceInstance(serviceType, registration.instance);
                } catch (error) {
                    if (this.logger) {
                        const err = error as Error;
                        this.logger.error(`Error switching workspace for ${serviceType}`, err?.stack || err?.message);
                        await this.logger.showWarning(`Issue switching workspace for ${serviceType}. See logs for details.`);
                    } else {
                        console.error(`Error switching workspace for ${serviceType}:`, error);
                    }
                }
            }
        }
    }

    /**
     * Get all registered service types
     */
    getRegisteredServices(): ServiceType[] {
        return Array.from(this.services.keys());
    }

    /**
     * Get service initialization status
     */
    getServiceStatus(): Record<string, { registered: boolean; initialized: boolean; dependencies: string[] }> {
        const status: Record<string, { registered: boolean; initialized: boolean; dependencies: string[] }> = {};

        for (const [serviceType, registration] of this.services) {
            status[serviceType] = {
                registered: true,
                initialized: registration.initialized,
                dependencies: registration.dependencies
            };
        }

        return status;
    }

    /**
     * Create time update callback for timer service
     */
    private createTimeUpdateCallback(): (branch: string, time: number) => void {
        return (branch: string, time: number) => {
            // This callback can be used to notify other services or UI components
            // For now, it's a placeholder that could be extended
            console.debug(`Time updated for branch ${branch}: ${time}s`);
        };
    }

    /**
     * Create state change callback for timer service
     */
    private createStateChangeCallback(): (state: StatusBarData) => void {
        return (state: StatusBarData) => {
            // This callback can be used to update UI components
            // For now, it's a placeholder that could be extended
            console.debug('Timer state changed:', state);
        };
    }

    /**
     * Validate service dependencies
     */
    private validateDependencies(): void {
        for (const [serviceType, registration] of this.services) {
            for (const dependency of registration.dependencies) {
                if (!this.services.has(dependency)) {
                    throw new Error(`Service ${serviceType} depends on ${dependency} which is not registered`);
                }
            }
        }
    }

    /**
     * Get dependency graph for debugging
     */
    getDependencyGraph(): Record<string, string[]> {
        const graph: Record<string, string[]> = {};
        
        for (const [serviceType, registration] of this.services) {
            graph[serviceType] = registration.dependencies;
        }
        
        return graph;
    }
}