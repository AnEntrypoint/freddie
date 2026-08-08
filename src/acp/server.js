import readline from 'node:readline'
import { EventEmitter } from 'node:events'
import { logger } from '../observability/log.js'
import { Events } from './events.js'
import { checkPermission } from './permissions.js'
import { AcpSessionManager } from './session.js'
import { createActor } from 'xstate'
import { persist } from '../machines/snapshot-store.js'
import { createAcpMachine, CAPABILITIES, ACP_INITIALIZE_RESPONSE, promptText } from './protocol.js'
import { METHODS } from './methods.js'

const log = logger('acp')

export { createAcpMachine, CAPABILITIES, ACP_INITIALIZE_RESPONSE, promptText }

export class AcpServer extends EventEmitter {
    constructor({ stdin = process.stdin, stdout = process.stdout, callLLM = null } = {}) {
        super()
        this.in = stdin; this.out = stdout; this.callLLM = callLLM
        this.sessions = new AcpSessionManager()
        this._pendingPerm = new Map()
        // Standard-ACP state: server->client requests (session/request_permission)
        // await responses routed back in handle(); per-session metadata (cwd from
        // session/new), cancellation flags, and prompt loops serialize turns.
        this._clientReqSeq = 0
        this._pendingClientReqs = new Map()
        this._acpMeta = new Map()
        this._acpCancelled = new Set()
        this._acpTurnLoops = new Map()
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
    // Standard-ACP frame emitters. session/update is a notification;
    // session/request_permission is a server->client request whose response
    // arrives back through handle() as a bare {id, result|error} frame.
    acpUpdate(sessionId, update) { this.send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } }) }
    sendClientRequest(method, params) {
        const id = 'srv-' + (++this._clientReqSeq)
        return new Promise((resolve, reject) => {
            this._pendingClientReqs.set(id, { resolve, reject })
            this.send({ jsonrpc: '2.0', id, method, params })
        })
    }
    async handle(line) {
        if (!line.trim()) return
        let req; try { req = JSON.parse(line) } catch { return this.send({ jsonrpc: '2.0', error: { message: 'invalid json' } }) }
        const { id, method, params = {} } = req
        // Responses to OUR server->client requests carry no method — route them
        // to the waiting promise instead of dispatching as an inbound method.
        if (!method) {
            const pending = this._pendingClientReqs.get(id)
            if (pending) {
                this._pendingClientReqs.delete(id)
                if (req.error) pending.reject(new Error(req.error?.message || String(req.error)))
                else pending.resolve(req.result)
            }
            return
        }
        log.info('rpc', { method, id })
        const fn = METHODS[method]
        if (!fn) {
            // Unknown notifications are dropped silently per JSON-RPC; unknown
            // requests still get method-not-found.
            if (id === undefined || id === null) return
            return this.send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'unknown method: ' + method } })
        }
        try {
            const result = await fn(this, params)
            // Notifications carry no id and must not be answered (e.g.
            // notifications/initialized, session/cancel).
            if (id !== undefined && id !== null) this.send({ jsonrpc: '2.0', id, result })
        } catch (e) { if (id !== undefined && id !== null) this.send({ jsonrpc: '2.0', id, error: { message: String(e?.message || e) } }) }
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
