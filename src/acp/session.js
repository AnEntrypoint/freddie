import { createSession, appendMessage, getMessages, listSessions } from '../sessions.js'

export class AcpSessionManager {
    constructor() { this.active = new Map() }
    new(opts = {}) {
        const id = createSession({ platform: 'acp', ...opts })
        this.active.set(id, { id, created: Date.now(), opts })
        return { sessionId: id }
    }
    resume(sessionId) {
        const messages = getMessages(sessionId)
        if (!messages) return null
        this.active.set(sessionId, { id: sessionId, resumed: Date.now(), messages })
        return { sessionId, messages }
    }
    list() {
        return { sessions: listSessions(50).filter(s => s.platform === 'acp') }
    }
    end(sessionId) {
        this.active.delete(sessionId)
        return { ended: sessionId }
    }
    appendUser(sessionId, content) { appendMessage(sessionId, { role: 'user', content }) }
    appendAssistant(sessionId, content) { appendMessage(sessionId, { role: 'assistant', content }) }
    isActive(sessionId) { return this.active.has(sessionId) }
}
