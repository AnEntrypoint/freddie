import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHost, discoverPlugins } from './host.js'
import { getFreddieHome } from '../home.js'
import { applyActiveProjectFromRegistry } from '../projects.js'

let _host = null
let _loadPromise = null

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_PLUGINS = path.resolve(__dirname, '..', '..', 'plugins')

export function host() {
    if (!_host) _host = createHost({ surfaces: ['pi', 'gui'] })
    return _host
}

export async function bootHost(extraRoots = []) {
    // Memoize the IN-FLIGHT promise, not a boolean flag: a boolean set true
    // before the awaits below complete let concurrent callers observe a
    // partially-loaded host. Returning the same promise means every caller
    // (including ones that arrive mid-load) awaits the exact same completion.
    if (_loadPromise) return _loadPromise
    _loadPromise = (async () => {
        const h = host()
        if (!process.env.FREDDIE_HOME && !process.env.FREDDIE_PROFILE) applyActiveProjectFromRegistry()
        const roots = [REPO_PLUGINS, path.join(getFreddieHome(), 'plugins'), path.join(process.cwd(), '.freddie', 'plugins'), ...extraRoots]
        const plugins = await discoverPlugins(roots)
        await h.load(plugins)
        const ccRoots = [path.join(getFreddieHome(), 'cc-plugins'), path.join(process.cwd(), '.freddie', 'cc-plugins')]
        await h.loadCcPlugins(ccRoots)
        const extra = (process.env.FREDDIE_EXTRA_CC_ROOTS || '').split(path.delimiter).filter(Boolean)
        for (const r of [__dirname, process.cwd(), ...extra]) await h.loadCcFromNodeModules(r)
        return h
    })()
    return _loadPromise
}

export function resetHostForTests() { _host = null; _loadPromise = null }
