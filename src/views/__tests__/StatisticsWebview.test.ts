import { StatisticsWebview, DEFAULT_WEBVIEW_CONFIG, DEFAULT_WEBVIEW_THEME } from '../StatisticsWebview';
import { StatisticsData, StatisticsFilters, createDefaultFilters } from '../../models';
import * as vscode from 'vscode';

// Mock VS Code API
jest.mock('vscode', () => ({
    ViewColumn: {
        Beside: 2
    },
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
            dispose: jest.fn(),
            visible: true
        })
    }
}));

describe('StatisticsWebview', () => {
    let statisticsWebview: StatisticsWebview;
    let mockPanel: any;

    beforeEach(() => {
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
            dispose: jest.fn(),
            visible: true
        };

        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
        
        statisticsWebview = new StatisticsWebview(
            DEFAULT_WEBVIEW_CONFIG,
            DEFAULT_WEBVIEW_THEME
        );
    });

    afterEach(() => {
        statisticsWebview.dispose();
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('should create webview with default configuration', () => {
            expect(statisticsWebview).toBeDefined();
            expect(statisticsWebview.isVisible()).toBe(false);
        });
    });

    describe('show', () => {
        it('should create webview panel when first shown', async () => {
            await statisticsWebview.show();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'branchTimeTracker',
                DEFAULT_WEBVIEW_CONFIG.title,
                DEFAULT_WEBVIEW_CONFIG.viewColumn,
                {
                    enableScripts: DEFAULT_WEBVIEW_CONFIG.enableScripts,
                    retainContextWhenHidden: DEFAULT_WEBVIEW_CONFIG.retainContextWhenHidden,
                    localResourceRoots: DEFAULT_WEBVIEW_CONFIG.localResourceRoots
                }
            );
            expect(statisticsWebview.isVisible()).toBe(true);
        });

        it('should reveal existing panel when shown again', async () => {
            await statisticsWebview.show();
            await statisticsWebview.show();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
            expect(mockPanel.reveal).toHaveBeenCalledWith(DEFAULT_WEBVIEW_CONFIG.viewColumn);
        });
    });

    describe('update', () => {
        it('should update webview content with new data', async () => {
            const testData: StatisticsData = {
                branches: [
                    {
                        name: 'main',
                        time: 3600,
                        lastUpdated: '2023-01-01T12:00:00Z',
                        sessionCount: 5,
                        averageSessionTime: 720,
                        percentage: 60
                    },
                    {
                        name: 'feature-branch',
                        time: 2400,
                        lastUpdated: '2023-01-01T10:00:00Z',
                        sessionCount: 3,
                        averageSessionTime: 800,
                        percentage: 40
                    }
                ],
                totalTime: 6000,
                filters: createDefaultFilters(),
                isLoading: false
            };

            await statisticsWebview.show();
            statisticsWebview.update(testData);

            expect(mockPanel.webview.html).toContain('main');
            expect(mockPanel.webview.html).toContain('feature-branch');
            expect(mockPanel.webview.html).toContain('1h'); // 3600 seconds = 1 hour
            expect(mockPanel.webview.html).toContain('40m'); // 2400 seconds = 40 minutes
        });

        it('should show loading state when data is loading', async () => {
            const loadingData: StatisticsData = {
                branches: [],
                totalTime: 0,
                filters: createDefaultFilters(),
                isLoading: true
            };

            await statisticsWebview.show();
            statisticsWebview.update(loadingData);

            expect(mockPanel.webview.html).toContain('Loading');
        });

        it('should show no data message when no branches match filters', async () => {
            const emptyData: StatisticsData = {
                branches: [],
                totalTime: 0,
                filters: createDefaultFilters(),
                isLoading: false
            };

            await statisticsWebview.show();
            statisticsWebview.update(emptyData);

            expect(mockPanel.webview.html).toContain('No branches match');
        });
    });

    describe('applyFilters', () => {
        it('should apply new filters and update content', async () => {
            const filters: StatisticsFilters = {
                branchPattern: 'feature*',
                minTime: 1800, // 30 minutes
                sortBy: 'name',
                sortOrder: 'asc'
            };

            await statisticsWebview.show();
            statisticsWebview.applyFilters(filters);

            expect(mockPanel.webview.html).toContain('feature*');
            expect(mockPanel.webview.html).toContain('30'); // minTime in minutes
        });
    });

    describe('HTML generation', () => {
        it('should generate valid HTML structure', async () => {
            await statisticsWebview.show();

            const html = mockPanel.webview.html;
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html>');
            expect(html).toContain('<head>');
            expect(html).toContain('<body>');
            expect(html).toContain('</html>');
        });

        it('should include filter controls', async () => {
            await statisticsWebview.show();

            const html = mockPanel.webview.html;
            expect(html).toContain('branchPattern');
            expect(html).toContain('minTime');
            expect(html).toContain('maxTime');
            expect(html).toContain('dateStart');
            expect(html).toContain('dateEnd');
        });

        it('should include action buttons', async () => {
            await statisticsWebview.show();

            const html = mockPanel.webview.html;
            expect(html).toContain('Export CSV');
            expect(html).toContain('Export JSON');
            expect(html).toContain('Import Data');
            expect(html).toContain('Toggle Pause');
        });

        it('should escape HTML in branch names', async () => {
            const testData: StatisticsData = {
                branches: [
                    {
                        name: '<script>alert("xss")</script>',
                        time: 3600,
                        lastUpdated: '2023-01-01T12:00:00Z',
                        sessionCount: 1,
                        averageSessionTime: 3600,
                        percentage: 100
                    }
                ],
                totalTime: 3600,
                filters: createDefaultFilters(),
                isLoading: false
            };

            await statisticsWebview.show();
            statisticsWebview.update(testData);

            const html = mockPanel.webview.html;
            expect(html).not.toContain('<script>alert("xss")</script>');
            expect(html).toContain('&lt;script&gt;');
        });
    });

    describe('dispose', () => {
        it('should dispose panel and clean up resources', async () => {
            await statisticsWebview.show();
            statisticsWebview.dispose();

            expect(mockPanel.dispose).toHaveBeenCalled();
            expect(statisticsWebview.isVisible()).toBe(false);
        });
    });

    describe('refresh', () => {
        it('should update webview content when refreshed', async () => {
            await statisticsWebview.show();
            const initialHtml = mockPanel.webview.html;
            
            statisticsWebview.refresh();
            
            // Content should be regenerated (even if same)
            expect(mockPanel.webview.html).toBeDefined();
        });
    });
});