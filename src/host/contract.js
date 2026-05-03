export { definePlugin, HookType, allowResult, blockResult, modifyResult, PluginRunner, PluginRuntime, piAdapter } from 'plugsdk'

export const SURFACES = ['pi', 'gui', 'both']

export const PI_VERBS = ['tool', 'env', 'command', 'cron', 'platform', 'memory', 'skill', 'context', 'agentExt', 'cli']
export const GUI_VERBS = ['route', 'page', 'nav', 'debug', 'api', 'asset']

export const HOOK_NAMES = [
    'preToolCall', 'postToolCall',
    'preLlmCall', 'postLlmCall',
    'onSessionStart', 'onSessionEnd',
    'onTurnStart', 'onTurnEnd',
    'onMessageInbound', 'onMessageOutbound',
]

import { HookType } from 'plugsdk'

export const FREDDIE_TO_SDK_HOOK = {
    preToolCall:        HookType.PRE_TOOL_USE,
    postToolCall:       HookType.POST_TOOL_USE,
    onSessionStart:     HookType.SESSION_START,
    onSessionEnd:       HookType.SESSION_END,
    onMessageInbound:   HookType.PROMPT_SUBMIT,
    onMessageOutbound:  HookType.AFTER_RESPONSE,
}

export function validatePlugin(p) {
    if (!p || typeof p !== 'object') throw new Error('plugin: object required')
    if (!p.name || typeof p.name !== 'string') throw new Error('plugin.name: string required')
    if (!SURFACES.includes(p.surfaces)) throw new Error(`plugin ${p.name}: surfaces must be one of ${SURFACES.join(',')}`)
    if (typeof p.register !== 'function') throw new Error(`plugin ${p.name}: register(ctx) function required`)
    if (p.requires && !Array.isArray(p.requires)) throw new Error(`plugin ${p.name}: requires must be array`)
    return p
}

export function topoSort(plugins) {
    const byName = new Map(plugins.map(p => [p.name, p]))
    const seen = new Map()
    const out = []
    const visit = (name, stack) => {
        if (seen.get(name) === 'done') return
        if (seen.get(name) === 'visiting') throw new Error(`plugin cycle: ${[...stack, name].join(' -> ')}`)
        const p = byName.get(name)
        if (!p) throw new Error(`plugin missing: ${name} (required by ${stack[stack.length - 1] || 'root'})`)
        seen.set(name, 'visiting')
        for (const dep of p.requires || []) visit(dep, [...stack, name])
        seen.set(name, 'done')
        out.push(p)
    }
    for (const p of plugins) visit(p.name, [])
    return out
}
