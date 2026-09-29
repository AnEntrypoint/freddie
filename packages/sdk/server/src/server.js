import { resolve } from 'node:path'
import { createUserMessage } from '@freddie/freddie-llm'
import { carrierKeyOf } from '@freddie/freddie-scope'
import { SessionId } from '@freddie/freddie-session'
import * as LlmDeepSeek from '@freddie/freddie-llm-deepseek'
import { setTurnContext } from './turn-context.js'

function subagentParentOf(carrier) {
  return carrierKeyOf(carrier)
}

function successStatus(reason, options) {
  if (reason === 'completed') return 'ok'
  return reason === 'max-tokens' && options.maxTokensAsSuccess === true ? 'ok' : 'error'
}

export class HarnessSdkJsonRpcServer {
  cwd = process.cwd()
  provider = 'deepseek-official'
  model = 'deepseek-official'
  maxTokens
  llmFiber
  sessions = new Map()
  sessionCreations = new Map()
  disposers = []
  shutdownTask
  shuttingDown = false

  constructor(ctx, transport, options = {}) {
    this.ctx = ctx
    this.transport = transport
    this.options = options
    const serverOptions = this.options
    this.disposers.push(ctx.on('session/event', (session, event) => {
      const payload = { sessionId: String(session.id), event }
      this.transport.notify('session.event', payload)
    }))
    this.disposers.push(ctx.on('agent/status', ({ agent, status }) => {
      this.transport.notify('session.status', { sessionId: String(agent.session.id), status })
    }))
    this.disposers.push(ctx.on('session/created', (session) => {
      const parentSession = session.header.parentSession
      if (parentSession === undefined) return
      const payload = {
        parentSessionId: String(parentSession),
        childSessionId: String(session.id),
      }
      this.transport.notify('subagent.started', payload)
    }))
    this.disposers.push(ctx.on('subagent/end', function (info) {
      const parent = subagentParentOf(this)
      if (!info.local) return
      const payload = {
        provider: info.provider,
        agentId: String(info.id),
        parentSessionId: String(parent.session.id),
        childSessionId: String(info.id),
        status: successStatus(info.stopReason, serverOptions),
        stopReason: info.stopReason,
        ...(info.lastAssistantMessage === undefined ? {} : { lastAssistantMessage: info.lastAssistantMessage }),
      }
      transport.notify('subagent.finished', payload)
    }))
  }

  async initialize(params) {
    if (params.maxTokens !== undefined
      && (!Number.isSafeInteger(params.maxTokens) || params.maxTokens <= 0)) {
      throw new TypeError('initialize maxTokens must be a positive safe integer')
    }
    this.cwd = resolve(params.cwd)
    this.provider = params.provider
    this.model = params.model
    this.maxTokens = params.maxTokens
    if (!this.hasAdapterFor(this.provider)) {
      if (this.provider !== 'deepseek-official') throw new Error(`no adapter registered for provider "${this.provider}"`)
      this.llmFiber = await this.ctx.plugin(LlmDeepSeek, {})
    }
    return { serverInfo: { name: 'freddie-sdk-runtime', version: '0.0.1' } }
  }

  async prompt(params) {
    const rec = await this.getOrCreateSession(params.sessionId)
    if (this.ctx.agents.get(rec.handle.agent.id) !== rec.handle.agent) {
      throw new Error(`session agent was disposed outside the server: ${params.sessionId}`)
    }
    this.applyToolScope(rec, params)
    if ('turnContext' in params) setTurnContext(rec.handle.agent, params.turnContext)
    const message = createUserMessage({ content: params.contentBlocks, source: { kind: 'user' } })
    rec.handle.agent.followup(message)
    return { messageId: message.id }
  }

  applyToolScope(rec, params) {
    const allow = params.enabledTools
    const deny = params.disabledTools
    if (allow === undefined && deny === undefined) return
    rec.disposeToolScope?.()
    rec.disposeToolScope = rec.handle.agent.ctx.tools.restrict({
      ...allow === undefined ? {} : { allow },
      ...deny === undefined ? {} : { deny },
    })
  }

  shutdown() {
    this.shutdownTask ??= this.performShutdown()
    return this.shutdownTask
  }

  async performShutdown() {
    this.shuttingDown = true
    const pendingCreations = [...this.sessionCreations.values()]
    await Promise.allSettled(pendingCreations)
    this.sessionCreations.clear()
    const records = [...this.sessions.values()]
    this.sessions.clear()
    const failures = []
    while (this.disposers.length > 0) {
      try {
        this.disposers.pop()?.()
      } catch (error) {
        failures.push(error)
      }
    }
    const teardownResults = await Promise.allSettled([
      ...records.map(rec => Promise.resolve().then(() => rec.handle.dispose())),
      ...(this.llmFiber === undefined ? [] : [Promise.resolve().then(() => this.llmFiber?.dispose())]),
    ])
    this.llmFiber = undefined
    failures.push(...teardownResults
      .filter((result) => result.status === 'rejected')
      .map(result => result.reason))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'SDK server teardown failed')
    return {}
  }

  async handleRequest(method, params) {
    switch (method) {
      case 'initialize':
        return this.initialize(params)
      case 'session/prompt':
        return this.prompt(params)
      case 'shutdown':
        return this.shutdown()
      default:
        throw new Error(`unknown Freddie SDK runtime method: ${method}`)
    }
  }

  async getOrCreateSession(sessionId) {
    if (this.shuttingDown) throw new Error('SDK server is shutting down')
    const existing = this.sessions.get(sessionId)
    if (existing) return existing
    const pending = this.sessionCreations.get(sessionId)
    if (pending) return pending
    const creation = this.createSession(sessionId)
    this.sessionCreations.set(sessionId, creation)
    void creation.then(
      () => { this.sessionCreations.delete(sessionId) },
      () => { this.sessionCreations.delete(sessionId) },
    )
    return creation
  }

  async createSession(sessionId) {
    const handle = await this.ctx.agents.create({
      sessionId: SessionId(sessionId),
      meta: { cwd: this.cwd },
      agentOptions: {
        provider: this.provider,
        model: this.model,
        ...this.maxTokens === undefined ? {} : { maxTokens: this.maxTokens },
      },
    })
    const rec = { handle }
    this.sessions.set(sessionId, rec)
    return rec
  }

  hasAdapterFor(provider) {
    return this.ctx.get('llm')?.listProviders().some(entry => entry.id === provider) ?? false
  }
}
