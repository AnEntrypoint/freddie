import readline from 'node:readline'
import { EventEmitter } from 'node:events'
import { bootHost } from '../host/index.js'
import { runTurn } from '../agent/machine.js'
import { wireHookBridge } from '../agent/wire_hooks.js'
import { logger } from '../observability/log.js'
import { Events } from './events.js'
import { checkPermission, rememberAllow, rememberDeny } from './permissions.js'
import { AcpSessionManager } from './session.js'
import { AcpWireBridge } from './wire-bridge.js'
import { queueTurn, steerTurn, cancelTurn, drainQueue, listLiveTurns } from '../agent/live-turns.js'
import { getConfigValue } from '../config.js'
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
    methods: ['initialize', 'session.new', 'session.resume', 'session.list', 'session.end', 'prompt.submit', 'tool.list', 'permission.respond', 'hooks/subscribe', 'hooks/unsubscribe', 'hooks/list', 'shutdown'],
    events: ['tool.start', 'tool.progress', 'tool.complete', 'message.delta', 'message.complete', 'permission.request', 'session.ended'],
}

// Standard Agent Client Protocol response, returned from initialize when the
// request carries a protocolVersion (Zed/JetBrains-class clients). Legacy
// freddie-ACP clients send no protocolVersion and still get CAPABILITIES.
const ACP_INITIALIZE_RESPONSE = {
    protocolVersion: 1,
    agentInfo: { name: 'freddie', version: '0.4.0' },
    agentCapabilities: { loadSession: true, promptCapabilities: { image: false, audio: false, embeddedContext: true } },
    authMethods: [],
}

// Flatten ACP ContentBlock[] prompt params into the plain text runTurn takes.
// Text blocks dominate in practice; resource links/embedded resources degrade
// to a uri mention / their inline text rather than being dropped silently.
function promptText(prompt) {
    if (typeof prompt === 'string') return prompt
    if (!Array.isArray(prompt)) return ''
    const parts = []
    for (const b of prompt) {
        if (!b) continue
        if (b.type === 'text' && b.text) parts.push(b.text)
        else if (b.type === 'resource_link' && b.uri) parts.push(b.name ? `${b.name} (${b.uri})` : b.uri)
        else if (b.type === 'resource' && b.resource?.text) parts.push(b.resource.text)
    }
    return parts.join('\n')
}

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

const METHODS = {
    initialize: (_srv, params) => params && params.protocolVersion != null ? ACP_INITIALIZE_RESPONSE : CAPABILITIES,
    // Standard-ACP lifecycle (Zed/JetBrains clients). Notifications arrive
    // id-less and are not answered by handle().
    'notifications/initialized': () => ({}),
    'notifications/cancelled': (srv, { id } = {}) => {
        // Client cancelled one of OUR outbound requests (e.g. a permission
        // prompt it auto-dismissed) — reject it so the bridge maps it to a
        // denied approval instead of hanging until the approval timeout.
        const pending = srv._pendingClientReqs.get(id)
        if (pending) { srv._pendingClientReqs.delete(id); pending.reject(new Error('cancelled by client')) }
        return {}
    },
    'session/new': async (srv, params = {}) => {
        const { sessionId } = await srv.sessions.new({})
        srv._acpMeta.set(sessionId, { cwd: params.cwd || null })
        return { sessionId }
    },
    'session/load': async (srv, { sessionId, cwd } = {}) => {
        const resumed = await srv.sessions.resume(sessionId)
        if (!resumed) throw new Error('session not found')
        srv._acpMeta.set(sessionId, { cwd: cwd || null })
        // Spec: the agent replays prior history as session/update
        // notifications BEFORE responding to session/load.
        for (const m of resumed.messages || []) {
            const kind = m.role === 'user' ? 'user_message_chunk' : m.role === 'assistant' ? 'agent_message_chunk' : null
            if (kind && m.content) srv.acpUpdate(sessionId, { sessionUpdate: kind, content: { type: 'text', text: String(m.content) } })
        }
        return {}
    },
    'session/prompt': async (srv, params = {}) => {
        const { sessionId } = params
        if (!srv.sessions.isActive(sessionId)) throw new Error('session not active')
        const text = promptText(params.prompt)
        if (!text) throw new Error('empty prompt')
        const sk = 'acp:' + sessionId
        // Steering (a freddie extension — ACP has no steer verb): the client
        // opts in via _meta.freddie.steer and the text is injected into the
        // live turn at its next tool_calls->prompting boundary.
        if (params._meta?.freddie?.steer) {
            if (!steerTurn(sk, text)) throw new Error('no live turn to steer')
            return { stopReason: 'end_turn' }
        }
        // Per-session turn loop: the first prompt starts the pump, later
        // prompts enqueue as follow-ups (kimi Enter=queue channel, visible in
        // the wire protocol as queue.append) and await their own turn.
        let loop = srv._acpTurnLoops.get(sk)
        if (!loop) { loop = { items: [], running: false }; srv._acpTurnLoops.set(sk, loop) }
        return await new Promise((resolve, reject) => {
            loop.items.push({ text, resolve, reject })
            if (loop.running) queueTurn(sk, text)
            else void runAcpTurnLoop(srv, sessionId, sk, loop)
        })
    },
    'session/cancel': (srv, { sessionId } = {}) => {
        // Cancel takes effect at the next machine state boundary; the in-flight
        // session/prompt then responds stopReason:'cancelled'.
        srv._acpCancelled.add(sessionId)
        cancelTurn('acp:' + sessionId)
        return {}
    },
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
    'hooks/subscribe': (_srv, { eventName }) => {
        const id = wireHookBridge.subscribe(eventName, async () => {
            // Client-side hooks are fire-and-forget from the server perspective;
            // the client processes the event and the bridge records the result.
            return { decision: 'allow' }
        })
        return { ok: true, id, eventName }
    },
    'hooks/unsubscribe': (_srv, { eventName, id }) => {
        const ok = wireHookBridge.unsubscribe(eventName, id)
        return { ok }
    },
    'hooks/list': () => {
        return { subscriptions: wireHookBridge.listSubscriptions() }
    },
    shutdown: (srv) => { srv.stop(); return { ok: true } },
}

