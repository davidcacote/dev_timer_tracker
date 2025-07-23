# Branch Time Tracker

A VS Code extension that tracks time spent on different Git branches with a beautiful tab-based interface.

## Features

- Tracks time spent on each Git branch
- Displays statistics in a dedicated tab with visual percentage bars
- Dark/light theme support
- Saves time tracking data between sessions
- Simple and lightweight
- Visual time distribution across branches

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

## Known Issues

- Initial alpha version - may contain bugs
- Time tracking is not 100% accurate for very fast branch switches

## Release Notes

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
