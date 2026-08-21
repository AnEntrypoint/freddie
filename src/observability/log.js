import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
import { redactSecrets } from '../auth.js'

const SEVERITIES = { debug: 10, info: 20, warning: 30, error: 40 }

let _streams = new Map()

function streamFor(name) {
    if (_streams.has(name)) return _streams.get(name)
    const dir = path.join(getFreddieHome(), 'logs')
    try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    let s
    if (typeof fs.createWriteStream === 'function') {
        s = fs.createWriteStream(path.join(dir, `${name}.log`), { flags: 'a' })
    } else {
        // Browser fs shim without createWriteStream — fall back to console.
        s = { write(line) { try { console.log('[' + name + ']', line.trim()) } catch {} }, end() {} }
    }
    _streams.set(name, s)
    return s
}

// Every record written through this sink is redacted the same way every
// other durable-write boundary in this codebase already is (wire events,
// trajectory files, the approval classifier's LLM prompt, telemetry) --
// log.js is the one general-purpose sink every subsystem's logger() funnels
// through, so making it structurally safe here means no future call site
// needs to remember to pre-redact. redactSecrets never throws on its own
// (pure structural walk), so no best-effort guard is needed around it.
export function log({ subsystem = 'app', severity = 'info', msg = '', ...rest }) {
    const ts = new Date().toISOString()
    const redactedRest = redactSecrets(rest)
    const redactedMsg = typeof msg === 'string' ? redactSecrets(msg) : msg
    const rec = { ts, subsystem, severity, msg: redactedMsg, ...redactedRest }
    let line
    try {
        line = JSON.stringify(rec) + '\n'
    } catch (e) {
        line = JSON.stringify({ ts, subsystem, severity, msg: redactedMsg, logSerializationError: String(e?.message || e) }) + '\n'
    }
    streamFor(subsystem).write(line)
    if (SEVERITIES[severity] >= 30) streamFor('errors').write(line)
}

export function logger(subsystem) {
    return {
        debug: (msg, e = {}) => log({ subsystem, severity: 'debug', msg, ...e }),
        info: (msg, e = {}) => log({ subsystem, severity: 'info', msg, ...e }),
        warn: (msg, e = {}) => log({ subsystem, severity: 'warning', msg, ...e }),
        error: (msg, e = {}) => log({ subsystem, severity: 'error', msg, ...e }),
    }
}

export function closeAll() {
    for (const s of _streams.values()) s.end()
    _streams.clear()
}
