import express from 'express'
let _server = null
const _routes = new Map()
export async function startWebhookListener({ port = 0, path = '/webhook' } = {}) {
    if (_server) return _server
    const app = express(); app.use(express.json())
    app.post(path, (req, res) => { for (const fn of _routes.values()) try { fn(req.body) } catch {} res.json({ ok: true }) })
    _server = await new Promise(r => { const s = app.listen(port, () => r(s)) })
    return { port: _server.address().port, path }
}
export function onWebhook(name, fn) { _routes.set(name, fn); return () => _routes.delete(name) }
export async function stopWebhookListener() { if (_server) await new Promise(r => _server.close(() => r())); _server = null; _routes.clear() }
