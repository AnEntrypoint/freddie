/**
 * Cordis-native gm access (`ctx.gm`): dispatches gm spool verbs directly
 * against `.gm/exec-spool/`, in-process — the same file-based cycle gm-mcp
 * wraps behind an MCP stdio server, driven here without that hop. Boots the
 * shared, machine-wide `agentplug-runner` daemon on first use if one isn't
 * already running; every session/project sharing one daemon is the intended
 * shape (stateless-per-call, per gm's own design).
 * @module @freddie/freddie-gm-client
 */

import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { ensureDaemon } from './daemon.js'
import { dispatch } from './spool.js'

/**
 * `ctx.gm`: one dispatch method per gm spool verb call, boot-on-first-use.
 * `sessionId` is fixed per instance (one per plugin activation) so the
 * per-verb dispatch counter in `spool.js` stays correctly scoped — every
 * call from this instance shares one session's `(verb, session_id-N)`
 * keyspace, matching gm's own single-session dispatch contract. Every
 * fanned-out subagent that wants its own `ctx.gm` mints its own distinct
 * `sessionId` (a separate plugin instance/config), never sharing this one's
 * — the same interference-avoidance contract gm's own skill documents for
 * concurrent dispatchers.
 */
export class Gm extends Service {
  static Config = z.object({
    sessionId: z.string().required(),
    cwd: z.string().default(process.cwd()),
  })

  config
  booted = false

  constructor(ctx, config) {
    super(ctx, 'gm')
    this.config = config
  }

  /**
   * Dispatch one gm spool verb and wait for its response. Boots the shared
   * daemon on first call if it isn't already running.
   * @param verb - gm spool verb name (e.g. `instruction`, `codesearch`, `recall`).
   * @param body - JSON body; `session_id` is filled in automatically if absent.
   * @param options.timeoutMs - per-dispatch timeout (default 120000, matching gm's own default).
   * @returns the parsed response body.
   */
  async call(verb, body = {}, { timeoutMs } = {}) {
    if (!this.booted) {
      await ensureDaemon(this.config.cwd)
      this.booted = true
    }
    return dispatch({
      cwd: this.config.cwd,
      verb,
      sessionId: this.config.sessionId,
      body,
      ...timeoutMs === undefined ? {} : { timeoutMs },
    })
  }

  /**
   * Embed one string via the shared daemon's `bert` plugin (BAAI/bge-small-en-v1.5,
   * 384-dim) — routed through the daemon, matching freddie's own corrected
   * design (`src/learn/gm-learn-backend.js`), not an in-process bert.wasm
   * instance. The `bert` spool verb's real body shape is `{verb: 'embed', text}`
   * (not `{op: 'embed', ...}` — that field name silently falls through to the
   * plugin's default `capabilities` response instead of erroring, so this is
   * live-verified, not guessed).
   * @param text - text to embed.
   * @returns a 384-length array of floats.
   * @throws when the daemon reports a non-ok response.
   */
  async embed(text) {
    const result = await this.call('bert', { verb: 'embed', text })
    if (result.ok !== true) {
      throw new Error(`gm-client: embed failed: ${result.error ?? 'unknown error'}`)
    }
    return result.embedding
  }

  /**
   * Embed several strings in one dispatch via the shared daemon's `bert` plugin.
   * @param texts - texts to embed, in order.
   * @returns an array of 384-length float arrays, same order as `texts`.
   * @throws when the daemon reports a non-ok response.
   */
  async embedBatch(texts) {
    const result = await this.call('bert', { verb: 'embed_batch', texts })
    if (result.ok !== true) {
      throw new Error(`gm-client: embed_batch failed: ${result.error ?? 'unknown error'}`)
    }
    return result.embeddings
  }
}

export default Gm
