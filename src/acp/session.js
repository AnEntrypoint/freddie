import { createSession, appendMessage, getMessages, listSessions } from '../sessions.js'

export class AcpSessionManager {
    constructor() { this.active = new Map() }
    async new(opts = {}) {
        const id = await createSession({ platform: 'acp', ...opts })
        this.active.set(id, { id, created: Date.now(), opts })
        return { sessionId: id }
    }
    async resume(sessionId) {
        const messages = await getMessages(sessionId)
        if (!messages) return null
        this.active.set(sessionId, { id: sessionId, resumed: Date.now(), messages })
        return { sessionId, messages }
    }
    async list() {
        return { sessions: (await listSessions(50)).filter(s => s.platform === 'acp') }
    }
    end(sessionId) {
        this.active.delete(sessionId)
        return { ended: sessionId }
    }
    async appendUser(sessionId, content) { await appendMessage(sessionId, { role: 'user', content }) }
    async appendAssistant(sessionId, content) { await appendMessage(sessionId, { role: 'assistant', content }) }
    isActive(sessionId) { return this.active.has(sessionId) }
}
