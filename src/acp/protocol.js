import { createMachine } from 'xstate'

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

export const CAPABILITIES = {
    name: 'freddie', version: '0.4.0',
    methods: ['initialize', 'session.new', 'session.resume', 'session.list', 'session.end', 'prompt.submit', 'tool.list', 'permission.respond', 'hooks/subscribe', 'hooks/unsubscribe', 'hooks/list', 'shutdown'],
    events: ['tool.start', 'tool.progress', 'tool.complete', 'message.delta', 'message.complete', 'permission.request', 'session.ended'],
}

// Standard Agent Client Protocol response, returned from initialize when the
// request carries a protocolVersion (Zed/JetBrains-class clients). Legacy
// freddie-ACP clients send no protocolVersion and still get CAPABILITIES.
export const ACP_INITIALIZE_RESPONSE = {
    protocolVersion: 1,
    agentInfo: { name: 'freddie', version: '0.4.0' },
    agentCapabilities: { loadSession: true, promptCapabilities: { image: false, audio: false, embeddedContext: true } },
    authMethods: [],
}

// Flatten ACP ContentBlock[] prompt params into the plain text runTurn takes.
// Text blocks dominate in practice; resource links/embedded resources degrade
// to a uri mention / their inline text rather than being dropped silently.
export function promptText(prompt) {
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
