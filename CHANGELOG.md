# Changelog

All notable changes to the Branch Time Tracker extension will be documented in this file.

## [Unreleased]

### Planned for 0.3.3

- Memory leak fixes in refreshCallbacks
- Active branch change detection with file system watcher
- Race condition prevention in async operations
- Enhanced error handling and user feedback
- Performance optimizations for timer management
- Status bar UX improvements with loading states

## [0.3.2] - 2025-07-24

### Fixed

- Improved error handling for git operations
- Fixed potential memory leaks in the statistics view

## [0.3.1] - 2025-07-23

### Added

- Manual refresh button in the statistics view
- Auto-refresh toggle with configurable interval (1-300 seconds)
- Improved UI for refresh controls

## [0.3.0] - 2025-07-23

### Added

- New tab-based statistics view with improved visualization
- Visual percentage bars for time distribution
- Dark/light theme support in the statistics view

### Changed

- Replaced popup with a persistent tab for better user experience
- Improved statistics display with better formatting and sorting
- Statistics now refresh when opened for accurate timing
- Better visual hierarchy in the statistics view

## [0.2.2] - 2025-07-23

### Changed

- Removed seconds from status bar for cleaner look
- Added total time tracked summary
- Updated publisher information to use personal account
- Fixed icon display in the extension

## [0.2.1] - 2025-07-23

### Changed

- Simplified status bar to show only time spent
- Improved statistics display with better formatting
- Added visual indicator for current branch in stats
- Updated extension publisher information
- Bumped version to 0.2.1

## [0.2.0] - 2025-07-23

### Added

- Status bar integration showing current branch and time spent
- Clickable status bar item that shows detailed statistics
- Loading indicators and better error states
- Improved time formatting

### Changed

- Updated version to 0.2.0
- Improved error handling and user feedback
- Better handling of workspace changes

## [0.1.0-alpha] - 2025-07-23

### Added

- Initial alpha release
- Basic branch time tracking functionality
- Simple view to display branch statistics
- Automatic time tracking when switching branches
- Data persistence between sessions
