// Adapter guard helpers for bootHostBrowser (see ./boot.js). Split out to
// keep boot.js under the 200-line vertical-slice cap; these are pure
// helpers with no independent public contract of their own.

export class FreddieAdapterError extends Error {
    constructor(message) {
        super(message)
        this.name = 'FreddieAdapterError'
    }
}

export function required(name, why) {
    throw new FreddieAdapterError(`bootHostBrowser: adapters.${name} is required (${why})`)
}

export function guardStorage(storage) {
    if (storage && typeof storage.getConfig === 'function' && typeof storage.setConfig === 'function') return storage
    return {
        getConfig() { required('storage.getConfig', 'called to read persisted freddie config (model/agent/skills/etc) — pass adapters.storage.getConfig()') },
        setConfig() { required('storage.setConfig', 'called to persist freddie config — pass adapters.storage.setConfig(value)') },
    }
}

export function guardFs(fsAdapter) {
    const missing = (method, why) => () => required(`fs.${method}`, why)
    return {
        readFile: fsAdapter?.readFile || missing('readFile', 'a plugin or embedder tool tried to read a file through the adapter fs'),
        writeFile: fsAdapter?.writeFile || missing('writeFile', 'a plugin or embedder tool tried to write a file through the adapter fs'),
        exists: fsAdapter?.exists || missing('exists', 'a plugin or embedder tool tried to check file existence through the adapter fs'),
        mkdir: fsAdapter?.mkdir || missing('mkdir', 'a plugin or embedder tool tried to create a directory through the adapter fs'),
        readdir: fsAdapter?.readdir || missing('readdir', 'a plugin or embedder tool tried to list a directory through the adapter fs'),
        stat: fsAdapter?.stat || missing('stat', 'a plugin or embedder tool tried to stat a path through the adapter fs'),
    }
}

// Normalizes `adapters.plugins` entries: each is either an already-resolved
// plugin object, or a zero-arg loader (sync or async) returning one. Loader
// functions let an embedder lazily construct a plugin object (e.g. closing
// over its own per-instance fs/exec adapters) without freddie needing to
// know anything about how that construction happens.
export async function resolvePlugins(list, validatePlugin) {
    const out = []
    for (const entry of list) {
        const p = typeof entry === 'function' ? await entry() : entry
        if (!p) continue
        out.push(validatePlugin(p))
    }
    return out
}
