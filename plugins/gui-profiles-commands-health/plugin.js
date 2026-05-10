import { listAllProfiles } from '../../src/commands/profile.js'
import { COMMAND_REGISTRY } from '../../src/commands/registry.js'
import { getFreddieHome } from '../../src/home.js'
import { PROVIDER_KEYS, DEFAULTS } from '../../src/agent/llm_resolver.js'
import { getStatus } from '../../src/agent/model-sampler.js'
export default {
    name: 'gui-profiles-commands-health', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/profiles', (_, res) => res.json(listAllProfiles()))
        gui.route('GET', '/api/commands', (_, res) => res.json(COMMAND_REGISTRY))
        gui.route('GET', '/api/health', (_, res) => res.json({ ok: true, ts: Date.now(), freddie_home: getFreddieHome() }))
        gui.route('GET', '/api/providers', (_, res) => {
            const status = getStatus()
            const providers = Object.keys(PROVIDER_KEYS).map(name => {
                const envKey = PROVIDER_KEYS[name]
                const configured = !!(envKey && process.env[envKey])
                const s = status.find(x => x.provider === name)
                const available = configured && (s ? s.ok !== false : true)
                return { name, configured, available, defaultModel: DEFAULTS[name] || '' }
            })
            res.json(providers)
        })
    },
}
