import * as vscode from 'vscode';
import { StatisticsData, StatisticsFilters, createDefaultFilters } from '../models';
import { formatTime, formatLastUpdated } from '../utils';

/**
 * Statistics webview interface
 */
export interface IStatisticsWebview {
    /**
     * Initialize the webview
     */
    initialize(): Promise<void>;

    /**
     * Show the webview panel
     */
    show(): Promise<void>;

    /**
     * Update webview with new data
     * @param data Statistics data
     */
    updateData(data: any): void;

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
     * Get current filters
     * @returns Current filters
     */
    getCurrentFilters(): StatisticsFilters;

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
        private context: vscode.ExtensionContext,
        config?: WebviewConfig,
        theme?: WebviewTheme
    ) {
        this.config = config || DEFAULT_WEBVIEW_CONFIG;
        this.theme = theme || DEFAULT_WEBVIEW_THEME;
        this.currentFilters = createDefaultFilters();
        this.setupMessageHandlers();
    }

    /**
     * Initialize the webview
     */
    async initialize(): Promise<void> {
        // Webview initialization is done when show() is called
        // This method is here for consistency with other views
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
    public updateData(data: any): void {
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
     * Get current filters
     */
    public getCurrentFilters(): StatisticsFilters {
        return { ...this.currentFilters };
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
     * Generate overall insights panel using aggregated distributions and dates
     */
    private generateInsights(data: StatisticsData): string {
        if (!data || !data.branches || data.branches.length === 0) return '';

        // Aggregate time distribution
        const distKeys = ['morning','afternoon','evening','night'] as const;
        const aggDist: Record<string, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
        for (const b of data.branches) {
            if (!b.timeDistribution) continue;
            for (const k of distKeys) aggDist[k] += b.timeDistribution[k] || 0;
        }
        const mostActiveTimeKey = Object.entries(aggDist).reduce((a, c) => c[1] > (a[1]||0) ? c : a, ['', 0 as any] as any)[0] || 'n/a';
        const mostActiveTime = mostActiveTimeKey.charAt(0).toUpperCase() + mostActiveTimeKey.slice(1);

        // Aggregate daily averages
        const dayKeys = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        const aggDaily: Record<string, number> = Object.fromEntries(dayKeys.map(d => [d, 0]));
        for (const b of data.branches) {
            if (!b.dailyAverages) continue;
            for (const d of dayKeys) aggDaily[d] += b.dailyAverages[d] || 0;
        }
        const mostActiveDay = Object.entries(aggDaily).reduce((a, c) => c[1] > (a[1]||0) ? c : a, ['', 0 as any] as any)[0] || 'n/a';

        // Average daily time across overall tracked window
        const firstDates = data.branches.map(b => b.firstSessionDate).filter(Boolean).map(d => new Date(d!));
        const lastDates = data.branches.map(b => b.lastSessionDate || b.lastUpdated).filter(Boolean).map(d => new Date(d));
        let avgDailyTime = 0;
        if (firstDates.length && lastDates.length) {
            const start = new Date(Math.min(...firstDates.map(d => d.getTime())));
            const end = new Date(Math.max(...lastDates.map(d => d.getTime())));
            const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000*60*60*24)));
            avgDailyTime = Math.floor(data.totalTime / days);
        }

        // Consistency score (0-100): based on stddev of aggregated daily averages
        const values = dayKeys.map(d => aggDaily[d]);
        const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
        const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length || 1);
        const std = Math.sqrt(variance);
        const score = Math.max(0, Math.min(100, Math.round(100 * (1 - (std / (mean + 1)) ))));

        return `
            <div class="insights">
                <h3>Insights</h3>
                <div class="insight-cards">
                    <div class="insight-card">
                        <div class="label">Most Active Day</div>
                        <div class="value">${mostActiveDay.charAt(0).toUpperCase() + mostActiveDay.slice(1)}</div>
                    </div>
                    <div class="insight-card">
                        <div class="label">Most Active Time</div>
                        <div class="value">${mostActiveTime}</div>
                    </div>
                    <div class="insight-card">
                        <div class="label">Avg Daily Time</div>
                        <div class="value">${formatTime(avgDailyTime, false)}</div>
                    </div>
                    <div class="insight-card">
                        <div class="label">Consistency</div>
                        <div class="value">${score}/100</div>
                    </div>
                </div>
            </div>
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
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 15px;
                    margin-bottom: 25px;
                }

                .stat-card {
                    background-color: var(--vscode-panel-background);
                    border-radius: 8px;
                    padding: 15px;
                    text-align: center;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                    transition: transform 0.2s, box-shadow 0.2s;
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .stat-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
                }

                .stat-card h3 {
                    margin: 0 0 8px 0;
                    font-size: 0.85em;
                    color: var(--vscode-descriptionForeground);
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .stat-card .value {
                    font-size: 1.6em;
                    font-weight: 600;
                    color: var(--vscode-textLink-foreground);
                    margin: 5px 0;
                }
                
                .stat-desc {
                    font-size: 0.75em;
                    color: var(--vscode-descriptionForeground);
                    opacity: 0.8;
                    margin-top: 4px;
                }

                .delta {
                    display: inline-block;
                    font-size: 0.75em;
                    padding: 2px 6px;
                    border-radius: 10px;
                    margin-top: 6px;
                }
                .delta.positive {
                    color: #2e7d32;
                    background: rgba(46, 125, 50, 0.15);
                }
                .delta.negative {
                    color: #c62828;
                    background: rgba(198, 40, 40, 0.15);
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

                function setSort(field, order) {
                    currentFilters.sortBy = field;
                    currentFilters.sortOrder = order;
                    vscode.postMessage({ command: 'sortBy', field, order });
                }
                
                // Real-time search
                let searchTimeout;
                function onSearchInput() {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(applyFilters, 300);
                }

                // Debounced apply for date/time inputs
                function onDateOrTimeInput() {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(applyFilters, 300);
                }

                // Quick period selection
                function setPeriod(period) {
                    const now = new Date();
                    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    let start = new Date(end);
                    switch (period) {
                        case 'today':
                            // start already today 00:00
                            break;
                        case 'week':
                            start.setDate(end.getDate() - 7);
                            break;
                        case 'month':
                            start.setMonth(end.getMonth() - 1);
                            break;
                        case 'year':
                            start.setFullYear(end.getFullYear() - 1);
                            break;
                    }
                    const fmt = d => d.toISOString().split('T')[0];
                    document.getElementById('dateStart').value = fmt(start);
                    document.getElementById('dateEnd').value = fmt(end);
                    applyFilters();
                }
                
                // Initialize event listeners
                document.addEventListener('DOMContentLoaded', function() {
                    const branchPattern = document.getElementById('branchPattern');
                    if (branchPattern) {
                        branchPattern.addEventListener('input', onSearchInput);
                    }
                    const dateStart = document.getElementById('dateStart');
                    const dateEnd = document.getElementById('dateEnd');
                    const minTime = document.getElementById('minTime');
                    const maxTime = document.getElementById('maxTime');
                    if (dateStart) dateStart.addEventListener('change', onDateOrTimeInput);
                    if (dateEnd) dateEnd.addEventListener('change', onDateOrTimeInput);
                    if (minTime) minTime.addEventListener('input', onDateOrTimeInput);
                    if (maxTime) maxTime.addEventListener('input', onDateOrTimeInput);
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
                    <div class="filter-group" style="align-self: end; gap: 8px;">
                        <div>
                            <button class="btn btn-secondary" title="Today" onclick="setPeriod('today')">Today</button>
                            <button class="btn btn-secondary" title="Last 7 days" onclick="setPeriod('week')">Week</button>
                            <button class="btn btn-secondary" title="Last 30 days" onclick="setPeriod('month')">Month</button>
                            <button class="btn btn-secondary" title="Last 365 days" onclick="setPeriod('year')">Year</button>
                        </div>
                    </div>
                </div>
                <div class="filter-row">
                    <div class="filter-group">
                        <label for="sortField">Sort Field</label>
                        <select id="sortField" class="filter-input" onchange="setSort(this.value, document.getElementById('sortOrder').value)">
                            <option value="time" ${filters.sortBy === 'time' ? 'selected' : ''}>Time Spent</option>
                            <option value="name" ${filters.sortBy === 'name' ? 'selected' : ''}>Branch Name</option>
                            <option value="lastUpdated" ${filters.sortBy === 'lastUpdated' ? 'selected' : ''}>Last Updated</option>
                            <option value="sessionCount" ${filters.sortBy === 'sessionCount' ? 'selected' : ''}>Sessions</option>
                            <option value="switchingFrequency" ${filters.sortBy === 'switchingFrequency' ? 'selected' : ''}>Switching/day</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="sortOrder">Order</label>
                        <select id="sortOrder" class="filter-input" onchange="setSort(document.getElementById('sortField').value, this.value)">
                            <option value="desc" ${filters.sortOrder === 'desc' ? 'selected' : ''}>Descending</option>
                            <option value="asc" ${filters.sortOrder === 'asc' ? 'selected' : ''}>Ascending</option>
                        </select>
                    </div>
                </div>
                <div class="filter-row">
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
            ${this.generateInsights(data)}
            ${this.generateStatisticsTable(data)}
        `;
    }

    /**
     * Generate summary statistics cards with advanced metrics
     */
    private generateSummaryStats(data: StatisticsData): string {
        const totalBranches = data.branches.length;
        const totalTime = formatTime(data.totalTime, false);
        const totalSessions = data.branches.reduce((sum, branch) => sum + (branch.sessionCount || 0), 0);
        const avgSessionTime = totalSessions > 0 
            ? formatTime(Math.floor(data.totalTime / totalSessions), false) 
            : '0m';
        const timeComp = data.comparisons?.time;
        const sessComp = data.comparisons?.sessions;
        const fmtDelta = (pct?: number) => {
            if (pct === undefined || isNaN(pct)) return '';
            const cls = pct >= 0 ? 'positive' : 'negative';
            const arrow = pct >= 0 ? '▲' : '▼';
            return `<span class="delta ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
        };
            
        // Calculate average switching frequency (sessions per day)
        const activeBranches = data.branches.filter(b => b.sessionCount > 0);
        const avgSwitchingFrequency = activeBranches.length > 0
            ? (activeBranches.reduce((sum, b) => sum + (b.switchingFrequency || 0), 0) / activeBranches.length).toFixed(1)
            : '0.0';

        // Find most active time of day
        let mostActiveTime = 'N/A';
        if (activeBranches.length > 0) {
            const timeDist = activeBranches[0].timeDistribution;
            if (timeDist) {
                const maxTime = Math.max(...Object.values(timeDist));
                const period = Object.entries(timeDist).find(([_, v]) => v === maxTime)?.[0] || '';
                mostActiveTime = period.charAt(0).toUpperCase() + period.slice(1);
            }
        }

        return `
            <div class="summary-stats">
                <div class="stat-card">
                    <h3>Total Branches</h3>
                    <div class="value">${totalBranches}</div>
                    <div class="stat-desc">tracked</div>
                </div>
                <div class="stat-card">
                    <h3>Total Time</h3>
                    <div class="value">${totalTime}</div>
                    ${fmtDelta(timeComp?.percentageChange)}
                    <div class="stat-desc">across all branches</div>
                </div>
                <div class="stat-card">
                    <h3>Total Sessions</h3>
                    <div class="value">${totalSessions}</div>
                    ${fmtDelta(sessComp?.percentageChange)}
                    <div class="stat-desc">tracked</div>
                </div>
                <div class="stat-card">
                    <h3>Avg Session</h3>
                    <div class="value">${avgSessionTime}</div>
                    <div class="stat-desc">per session</div>
                </div>
                <div class="stat-card">
                    <h3>Activity</h3>
                    <div class="value">${mostActiveTime}</div>
                    <div class="stat-desc">most active time</div>
                </div>
                <div class="stat-card">
                    <h3>Switching</h3>
                    <div class="value">${avgSwitchingFrequency}</div>
                    <div class="stat-desc">sessions/day</div>
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
                <td>${(branch.switchingFrequency ?? 0).toFixed(1)}</td>
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
                        <th class="${getSortClass('switchingFrequency')}" onclick="sortBy('switchingFrequency')">Switching/day</th>
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