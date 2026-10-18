# Agent Note: Drop unread fields from the client slot catalog

Status: implemented

## Problem

`packages/extensions/cordis-client-runner/src/client/slot-catalog.js` is the largest file in the Web client closure at 116735 bytes. Its only importer is `src/client/providers.js`, which reads a fixed set of entry fields at runtime (`key`, `summary`, `replaceRisk`, `registerOptions[name|type|requirement|doc]`, `keyDomain`, `doc`, `ownerProps`, `ownerPropsReferences`, `standardProps`, `hookContext`, `slotInject`). Several other fields and one export are never read by any consumer in the repository: `example`, `declaredBy`, `occupants`, `source`, `scope`, `kind`, and the `CLIENT_NOTES` export. The file is hand-maintained (no generator script exists), so no build step regenerates these fields.

## Decision

The catalog drops those six per-entry fields from all 49 entries and removes the unreferenced `CLIENT_NOTES` export. Live values for `declaredBy`, `occupants`, `scope` and `kind` come from the live slot tree (`node.declaredBy`, `node.occupants`, `node.scope`, `node.kind`), so the static copies were duplicates. `example` and `source` remain available in git history at the commit that made this change.

Measured: 116735 bytes to 83403 bytes. The slot id set (49 ids) is identical before and after, and the runtime-read view of every entry (SHA-256 over the runtime-read fields) is identical. The web server mounts with no console errors on a live page load.

## Alternatives considered

- Regenerate the file from a generator: rejected, no generator exists and the file is hand-written data.
- Minify whitespace: rejected, the file is hand-written and minification would reformat maintained source.
- Keep `example` and `source` for registrants: rejected for the client build; no client code reads them, and registrants read `doc`, `standardProps`, `ownerProps` and `registerOptions`, which are retained.

## Consequences

- The client no longer ships the registrant `example` snippets or per-entry source pointers. Recover them from git history if a maintainer needs them.
- `ownerProps`, `doc` and `standardProps` (about 35 KB of the new size) are still shipped because `providers.js` reads them for `cordis_inspect`; further reduction there would change the inspect output and is out of scope.
