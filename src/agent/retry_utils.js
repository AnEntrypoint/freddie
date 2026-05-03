import { isRetryable } from './error_classifier.js'
export async function retryAsync(fn, { attempts = 3, backoff = 200, factor = 2, max = 10_000, jitter = 0.2 } = {}) {
    let last
    for (let i = 0; i < attempts; i++) {
        try { return await fn(i) } catch (e) {
            last = e
            if (i === attempts - 1) break
            if (!isRetryable(e)) break
            const wait = Math.min(max, backoff * Math.pow(factor, i)) * (1 + (Math.random() * 2 - 1) * jitter)
            await new Promise(r => setTimeout(r, wait))
        }
    }
    throw last
}
export async function withTimeout(fn, ms) {
    return await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout after ' + ms + 'ms')), ms))])
}
