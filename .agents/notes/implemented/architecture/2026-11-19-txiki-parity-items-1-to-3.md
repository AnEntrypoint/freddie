# Agent Note: txiki parity for util, crypto, timers and fs.promises.opendir

Status: implemented

## Problem

The txiki implementation of the runtime contract (2026-11-18-txiki-runtime-implementation) left four gaps that agent code can reach: util.isDeepStrictEqual and util.parseEnv, crypto.randomBytes with a callback, timers/promises setTimeout with an AbortSignal, and fs.promises.opendir. Each threw by design, and the contract test only checked that the names exist.

## Decision

Each gap is closed in pure JS in packages/util/runtime/src/txiki.js, with the Node result as the oracle. Each behaviour is a shared case in test/parity-cases.js that runs under Node and under txiki. A case that fails under txiki is a defect to fix, never a gap to add.

- isDeepStrictEqual follows Node's structural rules, including cycles; parseEnv follows Node's dotenv grammar.
- randomBytes with a callback calls back from a setTimeout(0) turn; timers/promises setTimeout rejects an AbortError (ABORT_ERR) whose cause is the signal reason.
- opendir awaits tjs.readDir so ENOENT and ENOTDIR surface at open; Dir reads Dirents, records exhaustion because txiki's iterator returns undefined after its end, and closes on finish or break.

## Alternatives considered

- Keep the four gaps and document them. Rejected: agent code reaches them, and each has a Node oracle that is cheap to match.
- Depend on a maintained package for isDeepStrictEqual or dotenv parsing. Not taken: it would add a dependency to the runtime seam, and the subset needed is small enough to test against Node directly.

## Consequences

- The parity suite is 102 shared cases plus 12 gaps; the contract test stays at 114 names.
- Dir.close cannot release txiki's native handle eagerly, because the txiki iterator has no return(); the handle is released when the iterator is collected. Recorded in docs/fx-split.md.
- The equality and env cases cover the common shapes only; Node's full edge-case surface is not verified.
