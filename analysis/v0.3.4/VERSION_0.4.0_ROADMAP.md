# Version 0.4.0 Roadmap

## Objectives
- Accurate, configurable time tracking
- Better insights and UX while staying performant
- Prepare architecture for integrations and multi‑workspace

## Inputs
- Previous: `analysis/v0.3.3/VERSION_0.3.4_ROADMAP.md` (stability work done)
- Ideas: `brainStorming/IDEAS.md`

## In-Scope Features (v0.4.0)

### High Priority
1) Associate projects to branches
- Map each tracked branch to its project/repository
- Surface project in stats and exports
- Basis for project‑level filters and reports

2) Count time only with IDE active (config)
- New setting: `branchTimeTracker.countOnlyWhenActive: boolean`
- Pause accrual when IDE window not focused (or OS idle)
- Small “active-only” indicator in status bar/webview

3) Tags column (branch categorization)
- Add optional tags per branch (e.g., feature, bugfix, chore)
- Display as a new column + filter in webview
- Persist tags in storage and include in export

### Medium Priority (Out of scope for v0.4.0)
4) Enhanced export/import (CSV/JSON + scheduling)
- Multiple formats with columns for project, tags
- Optional scheduled export (daily/weekly) to a file path

5) Advanced filtering and analytics
- Filter by project, tags, date ranges
- Trends and comparisons (weekly/monthly)

6) Presets for tracking/filters
- Save and apply commonly used filter/layout presets

Note: All Medium priority items are not planned for v0.4.0.

### Low Priority (Out of scope for v0.4.0)
7) UI customization polish
- Status bar format options, compact webview mode

Note: All Low priority items are not planned for v0.4.0.

## Technical Improvements
- Modularization: extract `TrackingEngine`, `StorageService`, `GitService`, `StatsView`
- Performance: trim memory, debounce where needed, avoid heavy work on ticks
- Data safety: validation + backups on import/export

## Data Model Updates
- Add `projectId`/`projectName` per branch record
- Add `tags: string[]` per branch
- Export schema v2 with new columns/fields

## UX Notes
- Non‑disruptive defaults; new features are opt‑in (e.g., active-only setting off by default)
- Clear indicators when time accrual is paused due to inactivity

## Phases & Timeline (suggested ~4–5 weeks)
- Phase 1: Architecture & data model
  - Extract services, wire Git/project detection, migrate storage schema
- Phase 2: Core features (1–3)
  - Project association, active‑only accrual, tags column (+ minimal filters needed for tags)
- Phase 3: Polish & docs
  - Performance passes, UX polish related to features above, documentation

## Success Metrics
- Memory usage < 100MB during normal usage
- 0 data‑loss incidents in import/export; backups created on errors
- Positive user feedback on clarity of stats (≥4.5/5)

## Risks & Mitigations
- Project detection edge cases → fallback to workspace folder name; manual override
- Miscount with active‑only mode → explicit focus/idle hooks + manual verification
- Tag UX complexity → start minimal (free‑text, comma‑separated) + filter by contains
- Export scheduler reliability → run on activation + safe write (temp + rename)

## Dependencies
- VS Code APIs (window focus, workspace, configuration)
- Git extension API (repo/branch resolution)
- Node.js fs for storage and scheduled exports
