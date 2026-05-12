import { discoverAndPersist, listKnownProviders } from '../../src/agent/model-discovery.js'
import { PROVIDER_KEYS, DEFAULTS } from '../../src/agent/llm_resolver.js'
import { getConfigValue, saveConfigValue } from '../../src/config.js'
import { getStatus } from '../../src/agent/model-sampler.js'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const MATRIX_PATH = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..', '..', '.gm', 'model-availability.json')
let _rebuildInFlight = null

export default {
    name: 'gui-models-discover', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/models/providers', (_, res) => res.json({ providers: listKnownProviders(), keys: PROVIDER_KEYS, defaults: DEFAULTS }))
        gui.route('GET', '/api/models/cached', (_, res) => res.json(getConfigValue('agent.discovered_models', {}) || {}))
        gui.route('POST', '/api/models/discover', async (req, res) => {
            try { const provider = req.body?.provider; const result = await discoverAndPersist({ provider }); res.json(result) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
        gui.route('GET', '/api/models/queues', (_, res) => res.json(getConfigValue('agent.model_queues', {}) || {}))
        gui.route('POST', '/api/models/queues', (req, res) => {
            const { name, entries } = req.body || {}
            if (!name || !Array.isArray(entries)) return res.status(400).json({ error: 'name and entries[] required' })
            const queues = getConfigValue('agent.model_queues', {}) || {}
            queues[name] = entries
            saveConfigValue('agent.model_queues', queues)
            res.json({ name, entries })
        })
        gui.route('DELETE', '/api/models/queues/:name', (req, res) => {
            const queues = getConfigValue('agent.model_queues', {}) || {}
            delete queues[req.params.name]
            saveConfigValue('agent.model_queues', queues)
            res.json({ ok: true })
        })
        gui.route('GET', '/api/models/sampler', (_, res) => res.json({ status: getStatus() }))
        gui.route('GET', '/api/models/availability', (_, res) => {
            if (!fs.existsSync(MATRIX_PATH)) return res.status(404).json({ error: 'not_found', hint: 'run: node scripts/build-model-availability.js' })
            try { res.json(JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'))) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
        gui.route('GET', '/api/models/availability/summary', (_, res) => {
            if (!fs.existsSync(MATRIX_PATH)) return res.status(404).json({ error: 'not_found' })
            try { const j = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')); res.json({ timestamp: j.timestamp, daemons: j.daemons, summary: j.summary }) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
        gui.route('POST', '/api/models/availability/rebuild', (_, res) => {
            if (_rebuildInFlight && !_rebuildInFlight.killed) return res.status(409).json({ error: 'rebuild_in_progress', pid: _rebuildInFlight.pid })
            const script = path.resolve(path.dirname(MATRIX_PATH), '..', 'scripts', 'build-model-availability.js')
            _rebuildInFlight = spawn(process.execPath, [script], { detached: true, stdio: 'ignore', cwd: path.dirname(path.dirname(MATRIX_PATH)) })
            _rebuildInFlight.unref()
            res.status(202).json({ ok: true, pid: _rebuildInFlight.pid, jobId: String(Date.now()) })
        })
    },
}
