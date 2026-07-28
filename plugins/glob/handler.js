const MAX_RESULTS = 100

function isBrowser() {
    return typeof window !== 'undefined' || typeof globalThis?.window !== 'undefined'
}

let _spawn = null
async function _getSpawn() {
    if (_spawn) return _spawn
    if (isBrowser()) throw new Error('spawn not available in browser')
    const { spawn } = await import('node:child_process')
    _spawn = spawn
    return _spawn
}

async function runRg(args, cwd) {
    const spawn = await _getSpawn()
    return new Promise((resolve, reject) => {
        const child = spawn('rg', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', d => stdout += d.toString())
        child.stderr.on('data', d => stderr += d.toString())
        child.on('close', code => {
            if (code === 0 || code === 1) {
                // code 1 = no matches, which is fine for --files
                resolve(stdout.trim())
            } else {
                reject(new Error(stderr.trim() || `rg exited with code ${code}`))
            }
        })
        child.on('error', reject)
    })
}

export const globTool = ({
    name: 'glob',
    toolset: 'core',
    schema: {
        name: 'glob',
        description:
            'Find files matching a glob pattern. Uses ripgrep under the hood. ' +
            'Matches files only, not directories. Respects .gitignore by default. ' +
            'Results sorted by modification time, most recent first, capped at 100.',
        parameters: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Glob pattern to match files, e.g. "**/*.js", "src/*.ts", "*.{ts,tsx}". Supports brace expansion and recursive matching.',
                },
                path: {
                    type: 'string',
                    description: 'Directory to search. Defaults to the current working directory.',
                },
                include_ignored: {
                    type: 'boolean',
                    default: false,
                    description: 'Whether to include files ignored by .gitignore, .ignore, etc.',
                },
            },
            required: ['pattern'],
        },
    },
    handler: async (args, ctx = {}) => {
        if (isBrowser()) {
            return { error: 'glob tool is not available in the browser' }
        }

        const { pattern, path: searchPath, include_ignored = false } = args
        const cwd = ctx.cwd || process.cwd()

        const rgArgs = [
            '--files',
            '--glob', pattern,
            '--sort', 'modified',
            '--color', 'never',
            '--no-heading',
            '--no-line-number',
        ]

        if (!include_ignored) {
            // ripgrep respects .gitignore by default; --no-ignore disables it
            // so we do nothing extra here
        } else {
            rgArgs.push('--no-ignore')
        }

        // If a specific search directory is given, pass it as the last arg
        // Otherwise rg defaults to cwd
        if (searchPath) {
            rgArgs.push(searchPath)
        }

        try {
            const stdout = await runRg(rgArgs, cwd)
            if (!stdout) {
                return { files: [], total: 0, truncated: false }
            }
            const lines = stdout.split('\n').filter(l => l)
            const truncated = lines.length > MAX_RESULTS
            const files = lines.slice(0, MAX_RESULTS)
            return { files, total: lines.length, truncated }
        } catch (e) {
            // ripgrep not installed or other error
            return { error: `glob failed: ${e.message || e}` }
        }
    },
})