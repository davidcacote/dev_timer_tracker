import * as vscode from 'vscode';
import { StatisticsData, StatisticsFilters, createDefaultFilters } from '../models';
import { formatTime, formatLastUpdated } from '../utils';

/**
 * Statistics webview interface
 */
export interface IStatisticsWebview {
    /**
     * Show the webview panel
     */
    show(): Promise<void>;

    /**
     * Update webview with new data
     * @param data Statistics data
     */
    update(data: StatisticsData): void;

    /**
     * Apply filters to the display
     * @param filters Statistics filters
     */
    applyFilters(filters: StatisticsFilters): void;

    /**
     * Handle user actions from webview
     */
    handleUserActions(): void;

    /**
     * Refresh the webview content
     */
    refresh(): void;

    /**
     * Check if webview is visible
     * @returns True if visible
     */
    isVisible(): boolean;

    /**
     * Dispose of resources
     */
    dispose(): void;
}

/**
 * Webview message types
 */
export type WebviewMessage = 
    | { command: 'refresh' }
    | { command: 'setAutoRefresh'; enabled: boolean; interval: number }
    | { command: 'togglePause' }
    | { command: 'exportData'; format: 'csv' | 'json' }
    | { command: 'importData' }
    | { command: 'applyFilters'; filters: StatisticsFilters }
    | { command: 'resetFilters' }
    | { command: 'sortBy'; field: string; order: 'asc' | 'desc' };

/**
 * Webview configuration
 */
export interface WebviewConfig {
    /** Webview title */
    title: string;
    /** View column */
    viewColumn: vscode.ViewColumn;
    /** Enable scripts */
    enableScripts: boolean;
    /** Retain context when hidden */
    retainContextWhenHidden: boolean;
    /** Local resource roots */
    localResourceRoots?: vscode.Uri[];
}

/**
 * Webview theme
 */
export interface WebviewTheme {
    /** Primary color */
    primaryColor: string;
    /** Secondary color */
    secondaryColor: string;
    /** Background color */
    backgroundColor: string;
    /** Text color */
    textColor: string;
    /** Border color */
    borderColor: string;
}

/**
 * Enhanced statistics webview with filtering capabilities
 */
export class StatisticsWebview implements IStatisticsWebview {
    private panel: vscode.WebviewPanel | null = null;
    private config: WebviewConfig;
    private theme: WebviewTheme;
    private currentData: StatisticsData | null = null;
    private currentFilters: StatisticsFilters;
    private messageHandlers: Map<string, (message: any) => void> = new Map();
    private disposables: vscode.Disposable[] = [];

    constructor(
        config: WebviewConfig,
        theme?: WebviewTheme,
        private context?: vscode.ExtensionContext
    ) {
        this.config = config;
        this.theme = theme || DEFAULT_WEBVIEW_THEME;
        this.currentFilters = createDefaultFilters();
        this.setupMessageHandlers();
    }