// Per-session turn pump (standard ACP). Drains queued prompt items one turn at
// a time so each session/prompt response rides its own turn. queueTurn() above
// only records the follow-up in the wire protocol; drainQueue() keeps the
// live-turns shadow queue in sync with the loop's own item list.
async function runAcpTurnLoop(srv, sessionId, sk, loop) {
    loop.running = true
    while (loop.items.length) {
        const { text, resolve, reject } = loop.items.shift()
        try { resolve(await runAcpTurn(srv, sessionId, sk, text)) }
        catch (e) { reject(e) }
        try { drainQueue(sk) } catch { /* swallow: shadow-queue sync is best-effort */ }
    }
    loop.running = false
    srv._acpTurnLoops.delete(sk)
}

// One standard-ACP turn: subscribe the wire bridge BEFORE runTurn so every
// turn event is caught, run, translate to session/update frames en route, and
// resolve with the ACP stopReason (cancelled when session/cancel raced the
// turn, refusal on error, end_turn otherwise).
async function runAcpTurn(srv, sessionId, sk, text) {
    const meta = srv._acpMeta.get(sessionId) || {}
    await srv.sessions.appendUser(sessionId, text)
    const bridge = new AcpWireBridge({
        sessionKey: sk,
        sessionId,
        sendUpdate: (u) => srv.acpUpdate(sessionId, u),
        requestPermission: (p) => srv.sendClientRequest('session/request_permission', p),
    })
    try {
        // Same crash-observability journaling as prompt.submit below: the
        // in-flight prompt is persisted under kind=acp-prompt, the post-turn
        // assistant append is its own journaled step.
        await persist('acp-prompt', sessionId, { status: 'active', value: 'running', context: { sessionId, prompt: text } })
        const out = await runTurn({
            prompt: text,
            callLLM: srv.callLLM,
            sessionKey: sk,
            cwd: meta.cwd || undefined,
            timeoutMs: getConfigValue('agent.turn_timeout_ms', 600000),
        })
        await runStep(sk, 'acp-persist', async () => { await srv.sessions.appendAssistant(sessionId, out.result || ''); return { ok: true } })
        await clear('acp-prompt', sessionId)
        await clearSteps(sk)
        const stopReason = srv._acpCancelled.has(sessionId) ? 'cancelled' : out.error ? 'refusal' : 'end_turn'
        return { stopReason }
    } finally {
        bridge.dispose()
        srv._acpCancelled.delete(sessionId)
    }
}
