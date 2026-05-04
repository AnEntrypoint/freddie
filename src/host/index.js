import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHost, discoverPlugins } from './host.js'
import { getFreddieHome } from '../home.js'

let _host = null
let _loaded = false

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_PLUGINS = path.resolve(__dirname, '..', '..', 'plugins')

export function host() {
    if (!_host) _host = createHost({ surfaces: ['pi', 'gui'] })
    return _host
}

export async function bootHost(extraRoots = []) {
    const h = host()
    if (_loaded) return h
    _loaded = true
    const roots = [REPO_PLUGINS, path.join(getFreddieHome(), 'plugins'), path.join(process.cwd(), '.freddie', 'plugins'), ...extraRoots]
    const plugins = await discoverPlugins(roots)
    await h.load(plugins)
    const ccRoots = [path.join(getFreddieHome(), 'cc-plugins'), path.join(process.cwd(), '.freddie', 'cc-plugins')]
    await h.loadCcPlugins(ccRoots)
    const extra = (process.env.FREDDIE_EXTRA_CC_ROOTS || '').split(path.delimiter).filter(Boolean)
    for (const r of [__dirname, process.cwd(), ...extra]) await h.loadCcFromNodeModules(r)
    return h
}

export function resetHostForTests() { _host = null; _loaded = false }
