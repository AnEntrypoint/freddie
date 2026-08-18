// Per-session tracking of files written/edited via the write/edit tools this
// turn, so the bash tool can detect a model routing around a successful
// write with a shell redirect (`cat > path`, `echo ... > path`, `tee path`)
// -- live-witnessed with MiniCPM5-1B: it wrote valid HTML via `write`, then
// on a later turn ran `bash "cat > index.html"` with no stdin, which hung on
// the missing input and clobbered the file back to 0 bytes on timeout.
// In-memory only (process-lifetime, not persisted) -- this is a same-turn
// safety net, not an audit trail; file_state.js already exists for the
// latter and is model-invoked (unreliable for this purpose since a
// confused model is exactly the case that won't call it).
const writesBySession = new Map()

const MAX_PATHS_PER_SESSION = 200

export function recordWrite(sessionKey, resolvedPath) {
    if (!sessionKey || !resolvedPath) return
    let set = writesBySession.get(sessionKey)
    if (!set) { set = new Set(); writesBySession.set(sessionKey, set) }
    set.add(resolvedPath)
    if (set.size > MAX_PATHS_PER_SESSION) {
        const first = set.values().next().value
        set.delete(first)
    }
}

export function wasWrittenThisSession(sessionKey, resolvedPath) {
    return writesBySession.get(sessionKey)?.has(resolvedPath) ?? false
}

export function clearSession(sessionKey) {
    writesBySession.delete(sessionKey)
}
