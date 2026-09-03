import fs from 'node:fs'

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new Error('aborted')); return }
        const t = setTimeout(resolve, ms)
        const onAbort = () => { clearTimeout(t); reject(new Error('aborted')) }
        signal?.addEventListener('abort', onAbort, { once: true })
    })
}

export const _tool0 = {
    name: 'wait',
    toolset: 'core',
    schema: {
        name: 'wait',
        description: 'Pause for a fixed duration before continuing. Use when a real external process needs time to settle (a build, a deploy, a rate-limit cooldown) and there is nothing to poll.',
        parameters: { type: 'object', properties: { seconds: { type: 'number', description: 'Duration to wait, in seconds' } }, required: ['seconds'] },
    },
    handler: async (args, ctx) => {
        const seconds = Number(args.seconds)
        if (!(seconds > 0)) return { error: 'seconds must be a positive number' }
        const ms = seconds * 1000
        try {
            await sleep(ms, ctx?.signal)
            return { waited_seconds: seconds }
        } catch {
            return { error: 'aborted', waited_seconds: null }
        }
    },
}

export const _tool1 = {
    name: 'wait_for_file',
    toolset: 'core',
    schema: {
        name: 'wait_for_file',
        description: 'Poll until a file appears (or, with mode=changed, until an already-existing file\'s mtime advances) or a timeout elapses. Use to wait on a real external process writing a file (a build output, a spool response, a downloaded artifact) instead of guessing a fixed sleep duration.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Absolute or cwd-relative path to watch' },
                mode: { type: 'string', enum: ['exists', 'changed'], default: 'exists', description: '"exists": wait until the path exists. "changed": path must already exist; wait until its mtime advances past the mtime at call time.' },
                timeout_seconds: { type: 'number', default: 60, description: 'Give up and return timed_out:true after this many seconds' },
                poll_interval_seconds: { type: 'number', default: 1, description: 'How often to check' },
            },
            required: ['path'],
        },
    },
    handler: async (args, ctx) => {
        const mode = args.mode === 'changed' ? 'changed' : 'exists'
        const timeoutMs = Math.max(0, (Number(args.timeout_seconds) || 60) * 1000)
        const pollMs = Math.max(50, (Number(args.poll_interval_seconds) || 1) * 1000)
        const target = args.path
        if (!target) return { error: 'path required' }

        let baselineMtimeMs = null
        if (mode === 'changed') {
            if (!fs.existsSync(target)) return { error: `mode=changed requires an existing file; ${target} does not exist` }
            baselineMtimeMs = fs.statSync(target).mtimeMs
        }

        const deadline = Date.now() + timeoutMs
        while (true) {
            if (ctx?.signal?.aborted) return { error: 'aborted' }
            const exists = fs.existsSync(target)
            if (mode === 'exists' && exists) return { found: true }
            if (mode === 'changed' && exists) {
                const mtimeMs = fs.statSync(target).mtimeMs
                if (mtimeMs > baselineMtimeMs) return { found: true }
            }
            if (Date.now() >= deadline) return { found: false, timed_out: true, path: target }
            const remaining = deadline - Date.now()
            await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, Math.min(pollMs, remaining))
                const onAbort = () => { clearTimeout(t); reject(new Error('aborted')) }
                ctx?.signal?.addEventListener('abort', onAbort, { once: true })
            }).catch(() => {})
        }
    },
}
