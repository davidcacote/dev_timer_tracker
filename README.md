# Branch Time Tracker

A VS Code extension that tracks time spent on different Git branches.

## Features

- Tracks time spent on each Git branch
- Shows branch statistics in a dedicated view
- Saves time tracking data between sessions
- Simple and lightweight

## Installation

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/)
2. Open a Git repository in VS Code
3. The extension will automatically start tracking branch time

## Usage

- The extension automatically tracks time when you switch between branches
- View your branch time statistics in the "Branch Time" view in the activity bar
- Time is tracked in the background while you work

## Requirements

- VS Code 1.60.0 or higher
- Git installed and configured in your system PATH

## Extension Settings

This extension contributes the following settings:

* `branchTimeTracker.updateInterval`: How often to update the branch time (in milliseconds)

## Known Issues

- Initial alpha version - may contain bugs
- Time tracking is not 100% accurate for very fast branch switches

## Release Notes

### 0.1.0-alpha

Initial alpha release with basic branch time tracking functionality. Time Tracker

A VS Code extension that tracks how much time you spend coding on different git branches.

## Features

- Automatically tracks time spent on each git branch
- Shows branch time statistics via command palette
- Persistent storage of time tracking data
- No configuration needed - works out of the box

## Usage

1. Open VS Code command palette (Cmd+Shift+P on Mac)
2. Type "Show Branch Time Stats"
3. View time spent on each branch in hours and minutes

## Requirements

- Git must be installed and configured in your workspace
- VS Code 1.60.0 or higher

## Extension Settings

This extension does not have any configurable settings.

## Known Issues

- Time tracking starts when the extension is activated
- Time tracking stops when VS Code is closed
- Does not track time when VS Code is not focused

## Release Notes

### 0.1.0

- Initial release with basic time tracking functionality
- Automatic branch detection
- Time statistics display
