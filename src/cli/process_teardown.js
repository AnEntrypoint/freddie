// Shared exit teardown for one-shot CLI surfaces (exec, print-mode, run).
// Closes every handle the process is responsible for (undici's HTTP
// dispatcher, the libsql sessions.js handle, log streams) before calling
// process.exit() -- otherwise the process hangs on a native-addon-level
// libuv reference (libsql/agentplug-runner bindings) outside JS-level
// introspection, confirmed empty post-cleanup via
// process._getActiveHandles()/_getActiveRequests() (AGENTS.md's documented
// Windows gotcha). destroy() (not close()) on the dispatcher is correct
// since close() waits on in-flight requests this process no longer cares
// about.
export async function teardownAndExit(exitCode) {
    try {
        const u = await import('undici')
        await u.getGlobalDispatcher()?.destroy?.()
    } catch {}
    try {
        const { closeDb } = await import('../sessions.js')
        closeDb()
    } catch {}
    try {
        const { closeAll } = await import('../observability/log.js')
        closeAll()
    } catch {}
    process.exitCode = exitCode
    process.exit(exitCode)
}
