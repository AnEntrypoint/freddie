import { spawn } from 'node:child_process'
import { getConfigValue } from '../../../src/config.js'
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
            // Non-interactive shells don't source ~/.bashrc, so user aliases
            // silently don't expand. terminal.command_prefix lets a user inject
            // an alias-sourcing (or any other setup) line ahead of every command.
            const prefix = getConfigValue('terminal.command_prefix', '')
            const fullCommand = prefix ? `${prefix}\n${command}` : command
            const child = spawn(sh, [flag, fullCommand], { cwd, env: process.env })
            let stdout = '', stderr = ''
            const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {} resolve({ exitCode: -1, stdout, stderr: stderr + '\n[timeout]', timedOut: true }) }, timeout_ms)
            child.stdout?.on('data', d => stdout += d.toString())
            child.stderr?.on('data', d => stderr += d.toString())
            child.on('close', code => {
                clearTimeout(t)
                const result = { exitCode: code, stdout, stderr }
                // Windows cmd.exe can silently swallow ALL output (exit 0, empty
                // stdout+stderr) for certain nested-quote one-liners (witnessed:
                // node -e with double-quoted body containing single-quoted JS
                // strings plus an embedded literal \n) -- indistinguishable from
                // "ran fine and printed nothing" without this signal, and models
                // have been observed misdiagnosing it as "bash tool unavailable"
                // and silently substituting an unverified reimplementation.
                if (process.platform === 'win32' && code === 0 && !stdout && !stderr && command.length > 40) {
                    result.note = 'exitCode 0 with no output at all on a non-trivial command is unusual on Windows -- cmd.exe can silently swallow output for commands with nested quotes (e.g. node -e one-liners mixing double/single quotes and \\n). If you expected output, try writing the script to a file and running it instead of an inline -e/-c one-liner.'
                }
                resolve(result)
            })
            child.on('error', e => { clearTimeout(t); resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) })
        })
    },
})
