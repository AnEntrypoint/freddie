# Agent Note: Runtime adapter for agent-side Node built-ins

Status: implemented

## Problem

The agent side of freddie (the agent loop, tools, session log, sandbox, model adapters and the Cordis composition they need) reached Node built-ins and process globals directly. Roughly 180 packages under packages/ and framework/ imported node:fs, node:path, node:child_process and similar modules, read process.env and its neighbours, and created Buffers. The owner direction is to run that agent side as JavaScript inside an embedded txiki.js in fx. Txiki does not provide those Node modules, so agent code cannot move while it imports them.

## Decision

@freddie/freddie-runtime is the only seam through which agent-side code reaches Node built-ins and the process and Buffer globals. Agent code imports from its subpaths, for example @freddie/freddie-runtime/fs-promises or @freddie/freddie-runtime/process. Each subpath exports exactly the names the agent code uses, read from the installed runtime when the module loads.

The composition root installs one runtime before any other module loads. Node hosts import @freddie/freddie-runtime/install-node as their first import: apps/cli/src/bin.js and the three worker entries (code-runtime-worker-thread, workflow-worker-thread and the inspector worker). A missing install throws on first use, and a second install throws.

src/node.js holds the Node implementation: the real module namespaces and the global process. Each subpath therefore returns the same function objects Node gives, so behaviour does not change.

Another runtime, such as an embedded txiki.js, provides an object of the same shape as nodeRuntime and calls installRuntime from its own composition root. The shape is the set of names agent code imports, so that implementation has a precise contract.

## Alternatives considered

- Passing a runtime argument through every function: rejected. It changes most signatures for no behavioural gain, and Cordis services already give a per-plugin injection point where one is needed.
- Installing a default Node runtime on import: rejected. Package boundaries are explicit, so a missing install must fail loud and not fall back to Node.
- Moving the GUI-side Node halves (static server, HMR, upload staging, vendor generator) onto the adapter: rejected. They serve the browser from the Node host and are not agent code. They keep direct Node imports and are listed in docs/fx-split.md.

## Consequences

- Converted agent-side packages list @freddie/freddie-runtime as a dependency.
- Inside the agent-side scope, only src/node.js of the adapter imports a Node built-in.
- apps/cli keeps its direct Node imports, as the Node host.
- Adding a Node-only API to agent code means adding its name to the subpath and to the runtime shape, so every runtime has to provide it.
