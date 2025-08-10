// Mock VS Code API first
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        fire: jest.fn(),
        dispose: jest.fn()
    })),
    workspace: {
        onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() })
    }
}));

import { ConfigurationManager } from '../ConfigurationManager';
import { GlobalSettings } from '../../models/Settings';

describe('ConfigurationManager', () => {
    let configManager: ConfigurationManager;
    let mockContext: any;

    beforeEach(() => {
        mockContext = {
            globalState: {
                get: jest.fn().mockImplementation((key: string) => {
                    if (key === 'branchTimeTracker.presets') {
                        return [];
                    }
                    return undefined;
                }),
                update: jest.fn()
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            }
        };
        
        configManager = new ConfigurationManager(mockContext);
    });

    afterEach(() => {
        configManager.dispose();
    });

    describe('Basic Functionality', () => {
        it('should initialize with default global settings', async () => {
            await configManager.initialize();
            const settings = configManager.getGlobalSettings();
            
            expect(settings).toEqual({
                updateInterval: 1000,
                autoRefreshEnabled: true,
                defaultExportFormat: 'json',
                backupEnabled: true,
                maxBackups: 5,
                theme: 'auto'
            });
        });

        it('should return null workspace settings when no workspace is active', async () => {
            await configManager.initialize();
            const workspaceSettings = configManager.getWorkspaceSettings();
            
            expect(workspaceSettings).toBeNull();
        });

        it('should provide access to preset manager', async () => {
            await configManager.initialize();
            const presetManager = configManager.getPresetManager();
            
            expect(presetManager).toBeDefined();
            expect(typeof presetManager.getAllPresets).toBe('function');
            expect(typeof presetManager.createPreset).toBe('function');
            expect(typeof presetManager.updatePreset).toBe('function');
            expect(typeof presetManager.deletePreset).toBe('function');
            expect(typeof presetManager.duplicatePreset).toBe('function');
            expect(typeof presetManager.validatePreset).toBe('function');
        });

        it('should return effective settings combining global and workspace', async () => {
            await configManager.initialize();
            const effectiveSettings = configManager.getEffectiveSettings();
            
            expect(effectiveSettings.updateInterval).toBe(1000);
            expect(effectiveSettings.autoRefreshEnabled).toBe(true);
            expect(effectiveSettings.workspace).toBeUndefined();
        });

        it('should provide configuration change event handling', async () => {
            await configManager.initialize();
            const mockListener = jest.fn();
            
            const disposable = configManager.onConfigurationChanged(mockListener);
            expect(disposable).toBeDefined();
            expect(typeof disposable.dispose).toBe('function');
            
            disposable.dispose();
        });
    });

    describe('Settings Management', () => {
        it('should save global settings', async () => {
            await configManager.initialize();
            
            const newSettings = {
                updateInterval: 3000,
                theme: 'light' as const
            };
            
            await configManager.saveSettings(newSettings, 'global');
            
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'branchTimeTracker.globalSettings',
                expect.objectContaining(newSettings)
            );
        });

        it('should handle workspace switching', async () => {
            await configManager.initialize('/workspace1');
            
            // Should not throw error
            await configManager.switchWorkspace('/workspace2');
            
            const workspaceInfo = configManager.getCurrentWorkspaceInfo();
            expect(workspaceInfo?.workspaceFolder).toBe('/workspace2');
        });
    });
});