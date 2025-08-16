# Version 0.3.4 Roadmap (Stability Focus)

A small, focused release to harden 0.3.x. Primary goals: predictable auto‑refresh, live webview updates, reduced UI churn, and safer data/timer lifecycle.

## 🎯 Themes

- Reliability of auto‑refresh across status bar and webview
- Live sync while webview is open (without manual refresh)
- Safer data handling and timer lifecycle
- Small refactors to reduce complexity and regressions

## ✅ In-Scope Tasks

1. Auto‑refresh logic consolidation
   - Ensure a single source of truth for refresh ticks
   - Prevent overlapping timers across activation, settings change, workspace change
   - Acceptance: only one active interval at any time; changing interval applies within one tick

2. Webview live updates when visible
   - Guarantee periodic updates even if global auto‑refresh is disabled
   - Strategy: panel‑scoped lightweight refresh timer that runs only while panel is visible, or subscribe to a shared refresh bus
   - Acceptance: with panel open and tracking active, numbers increase without clicking refresh

3. Status bar debouncing and lightweight updates
   - Debounce rapid updates to avoid flicker
   - Avoid heavy computation on each tick; compute only needed values
   - Acceptance: no visible flicker; updates feel smooth

4. Data validation + safe writes
   - Validate loaded JSON and create timestamped backup on corruption before reset
   - Use atomic write (write temp file then rename)
   - Acceptance: corrupted file leads to backup + recovery without crashes

5. Timer lifecycle hardening
   - Pause updating when workspace is missing/inactive; resume cleanly when available
   - Ensure pausing via UI prevents time accrual across all update paths
   - Acceptance: no time accrues while paused or when no workspace exists

6. Minor refactors
   - Extract refresh management into a small module (e.g., RefreshBus/CallbackManager)
   - Split large functions in `showBranchStats()` and centralize constants
   - Acceptance: functions <150 lines; constants grouped at top; callbacks are disposed reliably

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
