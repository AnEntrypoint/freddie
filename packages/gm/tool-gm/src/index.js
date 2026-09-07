/**
 * Model-facing typed tools over `ctx.gm` (`@freddie/freddie-gm-client`):
 * `gm_instruction`, `gm_codesearch`, `gm_recall`, `gm_prd_add`,
 * `gm_mutable_add`, `gm_transition`, `gm_exec_js`, `gm_git_finalize` — a
 * first-class replacement for the generic MCP bridge's single opaque
 * `mcp__gm__gm(verb, body: any)` tool, each with real typed parameters and
 * output schema.
 * @module @freddie/freddie-tool-gm
 */

import { buildGmTools } from './verbs.js'

export const name = 'tool-gm'
export const inject = ['tools', 'gm']

/**
 * Register every gm-verb tool over the mounted `ctx.gm` service instance.
 * @param ctx - plugin context carrying the tool registry and `ctx.gm`.
 */
export function apply(ctx) {
  for (const tool of buildGmTools(ctx.gm)) {
    ctx.tools.register(tool)
  }
}
