import { runTurn } from '../../src/agent/machine.js'
export default {
    name: 'gui-chat', surfaces: 'gui',
    register({ gui }) {
        gui.route('POST', '/api/chat', async (req, res) => {
            const { prompt, sessionId = null, cwd, skill } = req.body || {}
            if (!prompt) return res.status(400).json({ error: 'prompt required' })
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')
            const send = (event, data) => res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n')
            send('start', { ts: Date.now(), sessionId })
            try {
                const out = await runTurn({ prompt, timeoutMs: 120000, cwd, skill })
                if (out.error) { send('error', { error: out.error }); res.end(); return }
                for (const m of out.messages) send('message', m)
                send('done', { result: out.result || '', iterations: out.iterations })
            } catch (e) { send('error', { error: String(e.message || e) }) }
            res.end()
        })
    },
}
