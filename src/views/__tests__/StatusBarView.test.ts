import { StatusBarView, DEFAULT_STATUS_BAR_CONFIG, DEFAULT_STATUS_BAR_THEME } from '../StatusBarView';
import { StatusBarData } from '../../models';
import * as vscode from 'vscode';

// Mock VS Code API
jest.mock('vscode', () => ({
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    ThemeColor: jest.fn().mockImplementation((id: string) => ({ id })),
    window: {
        createStatusBarItem: jest.fn().mockReturnValue({
            text: '',
            tooltip: '',
            backgroundColor: undefined,
            command: '',
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        })
    }
}));

// Mock timers
jest.useFakeTimers();

describe('StatusBarView', () => {
    let statusBarView: StatusBarView;
    let mockStatusBarItem: any;

    beforeEach(() => {
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            backgroundColor: undefined,
            command: '',
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        };
        
        (vscode.window.createStatusBarItem as jest.Mock).mockReturnValue(mockStatusBarItem);
        
        statusBarView = new StatusBarView(DEFAULT_STATUS_BAR_CONFIG, DEFAULT_STATUS_BAR_THEME);
    });

    afterEach(() => {
        statusBarView.dispose();
        jest.clearAllMocks();
        jest.clearAllTimers();
    });

    describe('initialization', () => {
        it('should create status bar item with correct configuration', () => {
            expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
                DEFAULT_STATUS_BAR_CONFIG.alignment,
                DEFAULT_STATUS_BAR_CONFIG.priority
            );
            expect(mockStatusBarItem.command).toBe(DEFAULT_STATUS_BAR_CONFIG.command);
            expect(mockStatusBarItem.show).toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('should show loading state when isLoading is true', () => {
            const data: StatusBarData = {
                currentBranch: null,
                currentTime: 0,
                isPaused: false,
                isLoading: true,
                error: null
            };

            statusBarView.update(data);
            jest.advanceTimersByTime(150);

            expect(mockStatusBarItem.text).toContain('Loading branch time');
            expect(mockStatusBarItem.tooltip).toContain('Loading branch time data');
        });

        it('should show error state when error is present', () => {
            const errorMessage = 'Test error';
            const data: StatusBarData = {
                currentBranch: null,
                currentTime: 0,
                isPaused: false,
                isLoading: false,
                error: errorMessage
            };

            statusBarView.update(data);
            jest.advanceTimersByTime(150);

            expect(mockStatusBarItem.text).toContain(errorMessage);
            expect(mockStatusBarItem.tooltip).toContain(`Error: ${errorMessage}`);
        });

        it('should show normal state with branch and time', () => {
            const data: StatusBarData = {
                currentBranch: 'main',
                currentTime: 3661, // 1h 1m 1s
                isPaused: false,
                isLoading: false,
                error: null
            };

            statusBarView.update(data);
            jest.advanceTimersByTime(150);

            expect(mockStatusBarItem.text).toContain('1h 1m on main');
            expect(mockStatusBarItem.tooltip).toContain('Spent 1h 1m on branch "main"');
        });

        it('should show paused state correctly', () => {
            const data: StatusBarData = {
                currentBranch: 'feature-branch',
                currentTime: 120, // 2m
                isPaused: true,
                isLoading: false,
                error: null
            };

            statusBarView.update(data);
            jest.advanceTimersByTime(150);

            expect(mockStatusBarItem.text).toContain('[PAUSED]');
            expect(mockStatusBarItem.text).toContain('2m on feature-branch');
            expect(mockStatusBarItem.tooltip).toContain('⏸️ Tracking Paused');
        });

        it('should handle no active branch', () => {
            const data: StatusBarData = {
                currentBranch: null,
                currentTime: 0,
                isPaused: false,
                isLoading: false,
                error: null
            };

            statusBarView.update(data);
            jest.advanceTimersByTime(150);

            expect(mockStatusBarItem.text).toContain('No active branch');
            expect(mockStatusBarItem.tooltip).toContain('No active git branch detected');
        });

        it('should debounce updates correctly', () => {
            const data1: StatusBarData = {
                currentBranch: 'main',
                currentTime: 100,
                isPaused: false,
                isLoading: false,
                error: null
            };

            const data2: StatusBarData = {
                currentBranch: 'main',
                currentTime: 200,
                isPaused: false,
                isLoading: false,
                error: null
            };

            // Call update twice quickly
            statusBarView.update(data1);
            statusBarView.update(data2);

            // Only the second update should be applied after debounce
            jest.advanceTimersByTime(150);
            expect(mockStatusBarItem.text).toContain('3m on main'); // formatTime doesn't show seconds by default
        });
    });

    describe('direct methods', () => {
        it('should show loading state via showLoading method', () => {
            statusBarView.showLoading();
            expect(mockStatusBarItem.text).toContain('Loading branch time');
            expect(mockStatusBarItem.tooltip).toContain('Loading branch time data');
        });

        it('should show error state via showError method', () => {
            const errorMessage = 'Direct error';
            statusBarView.showError(errorMessage);
            expect(mockStatusBarItem.text).toContain(errorMessage);
            expect(mockStatusBarItem.tooltip).toContain(`Error: ${errorMessage}`);
        });
    });

    describe('highlight', () => {
        it('should apply highlight background temporarily', () => {
            statusBarView.highlight(100);

            expect(mockStatusBarItem.backgroundColor).toBeDefined();

            jest.advanceTimersByTime(150);
            expect(mockStatusBarItem.backgroundColor).toBeUndefined();
        });

        it('should clear previous highlight when new highlight is applied', () => {
            statusBarView.highlight(1000);
            expect(mockStatusBarItem.backgroundColor).toBeDefined();

            // Apply new highlight before first one expires
            statusBarView.highlight(500);
            expect(mockStatusBarItem.backgroundColor).toBeDefined();

            // First timeout should be cleared, only second should apply
            jest.advanceTimersByTime(600);
            expect(mockStatusBarItem.backgroundColor).toBeUndefined();
        });
    });

    describe('show and hide', () => {
        it('should show status bar item', () => {
            statusBarView.show();
            expect(mockStatusBarItem.show).toHaveBeenCalled();
        });

        it('should hide status bar item', () => {
            statusBarView.hide();
            expect(mockStatusBarItem.hide).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should dispose status bar item and clear timeouts', () => {
            // Set up some timeouts
            statusBarView.highlight(1000);
            statusBarView.update({
                currentBranch: 'test',
                currentTime: 100,
                isPaused: false,
                isLoading: false,
                error: null
            });

            statusBarView.dispose();
            expect(mockStatusBarItem.dispose).toHaveBeenCalled();

            // Timeouts should be cleared - advancing time shouldn't cause any changes
            jest.advanceTimersByTime(2000);
            // If timeouts were properly cleared, no errors should occur
        });
    });
});