import { listAllProfiles } from '../../src/commands/profile.js'
import { COMMAND_REGISTRY } from '../../src/commands/registry.js'
import { getFreddieHome } from '../../src/home.js'
export default {
    name: 'gui-profiles-commands-health', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/profiles', (_, res) => res.json(listAllProfiles()))
        gui.route('GET', '/api/commands', (_, res) => res.json(COMMAND_REGISTRY))
        gui.route('GET', '/api/health', (_, res) => res.json({ ok: true, ts: Date.now(), freddie_home: getFreddieHome() }))
    },
}
