# Agent Note: Model menu container and focus ownership

Status: implemented

## Problem

An upward model menu sized against the viewport can extend beyond it when the trigger sits inside a narrow composer. At 320 pixels the root pane begins at −21 pixels, clipping its left labels. Separately, entering a child pane replaces the focused root-menu button. Focus falls to the page, leaving Escape outside the menu's keyboard owner.

## Decision

Whenever the menu has an inline-size query container, its root is static and its border-box width is capped at the container's content width. The actual composer footer row owns that sizing container; the positioned composer card remains the menu's absolute containing block. The upward menu aligns to the card's right edge and opens above the card at narrow and desktop widths. A menu without a query container retains its relative-root and viewport-width rules.

Opening and pane transitions focus the first enabled item synchronously after the actual DOM update, with the trigger as the empty-enabled-set fallback. Directional entry chooses the first or last enabled item, and subsequent arrow navigation wraps through enabled items. Escape returns a child pane to the root pane with focus, then closes the root menu and restores its trigger. The [session model selection decision](../feature/2026-07-24-web-session-model-selector.md) retains its independent directory, routing, persistence and effort rationale.

## Alternatives considered

**Reduce every menu to the compact trigger's width.** The trigger intentionally truncates a long current label; that width would needlessly constrain provider and effort inspection.

**Add fixed JavaScript fitting or use the existing anchored-position controller.** The existing controller places panels below their anchors. The composer's owned container and positioned card can bound this upward menu without another geometry observer or positioning lifecycle.

**Fit only below a viewport breakpoint.** The trigger's distance from the viewport edge depends on its composer and neighboring controls. The owned container supplies the actual constraint at every width.

**Restore focus with a delay or listen for Escape on the whole document.** The pane owner already knows when its replacement DOM is ready. Immediate owned focus keeps keyboard events within the current menu.

## Consequences

Desktop alignment follows the composer card rather than the compact trigger. The menu may be narrower than its ordinary 240-pixel minimum, allowing its left labels to remain visible. No selection, catalog, provider, locale or outside-close contract changes.

The real current session exposes provider DeepSeek, model gpt-6.1-sol and effort High. Native keyboard execution at 320 pixels opens the Model/Effort root, drills into the provider pane and effort levels, wraps Off→Max→Off with arrow keys, and returns through both Escape stages to the trigger. Model, provider and effort panes all occupy x89–295 with a 206-pixel border box; at 390 pixels they occupy x125–365 with a 240-pixel box, and at 1280 pixels x835–1075 with a 240-pixel box. The provider/model/effort label remains unchanged throughout. Directional entry from the trigger reaches the last item with ArrowUp and the first with ArrowDown. These observations exercise the current populated directory; unavailable or entirely disabled directories are not separately induced.
