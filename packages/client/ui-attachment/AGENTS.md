# AGENTS.md - ui-attachment

Rules for this package. The package contract is in [README.md](README.md); the client rules are in [../AGENTS.md](../AGENTS.md).

## Rationale

Facts that a name cannot carry; each bullet names the file and symbol it belongs to.

- `onWheel` (`AttachmentRail.js`, `#bindRail`): attached by hand as a non-passive listener because any wheel tick with a vertical component must be consumed with `preventDefault`, or it also scrolls the conversation behind the composer. A pure vertical tick becomes a horizontal step (LINE and PAGE deltas normalized to pixels, then capped by `WHEEL_TICK_CAP_PX` so a fast wheel stays followable); a diagonal pan keeps its horizontal intent; a purely horizontal pan stays native.
- `SCROLL_EDGE_SLACK_PX` (`AttachmentRail.js`): engines report fractional scroll positions at the edges, so an edge is only "reached" within this slack.

## CSS rationale

- `DropOverlay.css`: `pointer-events: none` because the layer is decoration; drag events must keep hitting the page so the owner's enter/leave count stays balanced.
- `ImageLightbox.css`: the mask is a separate layer, not a background on `.backdrop`, because `backdrop-filter` there would blur the previewed image and the close control along with the page.

- `AttachmentRail.js` is a webjsx custom element with explicit `applyDiff` re-render; edges recompute from scroll geometry on scroll, item-count change and rail resize (ResizeObserver, so panel resizes count). `#prevCount === null` marks the first layout pass: a rail mounting over an existing draft keeps its start position, while a newly added item is revealed at the end. `WHEEL_LINE_PX` converts `deltaMode` LINE deltas (Firefox notch wheels).
- `DropOverlay.js` and `ImageLightbox.js` mount directly on `document.body`: a transformed or filtered ancestor would otherwise trap the fixed layer in its box. The lightbox closes on Escape, backdrop press or close control and restores focus to the opener on disconnect.
- `MessageImage.js` `singleFit`: a lone image has a 240px long edge, aspect ratio clamped to [0.25, 4] with the overflow cropped by `object-fit: cover`, never upscaled past natural size; the crop anchor keeps the top of very tall and the left of very wide images. Several images render as 64px square tiles.
- `src/client/ComposerAttachments.js` exports a plain slot component: the slot renderer calls it on every re-render with fresh props, so each call creates a fresh element whose `setProps` diffs in place.
- `src/invariant.js` installs nothing: the package contributes only effect-owned slot entries whose lifecycle the slot registry owns.
