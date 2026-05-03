export function tgFloodWait(error) {
    const m = String(error?.message || '').match(/FLOOD_WAIT_(\d+)/)
    return m ? Number(m[1]) * 1000 : null
}
export async function tgWithRetry(fn, { attempts = 3 } = {}) {
    let last
    for (let i = 0; i < attempts; i++) {
        try { return await fn() } catch (e) {
            last = e
            const wait = tgFloodWait(e)
            if (wait != null) await new Promise(r => setTimeout(r, wait + 100))
            else if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)))
        }
    }
    throw last
}
export function withProxy(fetchOpts, proxy) { return proxy ? { ...fetchOpts, proxy } : fetchOpts }
