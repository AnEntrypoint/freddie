# Agent Note: Prune unread icon exports and share one duplicated folder path

Status: implemented

## Problem

`packages/client/ui-primitives/src/icons/index.js` is 107604 bytes and the largest module in the ui-primitives client closure. Most of it is SVG path data for icon components that no client code imports.

## Decision

Remove the 15 exports with no reference anywhere in `packages/` or in the repo's docs, apps, scripts, framework, examples and agent notes. Removed: `IconRefreshOutline16`, `IconLikeFill16`, `IconDislikeFill16`, `IconShareOutline16`, `IconThinkOutline16`, `IconLinkOutline14`, `IconLinkOutline16`, `IconRightUpOutline16`, `IconEnhanceOutline16`, `IconSendOutline16`, `IconPaperclipOutline16`, `IconLoadingOutline16`, `IconFullscreenOutline16`, `IconTreeCorner8x10`, `IconListPenOutline16`. Their definitions total 19005 bytes.

The path string shared by `IconFolderOpenOutline16` and `IconFolderOpen16` (980 bytes, byte-identical) moves to one module constant `ICON_FOLDER_OPEN_D`, referenced by both components.

Result: source 107604 to 87683 bytes.

## Consequences

- `packages/client/web/src/seed.js` registers the whole namespace (`import * as UiPrimitives`) through `getStaticModules()`, which `boot.js` passes to the module loader. A module loaded at runtime that named-imports a removed export would fail to link. Every module in the repo was searched and none does. Modules outside the repo that name-import these exports are not covered by that search.
- Rendered markup of the 55 remaining exports is unchanged. Witnessed by `.gm/witness/icons-before.txt` and `.gm/witness/icons-after.txt`: the same SHA-256 for all 55, and only the 15 removed names differ.

## Verification

- Server on 127.0.0.1:3080 returns 200 for the root page. The vendored copy `/vendor/@freddie/freddie-client-ui-primitives@0.1.1-rc.2/src/icons/index.js` is served at 87683 bytes and no longer contains the removed names.
- No browser was reachable in this session, so console errors were not read.
