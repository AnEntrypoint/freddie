import { runBatch } from '../../src/batch.js'
export default {
    name: 'gui-batch', surfaces: 'gui',
    register({ gui }) {
        gui.route('POST', '/api/batch', async (req, res) => {
            const { prompts = [], concurrency = 4, model = '' } = req.body || {}
            if (!prompts.length) return res.status(400).json({ error: 'prompts required' })
            try { res.json(await runBatch({ prompts, concurrency, model })) } catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
    },
}
