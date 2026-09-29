# AGENTS.md - ui-attachment

Rules for this package. The package contract is in [README.md](README.md); the client rules are in [../AGENTS.md](../AGENTS.md).

## Rationale

Facts that a name cannot carry; each bullet names the file and symbol it belongs to.

- `onWheel` (`AttachmentRail.js`, `#bindRail`): attached by hand as a non-passive listener because any wheel tick with a vertical component must be consumed with `preventDefault`, or it also scrolls the conversation behind the composer. A pure vertical tick becomes a horizontal step (LINE and PAGE deltas normalized to pixels, then capped by `WHEEL_TICK_CAP_PX` so a fast wheel stays followable); a diagonal pan keeps its horizontal intent; a purely horizontal pan stays native.
- `SCROLL_EDGE_SLACK_PX` (`AttachmentRail.js`): engines report fractional scroll positions at the edges, so an edge is only "reached" within this slack.

## CSS rationale

- `DropOverlay.css`: `pointer-events: none` because the layer is decoration; drag events must keep hitting the page so the owner's enter/leave count stays balanced.
- `ImageLightbox.css`: the mask is a separate layer, not a background on `.backdrop`, because `backdrop-filter` there would blur the previewed image and the close control along with the page.
