// Browser entry for freddie. Polymorphic with the Node CLI.
// node:* imports are expected to be satisfied by the host environment shims
// (thebird provides them via docs/vendor/esm/node/ + docs/shell-node-*.js).
//
// This entry deliberately re-exports only the browser-safe surface needed
// to embed freddie as an agent in a web OS: the xstate-driven agent machine,
// the host bootstrapper, and configuration defaults. It avoids re-exporting
// CLI/TUI/dashboard/MCP/ACP server code which pulls in commander, express,
// child_process, and other Node-only subsystems.
//
// Thin entrypoint: default config constant lives in ./config.js, the
// adapter-parameterized bootHostBrowser() (and its FreddieAdapterError /
// guard helpers) lives in ./boot.js. Both are re-exported here so every
// existing import of 'src/browser/index.js' (the vite lib entry, the
// package.json "./browser" export map target) keeps working unchanged.

export { bootHost, host, resetHostForTests } from '../host/index.js'
export { createAgentMachine, runTurn, resumeTurn } from '../agent/machine.js'
export { createActor, createMachine, assign, fromPromise, waitFor } from 'xstate'
// Persistence primitives (resumability seam). createPersistentActor accepts
// an optional `store` param (see machines/persistent-actor.js) and does NOT
// call bootHost()/dotenv/node:fs itself -- browser-safe on its own, unlike
// runTurn/resumeTurn's executing_tools step which still calls the bare
// Node-only bootHost() internally (see machine.js line 2/109/298/340; no
// adapter seam exists there yet). Re-exported so an embedder that cannot
// route tool-calling turns through runTurn/resumeTurn can still get real
// mid-turn snapshot resumability by driving its own createAgentMachine
// through createPersistentActor directly.
export { createPersistentActor } from '../machines/persistent-actor.js'
// Default (libsql-backed) store factories -- re-exported for reference/type
// shape only; a browser embedder supplies its OWN store (e.g. IndexedDB-
// backed) satisfying the same persist/load/clear and runStep/isStepDone/
// clearSteps contracts documented in these two modules' header comments.
export { createLibsqlSnapshotStore, SNAPSHOT_SCHEMA_VERSION } from '../machines/snapshot-store.js'
export { createLibsqlStepStore } from '../machines/step-journal.js'
// Text-format tool-call recovery (kimi <|tool_call_begin|> / llama <|python_tag|>).
// Exported so hosts that supply their own callLLM (e.g. thebird's gateway path)
// can reuse the same parser instead of duplicating it.
export { parseTextToolCalls } from '../agent/tool_call_text.js'

// Config defaults under the documented browser name.
export { FREDDIE_DEFAULT_CONFIG, DEFAULT_CONFIG } from './config.js'

// Optional extras that are browser-friendly when their node:* imports are shimmed.
export { buildContext, blocksToSystemMessage, ContextPlugins } from '../context/engine.js'
export { listSkills, findSkill, skillAsUserMessage } from '../skills/index.js'
export { log, logger } from '../observability/log.js'

// bootHostBrowser(adapters) — adapter-parameterized host boot for embedders.
// See ./boot.js for the full FreddieBrowserAdapters contract and rationale.
export { bootHostBrowser, FreddieAdapterError } from './boot.js'
