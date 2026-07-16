import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getFreddieHome } from '../home.js'
const _require = createRequire(import.meta.url)
const CHECKS = [
    { name: 'freddie-home', run: () => fs.existsSync(getFreddieHome()) ? { ok: true } : { ok: false, fix: 'mkdir -p ' + getFreddieHome() } },
    { name: 'node-version', run: () => { const v = process.versions.node; const major = Number(v.split('.')[0]); return major >= 20 ? { ok: true, value: v } : { ok: false, fix: 'install node >=20', value: v } } },
    { name: '@libsql/client', run: () => { try { _require.resolve('@libsql/client'); return { ok: true } } catch { return { ok: false, fix: 'npm install' } } } },
    { name: 'gh-cli', run: () => { const r = spawnSync('gh', ['--version'], { encoding: 'utf8' }); return r.status === 0 ? { ok: true, value: r.stdout.split('\n')[0] } : { ok: false, fix: 'install gh CLI' } } },
    { name: 'git', run: () => { const r = spawnSync('git', ['--version'], { encoding: 'utf8' }); return r.status === 0 ? { ok: true, value: r.stdout.trim() } : { ok: false, fix: 'install git' } } },
    { name: 'config-file', run: () => { const p = path.join(getFreddieHome(), 'config.yaml'); return fs.existsSync(p) ? { ok: true } : { ok: false, fix: 'freddie setup' } } },
    { name: 'acptoapi', run: async () => {
        const { isReachable, getAcptoapiUrl } = await import('../agent/acptoapi-bridge.js')
        const url = getAcptoapiUrl()
        // isReachable's own default (10000ms) is tuned for a per-turn caller; doctor
        // is a one-shot manual preflight, so it can afford the same generous window
        // real-chain fallback probing has been witnessed to need (multiple provider
        // hops before landing on a live one) -- 15000ms avoids a false-negative
        // report on a slow-but-working chain.
        const ok = await isReachable(15000)
        return ok ? { ok: true, value: url || 'in-process' } : { ok: false, fix: 'check FREDDIE_LLM_URL / provider keys / acptoapi config', value: url || 'in-process' }
    } },
    { name: 'design-version', run: () => {
        // Additive, warn-only: never fails the doctor run. Compares the installed
        // anentrypoint-design's own package.json version against the range freddie's
        // own package.json declares -- a plain informational mismatch surface, not a gate.
        try {
            const declared = _require('../../package.json').dependencies?.['anentrypoint-design']
            const installedPkg = _require.resolve('anentrypoint-design/package.json')
            const installed = JSON.parse(fs.readFileSync(installedPkg, 'utf8')).version
            if (!declared || !installed) return { ok: true, value: 'unavailable' }
            const pinned = declared !== 'latest' && !declared.startsWith('*')
            // 'latest'/'*' always reads as matching (nothing to compare against); a
            // pinned semver range that looks like it does not textually match the
            // installed version is surfaced as a value note, still ok:true (warn).
            const mismatch = pinned && !installed.startsWith(declared.replace(/^[\^~]/, ''))
            return { ok: true, value: mismatch ? `declared ${declared} vs installed ${installed} (mismatch)` : `${installed} (declared ${declared})` }
        } catch (e) { return { ok: true, value: 'unavailable: ' + String(e.message || e) } }
    } },
]

const PLUGINS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins')

// Enumerate every memory-*/platform-* plugin's handler.js, find its single
// exported adapter/memory class (the shape every such handler.js follows --
// see plugins/*/plugin.js which registers `module` wholesale), instantiate it
// (constructors are side-effect-free: they only read process.env, never touch
// the network) and call getRequiredEnv() when present. A handler.js with no
// class export (a helper module like platform-*_crypto/_network/_proto) has
// nothing to check and is silently skipped.
async function pluginEnvChecks() {
    let dirs = []
    try { dirs = fs.readdirSync(PLUGINS_ROOT).filter(d => d.startsWith('memory-') || d.startsWith('platform-')) }
    catch { return [] }
    const rows = []
    for (const d of dirs) {
        const handlerPath = path.join(PLUGINS_ROOT, d, 'handler.js')
        if (!fs.existsSync(handlerPath)) continue
        try {
            const mod = await import(pathToFileURL(handlerPath).href)
            const ClassExport = Object.values(mod).find(v => typeof v === 'function' && v.prototype && typeof v.prototype.getRequiredEnv === 'function')
            if (!ClassExport) continue   // helper module, nothing plugin-shaped to check
            const instance = new ClassExport()
            const required = instance.getRequiredEnv()
            if (!Array.isArray(required) || !required.length) continue
            const missing = required.filter(k => !process.env[k])
            // Fully unconfigured (none of its env vars set) reads as simply not in
            // use -- silent, matching doctor's existing "only report what's actionable"
            // style. Partially configured (some set, some missing) is the actionable
            // signal: the operator clearly intended to enable this plugin.
            if (missing.length && missing.length < required.length) {
                rows.push({ name: 'plugin:' + d, ok: false, fix: 'set ' + missing.join(', ') })
            } else if (!missing.length) {
                rows.push({ name: 'plugin:' + d, ok: true })
            }
        } catch { /* handler.js failed to import -- not this check's concern, skip */ }
    }
    return rows
}

export async function runDoctor() {
    const base = []
    for (const c of CHECKS) {
        try { base.push({ name: c.name, ...(await c.run()) }) }
        catch (e) { base.push({ name: c.name, ok: false, error: String(e.message || e) }) }
    }
    const plugins = await pluginEnvChecks().catch(() => [])
    return [...base, ...plugins]
}
