# Agent Note: Split TrajectoryTable by responsibility

Status: implemented

## Problem

`packages/client/ui-trajectory/src/client/TrajectoryTable.js` was a 2808-line module. It mixed SVG icons, timing and token formatting, record grouping and collapsing, usage panels, the prompt diff, schema parsing and the custom element that consumes all of them. Changing one responsibility meant loading the whole module.

## Decision

The responsibilities now live in six sibling modules under `packages/client/ui-trajectory/src/client/`:

- `TrajectoryIcons.js`: the tool, information and compacted icons, and `kindIcon`.
- `TrajectoryFormatting.js`: duration formatting, the started-at value and the assistant timing panel.
- `TrajectoryRecordGroups.js`: record flattening and filtering, request indexing, turn and assistant collapsing, and state labels.
- `TrajectoryUsage.js`: the token, usage and request-options panels.
- `TrajectoryPromptDiff.js`: the prompt diff section and the system prompt diff.
- `TrajectorySchema.js`: record schema parsing.

`TrajectoryTable.js` keeps `FreddieTrajectoryTable`, the native custom element still registered by `defineElement` at the module tail, and the `TrajectoryTable` factory, so `TrajectoryView.js` is unchanged. It also keeps the element-side helpers that no responsibility owns: tab lists, width helpers, record presentation, markdown content, timing rows, the overview and the tool catalog.

Each responsibility module exports only the names the element or those helpers call. Everything else stays module-private.

The split moves code only. The element's private fields, lifecycle and render paths are unchanged, so the rules in [ui-trajectory AGENTS.md](../../../../packages/client/ui-trajectory/AGENTS.md) on tail-follow, deferred virtualizer setup and native render owners still apply to `TrajectoryTable.js`.

## Alternatives considered

**Keep one module.** Rejected: it mixed pure formatting and diffing code with element lifecycle, so any change to a pure helper reloaded the whole 2808-line module.

**Move the element-side helpers too.** Rejected: they depend on element state or are called only by the element. Moving them widens the export surface without a separate responsibility to own.

**Leave usage panels in the element.** Rejected: the row description names usage panels as one of the mixed responsibilities, and they are pure render helpers like the others.

## Consequences

- Each responsibility is a module with its own import set, and the element imports them.
- `TrajectoryTable.js` shrinks from 2808 to 2163 lines. It keeps the element and its element-side helpers.
- Element-side helpers stay in one file, so splitting record presentation further is a separate decision.
- Verification before the write: every module-level reference in a moved block resolves to a declaration or import in its file, every import is used, and every moved name the element references is exported.
