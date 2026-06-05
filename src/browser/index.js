// Browser entry for freddie. Polymorphic with the Node CLI.
// node:* imports are expected to be satisfied by the host environment shims
// (thebird provides them via docs/vendor/esm/node/ + docs/shell-node-*.js).
//
// This entry deliberately re-exports only the browser-safe surface needed
// to embed freddie as an agent in a web OS: the xstate-driven agent machine,
// the host bootstrapper, and configuration defaults. It avoids re-exporting
// CLI/TUI/dashboard/MCP/ACP server code which pulls in commander, express,
// child_process, and other Node-only subsystems.

export { bootHost, host, resetHostForTests } from '../host/index.js'
export { createAgentMachine, runTurn } from '../agent/machine.js'
export { createActor, createMachine, assign, fromPromise, waitFor } from 'xstate'
// Text-format tool-call recovery (kimi <|tool_call_begin|> / llama <|python_tag|>).
// Exported so hosts that supply their own callLLM (e.g. thebird's gateway path)
// can reuse the same parser instead of duplicating it.
export { parseTextToolCalls } from '../agent/tool_call_text.js'

// Re-export config defaults under the documented browser name.
import { DEFAULT_CONFIG } from '../config.js'
export const FREDDIE_DEFAULT_CONFIG = DEFAULT_CONFIG
export { DEFAULT_CONFIG }

// Optional extras that are browser-friendly when their node:* imports are shimmed.
export { buildContext, blocksToSystemMessage, ContextPlugins } from '../context/engine.js'
export { listSkills, findSkill, skillAsUserMessage } from '../skills/index.js'
export { log, logger } from '../observability/log.js'
