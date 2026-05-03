import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'

const SEVERITIES = { debug: 10, info: 20, warning: 30, error: 40 }

let _streams = new Map()

function streamFor(name) {
    if (_streams.has(name)) return _streams.get(name)
    const dir = path.join(getFreddieHome(), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    const s = fs.createWriteStream(path.join(dir, `${name}.log`), { flags: 'a' })
    _streams.set(name, s)
    return s
}

export function log({ subsystem = 'app', severity = 'info', msg = '', ...rest }) {
    const ts = new Date().toISOString()
    const rec = { ts, subsystem, severity, msg, ...rest }
    const line = JSON.stringify(rec) + '\n'
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
