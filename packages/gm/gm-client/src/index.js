import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { bindTypertRemote, Remote } from '@freddie/freddie-typert-protocol'
import { resolveConfig, resolveGraph, resolveProse } from '@freddie/freddie-gm-config'
import { ensureDaemon } from './daemon.js'
import { dispatch, GmDaemonUnavailableError } from './spool.js'

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

  cwdOf(agent) {
    const cwd = agent?.session?.header?.cwd
    return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
  }

  dispatchFor(agent, verb, body, signal) {
    const cwd = this.cwdOf(agent)
    return this.call(verb, body, {
      ...cwd === undefined ? {} : { cwd },
      ...signal === undefined ? {} : { signal },
    })
  }

  prdAdd(agent, request, signal) {
    return this.dispatchFor(agent, 'prd-add', request, signal)
  }

  prdResolve(agent, request, signal) {
    return this.dispatchFor(agent, 'prd-resolve', request, signal)
  }

  mutableAdd(agent, request, signal) {
    return this.dispatchFor(agent, 'mutable-add', request, signal)
  }

  mutableResolve(agent, request, signal) {
    return this.dispatchFor(agent, 'mutable-resolve', {
      id: request.id,
      witness_evidence: request.witness_text,
    }, signal)
  }

  transition(agent, request, signal) {
    return this.dispatchFor(agent, 'transition', { to: request.to }, signal)
  }

  resolveProjectCwd(cwd) {
    if (typeof cwd === 'string' && cwd.length > 0) return cwd
    const sessionCwd = this.ctx.get('session')?.header?.cwd
    if (typeof sessionCwd === 'string' && sessionCwd.length > 0) return sessionCwd
    return this.config.cwd
  }

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

  async embed(text) {
    const result = await this.call('bert', { verb: 'embed', text })
    if (result.ok !== true) {
      throw new Error(`gm-client: embed failed: ${result.error ?? 'unknown error'}`)
    }
    return result.embedding
  }

  async embedBatch(texts) {
    const result = await this.call('bert', { verb: 'embed_batch', texts })
    if (result.ok !== true) {
      throw new Error(`gm-client: embed_batch failed: ${result.error ?? 'unknown error'}`)
    }
    return result.embeddings
  }

  resolveConfig() {
    return resolveConfig(this.config.cwd)
  }

  resolveProse(key) {
    return resolveProse(this.config.cwd, key)
  }

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
