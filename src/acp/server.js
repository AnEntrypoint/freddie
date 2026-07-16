import readline from 'node:readline'
import { EventEmitter } from 'node:events'
import { bootHost } from '../host/index.js'
import { runTurn } from '../agent/machine.js'
import { logger } from '../observability/log.js'
import { Events } from './events.js'
import { checkPermission, rememberAllow, rememberDeny } from './permissions.js'
import { AcpSessionManager } from './session.js'
import { createMachine, createActor } from 'xstate'
import { persist, load, clear } from '../machines/snapshot-store.js'
import { runStep, clearSteps } from '../machines/step-journal.js'

const log = logger('acp')

// ACP server lifecycle machine: stopped -> running -> stopped. Persisted so an
// active snapshot on boot signals the server was serving; per-prompt processing
// is persisted separately under kind=acp-prompt so an interrupted prompt.submit
// is observable + resumable after a restart.
export function createAcpMachine() {
    return createMachine({
        id: 'freddie-acp',
        initial: 'stopped',
        states: {
            stopped: { on: { START: 'running' } },
            running: { on: { STOP: 'stopped' } },
        },
    })
}

const CAPABILITIES = {
    name: 'freddie', version: '0.4.0',
    methods: ['initialize', 'session.new', 'session.resume', 'session.list', 'session.end', 'prompt.submit', 'tool.list', 'permission.respond', 'shutdown'],
    events: ['tool.start', 'tool.progress', 'tool.complete', 'message.delta', 'message.complete', 'permission.request', 'session.ended'],
}

export class AcpServer extends EventEmitter {
    constructor({ stdin = process.stdin, stdout = process.stdout, callLLM = null } = {}) {
        super()
        this.in = stdin; this.out = stdout; this.callLLM = callLLM
        this.sessions = new AcpSessionManager()
        this._pendingPerm = new Map()
        this.machine = createAcpMachine()
        this.actor = createActor(this.machine)
        this.actor.subscribe(() => { persist('acp', 'lifecycle', this.actor.getPersistedSnapshot()).catch(e => log.error('acp lifecycle persist failed', { err: String(e) })) })
        this.actor.start()
    }
    get state() { return this.actor.getSnapshot().value }
    start() {
        const rl = readline.createInterface({ input: this.in, crlfDelay: Infinity })
        rl.on('line', (l) => this.handle(l).catch(e => this.send({ jsonrpc: '2.0', error: { message: String(e) } })))
        this.rl = rl
        this.actor.send({ type: 'START' })
    }
    stop() { this.rl?.close(); try { this.actor.send({ type: 'STOP' }) } catch {} }
    send(o) { this.out.write(JSON.stringify(o) + '\n') }
    async handle(line) {
        if (!line.trim()) return
        let req; try { req = JSON.parse(line) } catch { return this.send({ jsonrpc: '2.0', error: { message: 'invalid json' } }) }
        const { id, method, params = {} } = req
        log.info('rpc', { method, id })
        const fn = METHODS[method]
        if (!fn) return this.send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'unknown method: ' + method } })
        try {
            const result = await fn(this, params)
            this.send({ jsonrpc: '2.0', id, result })
        } catch (e) { this.send({ jsonrpc: '2.0', id, error: { message: String(e?.message || e) } }) }
    }
    requestPermission(sessionId, tool) {
        const decided = checkPermission(sessionId, tool)
        if (decided !== 'ask') return Promise.resolve(decided)
        return new Promise((resolve) => {
            const reqId = sessionId + ':' + tool + ':' + Date.now()
            this._pendingPerm.set(reqId, { resolve, sessionId, tool })
            Events.permissionRequest((o) => this.send(o), { reqId, sessionId, tool })
        })
    }
}

const METHODS = {
    initialize: () => CAPABILITIES,
    'session.new': (srv, params) => srv.sessions.new(params),
    'session.resume': (srv, { sessionId }) => srv.sessions.resume(sessionId) || (() => { throw new Error('session not found') })(),
    'session.list': (srv) => srv.sessions.list(),
    'session.end': (srv, { sessionId }) => { Events.sessionEnded((o) => srv.send(o), { sessionId }); return srv.sessions.end(sessionId) },
    'tool.list': async () => {
        const h = await bootHost()
        return { tools: h.pi.tools.list().map(t => ({ name: t.name, toolset: t.toolset, schema: t.schema })) }
    },
    'permission.respond': (srv, { reqId, decision }) => {
        const pending = srv._pendingPerm.get(reqId)
        if (!pending) return { ok: false, error: 'unknown reqId' }
        srv._pendingPerm.delete(reqId)
        if (decision === 'allow' || decision === 'always_allow') rememberAllow(pending.sessionId, pending.tool)
        if (decision === 'deny' || decision === 'always_deny') rememberDeny(pending.sessionId, pending.tool)
        pending.resolve(decision === 'allow' || decision === 'always_allow' ? 'allow' : 'deny')
        return { ok: true }
    },
    'prompt.submit': async (srv, { sessionId, prompt }) => {
        if (!srv.sessions.isActive(sessionId)) throw new Error('session not active')
        srv.sessions.appendUser(sessionId, prompt)
        Events.messageDelta((o) => srv.send(o), { sessionId, role: 'user', content: prompt })
        // Persist in-flight prompt under kind=acp-prompt keyed by sessionId so a
        // refresh mid-turn is observable + resumable (the agent snapshot for the
        // turn itself lives under kind=agent via runTurn sessionKey).
        await persist('acp-prompt', sessionId, { status: 'active', value: 'running', context: { sessionId, prompt } })
        const sk = 'acp:' + sessionId
        // The agent turn itself is step-journaled under sessionKey=sk (at-most-once
        // LLM + tool effects). The post-turn persistence (session append) is its
        // own journaled step so a crash between runTurn return and appendAssistant
        // does not double-append on resume.
        const out = await runTurn({ prompt, callLLM: srv.callLLM, sessionKey: sk })
        await runStep(sk, 'acp-persist', async () => { await srv.sessions.appendAssistant(sessionId, out.result || ''); return { ok: true } })
        await clear('acp-prompt', sessionId)
        await clearSteps(sk)
        Events.messageComplete((o) => srv.send(o), { sessionId, role: 'assistant', content: out.result || '' })
        return { result: out.result, error: out.error, iterations: out.iterations }
    },
    shutdown: (srv) => { srv.stop(); return { ok: true } },
}
