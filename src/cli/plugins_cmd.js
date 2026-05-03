import { listPluginsInstalled, listHooks, listCliCommands } from './plugins.js'
import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
export async function pluginsSubcommand(action = 'list', { name, body } = {}) {
    if (action === 'list') return { plugins: await listPluginsInstalled(), hooks: listHooks(), cliCommands: listCliCommands().length }
    if (action === 'install') {
        if (!name || !body) return { error: 'name + body required' }
        const dir = path.join(getFreddieHome(), 'plugins', name)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, main: 'index.js' }, null, 2))
        fs.writeFileSync(path.join(dir, 'index.js'), body, 'utf8')
        return { installed: dir }
    }
    if (action === 'uninstall') {
        const dir = path.join(getFreddieHome(), 'plugins', name)
        if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); return { uninstalled: name } }
        return { error: 'not found' }
    }
    return { error: 'unknown action' }
}
