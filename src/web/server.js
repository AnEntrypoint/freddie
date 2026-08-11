import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { bootHost } from '../host/index.js'
import { logger } from '../observability/log.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const log = logger('web_server')

export async function createDashboard({ port = 0 } = {}) {
    const host = await bootHost()
    // Rehydrate any interrupted machines (agent turns, batches) from their
    // persisted snapshots; surface lifecycle markers. Non-blocking on failure.
    try { const { resumeAll } = await import('../machines/resume.js'); await resumeAll() } catch (e) { log.warn('resumeAll failed during gateway boot', { err: String(e) }) }
    const app = express()
    app.use(express.json())
    // Baseline security headers for the local dashboard. No CSP (the SDK uses
    // inline styles/SVG); these are the cheap, no-false-positive defaults.
    app.use((req, res, next) => {
        res.set('X-Content-Type-Options', 'nosniff')
        res.set('X-Frame-Options', 'SAMEORIGIN')
        res.set('Referrer-Policy', 'same-origin')
        next()
    })
    // index.html / app.js are mutable entry points — never cache.
    app.use((req, res, next) => {
        if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html' || req.path === '/app.js')) {
            res.set('Cache-Control', 'no-cache')
        }
        next()
    })
    // Express 5 matches routes in registration order. Specific routes (app.js,
    // /api/*) must be registered BEFORE the catch-all SPA fallback below,
    // otherwise the fallback would swallow them.
    app.use(express.static(__dirname))
    for (const r of host.gui.routes.list()) {
        const verb = r.method.toLowerCase()
        if (typeof app[verb] === 'function') app[verb](r.path, r.handler)
    }
    const debugApi = host.gui._state.apis.get('debug')
    if (debugApi?.attach) debugApi.attach(app)

    // SPA fallback: unknown non-API GET routes serve index.html so deep links
    // (and client-side hash routes) don't return Express's default 404 HTML.
    // /api/* is excluded — that 404s legitimately as data. The SDK itself is
    // no longer served locally: index.html loads it live from
    // cdn.jsdelivr.net/gh/AnEntrypoint/design@main so the dashboard always
    // tracks the newest commit on main without a local npm install.
    app.use((req, res, next) => {
        if (req.method !== 'GET') return next()
        if (req.path.startsWith('/api/')) return next()
        // Only serve index.html for paths that don't match any registered route
        res.set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, 'index.html'))
    })
    const { server, actualPort } = await new Promise((res, rej) => { const s = app.listen(port, () => { const a = s.address(); res({ server: s, actualPort: a && typeof a === 'object' ? a.port : port }) }); s.once('error', rej) })

    // Raw WebSocket upgrade routes (host.gui.wsRoute) -- ws in noServer mode,
    // matched by exact pathname against the real http.Server's 'upgrade'
    // event. Unmatched paths get their socket destroyed rather than hanging.
    const wsRoutes = host.gui._state.wsRoutes
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, socket, head) => {
        const pathname = new URL(req.url, 'http://internal').pathname
        const onConnection = wsRoutes.get(pathname)
        if (!onConnection) { socket.destroy(); return }
        wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, req))
    })

    return { server, port: actualPort, url: `http://127.0.0.1:${actualPort}/`, stop: () => new Promise(r => server.close(() => r())) }
}
