const _registry = new Map()

export function registerDebug(name, fn) {
    _registry.set(name, fn)
}

export function listDebug() {
    return [...registry().keys()]
}

export function snapshot(name) {
    const fn = _registry.get(name)
    if (!fn) return { error: `unknown subsystem: ${name}` }
    try { return fn() } catch (e) { return { error: String(e) } }
}

export function snapshotAll() {
    const out = {}
    for (const [k, fn] of _registry.entries()) {
        try { out[k] = fn() } catch (e) { out[k] = { error: String(e) } }
    }
    return out
}

export function attachDebugRoutes(app) {
    app.get('/debug', (_, res) => res.json([..._registry.keys()]))
    app.get('/debug/:name', (req, res) => res.json(snapshot(req.params.name)))
    app.get('/debug-all', (_, res) => res.json(snapshotAll()))
}

function registry() { return _registry }
