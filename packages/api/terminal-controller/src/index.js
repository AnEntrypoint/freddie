import z from '@freddie/schemastery'
import { Remote, TypertRemoteService } from '@freddie/freddie-typert-protocol'
import { discoverShells, resolveShell } from './shells.js'
import { BrowserTerminal, terminalFailure } from './terminal.js'

const TERMINAL_ID_PATTERN = /^[\w-]{1,128}$/u

export class TerminalController extends TypertRemoteService {
  static inject = ['terminals', 'subprocess', 'sandboxPolicy', 'typert']
  static Config = z.object({
    shell: z.union([z.object({
      path: z.string().required(),
      name: z.string().required(),
      args: z.array(z.string()).default([]),
    }), z.const(undefined)]),
    shellCandidates: z.array(z.string().min(1)).default(['zsh', 'bash', 'fish', 'pwsh', 'powershell', 'cmd']),
    ptyType: z.string().default('shell'),
    maxTerminals: z.number().step(1).min(1).default(8),
    maxCols: z.number().step(1).min(2).default(500),
    maxRows: z.number().step(1).min(1).default(200),
    scrollback: z.number().step(1).min(0).default(1000),
    maxBufferedBytes: z.number().step(1).min(1024).default(2 * 1024 * 1024),
    maxInputBytes: z.number().step(1).min(1).default(64 * 1024),
    cleanupRetryMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(60_000),
  })

  owners = new Map()
  lifetime = new AbortController()

  constructor(ctx, config) {
    super(ctx, 'terminalController', { namespace: 'terminal' })
    this.config = config
    ctx.effect(() => async () => {
      this.lifetime.abort(new Error('Terminal controller disposed'))
      const results = await Promise.allSettled([...this.owners].map(([id, owner]) => this.disposeOwner(id, owner)))
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
      if (errors.length > 0) throw new AggregateError(errors, 'Browser terminal cleanup failed')
    }, 'terminal-controller.processes')
  }

  environment(agent, signal) {
    signal.throwIfAborted()
    const cwd = agent.session.header.cwd ?? this.ctx.sandboxPolicy.resolve({ session: agent.session }).workspaceRoot
    return {
      cwd,
      maxInputBytes: this.config.maxInputBytes,
      maxCols: this.config.maxCols,
      maxRows: this.config.maxRows,
      scrollback: this.config.scrollback,
    }
  }

  shells(agent, signal) {
    signal.throwIfAborted()
    return discoverShells(this.ctx.subprocess, this.config.shell, this.config.shellCandidates, signal)
  }

  list(sessionId) {
    const owner = this.owners.get(sessionId)
    if (owner === undefined) return []
    return [...owner.terminals.values()].map(terminal => terminal.info)
  }

  async create(agent, request, signal) {
    this.lifetime.signal.throwIfAborted()
    if (!TERMINAL_ID_PATTERN.test(request.id)) throw new Error('Invalid terminal identity')
    this.dimensions(request.cols, request.rows)
    const owner = this.owner(agent)
    owner.lifetime.signal.throwIfAborted()
    this.requireOpen(owner, request.id)
    const existing = owner.terminals.get(request.id)
    if (existing !== undefined) return existing.info
    const pending = owner.pending.get(request.id)
    if (pending !== undefined) {
      const terminal = await pending
      this.requireOpen(owner, request.id)
      return terminal.info
    }
    const held = new Set([...owner.terminals.keys(), ...owner.pending.keys()]).size
    if (held >= this.config.maxTerminals) {
      throw terminalFailure('terminal/limit-reached', 'Session terminal limit reached', { limit: this.config.maxTerminals })
    }
    const allocation = this.spawn(agent, request, AbortSignal.any([signal, this.lifetime.signal, owner.lifetime.signal]))
    owner.pending.set(request.id, allocation)
    try {
      const terminal = await allocation
      owner.terminals.set(request.id, terminal)
      terminal.monitor(this.config, () => { owner.closedIds.add(request.id) }, () => {
        owner.terminals.delete(request.id)
      }, (error) => { this.ctx.logger.error('Browser terminal cleanup failed', error) })
      this.requireOpen(owner, request.id)
      return terminal.info
    } finally {
      owner.pending.delete(request.id)
    }
  }

  retain(sessionId, id, signal) {
    const owner = this.owners.get(sessionId)
    const terminal = owner?.terminals.get(id)
    if (terminal === undefined || owner.closedIds.has(id) || owner.lifetime.signal.aborted) {
      throw terminalFailure('terminal/unavailable', 'Terminal is closing or unavailable', {})
    }
    return terminal.retain(signal)
  }

