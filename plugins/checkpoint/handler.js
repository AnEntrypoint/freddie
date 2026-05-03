import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../src/home.js'
function dir() { const d = path.join(getFreddieHome(), 'checkpoints'); fs.mkdirSync(d, { recursive: true }); return d }

const ACTIONS = {
    save: ({ name, data }) => {
        if (!name) return { error: 'name required' }
        const p = path.join(dir(), name + '.json')
        fs.writeFileSync(p, JSON.stringify(data || {}, null, 2), 'utf8')
        return { saved: p }
    },
    load: ({ name }) => {
        const p = path.join(dir(), name + '.json')
        if (!fs.existsSync(p)) return { error: 'not found' }
        return { data: JSON.parse(fs.readFileSync(p, 'utf8')) }
    },
    list: () => ({ items: fs.readdirSync(dir()).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')) }),
    delete: ({ name }) => { const p = path.join(dir(), name + '.json'); if (fs.existsSync(p)) fs.unlinkSync(p); return { deleted: name } },
}

export const _tool = ({
    name: 'checkpoint',
    toolset: 'core',
    schema: { name: 'checkpoint', description: 'Save/load/list/delete named JSON checkpoints under ~/.freddie/checkpoints.', parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, name: { type: 'string' }, data: {} }, required: ['action'] } },
    handler: async (args) => { const fn = ACTIONS[args.action]; return fn ? fn(args) : { error: 'unknown action' } },
})
