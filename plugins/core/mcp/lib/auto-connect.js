// Generic MCP server auto-connect for freddie.
//
// freddie never special-cases any particular MCP server (gm included) in code.
// Instead it auto-connects servers declared in two host-agnostic places at
// session start:
//
//   1. freddie config `mcp.servers` — richer shape that may carry an optional
//      one-time `install` step (run before first connect if `installCheck`
//      reports the server is not yet built/installed), so a server that ships
//      without its deps present (e.g. a vendored MCP server with its own
//      package.json) is made runnable on demand.
//   2. the standard `.mcp.json` files at the project root and freddie home
//      (`{ mcpServers: { name: { command, args, cwd } } }`) — the same format
//      `add-mcp` and other agent hosts write, so a server registered for one
//      host is picked up by freddie without gm/freddie-specific wiring.
//
// Best-effort by design: every failure (missing server, failed install, spawn
// error) is logged and skipped, never thrown into the session-start path.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { isMcpConnected, connectMcpServer } from './tool.js'
import { logger } from '../../../../src/observability/log.js'
import { loadConfig } from '../../../../src/config.js'
import { getFreddieHome } from '../../../../src/home.js'

const log = logger('mcp-autoconnect')

// Bound a one-time install so a missing/offline server can never hang a turn.
const INSTALL_TIMEOUT_MS = 180_000

let _ensuring = null

function exists(p) {
    try { return !!p && fs.existsSync(p) } catch { return false }
}

function runInstall(install, cwd) {
    return new Promise((resolve) => {
        const cmd = install.command
        const args = Array.isArray(install.args) ? install.args : []
        if (!cmd) return resolve({ ok: false, error: 'install.command required' })
        const child = spawn(cmd, args, {
            cwd: install.cwd || cwd || process.cwd(),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: INSTALL_TIMEOUT_MS,
        })
        let stderr = ''
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('error', (err) => resolve({ ok: false, error: err.message }))
        child.on('close', (code) => {
            if (code === 0) resolve({ ok: true })
            else resolve({ ok: false, error: `install exited ${code}: ${(stderr || '').trim().slice(-500)}` })
        })
    })
}

/** Discover MCP servers from freddie config + standard .mcp.json files. */
export function discoverMcpServers() {
    const servers = []

    const cfg = loadConfig()
    for (const s of (cfg?.mcp?.servers || [])) {
        if (s?.id && s?.command) servers.push(s)
    }

    const roots = [
        path.join(process.cwd(), '.mcp.json'),
        path.join(getFreddieHome(), '.mcp.json'),
    ]
    for (const file of roots) {
        if (!exists(file)) continue
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
            const defs = raw?.mcpServers || {}
            for (const [name, def] of Object.entries(defs)) {
                if (def?.command) servers.push({ id: name, command: def.command, args: def.args || [], cwd: def.cwd })
            }
        } catch (e) {
            log.warn('failed to read mcp config', { file, error: e.message })
        }
    }

    // De-dupe by id, keeping the first declaration.
    const seen = new Set()
    return servers.filter((s) => (seen.has(s.id) ? false : seen.add(s.id)))
}

/**
 * Connect every discovered MCP server, running an optional install step first
 * if its `installCheck` path is absent. Idempotent — already-connected servers
 * are skipped. Concurrent callers share one in-flight pass.
 */
export async function autoConnectMcpServers() {
    if (_ensuring) return _ensuring
    _ensuring = (async () => {
        const results = []
        for (const s of discoverMcpServers()) {
            if (isMcpConnected(s.id)) { results.push({ id: s.id, status: 'connected' }); continue }
            try {
                if (s.install) {
                    const check = s.installCheck ? path.resolve(s.cwd || process.cwd(), s.installCheck) : null
                    if (!check || !exists(check)) {
                        log.info('installing mcp server deps', { id: s.id })
                        const r = await runInstall(s.install, s.cwd)
                        if (!r.ok) { log.error('mcp server install failed; skipping', { id: s.id, error: r.error }); results.push({ id: s.id, status: 'install_failed' }); continue }
                    }
                }
                const r = await connectMcpServer({ command: s.command, args: s.args || [], id: s.id })
                if (r.error) { log.error('mcp server connect failed', { id: s.id, error: r.error }); results.push({ id: s.id, status: 'connect_failed' }) }
                else results.push({ id: s.id, status: 'connected' })
            } catch (e) {
                log.error('mcp server auto-connect threw', { id: s.id, error: e.message })
                results.push({ id: s.id, status: 'error' })
            }
        }
        return results
    })()
    try {
        return await _ensuring
    } finally {
        _ensuring = null
    }
}
