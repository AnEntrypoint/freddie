import fs from 'node:fs'
import path from 'node:path'
import { getProfilesRoot, listProfiles, applyProfileOverride } from '../home.js'

export function createProfile(name) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('profile name must match [a-zA-Z0-9_-]+')
    const p = path.join(getProfilesRoot(), name)
    if (fs.existsSync(p)) throw new Error(`profile exists: ${name}`)
    fs.mkdirSync(p, { recursive: true })
    return p
}

export function deleteProfile(name) {
    const p = path.join(getProfilesRoot(), name)
    if (!fs.existsSync(p)) throw new Error(`profile not found: ${name}`)
    fs.rmSync(p, { recursive: true, force: true })
    return name
}

export function switchProfile(name) {
    if (name && name !== 'default') {
        const p = path.join(getProfilesRoot(), name)
        if (!fs.existsSync(p)) throw new Error(`profile not found: ${name}`)
    }
    applyProfileOverride(name)
    return name || 'default'
}

export function listAllProfiles() { return ['default', ...listProfiles()] }

export function renameProfile(from, to) {
    if (!/^[a-zA-Z0-9_-]+$/.test(to)) throw new Error('profile name must match [a-zA-Z0-9_-]+')
    const src = path.join(getProfilesRoot(), from)
    const dst = path.join(getProfilesRoot(), to)
    if (!fs.existsSync(src)) throw new Error('profile not found: ' + from)
    if (fs.existsSync(dst)) throw new Error('profile exists: ' + to)
    fs.renameSync(src, dst)
    return to
}

const IGNORE = new Set(['logs', 'sessions.db', 'sessions.db-wal', 'sessions.db-shm', '.lock'])

function copyFiltered(src, dst) {
    fs.mkdirSync(dst, { recursive: true })
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
        if (IGNORE.has(ent.name)) continue
        const a = path.join(src, ent.name), b = path.join(dst, ent.name)
        if (ent.isDirectory()) copyFiltered(a, b)
        else if (ent.isFile()) fs.copyFileSync(a, b)
    }
}

export function exportProfile(name, outDir) {
    const src = path.join(getProfilesRoot(), name)
    if (!fs.existsSync(src)) throw new Error('profile not found: ' + name)
    const out = path.join(outDir, name + '-profile')
    copyFiltered(src, out)
    fs.writeFileSync(path.join(out, 'freddie-profile.json'), JSON.stringify({ name, exported: new Date().toISOString(), version: 1 }, null, 2))
    return out
}

export function importProfile(srcDir, name) {
    const meta = path.join(srcDir, 'freddie-profile.json')
    if (!fs.existsSync(meta)) throw new Error('not a freddie profile export: missing freddie-profile.json')
    const target = name || JSON.parse(fs.readFileSync(meta, 'utf8')).name
    if (!/^[a-zA-Z0-9_-]+$/.test(target)) throw new Error('invalid profile name: ' + target)
    const dst = path.join(getProfilesRoot(), target)
    if (fs.existsSync(dst)) throw new Error('profile exists: ' + target)
    copyFiltered(srcDir, dst)
    fs.unlinkSync(path.join(dst, 'freddie-profile.json'))
    return target
}
