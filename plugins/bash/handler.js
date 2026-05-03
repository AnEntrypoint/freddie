import { spawn } from 'node:child_process'
export const _tool = ({
    name: 'bash',
    toolset: 'core',
    schema: {
        name: 'bash',
        description: 'Run a shell command. Returns stdout/stderr/exitCode.',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Shell command to execute' },
                cwd: { type: 'string', description: 'Working directory' },
                timeout_ms: { type: 'number', description: 'Hard timeout in ms', default: 60000 },
                background: { type: 'boolean', default: false },
            },
            required: ['command'],
        },
    },
    handler: async (args) => {
        const { command, cwd = process.cwd(), timeout_ms = 60000 } = args
        return await new Promise((resolve) => {
            const sh = process.platform === 'win32' ? 'cmd' : 'sh'
            const flag = process.platform === 'win32' ? '/c' : '-c'
            const child = spawn(sh, [flag, command], { cwd, env: process.env })
            let stdout = '', stderr = ''
            const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {} resolve({ exitCode: -1, stdout, stderr: stderr + '\n[timeout]', timedOut: true }) }, timeout_ms)
            child.stdout?.on('data', d => stdout += d.toString())
            child.stderr?.on('data', d => stderr += d.toString())
            child.on('close', code => { clearTimeout(t); resolve({ exitCode: code, stdout, stderr }) })
            child.on('error', e => { clearTimeout(t); resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) })
        })
    },
})
