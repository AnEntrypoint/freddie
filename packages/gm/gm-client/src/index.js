/**
 * Cordis-native gm access (`ctx.gm`): dispatches gm spool verbs directly
 * against `.gm/exec-spool/`, in-process — the same file-based cycle gm-mcp
 * wraps behind an MCP stdio server, driven here without that hop. Boots the
 * shared, machine-wide native `agentplug-runner` daemon (`spool`) on first
 * use if one isn't already running; every session/project sharing one daemon
 * is the intended shape (stateless-per-call, per gm's own design).
 * @module @freddie/freddie-gm-client
 */

import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { bindTypertRemote, Remote } from '@freddie/freddie-typert-protocol'
import { resolveConfig, resolveGraph, resolveProse } from '@freddie/freddie-gm-config'
import { ensureDaemon } from './daemon.js'
import { dispatch, GmDaemonUnavailableError } from './spool.js'

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
  bootedCwds = new Set()

  constructor(ctx, config) {
    super(ctx, 'gm')
    this.config = config
    this.typertRemote = bindTypertRemote(this, this.name)
  }

  /**
   * Session workspace for one Agent-scoped Remote, never the GUI host cwd.
   * @param agent - live agent whose session owns the open workspace.
   * @returns an absolute project directory, or undefined.
   */
  cwdOf(agent) {
    const cwd = agent?.session?.header?.cwd
    return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
  }

  /**
   * Dispatch one verb with the Agent session cwd and optional cancellation.
   * @param agent - live agent.
   * @param verb - gm spool verb.
   * @param body - JSON body.
   * @param signal - optional abort.
   * @returns the parsed response body.
   */
  dispatchFor(agent, verb, body, signal) {
    const cwd = this.cwdOf(agent)
    return this.call(verb, body, {
      ...cwd === undefined ? {} : { cwd },
      ...signal === undefined ? {} : { signal },
    })
  }

  /**
   * Add or rescope one PRD row in the Agent session workspace.
   * @param agent - live agent.
   * @param request - kebab-case id plus optional PRD fields.
   * @param signal - optional abort.
   * @returns the parsed spool response.
   */
  prdAdd(agent, request, signal) {
    return this.dispatchFor(agent, 'prd-add', request, signal)
  }

  /**
   * Resolve one PRD row with non-empty witness evidence.
   * @param agent - live agent.
   * @param request - id and witness_evidence.
   * @param signal - optional abort.
   * @returns the parsed spool response.
   */
  prdResolve(agent, request, signal) {
    return this.dispatchFor(agent, 'prd-resolve', request, signal)
  }

  /**
   * Record one typed mutable against a PRD row.
   * @param agent - live agent.
   * @param request - kebab-case id plus optional mutable fields.
   * @param signal - optional abort.
   * @returns the parsed spool response.
   */
  mutableAdd(agent, request, signal) {
    return this.dispatchFor(agent, 'mutable-add', request, signal)
  }

  /**
   * Discharge one mutable. `witness_text` maps to the daemon `witness_evidence` field.
   * @param agent - live agent.
   * @param request - id and witness_text.
   * @param signal - optional abort.
   * @returns the parsed spool response.
   */
  mutableResolve(agent, request, signal) {
    return this.dispatchFor(agent, 'mutable-resolve', {
      id: request.id,
      witness_evidence: request.witness_text,
    }, signal)
  }

  /**
   * Advance the gm session phase when gates pass.
   * @param agent - live agent.
   * @param request - target phase name.
   * @param signal - optional abort.
   * @returns the parsed spool response.
   */
  transition(agent, request, signal) {
    return this.dispatchFor(agent, 'transition', { to: request.to }, signal)
  }

  /**
   * Project root containing `.gm/exec-spool` for one dispatch. A per-call
   * `cwd` (the session workspace) wins over the plugin config default, which
   * is `process.cwd()` — the GUI host's checkout, not the open workspace.
   * @param cwd - optional per-call override.
   * @returns an absolute project directory.
   */
  resolveProjectCwd(cwd) {
    if (typeof cwd === 'string' && cwd.length > 0) return cwd
    const sessionCwd = this.ctx.get('session')?.header?.cwd
    if (typeof sessionCwd === 'string' && sessionCwd.length > 0) return sessionCwd
    return this.config.cwd
  }

  /**
   * Dispatch one gm spool verb and wait for its response. Boots the shared
   * daemon on first call if it isn't already running.
   * @param verb - gm spool verb name (e.g. `instruction`, `codesearch`, `recall`).
   * @param body - JSON body; `session_id` is filled in automatically if absent. Ignored when `options.rawBody` is given.
   * @param options.rawBody - literal text body for a plain-text-body verb (exec_js and its language stems, serp, browser, cdp) -- these reject a JSON-wrapped body outright. Mutually exclusive with `body`.
   * @param options.timeoutMs - per-dispatch timeout (default 120000, matching gm's own default).
   * @param options.signal - abort stops the spool poll without waiting the remaining timeout.
   * @param options.cwd - project root for this dispatch; defaults to config `cwd`.
   * @returns the parsed response body.
   */
  async call(verb, body = {}, { timeoutMs, rawBody, signal, cwd } = {}) {
    const projectCwd = this.resolveProjectCwd(cwd)
    if (!this.bootedCwds.has(projectCwd)) {
      await ensureDaemon(projectCwd)
      this.bootedCwds.add(projectCwd)
    }
    const dispatchBody = verb === 'codesearch' && (body === null || typeof body !== 'object' || body.mode === undefined)
      ? { ...body ?? {}, mode: 'literal' }
      : body
    const request = {
      cwd: projectCwd,
      verb,
      sessionId: this.config.sessionId,
      body: dispatchBody,
      ...rawBody === undefined ? {} : { rawBody },
      ...timeoutMs === undefined ? {} : { timeoutMs },
      ...signal === undefined ? {} : { signal },
    }
    try {
      return await dispatch(request)
    } catch (error) {
      if (!(error instanceof GmDaemonUnavailableError) || error.code !== 'GM_DAEMON_DIED') throw error
      this.bootedCwds.delete(projectCwd)
      try {
        await ensureDaemon(projectCwd)
        this.bootedCwds.add(projectCwd)
        return await dispatch(request)
      } catch (recoveryError) {
        error.recoveryError = recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
      }
      throw error
    }
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

  /**
   * Read the project's resolved gm.config.json from already-materialized
   * on-disk tiers. Never dispatches to the daemon.
   * @returns `{ tier, why, rejected, version, config, cacheDir }`.
   */
  resolveConfig() {
    return resolveConfig(this.config.cwd)
  }

  /**
   * Read one instruction/gate/residual prose file from local override then cacheDir.
   * @param key - stem without `.md`.
   * @returns `{ tier, text }` or `{ tier: 'miss' }`.
   */
  resolveProse(key) {
    return resolveProse(this.config.cwd, key)
  }

  /**
   * Read the FSM graph JSON wholesale from local override then cacheDir.
   * @returns `{ tier, graph }` or `{ tier: 'miss' }`.
   */
  resolveGraph() {
    return resolveGraph(this.config.cwd)
  }
}

Remote('prdAdd')(Gm.prototype.prdAdd, {
  name: 'prdAdd',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(Gm.prototype)) },
})
Remote('prdResolve')(Gm.prototype.prdResolve, {
  name: 'prdResolve',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(Gm.prototype)) },
})
Remote('mutableAdd')(Gm.prototype.mutableAdd, {
  name: 'mutableAdd',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(Gm.prototype)) },
})
Remote('mutableResolve')(Gm.prototype.mutableResolve, {
  name: 'mutableResolve',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(Gm.prototype)) },
})
Remote('transition')(Gm.prototype.transition, {
  name: 'transition',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(Gm.prototype)) },
})

export default Gm
