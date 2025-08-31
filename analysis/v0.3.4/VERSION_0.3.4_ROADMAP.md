# Version 0.3.4 Roadmap (Stability Focus)

A small, focused release to harden 0.3.x. Primary goals: predictable auto‑refresh, live webview updates, reduced UI churn, and safer data/timer lifecycle.

## 🎯 Themes

- Reliability of auto‑refresh across status bar and webview
- Live sync while webview is open (without manual refresh)
- Safer data handling and timer lifecycle
- Small refactors to reduce complexity and regressions

## ✅ In-Scope Tasks

1. Auto‑refresh logic consolidation — ✅ Completed (2025-08-16)
   - Ensure a single source of truth for refresh ticks
   - Prevent overlapping timers across activation, settings change, workspace change
   - Acceptance: only one active interval at any time; changing interval applies within one tick
   - Implemented: centralized interval management and immediate apply on setting change in `src/extension.ts`

2. Webview live updates when visible — ✅ Completed (2025-08-16)
   - Guarantee periodic updates even if global auto‑refresh is disabled
   - Strategy: panel‑scoped lightweight refresh timer that runs only while panel is visible, or subscribe to a shared refresh bus
   - Acceptance: with panel open and tracking active, numbers increase without clicking refresh
   - Implemented: panel‑scoped timer in `src/extension.ts` within `showBranchStats()`; starts on visibility, stops on hide/dispose; updates content and status bar

3. Status bar debouncing and lightweight updates — ✅ Completed (2025-08-16)
   - Debounce rapid updates to avoid flicker
   - Avoid heavy computation on each tick; compute only needed values
   - Acceptance: no visible flicker; updates feel smooth
   - Implemented: 100ms debounce in `src/extension.ts` `updateStatusBar()`

4. Data validation + safe writes — ✅ Completed (2025-08-16)
   - Validate loaded JSON and create timestamped backup on corruption before reset
   - Use atomic write (write temp file then rename)
   - Acceptance: corrupted file leads to backup + recovery without crashes
   - Implemented: atomic save via temp file + rename in `saveBranchTimes()`; backup on load failure + reset prompt in `loadBranchTimes()` (`src/extension.ts`)

5. Timer lifecycle hardening — ✅ Completed (2025-08-16)
   - Pause updating when workspace is missing/inactive; resume cleanly when available
   - Ensure pausing via UI prevents time accrual across all update paths
   - Acceptance: no time accrues while paused or when no workspace exists
   - Implemented: guards in update paths and pause checks in `src/extension.ts`

6. Minor refactors — ✅ Completed (2025-08-16)
   - Extract refresh management into a small module (e.g., RefreshBus/CallbackManager)
   - Split large functions in `showBranchStats()` and centralize constants
   - Acceptance: functions <150 lines; constants grouped at top; callbacks are disposed reliably
   - Implemented: `RefreshBus` class introduced in `src/extension.ts`; `showBranchStats()` helpers extracted (`getSortedBranches()`, `getTotalSeconds()`, `getBranchStatsHtml()` already isolated); constants centralized at top

## 🔍 Verification/Regression Checks

- HEAD watcher triggers branch change reliably (create/change events)
- No race between interval tick and branch change handling
- One webview open/close cycle leaves no leaked callbacks or timers
- Auto‑refresh setting persists and applies on reload

## 📦 Deliverables

- Code changes in `src/extension.ts` to:
  - Centralize and guard interval management
  - Introduce webview‑scoped refresh or shared refresh bus
  - Debounce status bar updates
  - Add atomic save for data file and backup on corruption
  - Extract small helpers and constants

- Docs updates
  - `analysis/v0.3.4/README.md` (this release scope)
  - CHANGELOG 0.3.4 section with fixes

## 📈 Success Metrics

- No callback/timer leaks after 20 open/close webview iterations
- Status bar and webview values match ±1 interval
- Zero user‑visible crashes on corrupted data scenarios
- CPU usage stable; no runaway intervals

## 🚧 Out of Scope (move to BrainStorming)

- New analytics features
- Major UI redesigns
- Integrations and advanced exports beyond stability fixes

## 🗓️ Timeline (suggested)

- Day 1: Implement refresh consolidation + panel live updates
- Day 2: Data safe‑write + backups; debounce + cleanup refactors
- Day 3: Verification passes, docs + changelog, polish
