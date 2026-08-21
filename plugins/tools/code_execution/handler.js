import { spawn } from 'node:child_process'
const RUNNERS = {
    python: ['python', '-c'], python3: ['python3', '-c'],
    node: ['node', '-e'], deno: ['deno', 'eval'],
    ruby: ['ruby', '-e'], bash: ['bash', '-c'],
}

export const _tool = ({
    name: 'code_execution',
    toolset: 'core',
    schema: { name: 'code_execution', description: 'Execute a code snippet in a chosen runner (python, node, deno, ruby, bash). Returns stdout/stderr/exitCode.', parameters: { type: 'object', properties: { code: { type: 'string' }, runner: { type: 'string', enum: Object.keys(RUNNERS), default: 'python' }, timeout_ms: { type: 'number', default: 30000 } }, required: ['code'] } },
    handler: async ({ code, runner = 'python', timeout_ms = 30000 }, ctx = {}) => {
        const cmd = RUNNERS[runner]
        if (!cmd) return { error: 'unknown runner: ' + runner }
        return await new Promise(resolve => {
            const child = spawn(cmd[0], [cmd[1], code], { env: process.env })
            let stdout = '', stderr = ''
            const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {} resolve({ exitCode: -1, stdout, stderr: stderr + '\n[timeout]' }) }, timeout_ms)
            // ctx.signal is the turn's AbortController (machine.js) -- fired on
            // turn-level timeout, independently of and potentially sooner than
            // this handler's own timeout_ms. Same defect/fix shape as bash's
            // handler: without this the subprocess outlives a turn that already
            // reported itself ended.
            const onAbort = () => { clearTimeout(t); try { child.kill('SIGKILL') } catch {} resolve({ exitCode: -1, stdout, stderr: stderr + '\n[aborted: turn ended]', aborted: true }) }
            if (ctx.signal) {
                if (ctx.signal.aborted) onAbort()
                else ctx.signal.addEventListener('abort', onAbort, { once: true })
            }
            child.stdout?.on('data', d => stdout += d.toString())
            child.stderr?.on('data', d => stderr += d.toString())
            child.on('close', code => { clearTimeout(t); ctx.signal?.removeEventListener('abort', onAbort); resolve({ exitCode: code, stdout, stderr }) })
            child.on('error', e => { clearTimeout(t); ctx.signal?.removeEventListener('abort', onAbort); resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) })
        })
    },
})
