import path from 'node:path'
import fs from 'node:fs'
import { listDebug, snapshotAll, attachDebugRoutes } from '../../../src/observability/debug.js'
import { getFreddieHome } from '../../../src/home.js'
export default {
    name: 'gui-debug', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/debug', (_, res) => res.json(listDebug()))
        gui.route('GET', '/api/debug-all', (_, res) => res.json(snapshotAll()))
        gui.route('GET', '/api/logs', (_, res) => {
            const dir = path.join(getFreddieHome(), 'logs')
            if (!fs.existsSync(dir)) return res.json([])
            res.json(fs.readdirSync(dir).filter(f => f.endsWith('.log')).map(f => f.replace(/\.log$/, '')))
        })
        gui.route('GET', '/api/logs/:subsystem', (req, res) => {
            // subsystem is a log-filename stem (see src/observability/log.js) --
            // reject traversal/absolute segments before joining, or a value like
            // '../../auth/anthropic' could read any '.log'-suffixed path outside
            // <FREDDIE_HOME>/logs.
            const subsystem = String(req.params.subsystem || '')
            if (!/^[a-zA-Z0-9_-]+$/.test(subsystem)) return res.status(400).json({ error: 'invalid subsystem name' })
            const file = path.join(getFreddieHome(), 'logs', subsystem + '.log')
            if (!fs.existsSync(file)) return res.json([])
            const max = Number(req.query.max) || 200
            let lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return { raw: l } } })
            if (req.query.severity) lines = lines.filter(l => l.severity === req.query.severity)
            res.json(lines.slice(-max))
        })
        gui.api('debug', { attach: attachDebugRoutes })
    },
}
