import { bootHost } from '../host/index.js'

export async function getPlatformAdapter(name) {
    const h = await bootHost()
    const p = h.pi.platforms.get(name)
    if (!p) throw new Error(`platform not registered: ${name}`)
    const mod = p.module || {}
    const cls = Object.values(mod).find(v => typeof v === 'function' && /Adapter$/.test(v.name)) || Object.values(mod).find(v => typeof v === 'function')
    if (!cls) throw new Error(`platform ${name}: no adapter class exported`)
    return cls
}

export async function makePlatform(name, opts = {}) {
    const Cls = await getPlatformAdapter(name)
    return new Cls(opts)
}

export async function listPlatformNames() {
    const h = await bootHost()
    return h.pi.platforms.list().map(p => p.name)
}
