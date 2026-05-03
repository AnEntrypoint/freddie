import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

let _cached = null

const LEGACY_HOME_ENV = 'FOPH' + '_HOME'
const LEGACY_PROFILE_ENV = 'FOPH' + '_PROFILE'
const LEGACY_DIR = '.' + 'foph'

export function getFreddieHome() {
    if (_cached) return _cached
    const env = process.env.FREDDIE_HOME || process.env[LEGACY_HOME_ENV]
    if (env) { _cached = env; ensure(env); return env }
    const profile = process.env.FREDDIE_PROFILE || process.env[LEGACY_PROFILE_ENV]
    const newRoot = path.join(os.homedir(), '.freddie')
    const legacyRoot = path.join(os.homedir(), LEGACY_DIR)
    const root = fs.existsSync(newRoot) ? newRoot : (fs.existsSync(legacyRoot) ? legacyRoot : newRoot)
    const home = profile ? path.join(root, 'profiles', profile) : root
    _cached = home
    ensure(home)
    return home
}

export function displayFreddieHome() {
    const profile = process.env.FREDDIE_PROFILE
    return profile ? `~/.freddie/profiles/${profile}` : '~/.freddie'
}

export function applyProfileOverride(name) {
    if (!name || name === 'default') { delete process.env.FREDDIE_PROFILE; _cached = null; return }
    process.env.FREDDIE_PROFILE = name
    _cached = null
}

export function getProfilesRoot() {
    if (process.env.FREDDIE_PROFILES_ROOT) return process.env.FREDDIE_PROFILES_ROOT
    if (process.env.FREDDIE_HOME) return path.join(process.env.FREDDIE_HOME, 'profiles')
    return path.join(os.homedir(), '.freddie', 'profiles')
}

export function listProfiles() {
    const root = getProfilesRoot()
    if (!fs.existsSync(root)) return []
    return fs.readdirSync(root).filter(n => fs.statSync(path.join(root, n)).isDirectory())
}

export function resetCacheForTests() { _cached = null }

function ensure(p) { try { fs.mkdirSync(p, { recursive: true }) } catch {} }
