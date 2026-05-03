import { listDebug, snapshotAll } from '../../observability/debug.js'

const _counters = new Map()
export function inc(name, delta = 1) { _counters.set(name, (_counters.get(name) || 0) + delta) }
export function counters() { return Object.fromEntries(_counters) }
export function metricsText() {
    const lines = ['# HELP freddie_counter generic counter', '# TYPE freddie_counter counter']
    for (const [name, value] of _counters) lines.push(`freddie_counter{name="${name}"} ${value}`)
    for (const sub of listDebug()) lines.push(`freddie_subsystem{name="${sub}"} 1`)
    return lines.join('\n') + '\n'
}
export const plugin = {
    name: 'observability',
    register: (ctx) => {
        ctx.registerHook('preToolCall', async (p) => { inc('tool_calls_total'); inc(`tool_call:${p?.name || 'unknown'}`); return p })
        if (typeof ctx.attachRoute === 'function') ctx.attachRoute('/metrics', (_, res) => { res.set('content-type', 'text/plain'); res.send(metricsText()) })
    },
}
