// onPreCompact/onPostCompact hook invocation — split out of machine.js so
// machine_builder.js (the real, live compaction call site inside the
// 'prompting' state's invoke) can import it without a circular dependency:
// machine.js imports createAgentMachine FROM machine_builder.js, so
// machine_builder.js importing invokeCompactHooks back from machine.js would
// cycle. This module has no dependency on either, so both import from here.
import { bootHost } from '../host/index.js'
import { HookEngine } from './hooks_engine.js'
import { wireHookBridge } from './wire_hooks.js'
import { loadConfig } from '../config.js'

export async function invokeCompactHooks({ trigger = 'auto', messages = [] } = {}) {
    const h = await bootHost()
    const hookEngine = new HookEngine({ config: loadConfig() })
    const pre = await h.hooks.invoke('onPreCompact', { trigger, messages })
    hookEngine.runHooks('onPreCompact', { trigger }).catch(() => {})
    wireHookBridge.forwardHook('onPreCompact', { trigger }).catch(() => {})
    if (pre?.behavior === 'block') return { skipped: true, reason: pre.reason || 'blocked' }
    return { pre, post: async (summary) => {
        await h.hooks.invoke('onPostCompact', { trigger, messages, summary })
        hookEngine.runHooks('onPostCompact', { trigger }).catch(() => {})
        wireHookBridge.forwardHook('onPostCompact', { trigger }).catch(() => {})
    } }
}
