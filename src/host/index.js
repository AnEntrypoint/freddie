import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createHost, discoverPlugins } from './host.js'
import { getFreddieHome } from '../home.js'
import { applyActiveProjectFromRegistry } from '../projects.js'
import { env } from '../env.js'

let _host = null
let _loadPromise = null

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_PLUGINS = path.resolve(__dirname, '..', '..', 'plugins')

// Every process entrypoint (bin/freddie.js, src/web/server.js, src/acp/server.js,
// src/gateway/run.js) calls bootHost() before touching a provider key, so this
// is the one place a `.env` in the invoking cwd reaches process.env for every
// downstream reader (acptoapi's own process.env.GROQ_API_KEY etc reads, pi-ai's
// findEnvKeys/getEnvApiKey). Silent no-op when no .env file exists.
dotenv.config()

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
        if (!env('FREDDIE_HOME') && !env('FREDDIE_PROFILE')) applyActiveProjectFromRegistry()
        const roots = [REPO_PLUGINS, path.join(getFreddieHome(), 'plugins'), path.join(process.cwd(), '.freddie', 'plugins'), ...extraRoots]
        const plugins = await discoverPlugins(roots)
        await h.load(plugins)
        const ccRoots = [path.join(getFreddieHome(), 'cc-plugins'), path.join(process.cwd(), '.freddie', 'cc-plugins')]
        await h.loadCcPlugins(ccRoots)
        const extra = (env('FREDDIE_EXTRA_CC_ROOTS') || '').split(path.delimiter).filter(Boolean)
        for (const r of [__dirname, process.cwd(), ...extra]) await h.loadCcFromNodeModules(r)
        return h
    })()
    return _loadPromise
}

export function resetHostForTests() { _host = null; _loadPromise = null }
