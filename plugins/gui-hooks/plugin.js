/**
 * gui-hooks — Dashboard routes for wire hook subscription management.
 *
 * Routes:
 *   GET  /api/hooks/subscriptions      — list active wire hook subscriptions
 *   POST /api/hooks/subscribe          — subscribe to a hook event
 *   DELETE /api/hooks/subscribe/:id    — unsubscribe by subscription id
 *
 * The wire hook bridge is a pure in-memory singleton; this plugin exposes
 * its state through the dashboard HTTP API.
 */
import { wireHookBridge } from '../../src/agent/wire_hooks.js'

export default {
    name: 'gui-hooks',
    surfaces: 'gui',
    register({ gui }) {
        // List active wire hook subscriptions
        gui.route('GET', '/api/hooks/subscriptions', (_req, res) => {
            res.json({ subscriptions: wireHookBridge.listSubscriptions() })
        })

        // Subscribe to a hook event. Body: { eventName, timeout? }
        gui.route('POST', '/api/hooks/subscribe', (req, res) => {
            const { eventName, timeout } = req.body || {}
            if (!eventName) return res.status(400).json({ error: 'eventName is required' })
            try {
                const id = wireHookBridge.subscribe(eventName, async () => ({ decision: 'allow' }), { timeout })
                res.json({ ok: true, id, eventName })
            } catch (e) {
                res.status(400).json({ error: e.message })
            }
        })

        // Unsubscribe from a hook event. Query: ?eventName=...&id=...
        gui.route('DELETE', '/api/hooks/subscribe/:id', (req, res) => {
            const { id } = req.params
            const { eventName } = req.query || {}
            if (!id || !eventName) return res.status(400).json({ error: 'eventName query param and id path param are required' })
            const ok = wireHookBridge.unsubscribe(eventName, id)
            res.json({ ok })
        })
    },
}