  async *follow(agent, id, attachmentId, signal) {
    if (!TERMINAL_ID_PATTERN.test(attachmentId)) throw new Error('Invalid terminal attachment identity')
    yield* this.terminal(agent, id).follow(attachmentId, signal)
  }

  async write(agent, id, attachmentId, data) {
    if (Buffer.byteLength(data, 'utf8') > this.config.maxInputBytes) throw new Error('Terminal input exceeds the configured limit')
    await this.terminal(agent, id).write(attachmentId, data)
  }

  async resize(agent, id, attachmentId, cols, rows) {
    this.dimensions(cols, rows)
    await this.terminal(agent, id).resize(attachmentId, cols, rows)
  }

  async close(agent, id) {
    const owner = this.owner(agent)
    owner.closedIds.add(id)
    await owner.pending.get(id)?.catch(() => {})
    const terminal = owner.terminals.get(id)
    if (terminal === undefined) return
    await terminal.close()
    owner.terminals.delete(id)
  }

  owner(agent) {
    let owner = this.owners.get(agent.id)
    if (owner === undefined) {
      owner = { terminals: new Map(), pending: new Map(), closedIds: new Set(), lifetime: new AbortController() }
      this.owners.set(agent.id, owner)
      const owned = owner
      agent.ctx.effect(() => async () => { await this.disposeOwner(agent.id, owned) }, 'terminal-controller.owner')
    }
    return owner
  }

  disposeOwner(id, owner) {
    if (owner.cleanup !== undefined) return owner.cleanup
    owner.lifetime.abort(new Error('Terminal Session owner disposed'))
    owner.cleanup = (async () => {
      await Promise.allSettled(owner.pending.values())
      const results = await Promise.allSettled([...owner.terminals.values()].map(terminal => terminal.dispose()))
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
      owner.terminals.clear()
      this.owners.delete(id)
      if (errors.length > 0) throw new AggregateError(errors, 'Session terminal cleanup failed')
    })().catch((error) => { delete owner.cleanup; throw error })
    return owner.cleanup
  }

  terminal(agent, id) {
    const owner = this.owners.get(agent.id)
    const terminal = owner?.terminals.get(id)
    if (terminal === undefined) throw terminalFailure('terminal/unavailable', 'Terminal no longer exists in this Session', {})
    this.requireOpen(owner, id)
    return terminal
  }

  requireOpen(owner, id) {
    if (owner.closedIds.has(id)) throw terminalFailure('terminal/unavailable', 'Terminal was closed in this Session', {})
  }

  dimensions(cols, rows) {
    if (!Number.isSafeInteger(cols) || cols < 2 || cols > this.config.maxCols
      || !Number.isSafeInteger(rows) || rows < 1 || rows > this.config.maxRows) {
      throw new Error('Terminal dimensions exceed the configured limits')
    }
  }

  async spawn(agent, request, signal) {
    const environment = this.environment(agent, signal)
    const shell = request.shellPath === undefined
      ? await resolveShell(this.ctx.subprocess, this.config.shell, signal)
      : (await this.shells(agent, signal)).find(candidate => candidate.path === request.shellPath)
    if (shell === undefined) throw new Error('Selected shell is not available in this execution environment')
    const snapshot = await this.ctx.terminals.spawn(agent, {
      type: this.config.ptyType,
      name: request.id,
      cwd: environment.cwd,
    }, signal)
    const dimensions = await this.ctx.terminals.resize(agent, snapshot.sessionId, request.cols, request.rows)
    return new BrowserTerminal(this.ctx.terminals, agent, snapshot.sessionId, {
      id: request.id,
      shell,
      title: shell.name,
      cwd: environment.cwd,
      cols: dimensions.cols,
      rows: dimensions.rows,
      state: 'running',
      exitCode: null,
    }, this.config.scrollback, this.config.maxBufferedBytes)
  }
}

Remote('environment')(TerminalController.prototype.environment, {
  name: 'environment',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(TerminalController.prototype)) },
})
Remote('shells')(TerminalController.prototype.shells, {
  name: 'shells',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(TerminalController.prototype)) },
})
Remote('list')(TerminalController.prototype.list, {
  name: 'list',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(TerminalController.prototype)) },
})
Remote('create')(TerminalController.prototype.create, {
  name: 'create',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(TerminalController.prototype)) },
})
Remote('write')(TerminalController.prototype.write, {
  name: 'write',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(TerminalController.prototype)) },
})
Remote('resize')(TerminalController.prototype.resize, {
  name: 'resize',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(TerminalController.prototype)) },
})
Remote('close')(TerminalController.prototype.close, {
  name: 'close',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(TerminalController.prototype)) },
})

export default TerminalController
