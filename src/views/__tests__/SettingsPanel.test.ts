import { SettingsPanel, DEFAULT_SETTINGS_PANEL_CONFIG, PresetOperation } from '../SettingsPanel';
import { Settings, TrackingPreset } from '../../models';
import * as vscode from 'vscode';

// Mock VS Code API
jest.mock('vscode', () => ({
    ViewColumn: {
        One: 1,
        Beside: 2
    },
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn(),
        dispose: jest.fn()
    })),
    window: {
        createWebviewPanel: jest.fn().mockReturnValue({
            webview: {
                html: '',
                onDidReceiveMessage: jest.fn().mockReturnValue({
                    dispose: jest.fn()
                })
            },
            onDidDispose: jest.fn().mockReturnValue({
                dispose: jest.fn()
            }),
            reveal: jest.fn(),
            dispose: jest.fn()
        }),
        showSaveDialog: jest.fn(),
        showOpenDialog: jest.fn(),
        showWarningMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn()
    },
    workspace: {
        fs: {
            writeFile: jest.fn(),
            readFile: jest.fn()
        }
    },
    Uri: {
        file: jest.fn().mockReturnValue({ fsPath: '/test/path' })
    }
}));

describe('SettingsPanel', () => {
    let settingsPanel: SettingsPanel;
    let mockPanel: any;
    let mockEventEmitter: any;

    beforeEach(() => {
        mockEventEmitter = {
            event: jest.fn(),
            fire: jest.fn(),
            dispose: jest.fn()
        };

        (vscode.EventEmitter as jest.Mock).mockReturnValue(mockEventEmitter);

        mockPanel = {
            webview: {
                html: '',
                onDidReceiveMessage: jest.fn().mockReturnValue({
                    dispose: jest.fn()
                })
            },
            onDidDispose: jest.fn().mockReturnValue({
                dispose: jest.fn()
            }),
            reveal: jest.fn(),
            dispose: jest.fn()
        };

        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
        
        settingsPanel = new SettingsPanel(DEFAULT_SETTINGS_PANEL_CONFIG);
    });

    afterEach(() => {
        settingsPanel.dispose();
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('should create settings panel with default configuration', () => {
            expect(settingsPanel).toBeDefined();
        });
    });

    describe('show', () => {
        it('should create webview panel when first shown', async () => {
            await settingsPanel.show();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'branchTimeTrackerSettings',
                DEFAULT_SETTINGS_PANEL_CONFIG.title,
                DEFAULT_SETTINGS_PANEL_CONFIG.viewColumn,
                {
                    enableScripts: DEFAULT_SETTINGS_PANEL_CONFIG.enableScripts,
                    retainContextWhenHidden: DEFAULT_SETTINGS_PANEL_CONFIG.retainContextWhenHidden
                }
            );
        });

        it('should reveal existing panel when shown again', async () => {
            await settingsPanel.show();
            await settingsPanel.show();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
            expect(mockPanel.reveal).toHaveBeenCalledWith(DEFAULT_SETTINGS_PANEL_CONFIG.viewColumn);
        });
    });

    describe('updateSettings', () => {
        it('should update settings display', async () => {
            const testSettings: Settings = {
                updateInterval: 120000,
                autoRefreshEnabled: true,
                defaultExportFormat: 'json',
                backupEnabled: true,
                maxBackups: 5,
                theme: 'auto'
            };

            await settingsPanel.show();
            settingsPanel.updateSettings(testSettings);

            expect(mockPanel.webview.html).toContain('120'); // updateInterval in seconds
            expect(mockPanel.webview.html).toContain('checked'); // autoRefreshEnabled
            expect(mockPanel.webview.html).toContain('json'); // defaultExportFormat
        });
    });

    describe('updatePresets', () => {
        it('should update presets display', async () => {
            const testPresets: TrackingPreset[] = [
                {
                    id: 'preset1',
                    name: 'Development Preset',
                    description: 'Settings for development work',
                    settings: {
                        updateInterval: 60000,
                        autoRefresh: true,
                        displayFormat: 'detailed',
                        trackingEnabled: true
                    },
                    createdAt: '2023-01-01T00:00:00Z',
                    lastUsed: '2023-01-02T00:00:00Z'
                }
            ];

            await settingsPanel.show();
            settingsPanel.updatePresets(testPresets);

            expect(mockPanel.webview.html).toContain('Development Preset');
            expect(mockPanel.webview.html).toContain('Settings for development work');
        });
    });

    describe('event handlers', () => {
        it('should register settings change handler', () => {
            const handler = jest.fn();
            const disposable = settingsPanel.onSettingsChange(handler);

            expect(mockEventEmitter.event).toHaveBeenCalled();
            expect(disposable).toBeDefined();
        });

        it('should register preset operation handler', () => {
            const handler = jest.fn();
            const disposable = settingsPanel.onPresetOperation(handler);

            expect(mockEventEmitter.event).toHaveBeenCalled();
            expect(disposable).toBeDefined();
        });
    });

    describe('validation', () => {
        it('should show validation errors', async () => {
            const errors = ['Preset name is required', 'Update interval too short'];

            await settingsPanel.show();
            settingsPanel.showValidationErrors(errors);

            expect(mockPanel.webview.html).toContain('Validation Errors');
            expect(mockPanel.webview.html).toContain('Preset name is required');
            expect(mockPanel.webview.html).toContain('Update interval too short');
        });

        it('should not show validation errors section when no errors', async () => {
            await settingsPanel.show();
            settingsPanel.showValidationErrors([]);

            expect(mockPanel.webview.html).not.toContain('Validation Errors');
        });
    });

    describe('HTML generation', () => {
        it('should generate valid HTML structure', async () => {
            await settingsPanel.show();

            const html = mockPanel.webview.html;
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html>');
            expect(html).toContain('<head>');
            expect(html).toContain('<body>');
            expect(html).toContain('</html>');
        });

        it('should include settings form controls', async () => {
            const testSettings: Settings = {
                updateInterval: 120000,
                autoRefreshEnabled: true,
                defaultExportFormat: 'json',
                backupEnabled: true,
                maxBackups: 5,
                theme: 'auto'
            };

            await settingsPanel.show();
            settingsPanel.updateSettings(testSettings);

            const html = mockPanel.webview.html;
            expect(html).toContain('updateInterval');
            expect(html).toContain('autoRefreshEnabled');
            expect(html).toContain('defaultExportFormat');
            expect(html).toContain('backupEnabled');
            expect(html).toContain('maxBackups');
            expect(html).toContain('theme');
        });

        it('should include preset management controls', async () => {
            await settingsPanel.show();

            const html = mockPanel.webview.html;
            expect(html).toContain('presetName');
            expect(html).toContain('presetDescription');
            expect(html).toContain('Create Preset');
        });

        it('should include action buttons', async () => {
            await settingsPanel.show();

            const html = mockPanel.webview.html;
            expect(html).toContain('Export Settings');
            expect(html).toContain('Import Settings');
            expect(html).toContain('Reset Global Settings');
            expect(html).toContain('Reset Workspace Settings');
        });

        it('should escape HTML in preset names and descriptions', async () => {
            const testPresets: TrackingPreset[] = [
                {
                    id: 'preset1',
                    name: '<script>alert("xss")</script>',
                    description: '<img src="x" onerror="alert(1)">',
                    settings: {
                        updateInterval: 60000,
                        autoRefresh: true,
                        displayFormat: 'detailed',
                        trackingEnabled: true
                    },
                    createdAt: '2023-01-01T00:00:00Z',
                    lastUsed: '2023-01-02T00:00:00Z'
                }
            ];

            await settingsPanel.show();
            settingsPanel.updatePresets(testPresets);

            const html = mockPanel.webview.html;
            expect(html).not.toContain('<script>alert("xss")</script>');
            expect(html).not.toContain('<img src="x" onerror="alert(1)">');
            expect(html).toContain('&lt;script&gt;');
            expect(html).toContain('&lt;img');
        });
    });

    describe('dispose', () => {
        it('should dispose panel and clean up resources', async () => {
            await settingsPanel.show();
            settingsPanel.dispose();

            expect(mockPanel.dispose).toHaveBeenCalled();
            expect(mockEventEmitter.dispose).toHaveBeenCalledTimes(2); // Two event emitters
        });
    });
});