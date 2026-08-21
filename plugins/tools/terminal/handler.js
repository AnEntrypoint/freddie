import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { getConfigValue } from '../../../src/config.js'
import { scrubEnv } from '../../../src/host/tool-resources.js'
import { listKnownEnvVars } from '../../../src/auth.js'
import { killTree } from '../../../src/tools/kill_tree.js'
import { registerProcess } from '../process_registry/handler.js'

// sessionKey -> Set<id>: lets a turn's abort listener enumerate and close
// only ITS OWN open terminal sessions, never a sibling turn's, when several
// turns share this one process-lifetime module. undefined sessionKey (a
// caller with no ctx.sessionKey) sessions are never auto-closed by any
// listener -- action:close remains the only way to end them, matching the
// pre-existing behavior for that case.
const _sessions = new Map() // id -> { child, buf, sessionKey, lastActivity }
const _bySessionKey = new Map() // sessionKey -> Set<id>

// No session may outlive its owning turn by more than this grace period, and
// no session may sit idle (no send/read) longer than this either -- a session
// opened and never explicitly closed previously ran forever with no bound at
// all (module-level Map, no cap, no sweep, no ctx.signal listener).
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
let _idleSweepTimer = null
function ensureIdleSweep() {
    if (_idleSweepTimer) return
    _idleSweepTimer = setInterval(() => {
        const now = Date.now()
        for (const [id, s] of _sessions) {
            if (now - s.lastActivity > SESSION_IDLE_TIMEOUT_MS) closeSession(id)
        }
    }, 60000)
    if (typeof _idleSweepTimer.unref === 'function') _idleSweepTimer.unref()
}

function closeSession(id) {
    const s = _sessions.get(id)
    if (!s) return false
    try { killTree(s.child.pid) } catch {}
    try { s.child.kill('SIGTERM') } catch {}
    _sessions.delete(id)
    if (s.sessionKey && _bySessionKey.has(s.sessionKey)) {
        _bySessionKey.get(s.sessionKey).delete(id)
        if (_bySessionKey.get(s.sessionKey).size === 0) _bySessionKey.delete(s.sessionKey)
    }
    return true
}

// Called from ctx.signal's abort listener (registered per-session below) --
// closes every session this specific sessionKey opened, not the whole
// process-wide _sessions Map, so an ended turn's cleanup never touches a
// sibling turn's still-live terminal.
function closeSessionsForKey(sessionKey) {
    const ids = _bySessionKey.get(sessionKey)
    if (!ids) return
    for (const id of [...ids]) closeSession(id)
}

export const _tool = ({
    name: 'terminal',
    toolset: 'core',
    schema: { name: 'terminal', description: 'Open a long-lived shell session, send input lines, capture output. Actions: open, send, read, close.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['open', 'send', 'read', 'close', 'list'] }, id: { type: 'string' }, input: { type: 'string' }, cwd: { type: 'string' } }, required: ['action'] } },
    handler: async ({ action, id, input, cwd }, ctx = {}) => {
        if (action === 'open') {
            // Fail fast at the entry boundary with the offending path still in
            // scope, rather than letting spawn() silently start the shell
            // process in whatever directory Node's own cwd-resolution falls
            // back to (Windows: the shell often just opens successfully in a
            // wrong/unintended directory instead of erroring) -- a session
            // silently rooted somewhere other than what the caller asked for
            // is a correctness bug that surfaces much later, far from its cause.
            const targetCwd = cwd || process.cwd()
            if (cwd) {
                let stat
                try { stat = fs.statSync(cwd) } catch { return { error: `terminal: cwd does not exist: ${cwd}` } }
                if (!stat.isDirectory()) return { error: `terminal: cwd is not a directory: ${cwd}` }
            }
            const sid = 'term-' + Date.now()
            const sh = process.platform === 'win32' ? 'cmd' : 'sh'
            // terminal.scrub_provider_env gates env exactly like bash/handler.js
            // -- previously this always inherited process.env unconditionally,
            // silently bypassing the config flag's whole-session intent for
            // every terminal session regardless of the setting.
            const childEnv = getConfigValue('terminal.scrub_provider_env', false)
                ? scrubEnv(process.env, listKnownEnvVars())
                : process.env
            const child = spawn(sh, [], { cwd: targetCwd, env: childEnv })
            // process_registry was always empty in practice (registerProcess
            // exported but never called by any real spawn call site) -- wiring
            // it here alongside bash/code_execution makes the process_registry
            // tool's list/kill actions reflect a live terminal session too, not
            // just one-shot bash/code_execution spawns. Best-effort: a
            // registration failure must never block the session from opening.
            try { registerProcess(sid, child, { tool: 'terminal', command: '(interactive session)', cwd: targetCwd }) } catch {}
            const buf = { stdout: '', stderr: '' }
            child.stdout?.on('data', d => buf.stdout += d.toString())
            child.stderr?.on('data', d => buf.stderr += d.toString())
            const sessionKey = ctx.sessionKey || null
            _sessions.set(sid, { child, buf, sessionKey, lastActivity: Date.now() })
            if (sessionKey) {
                if (!_bySessionKey.has(sessionKey)) _bySessionKey.set(sessionKey, new Set())
                _bySessionKey.get(sessionKey).add(sid)
            }
            // ctx.signal is the owning turn's AbortController (machine.js) --
            // without this listener, a turn that ends (aborts, times out, or
            // the process crashes) left the child process and its Map entry
            // alive indefinitely, a real handle/resource leak distinct from
            // the already-fixed bash/code_execution timeout-cleanup path.
            if (ctx.signal) {
                const onAbort = () => closeSession(sid)
                if (ctx.signal.aborted) onAbort()
                else ctx.signal.addEventListener('abort', onAbort, { once: true })
            }
            ensureIdleSweep()
            return { id: sid, opened: true }
        }
        // list needs no id -- pre-existing bug found while touching this file
        // (not introduced by this change): every OTHER action fell through to
        // the id-lookup guard below unconditionally, so 'list' (which by
        // definition doesn't target one specific session) always failed with
        // 'unknown terminal id: undefined' before ever reaching its own
        // branch. Handled before the lookup so it actually works.
        if (action === 'list') return { sessions: [..._sessions.keys()] }
        const s = _sessions.get(id)
        if (!s) return { error: 'unknown terminal id: ' + id }
        s.lastActivity = Date.now()
        if (action === 'send') { s.child.stdin?.write(input + '\n'); return { sent: true } }
        if (action === 'read') { const out = { ...s.buf }; s.buf.stdout = ''; s.buf.stderr = ''; return out }
        if (action === 'close') { closeSession(id); return { closed: id } }
        return { error: 'unknown action' }
    },
})

export { closeSessionsForKey }
