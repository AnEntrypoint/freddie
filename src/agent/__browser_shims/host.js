export async function bootHost() {
    const br = globalThis.__freddieRuntimeBridge
    if (!br || !br.host) throw new Error('freddie-runtime: __freddieRuntimeBridge.host not set')
    const host = br.host
    return {
        hooks: {
            async invoke(name, payload) {
                const map = { preToolCall: 'pre_tool_use', postToolCall: 'post_tool_use', onMessageInbound: 'user_prompt_submit', onMessageOutbound: null, onSessionStart: null, onSessionEnd: 'stop', onPreCompact: null, onPostCompact: null }
                const key = map[name]
                if (!key || !host.pi.hooks[key]) return null
                let merged = null
                for (const fn of host.pi.hooks[key]) {
                    try {
                        const r = await fn(payload || {})
                        if (!r || typeof r !== 'object') continue
                        merged = merged || {}
                        if (r.decision === 'block') return { behavior: 'block', reason: r.reason || 'denied' }
                        if (r.systemMessage) merged.systemMessage = (merged.systemMessage ? merged.systemMessage + '\n' : '') + r.systemMessage
                        if (r.additionalContext) merged.additionalContext = (merged.additionalContext ? merged.additionalContext + '\n' : '') + r.additionalContext
                        if (r.args) merged.args = r.args
                    } catch (e) { console.warn('[freddie-runtime] hook ' + key + ' threw:', e && e.message) }
                }
                return merged
            },
        },
        pi: {
            tools: host.pi.tools,
            skills: host.pi.skills,
            hooks: host.pi.hooks,
            dispatchTool: async (name, args) => {
                const out = await host.runTool(name, args || {})
                return typeof out === 'string' ? out : JSON.stringify(out)
            },
        },
    }
}
