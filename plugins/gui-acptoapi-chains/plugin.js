// freddie ↔ acptoapi chain bridge — surfaces acptoapi /v1/chains, /debug/probe-live
// through freddie's GUI API so the dashboard can manage named fallback chains
// without thebird talking directly to acptoapi.
import { getAcptoapiUrl } from '../../src/agent/acptoapi-bridge.js'
import { env } from '../../src/env.js'

function base() { return getAcptoapiUrl().replace(/\/v1\/?$/, '') }
const HDR = () => ({ 'content-type': 'application/json', authorization: 'Bearer none' })

async function fwd(url, init) {
    try {
        const r = await fetch(url, init)
        const ct = r.headers.get('content-type') || ''
        if (ct.includes('json')) return { status: r.status, json: await r.json() }
        return { status: r.status, text: await r.text() }
    } catch (e) { return { status: 502, json: { error: { message: e.message, via: url } } } }
}

export default {
    name: 'gui-acptoapi-chains', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/acptoapi/health', async (_, res) => {
            const r = await fwd(base() + '/health', { headers: HDR() })
            res.status(r.status === 502 ? 502 : 200).json(r.json || { text: r.text })
        })

        gui.route('GET', '/api/acptoapi/chains', async (_, res) => {
            const r = await fwd(base() + '/v1/chains', { headers: HDR() })
            res.status(r.status).json(r.json || {})
        })

        gui.route('POST', '/api/acptoapi/chains', async (req, res) => {
            const { name, links } = req.body || {}
            if (!name || !Array.isArray(links)) return res.status(400).json({ error: { message: 'name + links[] required' } })
            const r = await fwd(base() + '/v1/chains', {
                method: 'POST', headers: HDR(), body: JSON.stringify({ name, links }),
            })
            res.status(r.status).json(r.json || {})
        })

        gui.route('DELETE', '/api/acptoapi/chains/:name', async (req, res) => {
            const r = await fwd(base() + '/v1/chains?name=' + encodeURIComponent(req.params.name), {
                method: 'DELETE', headers: HDR(),
            })
            res.status(r.status).json(r.json || {})
        })

        gui.route('GET', '/api/acptoapi/probe', async (req, res) => {
            const force = req.query.force === '1' ? '?force=1' : ''
            const r = await fwd(base() + '/debug/probe-live' + force, { headers: HDR() })
            res.status(r.status).json(r.json || {})
        })

        gui.route('GET', '/api/acptoapi/models', async (_, res) => {
            const r = await fwd(base() + '/v1/models', { headers: HDR() })
            res.status(r.status).json(r.json || {})
        })

        gui.route('GET', '/api/acptoapi/auto-chain', async (_, res) => {
            const r = await fwd(base() + '/debug/auto-chain', { headers: HDR() })
            res.status(r.status).json(r.json || {})
        })

        // surface acptoapi config knobs freddie exposes via env
        gui.route('GET', '/api/acptoapi/config', (_, res) => {
            res.json({
                url: base(),
                model: env('FREDDIE_LLM_MODEL') || 'claude/haiku',
                envHints: {
                    FREDDIE_LLM_URL: env('FREDDIE_LLM_URL') || null,
                    FREDDIE_LLM_MODEL: env('FREDDIE_LLM_MODEL') || null,
                    ACPTOAPI_LIVE_PROBE: env('ACPTOAPI_LIVE_PROBE') || null,
                    ACPTOAPI_PROBE_CAP: env('ACPTOAPI_PROBE_CAP') || null,
                },
            })
        })
    },
}
