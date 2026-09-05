# Agent Note: webjsx keyedMap skips primitive oldVNodes

Status: implemented

## Problem

`wrapBlockChildren` interleaves `'\n'` text nodes between markdown blocks. webjsx caches those primitives on `parentProps.children`. On a later pass that includes a keyed VElement, `diffChildren` builds a keyedMap over `oldVNodes` and read `matchingVNode.props.key`.

`isVElement` is true for any non-string/number/bigint, so the new-child key read already skips primitives. The old-child keyedMap builder only skipped `instanceof Node`. A leftover `'\n'` at that index threw `Cannot read properties of undefined (reading 'key')` and every later `applyDiff` on that parent failed until the tab reloaded.

The pnpm patch at `patches/webjsx@0.0.73.patch` is the source of the Node skip; the vendored `/vendor/webjsx@0.0.73/` copy is what the GUI actually loads.

## Decision

The keyedMap builder uses the same predicate as the new-child key read: skip a raw DOM Node **or** anything that is not a VElement (`!isVElement(matchingVNode)`). That covers string/number/bigint primitives without changing keyed VElement handling.

The guard lives in both `patches/webjsx@0.0.73.patch` (pnpm's patched `node_modules` copy) and `packages/client/vendor-modules/vendor/webjsx@0.0.73/dist/applyDiff.js` (the served copy). `generate-vendor.mjs` asserts the vendored file contains `!isVElement(matchingVNode)` so a regenerate cannot drop it.

## Alternatives considered

**Stop emitting `'\n'` from `wrapBlockChildren`.** Rejected: those nodes are the replaced-pipeline DOM parity the markdown renderer still pins; deleting them changes visible HTML around raw HTML blocks.

**Catch the throw in `applyDiff`.** Rejected: it would hide every future keyedMap bug and leave the parent in a half-diffed state.

**Bump the webjsx version URL and vendor a fork.** Rejected: the rest of the local patch (real-Node children, function components, self-closing outlets) still applies to 0.0.73; a version bump is a separate publish, not this crash.

## Consequences

A markdown re-render that mixes keyed elements with leftover newline primitives completes. `generate-vendor` refuses a copy that lacks the primitive guard. Re-running `pnpm install` reapplies the patch under a new `patch_hash`; the live hashed `node_modules` copy must carry the same guard before that install, or the GUI keeps serving the throwing builder until then.
