import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex') }

function walk(root) {
    const out = []
    function rec(dir, rel) {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, ent.name)
            const r = path.posix.join(rel, ent.name)
            if (ent.isDirectory()) {
                if (ent.name === '.git' || ent.name === 'node_modules') continue
                rec(abs, r)
            } else if (ent.isFile()) {
                const buf = fs.readFileSync(abs)
                out.push({ rel: r, abs, hash: sha256(buf), size: buf.length })
            }
        }
    }
    rec(root, '')
    return out
}

export async function syncTo(env, localRoot, remoteRoot, { onProgress } = {}) {
    const files = walk(localRoot)
    let transferred = 0
    for (const f of files) {
        const target = path.posix.join(remoteRoot, f.rel)
        const r = await env.put(f.abs, target)
        transferred++
        if (onProgress) onProgress({ rel: f.rel, transferred, total: files.length, status: r.error ? 'error' : 'ok', error: r.error })
    }
    return { files: files.length, transferred }
}

export async function syncFrom(env, remoteRoot, localRoot, manifest = []) {
    fs.mkdirSync(localRoot, { recursive: true })
    let transferred = 0
    for (const rel of manifest) {
        const remote = path.posix.join(remoteRoot, rel)
        const local = path.join(localRoot, rel)
        fs.mkdirSync(path.dirname(local), { recursive: true })
        const r = await env.get(remote, local)
        if (!r.error) transferred++
    }
    return { transferred, total: manifest.length }
}

export function diffManifest(localRoot, remoteManifest = []) {
    const local = walk(localRoot)
    const localByRel = new Map(local.map(f => [f.rel, f]))
    const remoteByRel = new Map(remoteManifest.map(f => [f.rel, f]))
    const toUpload = local.filter(f => remoteByRel.get(f.rel)?.hash !== f.hash).map(f => f.rel)
    const toDelete = remoteManifest.filter(f => !localByRel.has(f.rel)).map(f => f.rel)
    return { toUpload, toDelete }
}

export { walk, sha256 }
