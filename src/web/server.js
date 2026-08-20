import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { bootHost } from '../host/index.js'
import { logger } from '../observability/log.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const log = logger('web_server')
const REPO_ROOT = path.resolve(__dirname, '../..')

// index.html's static fallback points the SDK at jsDelivr's @main (gh/ mode) —
// safe but caches a branch reference up to 12h (AGENTS.md's "Kit consumption
// strategy"). Serving through the dashboard, pin to the design submodule's
// actual checked-out commit instead: immutable + fast (a specific commit is
// cached forever) and it tracks whatever scripts/sync-upstream.mjs's daily
// `git submodule update --remote --checkout` last landed, no separate bump
// step. Falls back to @main (leaves index.html untouched) if the submodule
// SHA can't be read (e.g. a shallow clone without the submodule checked out).
function designSdkSha() {
    try {
        return execFileSync('git', ['ls-tree', 'HEAD', 'design'], { cwd: REPO_ROOT, encoding: 'utf8' })
            .split(/\s+/)[2]?.trim() || null
    } catch { return null }
}

// The dashboard exposes unauthenticated, sensitive surfaces (POST
// /api/terminal/exec runs arbitrary shell commands; /api/auth and
// /api/mcp/oauth/:server touch stored provider secrets) with no auth
// middleware anywhere in this file. Binding to a non-loopback address by
// default would put all of that on the network unauthenticated. Default to
// loopback-only; a caller that genuinely wants LAN/remote access passes an
// explicit host.
const DEFAULT_HOST = '127.0.0.1'

export async function createDashboard({ port = 0, host: bindHost = DEFAULT_HOST } = {}) {
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
    // index.html ships pointing the SDK at jsDelivr's @main; rewrite to the
    // design submodule's pinned commit when readable (see designSdkSha above).
    const sha = designSdkSha()
    const indexHtmlPath = path.join(__dirname, 'index.html')
    const sendIndexHtml = (res) => {
        let html = fs.readFileSync(indexHtmlPath, 'utf8')
        if (sha) html = html.replaceAll('AnEntrypoint/design@main', `AnEntrypoint/design@${sha}`)
        res.set('Cache-Control', 'no-cache').type('html').send(html)
    }
    app.get(['/', '/index.html'], (req, res) => sendIndexHtml(res))
    // Express 5 matches routes in registration order. Specific routes (app.js,
    // /api/*) must be registered BEFORE the catch-all SPA fallback below,
    // otherwise the fallback would swallow them.
    app.use(express.static(__dirname, { index: false }))
    for (const r of host.gui.routes.list()) {
        const verb = r.method.toLowerCase()
        if (typeof app[verb] === 'function') app[verb](r.path, r.handler)
    }
    const debugApi = host.gui._state.apis.get('debug')
    if (debugApi?.attach) debugApi.attach(app)

    // SPA fallback: unknown non-API GET routes serve index.html so deep links
    // (and client-side hash routes) don't return Express's default 404 HTML.
    // /api/* is excluded — that 404s legitimately as data.
    app.use((req, res, next) => {
        if (req.method !== 'GET') return next()
        if (req.path.startsWith('/api/')) return next()
        // Only serve index.html for paths that don't match any registered route
        sendIndexHtml(res)
    })
    if (bindHost !== DEFAULT_HOST) log.warn('dashboard binding to a non-loopback host with no built-in authentication', { host: bindHost })
    const { server, actualPort } = await new Promise((res, rej) => { const s = app.listen(port, bindHost, () => { const a = s.address(); res({ server: s, actualPort: a && typeof a === 'object' ? a.port : port }) }); s.once('error', rej) })

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

    const displayHost = (bindHost === '0.0.0.0' || bindHost === '::') ? '127.0.0.1' : bindHost
    return { server, port: actualPort, url: `http://${displayHost}:${actualPort}/`, stop: () => new Promise(r => server.close(() => r())) }
}
