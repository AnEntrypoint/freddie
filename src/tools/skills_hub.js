import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
import { registry } from './registry.js'

const HUB_INDEX_URL = 'https://raw.githubusercontent.com/AnEntrypoint/freddie-skills/main/index.json'

const ACTIONS = {
    catalog: async () => {
        try { const r = await fetch(HUB_INDEX_URL); if (!r.ok) return { items: [], error: 'fetch ' + r.status }; return { items: await r.json() } }
        catch (e) { return { items: [], error: String(e.message || e) } }
    },
    install: async ({ name, body }) => {
        if (!name || !body) return { error: 'name + body required' }
        const dir = path.join(getFreddieHome(), 'skills', name)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf8')
        return { installed: dir }
    },
    uninstall: async ({ name }) => {
        const dir = path.join(getFreddieHome(), 'skills', name)
        if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); return { uninstalled: name } }
        return { error: 'not found' }
    },
}
registry.register({
    name: 'skills_hub',
    toolset: 'core',
    schema: { name: 'skills_hub', description: 'Browse and install community skills.', parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, name: { type: 'string' }, body: { type: 'string' } }, required: ['action'] } },
    handler: async (a) => { const fn = ACTIONS[a.action]; return fn ? await fn(a) : { error: 'unknown action' } },
})
