import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { bootHost } from '../host/index.js'
import { logger } from '../observability/log.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const log = logger('web_server')

// Resolve the real hashed SDK bundle filenames (247420.js / 247420.css today).
// index.html pins stable aliases (sdk.js / sdk.css); we map them to whatever
// hashed file is actually present so a version bump can't 404 silently.
function resolveSdkBundle(distDir) {
    let js = '247420.js', css = '247420.css'
    try {
        const files = fs.readdirSync(distDir)
        const jsHit = files.find(f => /^247420.*\.js$/.test(f))
        const cssHit = files.find(f => /^247420.*\.css$/.test(f))
        if (jsHit) js = jsHit
        if (cssHit) css = cssHit
        if (!jsHit || !cssHit) console.error(`[dashboard] SDK bundle missing in ${distDir} (js=${jsHit || 'NONE'}, css=${cssHit || 'NONE'}) — dashboard will fail to mount. Run: node scripts/build.mjs in anentrypoint-design`)
    } catch (e) {
        console.error(`[dashboard] cannot read SDK dist dir ${distDir}: ${e.message}`)
    }
    return { js, css }
}

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
    const fromNodeModules = path.join(__dirname, '..', '..', 'node_modules', 'anentrypoint-design', 'dist')
    const sdk = resolveSdkBundle(fromNodeModules)

    // Stable aliases -> real hashed bundle. Immutable cache (hashed content).
    const sendImmutable = file => (req, res) => res.set('Cache-Control', 'public, max-age=31536000, immutable').sendFile(path.join(fromNodeModules, file))
    app.get('/vendor/anentrypoint-design/sdk.js', sendImmutable(sdk.js))
    app.get('/vendor/anentrypoint-design/sdk.css', sendImmutable(sdk.css))

    // index.html / app.js are mutable entry points — never cache.
    app.use((req, res, next) => {
        if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html' || req.path === '/app.js')) {
            res.set('Cache-Control', 'no-cache')
        }
        next()
    })
    app.use(express.static(__dirname))
    app.use('/vendor/anentrypoint-design', express.static(fromNodeModules))
    const nmKitsOs = path.join(__dirname, '..', '..', 'node_modules', 'anentrypoint-design', 'src', 'kits', 'os')
    app.use('/vendor/anentrypoint-design/kits/os', express.static(nmKitsOs))
    for (const r of host.gui.routes.list()) {
        const verb = r.method.toLowerCase()
        if (typeof app[verb] === 'function') app[verb](r.path, r.handler)
    }
    const debugApi = host.gui._state.apis.get('debug')
    if (debugApi?.attach) debugApi.attach(app)

    // SPA fallback: unknown non-API GET routes serve index.html so deep links
    // (and client-side hash routes) don't return Express's default 404 HTML.
    // /api/* and /vendor/* are excluded — those 404 legitimately as data/assets.
    app.get(/.*/, (req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/vendor/')) return next()
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
