# Agent Note: txiki implementation of the runtime contract

Status: implemented

## Problem

The runtime adapter (2026-11-18-runtime-adapter-for-agent-side-node-apis) gives agent code one seam, but it has only a Node implementation. Freddie's agent side has to run as JavaScript inside an embedded txiki.js in fx, so the same subpaths must be satisfied by txiki as well, and nothing in the agent code may import a Node built-in.

## Decision

packages/util/runtime/src/txiki.js is the second implementation of the same contract. txikiRuntime has the same keys and member names as nodeRuntime, and src/install-txiki.js installs it through the same installRuntime. The implementation uses only tjs: modules and web globals.

Where txiki has no equivalent, the name is exported and its value throws a message that names the gap and points to docs/fx-split.md. A module object or default export that lacks a member throws the same way. The implementation never falls back to Node, and it never returns a stub that silently does nothing.

A contract test pins the names. test/contract-names.js lists every name each subpath exports, and both entries check that each name is defined after their runtime is installed.

## Alternatives considered

- Map every name to a best-effort approximation. Rejected: an approximation that differs from Node in an unseen way is worse than a clear error at the point of use.
- Keep the txiki implementation in fx. Rejected: freddie's agent packages need the seam to run standalone, and the contract test has to run against the same source in both runtimes.
- Write one implementation that picks Node or txiki at run time. Rejected: it would let the Node import into the txiki path, which is the exact coupling the adapter removes.

## Consequences

- Sync fs, child_process, streams, vm, http, zlib, worker_threads, AsyncLocalStorage and createHash are gaps. They are listed in docs/fx-split.md. Agent code that reaches them under txiki fails at the call site, not at import.
- process.platform and os.platform are gaps, because txiki exposes no JS-level platform. Module code that reads them at load time will fail under txiki until fx supplies a platform value.
- The Buffer subset is reimplemented in pure JS over Uint8Array. Its behaviour matches Node for the members agent code uses, and the members it lacks throw a TypeError at call time.
- A new subpath or a new name in agent code must be added to the contract names, and the txiki implementation must cover it or name the gap.
- See [the runtime adapter note](2026-11-18-runtime-adapter-for-agent-side-node-apis.md) for the seam, and docs/fx-split.md for the gap table.
