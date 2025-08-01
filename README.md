# Branch Time Tracker

A VS Code extension that tracks time spent on different Git branches with a beautiful tab-based interface.

**Current Version**: 0.3.2

## Features

- Tracks time spent on each Git branch
- Displays statistics in a dedicated tab with visual percentage bars
- Dark/light theme support
- Saves time tracking data between sessions
- Simple and lightweight
- Visual time distribution across branches
- Manual refresh button for up-to-date statistics
- Auto-refresh with configurable interval (1-300 seconds)
- Improved error handling for git operations
- Enhanced UI with better visual hierarchy
- Persistent tab-based statistics view
- Real-time branch time tracking

## Installation

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/)
2. Open a Git repository in VS Code
3. The extension will automatically start tracking branch time

## Usage

- The extension automatically tracks time when you switch between branches
- Click the status bar item to open detailed statistics in a new tab
- The statistics tab shows:
  - Time spent per branch with visual percentage bars
  - Current active branch
  - Total time tracked across all branches
  - Number of branches being tracked
- Time is tracked in the background while you work

### Viewing Statistics

1. Click on the time display in the status bar (e.g., "2h 30m on branch")
2. A new tab will open with detailed statistics
3. The view updates automatically when you switch branches

## Requirements

- VS Code 1.60.0 or higher
- Git installed and configured in your system PATH

## Extension Settings

This extension contributes the following settings:

- `branchTimeTracker.updateInterval`: How often to update the branch time (in milliseconds)

## Version History

### [0.3.2] - 2025-07-24

- **Fixed**: Improved error handling for git operations
- **Fixed**: Fixed potential memory leaks in the statistics view

### [0.3.1] - 2025-07-23

- **Added**: Manual refresh button in the statistics view
- **Added**: Auto-refresh toggle with configurable interval (1-300 seconds)
- **Added**: Improved UI for refresh controls

### [0.3.0] - 2025-07-23

- **Added**: New tab-based statistics view with improved visualization
- **Added**: Visual percentage bars for time distribution
- **Added**: Dark/light theme support in the statistics view
- **Changed**: Replaced popup with a persistent tab for better user experience
- **Changed**: Improved statistics display with better formatting and sorting

### [0.2.2] - 2025-07-23

- **Changed**: Removed seconds from status bar for cleaner look
- **Changed**: Added total time tracked summary
- **Changed**: Updated publisher information
- **Fixed**: Icon display issues

### [0.2.0] - 2025-07-23

- **Added**: Status bar integration showing current branch and time spent
- **Added**: Clickable status bar item that shows detailed statistics
- **Added**: Loading indicators and better error states
- **Added**: Improved time formatting

### [0.1.0-alpha] - 2025-07-23

- **Added**: Initial alpha release with basic branch time tracking functionality
- **Added**: Simple view to display branch statistics
- **Added**: Automatic time tracking when switching branches
- **Added**: Data persistence between sessions

For detailed changelog, see [CHANGELOG.md](./CHANGELOG.md).

## 🚀 Development Status

### Current Version: 0.3.2

- **Status**: Stable release
- **Focus**: Bug fixes and performance improvements
- **Last Updated**: July 24, 2025

### Upcoming Version: 0.3.3

- **Status**: In development
- **Focus**: Critical bug fixes and UX improvements
- **Planned Release**: August 2025
- **Key Improvements**:
  - Memory leak fixes
  - Active branch change detection
  - Race condition prevention
  - Enhanced error handling

For detailed development roadmap, see [v0.3.3 Roadmap](./analysis/v0.3.2/VERSION_0.3.3_ROADMAP.md).

## 📊 Analysis & Documentation

This project includes comprehensive analysis documentation for each version:

- **[Analysis Documentation](./analysis/)** - Complete analysis of code quality, UX, and development roadmaps
- **[v0.3.2 Analysis](./analysis/v0.3.2/)** - Latest analysis with critical fixes and v0.3.3 roadmap

### Key Analysis Documents:

- **Executive Summary** - High-level overview and critical issues
- **Technical Analysis** - Detailed code review with specific fixes
- **UX Diagrams** - User journey flows and interaction patterns
- **Development Roadmap** - Comprehensive planning for future versions

## Build Process

This project includes a build system that organizes build artifacts in a `builds` directory and prevents file overwrites.

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)
- VS Code Extension Manager (vsce)

### Building the Extension

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Compile TypeScript**

   ```bash
   npm run compile
   ```

   This compiles the TypeScript code to the `builds/out` directory.

3. **Package the Extension**

   ```bash
   npm run vscode:package
   ```

   This creates a VSIX file in the `builds` directory with a timestamp in the filename (e.g., `branch-time-tracker-0.3.3-20250725-224600.vsix`).

### Build Organization

- All build artifacts are stored in the `builds` directory
- Each VSIX file includes a timestamp to prevent overwrites
- The `builds/out` directory contains compiled JavaScript files
- The `builds` directory is excluded from version control

### Organizing Existing Builds

To organize existing VSIX files into the builds directory:

```bash
./scripts/organize-builds.sh
```

This script:

- Moves all `.vsix` files from the root directory to the `builds` directory
- Appends a timestamp to each filename
- Preserves the version number in the filename

### Installing a Local Build

To install a local build in VS Code:

1. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
2. Select "Extensions: Install from VSIX..."
3. Navigate to the `builds` directory and select the desired VSIX file

## Known Issues

- Time tracking is not 100% accurate for very fast branch switches
- Memory usage may increase over time (will be fixed in v0.3.3)
- Branch changes outside VS Code may not be detected immediately (will be fixed in v0.3.3)
- Some git operations may fail silently (will be improved in v0.3.3)

### Planned Fixes (v0.3.3)

- Memory leak prevention
- Real-time branch change detection
- Enhanced error handling and user feedback
- Performance optimizations

## Release Notes

### 0.3.2 (Latest)

- Improved error handling for git operations
- Fixed potential memory leaks in the statistics view
- Enhanced stability and performance

### 0.3.1

- Manual refresh button in the statistics view
- Auto-refresh toggle with configurable interval
- Improved UI for refresh controls

### 0.3.0

- New tab-based statistics view with improved visualization
- Visual percentage bars for time distribution
- Dark/light theme support
- Better visual hierarchy and formatting

### 0.2.2

- Removed seconds from status bar for cleaner look
- Updated publisher information
- Fixed icon display issues

### 0.1.0-alpha

Initial alpha release with basic branch time tracking functionality.

- Automatic branch detection
- Time statistics display
