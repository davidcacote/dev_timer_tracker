# Branch Time Tracker - Sequential UX Diagram

## User Journey Flow

```mermaid
sequenceDiagram
    participant User
    participant VSCode
    participant Extension
    participant Git
    participant Storage
    participant StatusBar
    participant WebView

    Note over User,WebView: Extension Activation
    User->>VSCode: Opens workspace with Git repo
    VSCode->>Extension: activate(context)
    Extension->>Storage: loadBranchTimes()
    Extension->>Git: getCurrentGitBranch()
    Git-->>Extension: current branch name
    Extension->>StatusBar: createStatusBarItem()
    Extension->>Extension: setupAutoRefresh()
    StatusBar-->>User: Shows "Loading branch time..."

    Note over User,WebView: Initial Setup Complete
    Extension->>StatusBar: updateStatusBar()
    StatusBar-->>User: Shows "2h 30m on main"

    Note over User,WebView: Branch Switching (Manual)
    User->>Git: git checkout feature-branch
    User->>VSCode: Continues coding
    Extension->>Extension: handleBranchChange() (on next refresh)
    Extension->>Git: getCurrentGitBranch()
    Git-->>Extension: "feature-branch"
    Extension->>Extension: updateBranchTime() (for previous branch)
    Extension->>Storage: saveBranchTimes()
    Extension->>StatusBar: updateStatusBar()
    StatusBar-->>User: Shows "0m on feature-branch"

    Note over User,WebView: Auto-Refresh Cycle
    Extension->>Extension: Auto-refresh timer triggers
    Extension->>Extension: updateBranchTime()
    Extension->>Storage: saveBranchTimes()
    Extension->>StatusBar: updateStatusBar()
    Extension->>WebView: refreshCallbacks.forEach()
    StatusBar-->>User: Shows "5m on feature-branch"

    Note over User,WebView: Viewing Statistics
    User->>StatusBar: Clicks status bar item
    Extension->>Extension: showBranchStats()
    Extension->>Extension: updateBranchTime() (force refresh)
    Extension->>WebView: createWebviewPanel()
    WebView-->>User: Opens statistics tab
    User->>WebView: Views branch statistics

    Note over User,WebView: Manual Refresh
    User->>WebView: Clicks "Refresh Now" button
    WebView->>Extension: postMessage({command: 'refresh'})
    Extension->>Extension: updateBranchTime()
    Extension->>WebView: updatePanelContent()
    Extension->>StatusBar: updateStatusBar()
    WebView-->>User: Updated statistics

    Note over User,WebView: Auto-Refresh Settings
    User->>WebView: Toggles auto-refresh checkbox
    WebView->>Extension: postMessage({command: 'setAutoRefresh'})
    Extension->>Extension: setupAutoRefresh()
    Extension->>Storage: save settings
    WebView-->>User: Updated settings applied

    Note over User,WebView: Extension Deactivation
    User->>VSCode: Closes workspace
    VSCode->>Extension: deactivate()
    Extension->>Extension: updateBranchTime() (final save)
    Extension->>StatusBar: dispose()
    Extension->>Extension: clearInterval()
```

## State Management Flow

```mermaid
stateDiagram-v2
    [*] --> ExtensionLoading
    ExtensionLoading --> NoWorkspace: No workspace folder
    ExtensionLoading --> WorkspaceActive: Workspace with Git repo

    NoWorkspace --> WorkspaceActive: User opens workspace
    WorkspaceActive --> NoWorkspace: User closes workspace

    WorkspaceActive --> BranchTracking
    BranchTracking --> BranchTracking: Auto-refresh timer
    BranchTracking --> BranchTracking: Manual refresh
    BranchTracking --> BranchTracking: Branch switch detected

    BranchTracking --> StatisticsView: User clicks status bar
    StatisticsView --> BranchTracking: User closes statistics
    StatisticsView --> StatisticsView: Manual refresh
    StatisticsView --> StatisticsView: Auto-refresh update

    BranchTracking --> [*]: Extension deactivated
    StatisticsView --> [*]: Extension deactivated
```

## Data Flow Architecture

```mermaid
graph TD
    A[User Action] --> B[Extension Event Handler]
    B --> C{Action Type}

    C -->|Branch Switch| D[Git Operations]
    C -->|Time Update| E[Time Calculation]
    C -->|View Stats| F[Statistics Generation]
    C -->|Settings Change| G[Settings Update]

    D --> H[Branch Detection]
    H --> I[Update Current Branch]
    I --> E

    E --> J[Time Storage]
    J --> K[Local File System]

    F --> L[HTML Generation]
    L --> M[WebView Display]

    G --> N[Timer Management]
    N --> O[Auto-refresh Setup]

    E --> P[Status Bar Update]
    P --> Q[User Interface]

    K --> R[Data Persistence]
    R --> S[Session Recovery]
```

## Error Handling Flow

```mermaid
flowchart TD
    A[Operation Start] --> B{Check Prerequisites}
    B -->|No Workspace| C[Show Error in Status Bar]
    B -->|No Git Repo| D[Show Git Error]
    B -->|Valid Setup| E[Execute Operation]

    E --> F{Git Command Success?}
    F -->|No| G[Log Error & Continue]
    F -->|Yes| H[Process Result]

    H --> I{Data Valid?}
    I -->|No| J[Use Default Values]
    I -->|Yes| K[Update State]

    G --> L[Show User-Friendly Message]
    J --> L
    K --> M[Update UI]
    L --> M

    C --> N[Wait for Workspace]
    D --> N
    M --> O[Continue Normal Operation]
    N --> O
```

## Performance Optimization Points

1. **Timer Management**: Only run auto-refresh when workspace is active
2. **Memory Management**: Properly dispose of callbacks and timers
3. **Storage Efficiency**: Batch writes to reduce I/O operations
4. **UI Updates**: Debounce status bar updates to prevent flickering
5. **Git Operations**: Cache branch information to reduce git calls
