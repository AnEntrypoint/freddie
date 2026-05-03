import readline from 'node:readline'
import { EventEmitter } from 'node:events'
import { bootHost } from '../host/index.js'
import { runTurn } from '../agent/machine.js'
import { logger } from '../observability/log.js'
import { Events } from './events.js'
import { checkPermission, rememberAllow, rememberDeny } from './permissions.js'
import { AcpSessionManager } from './session.js'

const log = logger('acp')

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
    }
    start() {
        const rl = readline.createInterface({ input: this.in, crlfDelay: Infinity })
        rl.on('line', (l) => this.handle(l).catch(e => this.send({ jsonrpc: '2.0', error: { message: String(e) } })))
        this.rl = rl
    }
    stop() { this.rl?.close() }
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
        const out = await runTurn({ prompt, callLLM: srv.callLLM })
        srv.sessions.appendAssistant(sessionId, out.result || '')
        Events.messageComplete((o) => srv.send(o), { sessionId, role: 'assistant', content: out.result || '' })
        return { result: out.result, error: out.error, iterations: out.iterations }
    },
    shutdown: (srv) => { srv.stop(); return { ok: true } },
}
