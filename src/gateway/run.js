import { logger } from '../observability/log.js'
import { runTurn } from '../agent/machine.js'

const log = logger('gateway')

export class Gateway {
    constructor({ platforms = {}, callLLM = null } = {}) {
        this.platforms = new Map()
        this.callLLM = callLLM
        this.hooks = { inbound: [], outbound: [] }
        for (const [name, adapter] of Object.entries(platforms)) this.register(name, adapter)
    }
    register(name, adapter) {
        this.platforms.set(name, adapter)
        adapter.on?.('message', (m) => this.handleInbound(name, m))
    }
    addHook(stage, fn) { this.hooks[stage].push(fn) }
    async start() {
        for (const a of this.platforms.values()) await a.start?.()
        log.info('gateway started', { platforms: [...this.platforms.keys()] })
    }
    async stop() {
        for (const a of this.platforms.values()) await a.stop?.()
        log.info('gateway stopped')
    }
    async handleInbound(platform, msg) {
        log.info('inbound', { platform, from: msg.from, len: (msg.text || '').length })
        let cur = { ...msg, platform }
        for (const h of this.hooks.inbound) cur = (await h(cur)) || cur
        const result = await runTurn({ prompt: cur.text || '', callLLM: this.callLLM })
        let reply = { to: msg.from, text: result.result || result.error || '', platform, result }
        for (const h of this.hooks.outbound) reply = (await h(reply)) || reply
        const adapter = this.platforms.get(platform)
        await adapter.send?.(reply)
        return reply
    }
}

export const bootMdHook = async (m) => {
    if ((m.text || '').startsWith('/boot')) m.text = (m.text || '').replace(/^\/boot\s*/, '').trim() || 'hello'
    return m
}
