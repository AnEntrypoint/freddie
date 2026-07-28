---
target: src/web/index.html
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-07-28T11-15-11Z
slug: src-web-index-html
---
## Freddie Dashboard Critique

**Method: dual-agent (A: agent-0 · B: agent-1)**

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Sampler reports provider availability, not agent state. "live" chip is always green. Status bar shows build metadata. |
| 2 | Match System / Real World | 3 | Core terms are developer-familiar. `more-horizontal` icon reused for 3 concrete tools; `settings` icon for 3 distinct concepts. |
| 3 | User Control and Freedom | 3 | Hash routing, command palette, Escape dismissal on drawer. No undo for destructive actions at shell level. |
| 4 | Consistency and Standards | 4 | Consistent SDK usage throughout. Standard web patterns. No inconsistencies detected. |
| 5 | Error Prevention | 2 | Toast catches mutation errors. No confirmation for destructive actions. 29-item flat nav makes mis-navigation likely. |
| 6 | Recognition Rather Than Recall | 2 | Icons + labels help, but 29 flat items requires scanning every time. Reused icons force recall. |
| 7 | Flexibility and Efficiency | 3 | Command palette (Ctrl+K), arrow-key nav, programmatic access. Missing: direct keyboard shortcuts, recent list. |
| 8 | Aesthetic and Minimalist Design | 2 | SDK's design is clean but 29 flat nav items is a wall of text. Topbar is 97% empty. Toast hardcodes colors. |
| 9 | Error Recovery | 2 | Toast with `role='alert'`. Error page renders stack trace. No "what to do next" guidance, no retry button. |
| 10 | Help and Documentation | 1 | No help link, no docs, no onboarding, no tooltips, no "?" button. Ctrl+K discoverable only via hidden shortcut. |
| **Total** | | **24/40** | **Acceptable** |

### Design Specificity Verdict

**Interchangeable.** The shell passes exactly one product-specific string into the SDK: `'freddie'` as the brand name. Everything else is the SDK's generic chrome. The 29-item flat nav could be a CRM, a CMS, or a media player. A coding agent dashboard should surface agent state, model, session, and tool availability in its chrome — none of that is present.

**Deterministic scan**: Clean (exit 0). Manual inspection found 6 issues: 3 hardcoded colors in inline CSS, 3 utility classes that belong in the SDK, missing `role='main'` ARIA landmark, and command palette theme toggle bypassing the SDK controller.

### Overall Impression

The dashboard shell is a well-implemented SDK wrapper that's technically clean but design-vacant. The single biggest opportunity: turn the 29-item flat nav into a categorized IA with 3-4 groups, and make the status bar show agent state instead of build metadata.

### What's Working

- **FOUC guard + theme pre-paint**: `body { visibility: hidden }` with `data-ready` lift, plus inline script that pre-paints the correct theme attribute before SDK load.
- **Keyboard accessibility**: Skip link, arrow-key nav in sidebar, Escape dismissal on drawer.
- **Toast system**: 6-second auto-dismiss, `role='alert'`, content truncation, timer cleanup.

### Priority Issues

**[P0] 29-item flat navigation with zero information architecture**: `state.js:105-135` defines 29 routes in a single flat array. `app.js:79-83` builds one Side section containing all 29 items. `chat` is item #2, visually identical to `session-tree` and `notifications`. Fix: categorize into 3-4 groups (Core, Infrastructure, Configuration, Observability).

**[P0] Status bar shows build metadata, not system state**: `app.js:103` reports "ds-247420 · webjsx · 29 routes" — meaningess to a developer. Fix: show agent state, current model, active project, session count.

**[P1] No visual hierarchy distinguishes primary from secondary routes**: All 29 nav items have identical visual weight. Fix: give Core group visual prominence, consider a split layout.

**[P1] Topbar is underutilized**: `app.js:99` has empty `items` array, unused search slot. Fix: add "New Chat" button, current project name, "Ctrl+K" hint.

**[P2] Crumb is redundant**: Always "freddie / [page]" — duplicates active sidebar item. Fix: remove or repurpose.

**[P2] Toast hardcodes colors**: `index.html:37-40` uses raw `#b3261e`, `#fff`, `rgba(0,0,0,.3)` — no design tokens. Fix: use SDK's Toast component.

**[P3] "live" chip is always green**: `app.js:100` — green whenever page render didn't throw, regardless of backend health. Fix: check actual health endpoint.

**[P3] Icon reuse: `more-horizontal` for tools, logs, AND terminal**: `state.js:122,129,134`. Fix: use distinct icons.

**[P3] `settings` icon reused for settings, config, AND machines**: `state.js:117,118,126`. Fix: distinct icons; reconsider overlapping routes.

**[P3] Command palette theme toggle bypasses SDK controller**: `app.js:23-30` directly manipulates DOM and localStorage. Fix: use SDK's ThemeToggle API.

**[P3] No visible hint for Ctrl+K command palette**: `app.js:165-179` registers listener but no affordance. Fix: add "Ctrl+K" hint in topbar or status bar.

### Persona Red Flags

**Alex (Power User)**: 29 flat links, no keyboard shortcuts for direct page nav, no "New Chat" button, no model/project info in chrome. Status bar shows build metadata. Discovers Ctrl+K by accident. Closes dashboard, uses CLI instead. High abandonment risk.

**Jordan (First-Timer)**: 29 undifferentiated links. Which one is "chat"? Item #2, identical to everything else. "live" chip is green — is the agent running? Sampler pill says "sampler 12/17" — what does that mean? No help, no tooltips, no onboarding. Will abandon at the nav.

**Sam (Accessibility-Dependent)**: Skip link and keyboard nav well-implemented. But 29 tab stops before reaching main content. No ARIA landmarks beyond SDK defaults. Toast contrast passes but isn't themed. Command palette invisible without Ctrl+K. Usable but exhausting.

### Minor Observations

- `app.js:41`: Unicode ellipsis inconsistent with codebase's three ASCII dots.
- `server.js:37-38`: `express.static(__dirname)` registered twice — duplicate.
- `app.js:112`: Live-route recompute checks for `'chat'` specifically — breaks for other live routes.
- `state.js:61`: `degraded` computed but never surfaced in UI.
- `app.js:76`: `setInterval` triggers full rerender every 15s even if sampler data unchanged.
- `app.js:88`: No page transition animation — hard cut.
- `index.html:48`: Service worker registration in separate script block — third entry point.
- `state.js:105-135`: Route order is arbitrary, not alphabetical or grouped.

### Questions to Consider

- What if the dashboard were reduced to 5 primary actions with everything else behind a "More" toggle?
- What if the status bar showed the last thing the agent did instead of build metadata?
- The topbar is 97% empty space. What if it showed the current model, active project, and a "New Chat" button?
- Does the Crumb serve any purpose when the sidebar already shows the active page?
- How many seconds until a first-time user finds the chat? Understands the sampler pill? Discovers Ctrl+K?
