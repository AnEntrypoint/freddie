import { runTurn } from '../../src/agent/machine.js'
import { createSession } from '../../src/sessions.js'
export default {
    name: 'gui-chat', surfaces: 'gui',
    register({ gui }) {
        gui.route('POST', '/api/chat', async (req, res) => {
            const { prompt, sessionId: incomingSessionId = null, cwd, skill, provider, model } = req.body || {}
            if (!prompt) return res.status(400).json({ error: 'prompt required' })
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')
            const send = (event, data) => res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n')
            let sessionId = incomingSessionId
            if (!sessionId) {
                try {
                    sessionId = await createSession({ platform: 'web', title: prompt.slice(0, 80), cwd: cwd || null, skill: skill || null, model: model || null })
                } catch (_) { sessionId = null }
            }
            send('start', { ts: Date.now(), sessionId })
            try {
                const out = await runTurn({ prompt, timeoutMs: 120000, cwd, skill, provider, model })
                if (out.error) { send('error', { error: out.error }); res.end(); return }
                for (const m of out.messages) send('message', m)
                send('done', { result: out.result || '', iterations: out.iterations, sessionId })
            } catch (e) { send('error', { error: String(e.message || e) }) }
            res.end()
        })
    },
}
