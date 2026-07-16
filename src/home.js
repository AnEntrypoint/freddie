import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { env as getEnv } from './env.js'

let _cached = null

export function getFreddieHome() {
    if (_cached) return _cached
    const home_env = getEnv('FREDDIE_HOME')
    if (home_env) { _cached = home_env; ensure(home_env); return home_env }
    const profile = getEnv('FREDDIE_PROFILE')
    const root = path.join(os.homedir(), '.freddie')
    const home = profile ? path.join(root, 'profiles', profile) : root
    _cached = home
    ensure(home)
    return home
}

export function displayFreddieHome() {
    const profile = getEnv('FREDDIE_PROFILE')
    return profile ? `~/.freddie/profiles/${profile}` : '~/.freddie'
}

export function applyProfileOverride(name) {
    if (!name || name === 'default') { delete process.env.FREDDIE_PROFILE; _cached = null; return }
    process.env.FREDDIE_PROFILE = name
    _cached = null
}

export function applyHomeOverride(absPath) {
    if (!absPath) { delete process.env.FREDDIE_HOME; _cached = null; return }
    process.env.FREDDIE_HOME = absPath
    _cached = null
    ensure(absPath)
}

export function getProfilesRoot() {
    if (getEnv('FREDDIE_PROFILES_ROOT')) return getEnv('FREDDIE_PROFILES_ROOT')
    if (getEnv('FREDDIE_HOME')) return path.join(getEnv('FREDDIE_HOME'), 'profiles')
    return path.join(os.homedir(), '.freddie', 'profiles')
}

export function listProfiles() {
    const root = getProfilesRoot()
    if (!fs.existsSync(root)) return []
    return fs.readdirSync(root).filter(n => fs.statSync(path.join(root, n)).isDirectory())
}

export function resetCacheForTests() { _cached = null }

function ensure(p) { try { fs.mkdirSync(p, { recursive: true }) } catch {} }
