import { listJobs, createJob, deleteJob } from '../../../src/cron/scheduler.js'
export default {
    name: 'gui-cron', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/cron', async (_, res) => res.json(await listJobs()))
        gui.route('POST', '/api/cron', async (req, res) => {
            const { cron, prompt, model = null } = req.body || {}
            if (!cron || !prompt) return res.status(400).json({ error: 'cron and prompt required' })
            try { res.json({ id: await createJob({ cron, prompt, model }) }) } catch (e) { res.status(400).json({ error: String(e.message || e) }) }
        })
        gui.route('DELETE', '/api/cron/:id', async (req, res) => {
            const id = Number(req.params.id)
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'id must be a number' })
            try { await deleteJob(id); res.json({ ok: true }) }
            catch (e) { res.status(400).json({ error: String(e.message || e) }) }
        })
    },
}
