import { logger } from '../observability/log.js'
import { runTurn } from '../agent/machine.js'
import { createMachine, assign, fromPromise, createActor } from 'xstate'
import { persist, load, clear } from '../machines/snapshot-store.js'
import { runStep, clearSteps } from '../machines/step-journal.js'
import { randomUUID } from 'node:crypto'

const log = logger('gateway')

// Gateway lifecycle machine: stopped -> starting -> running -> stopping -> stopped.
// The running state's context tracks platform names; lifecycle is the resumable
// shape. In-flight inbound message processing is persisted separately (per-message
// snapshot under kind=gateway-msg) so a refresh re-drives messages whose reply was
// never sent.
export function createGatewayMachine({ platformNames = [] } = {}) {
    return createMachine({
        id: 'freddie-gateway',
        initial: 'stopped',
        context: ({ input }) => ({ platformNames: input?.platformNames || platformNames }),
        states: {
            stopped: { on: { START: 'starting' } },
            starting: { on: { STARTED: 'running', FAIL: 'stopped' } },
            running: { on: { STOP: 'stopping' } },
            stopping: { on: { STOPPED: 'stopped' } },
        },
    })
}

export class Gateway {
    constructor({ platforms = {}, callLLM = null } = {}) {
        this.platforms = new Map()
        this.callLLM = callLLM
        this.hooks = { inbound: [], outbound: [] }
        for (const [name, adapter] of Object.entries(platforms)) this.register(name, adapter)
        this.machine = createGatewayMachine({ platformNames: [...this.platforms.keys()] })
        this.actor = createActor(this.machine, { input: { platformNames: [...this.platforms.keys()] } })
        // Persist lifecycle transitions so the gateway's state is observable +
        // resumable; an active snapshot on boot means the gateway was running.
        this.actor.subscribe((snap) => { persist('gateway', 'lifecycle', this.actor.getPersistedSnapshot()).catch(e => log.error('gateway lifecycle persist failed', { err: String(e) })) })
        this.actor.start()
    }
    get state() { return this.actor.getSnapshot().value }
    register(name, adapter) {
        this.platforms.set(name, adapter)
        adapter.on?.('message', (m) => { this.handleInbound(name, m).catch(e => log.error('message listener error', { platform: name, from: m.from, error: String(e) })) })
    }
    addHook(stage, fn) { this.hooks[stage].push(fn) }
    async start() {
        this.actor.send({ type: 'START' })
        for (const a of this.platforms.values()) await a.start?.()
        this.actor.send({ type: 'STARTED' })
        log.info('gateway started', { platforms: [...this.platforms.keys()] })
    }
    async stop() {
        this.actor.send({ type: 'STOP' })
        for (const a of this.platforms.values()) await a.stop?.()
        this.actor.send({ type: 'STOPPED' })
        log.info('gateway stopped')
    }
    async handleInbound(platform, msg) {
        log.info('inbound', { platform, from: msg.from, len: (msg.text || '').length })
        // Persist the in-flight message under a stable key derived from platform +
        // sender + content so a refresh mid-processing re-drives it instead of
        // dropping it. The snapshot is cleared once the reply is sent.
        const msgKey = msg.id || `${platform}:${msg.from}:${randomUUID()}`
        // A persist failure must not drop the message: degrade to non-resumable
        // processing (the reply still goes out) rather than throwing it away.
        try {
            await persist('gateway-msg', msgKey, { status: 'active', value: 'processing', context: { platform, from: msg.from, text: msg.text } })
        } catch (e) {
            log.warn('cannot persist gateway-msg, continuing without resumability', { msgKey, err: String(e) })
        }
        let cur = { ...msg, platform }
        for (const h of this.hooks.inbound) cur = (await h(cur)) || cur
        const result = await runStep(msgKey, 'run', () => runTurn({ prompt: cur.text || '', callLLM: this.callLLM }))
        let reply = { to: msg.from, text: result.result || result.error || '', platform, result }
        for (const h of this.hooks.outbound) reply = (await h(reply)) || reply
        const adapter = this.platforms.get(platform)
        // Clear the in-flight snapshot whether or not the send throws: a send
        // failure must not leave the message to be re-driven (and re-replied) on
        // the next boot. The contract is "cleared once processing completes".
        try {
            await adapter.send?.(reply)
        } finally {
            await clear('gateway-msg', msgKey)
            await clearSteps(msgKey)
        }
        return reply
    }
}

export const bootMdHook = async (m) => {
    if ((m.text || '').startsWith('/boot')) m.text = (m.text || '').replace(/^\/boot\s*/, '').trim() || 'hello'
    return m
}
