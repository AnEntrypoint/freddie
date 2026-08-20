import { notificationManager } from '../../../src/agent/notifications.js'

export default {
    name: 'gui-notifications',
    surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/notifications', async (_, res) => {
            res.json(notificationManager.getAll())
        })
        gui.route('POST', '/api/notifications/dismiss-all', async (_, res) => {
            notificationManager.dismissAll()
            res.json({ ok: true })
        })
        gui.route('POST', '/api/notifications/:id/dismiss', async (req, res) => {
            const ok = notificationManager.dismiss(req.params.id)
            if (!ok) return res.status(404).json({ error: 'notification not found' })
            res.json({ ok: true })
        })
    },
}