    /**
     * Show the webview panel
     */
    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(this.config.viewColumn);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'branchTimeTracker',
            this.config.title,
            this.config.viewColumn,
            {
                enableScripts: this.config.enableScripts,
                retainContextWhenHidden: this.config.retainContextWhenHidden,
                localResourceRoots: this.config.localResourceRoots
            }
        );

        this.setupWebviewEventHandlers();
        this.updateWebviewContent();
    }

    /**
     * Update webview with new data
     */
    public update(data: StatisticsData): void {
        this.currentData = data;
        this.updateWebviewContent();
    }

    /**
     * Apply filters to the display
     */
    public applyFilters(filters: StatisticsFilters): void {
        this.currentFilters = { ...filters };
        this.updateWebviewContent();
    }

    /**
     * Handle user actions from webview
     */
    public handleUserActions(): void {
        // This method is called automatically through message handlers
        // Individual handlers are set up in setupMessageHandlers()
    }

    /**
     * Refresh the webview content
     */
    public refresh(): void {
        this.updateWebviewContent();
    }

    /**
     * Check if webview is visible
     */
    public isVisible(): boolean {
        return this.panel?.visible ?? false;
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
        }
    }

    /**
     * Set up message handlers for webview communication
     */
    private setupMessageHandlers(): void {
        this.messageHandlers.set('refresh', () => {
            this.refresh();
        });

        this.messageHandlers.set('applyFilters', (message) => {
            this.applyFilters(message.filters);
        });

        this.messageHandlers.set('resetFilters', () => {
            this.currentFilters = createDefaultFilters();
            this.updateWebviewContent();
        });

        this.messageHandlers.set('sortBy', (message) => {
            this.currentFilters.sortBy = message.field;
            this.currentFilters.sortOrder = message.order;
            this.updateWebviewContent();
        });
    }

    /**
     * Set up webview event handlers
     */
    private setupWebviewEventHandlers(): void {
        if (!this.panel) return;

        // Handle messages from webview
        const messageDisposable = this.panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => {
                const handler = this.messageHandlers.get(message.command);
                if (handler) {
                    handler(message);
                } else {
                    // Forward unhandled messages to extension context
                    this.forwardMessage(message);
                }
            }
        );

        // Handle panel disposal
        const disposeDisposable = this.panel.onDidDispose(() => {
            this.panel = null;
            this.dispose();
        });

        this.disposables.push(messageDisposable, disposeDisposable);
    }

    /**
     * Forward message to extension context for handling
     */
    private forwardMessage(message: WebviewMessage): void {
        // This would typically be handled by the extension's main logic
        // For now, we'll emit a custom event or use a callback pattern
        console.log('Forwarding message to extension:', message);
    }

    /**
     * Update webview content
     */
    private updateWebviewContent(): void {
        if (!this.panel) return;

        this.panel.webview.html = this.generateWebviewHtml();
    }

    /**
     * Generate HTML content for the webview
     */
    private generateWebviewHtml(): string {
        const data = this.currentData;
        const filters = this.currentFilters;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${this.config.title}</title>
                ${this.generateStyles()}
                ${this.generateScripts()}
            </head>
            <body>
                <div class="container">
                    ${this.generateHeader()}
                    ${this.generateFilterControls(filters)}
                    ${this.generateStatisticsContent(data)}
                    ${this.generateActionButtons()}
                </div>
            </body>
            </html>
        `;
    }

    /**
     * Generate CSS styles
     */
    private generateStyles(): string {
        return `
            <style>
                :root {
                    --primary-color: ${this.theme.primaryColor};
                    --secondary-color: ${this.theme.secondaryColor};
                    --background-color: ${this.theme.backgroundColor};
                    --text-color: ${this.theme.textColor};
                    --border-color: ${this.theme.borderColor};
                }

                body {
                    font-family: var(--vscode-font-family);
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    line-height: 1.6;
                }

                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }

                .header h1 {
                    margin: 0;
                    color: var(--vscode-textLink-foreground);
                }

                .filter-controls {
                    background-color: var(--vscode-panel-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px;
                    margin-bottom: 20px;
                }

                .filter-row {
                    display: flex;
                    gap: 15px;
                    align-items: center;
                    margin-bottom: 15px;
                    flex-wrap: wrap;
                }

                .filter-row:last-child {
                    margin-bottom: 0;
                }

                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }

                .filter-group label {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    font-weight: 500;
                }

                .filter-input {
                    padding: 6px 10px;
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 3px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-size: 0.9em;
                    min-width: 120px;
                }

                .filter-input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }

                .btn {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 0.9em;
                    transition: background-color 0.2s;
                }

                .btn-primary {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }

                .btn-primary:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }

                .btn-secondary {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }

                .btn-secondary:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }

                .statistics-table {
                    width: 100%;
                    border-collapse: collapse;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    overflow: hidden;
                }

                .statistics-table th,
                .statistics-table td {
                    padding: 12px 15px;
                    text-align: left;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }

                .statistics-table th {
                    background-color: var(--vscode-panel-background);
                    font-weight: 600;
                    cursor: pointer;
                    user-select: none;
                    position: relative;
                }

                .statistics-table th:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }

                .statistics-table th.sortable::after {
                    content: '↕';
                    position: absolute;
                    right: 8px;
                    opacity: 0.5;
                }

                .statistics-table th.sort-asc::after {
                    content: '↑';
                    opacity: 1;
                }

                .statistics-table th.sort-desc::after {
                    content: '↓';
                    opacity: 1;
                }

                .statistics-table tbody tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }

                .statistics-table tbody tr:last-child td {
                    border-bottom: none;
                }

                .progress-bar {
                    width: 100%;
                    height: 6px;
                    background-color: var(--vscode-progressBar-background);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-top: 4px;
                }

                .progress-fill {
                    height: 100%;
                    background-color: var(--vscode-progressBar-foreground);
                    transition: width 0.3s ease;
                }

                .no-data {
                    text-align: center;
                    padding: 40px;
                    color: var(--vscode-descriptionForeground);
                }

                .loading {
                    text-align: center;
                    padding: 40px;
                }

                .action-buttons {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid var(--vscode-panel-border);
                }

                .summary-stats {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }

                .stat-card {
                    background-color: var(--vscode-panel-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 15px;
                    flex: 1;
                    min-width: 150px;
                }

                .stat-card h3 {
                    margin: 0 0 8px 0;
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .stat-card .value {
                    font-size: 1.5em;
                    font-weight: 600;
                    color: var(--vscode-textLink-foreground);
                }

                @media (max-width: 768px) {
                    .filter-row {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .statistics-table {
                        font-size: 0.9em;
                    }

                    .statistics-table th,
                    .statistics-table td {
                        padding: 8px 10px;
                    }
                }
            </style>
        `;
    }

    /**
     * Generate JavaScript for webview functionality
     */
    private generateScripts(): string {
        return `
            <script>
                const vscode = acquireVsCodeApi();
                
                // Filter management
                let currentFilters = ${JSON.stringify(this.currentFilters)};
                
                function applyFilters() {
                    const branchPattern = document.getElementById('branchPattern').value;
                    const minTime = document.getElementById('minTime').value;
                    const maxTime = document.getElementById('maxTime').value;
                    const dateStart = document.getElementById('dateStart').value;
                    const dateEnd = document.getElementById('dateEnd').value;
                    
                    const filters = {
                        ...currentFilters,
                        branchPattern: branchPattern || undefined,
                        minTime: minTime ? parseInt(minTime) * 60 : undefined, // Convert minutes to seconds
                        maxTime: maxTime ? parseInt(maxTime) * 60 : undefined,
                        dateRange: (dateStart && dateEnd) ? {
                            start: new Date(dateStart),
                            end: new Date(dateEnd)
                        } : undefined
                    };
                    
                    currentFilters = filters;
                    vscode.postMessage({ command: 'applyFilters', filters });
                }
                
                function resetFilters() {
                    document.getElementById('branchPattern').value = '';
                    document.getElementById('minTime').value = '';
                    document.getElementById('maxTime').value = '';
                    document.getElementById('dateStart').value = '';
                    document.getElementById('dateEnd').value = '';
                    
                    vscode.postMessage({ command: 'resetFilters' });
                }
                
                function sortBy(field) {
                    const currentOrder = currentFilters.sortOrder;
                    const newOrder = (currentFilters.sortBy === field && currentOrder === 'desc') ? 'asc' : 'desc';
                    
                    currentFilters.sortBy = field;
                    currentFilters.sortOrder = newOrder;
                    
                    vscode.postMessage({ command: 'sortBy', field, order: newOrder });
                }
                
                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }
                
                function exportData(format) {
                    vscode.postMessage({ command: 'exportData', format });
                }
                
                function importData() {
                    vscode.postMessage({ command: 'importData' });
                }
                
                function togglePause() {
                    vscode.postMessage({ command: 'togglePause' });
                }
                
                // Real-time search
                let searchTimeout;
                function onSearchInput() {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(applyFilters, 300);
                }
                
                // Initialize event listeners
                document.addEventListener('DOMContentLoaded', function() {
                    const branchPattern = document.getElementById('branchPattern');
                    if (branchPattern) {
                        branchPattern.addEventListener('input', onSearchInput);
                    }
                });
            </script>
        `;
    }

    /**
     * Generate header section
     */
    private generateHeader(): string {
        return `
            <div class="header">
                <h1>Branch Time Statistics</h1>
                <div>
                    <button class="btn btn-secondary" onclick="refresh()">
                        🔄 Refresh
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Generate filter controls
     */
    private generateFilterControls(filters: StatisticsFilters): string {
        const dateStart = filters.dateRange ? filters.dateRange.start.toISOString().split('T')[0] : '';
        const dateEnd = filters.dateRange ? filters.dateRange.end.toISOString().split('T')[0] : '';
        const minTimeMinutes = filters.minTime ? Math.floor(filters.minTime / 60) : '';
        const maxTimeMinutes = filters.maxTime ? Math.floor(filters.maxTime / 60) : '';

        return `
            <div class="filter-controls">
                <h3>Filters</h3>
                <div class="filter-row">
                    <div class="filter-group">
                        <label for="branchPattern">Branch Pattern</label>
                        <input type="text" id="branchPattern" class="filter-input" 
                               placeholder="Search branches..." 
                               value="${filters.branchPattern || ''}"
                               title="Use * for wildcards, ? for single characters">
                    </div>
                    <div class="filter-group">
                        <label for="minTime">Min Time (minutes)</label>
                        <input type="number" id="minTime" class="filter-input" 
                               placeholder="0" min="0" value="${minTimeMinutes}">
                    </div>
                    <div class="filter-group">
                        <label for="maxTime">Max Time (minutes)</label>
                        <input type="number" id="maxTime" class="filter-input" 
                               placeholder="∞" min="0" value="${maxTimeMinutes}">
                    </div>
                </div>
                <div class="filter-row">
                    <div class="filter-group">
                        <label for="dateStart">From Date</label>
                        <input type="date" id="dateStart" class="filter-input" value="${dateStart}">
                    </div>
                    <div class="filter-group">
                        <label for="dateEnd">To Date</label>
                        <input type="date" id="dateEnd" class="filter-input" value="${dateEnd}">
                    </div>
                    <div class="filter-group" style="justify-content: flex-end;">
                        <div style="height: 20px;"></div>
                        <div>
                            <button class="btn btn-primary" onclick="applyFilters()">Apply Filters</button>
                            <button class="btn btn-secondary" onclick="resetFilters()">Reset</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Generate statistics content
     */
    private generateStatisticsContent(data: StatisticsData | null): string {
        if (!data) {
            return '<div class="loading">Loading statistics...</div>';
        }

        if (data.isLoading) {
            return '<div class="loading">🔄 Loading...</div>';
        }

        if (data.branches.length === 0) {
            return `
                <div class="no-data">
                    <p>No branches match the current filters.</p>
                    <p>Try adjusting your filter criteria or resetting filters.</p>
                </div>
            `;
        }

        return `
            ${this.generateSummaryStats(data)}
            ${this.generateStatisticsTable(data)}
        `;
    }

    /**
     * Generate summary statistics cards
     */
    private generateSummaryStats(data: StatisticsData): string {
        const totalBranches = data.branches.length;
        const totalTime = formatTime(data.totalTime, false);
        const avgTime = data.branches.length > 0 ? 
            formatTime(Math.floor(data.totalTime / data.branches.length), false) : '0m';
        const totalSessions = data.branches.reduce((sum, branch) => sum + branch.sessionCount, 0);

        return `
            <div class="summary-stats">
                <div class="stat-card">
                    <h3>Total Branches</h3>
                    <div class="value">${totalBranches}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Time</h3>
                    <div class="value">${totalTime}</div>
                </div>
                <div class="stat-card">
                    <h3>Average Time</h3>
                    <div class="value">${avgTime}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Sessions</h3>
                    <div class="value">${totalSessions}</div>
                </div>
            </div>
        `;
    }

    /**
     * Generate statistics table
     */
    private generateStatisticsTable(data: StatisticsData): string {
        const getSortClass = (field: string) => {
            if (data.filters.sortBy === field) {
                return `sort-${data.filters.sortOrder}`;
            }
            return 'sortable';
        };

        const rows = data.branches.map(branch => `
            <tr>
                <td>${this.escapeHtml(branch.name)}</td>
                <td>${formatTime(branch.time, false)}</td>
                <td>
                    ${branch.percentage.toFixed(1)}%
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${branch.percentage}%"></div>
                    </div>
                </td>
                <td>${branch.sessionCount}</td>
                <td>${formatTime(branch.averageSessionTime, false)}</td>
                <td>${formatLastUpdated(branch.lastUpdated)}</td>
            </tr>
        `).join('');

        return `
            <table class="statistics-table">
                <thead>
                    <tr>
                        <th class="${getSortClass('name')}" onclick="sortBy('name')">Branch Name</th>
                        <th class="${getSortClass('time')}" onclick="sortBy('time')">Time Spent</th>
                        <th>Percentage</th>
                        <th class="${getSortClass('sessionCount')}" onclick="sortBy('sessionCount')">Sessions</th>
                        <th>Avg Session</th>
                        <th class="${getSortClass('lastUpdated')}" onclick="sortBy('lastUpdated')">Last Updated</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    /**
     * Generate action buttons
     */
    private generateActionButtons(): string {
        return `
            <div class="action-buttons">
                <button class="btn btn-primary" onclick="exportData('csv')">
                    📊 Export CSV
                </button>
                <button class="btn btn-primary" onclick="exportData('json')">
                    📄 Export JSON
                </button>
                <button class="btn btn-secondary" onclick="importData()">
                    📥 Import Data
                </button>
                <button class="btn btn-secondary" onclick="togglePause()">
                    ⏸️ Toggle Pause
                </button>
            </div>
        `;
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

/**
 * Default webview configuration
 */
export const DEFAULT_WEBVIEW_CONFIG: WebviewConfig = {
    title: 'Branch Time Statistics',
    viewColumn: vscode.ViewColumn.Beside,
    enableScripts: true,
    retainContextWhenHidden: true
};

/**
 * Default webview theme
 */
export const DEFAULT_WEBVIEW_THEME: WebviewTheme = {
    primaryColor: '#007acc',
    secondaryColor: '#6c757d',
    backgroundColor: '#1e1e1e',
    textColor: '#cccccc',
    borderColor: '#3c3c3c'
};