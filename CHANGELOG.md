# Changelog

All notable changes to the Branch Time Tracker extension will be documented in this file.

## [0.4.0] - Unreleased

### Planned

- Enhanced data export/import functionality with more formats (CSV, JSON)
- Customizable time tracking presets and templates
- Advanced filtering and search in statistics view
- Project-specific time tracking configurations
- Integration with popular time tracking services

### In Progress

- Refactoring core tracking engine for better performance
- Improving test coverage for critical components

## [0.3.4] - 2025-08-16

### Changed

- Consolidated auto-refresh logic to ensure a single active interval and immediate application on interval changes
- Webview live updates while visible via panel-scoped timer with proper start/stop on visibility and dispose
- Debounced status bar updates to reduce flicker and unnecessary work
- Minor refactors: introduced helper functions for interval policy and stats data preparation

### Fixed

- Safer data handling: validate JSON on load, create timestamped backup on corruption, and reset flow
- Atomic saves: write to temp file then rename to prevent partial writes
- Timer lifecycle hardening: no time accrues when paused or when no workspace is available

## [0.3.3] - 2025-08-09

### Added

- Active branch change detection with file system watcher
- Enhanced error handling and user feedback
- Status bar UX improvements with loading states

### Fixed

- Memory leak in refreshCallbacks
- Race conditions in async operations
- Performance optimizations for timer management

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
