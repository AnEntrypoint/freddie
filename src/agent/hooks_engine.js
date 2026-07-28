/**
 * HookEngine — runs shell commands defined in config at hook trigger points.
 * Matches kimi's server-side hook behavior.
 *
 * Kimi config key names are accepted in the config and mapped to freddie's
 * internal HOOK_NAMES via KIMI_TO_FREDDIE_HOOK. The user-facing config and
 * environment variables follow kimi convention.
 */
import { spawn } from 'node:child_process'

// Map kimi-style hook config keys to freddie's internal hook names.
// Users write kimi names in their config.yaml; the engine resolves them.
const KIMI_TO_FREDDIE_HOOK = {
    PreToolUse:       'preToolCall',
    PostToolUse:      'postToolCall',
    UserPromptSubmit: 'onMessageInbound',
    Stop:             'onMessageOutbound',
    SessionStart:     'onSessionStart',
    SessionEnd:       'onSessionEnd',
    SubagentStart:    'onTurnStart',
    SubagentStop:     'onTurnEnd',
    PreCompact:       'onPreCompact',
    PostCompact:      'onPostCompact',
    Notification:     'onMessageOutbound', // best-effort mapping
}

// Reverse map for reporting: freddie -> kimi
const FREDDIE_TO_KIMI = Object.fromEntries(
    Object.entries(KIMI_TO_FREDDIE_HOOK).map(([k, v]) => [v, k])
)

// All kimi hook names the config can declare
const KIMI_HOOK_NAMES = Object.keys(KIMI_TO_FREDDIE_HOOK)

// Default bash runner: spawns a shell command with a timeout and returns
// { stdout, stderr, exitCode }. Used in Node.js; in browser, pass a no-op.
async function defaultBashRunner(command, { timeout = 30000, env = {}, cwd } = {}) {
    return new Promise((resolve) => {
        const child = spawn('bash', ['-c', command], {
            cwd: cwd || process.cwd(),
            env: { ...process.env, ...env },
            timeout,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''; let stderr = ''
        child.stdout.on('data', (d) => { stdout += d.toString() })
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('close', (exitCode) => {
            resolve({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode: exitCode ?? -1 })
        })
        child.on('error', (err) => {
            resolve({ stdout: stdout.trimEnd(), stderr: (stderr + ' ' + err.message).trim(), exitCode: -1 })
        })
    })
}

export class HookEngine {
    /**
     * @param {object} opts
     * @param {object} opts.config — the full freddie config (hooks section at config.hooks)
     * @param {function} [opts.bashRunner] — async (command, {timeout, env, cwd}) => {stdout, stderr, exitCode}
     * @param {boolean} [opts.isBrowser] — if true, bashRunner is a no-op and shell hooks are skipped
     */
    constructor({ config, bashRunner, isBrowser } = {}) {
        this._config = config
        this._bashRunner = bashRunner || (isBrowser ? null : defaultBashRunner)
        this._isBrowser = !!isBrowser
        this._runHistory = new Set() // dedup: "command::hookName::matchTarget"
    }

    /**
     * Run all hooks matching a trigger.
     * @param {string} hookName — freddie internal hook name (e.g. 'preToolCall')
     * @param {object} context — {name, args, result, sessionKey, ...}
     * @returns {Promise<{results: Array<{command, ok, stdout, stderr, exitCode, error}>}>}
     */
    async runHooks(hookName, context = {}) {
        const kimiName = FREDDIE_TO_KIMI[hookName]
        if (!kimiName) return { results: [] }

        const hooks = this._config?.hooks?.[kimiName] || []
        if (!hooks.length) return { results: [] }

        const results = []
        const hookEnv = this._buildEnv(context)

        for (const hook of hooks) {
            const { matcher, command, timeout = 30 } = hook
            if (!command) continue

            // Check if matcher regex matches the tool name or action
            const matchTarget = context.name || context.action || ''
            if (matcher && !this._testMatcher(matcher, matchTarget)) continue

            // Dedup: same command + same hook name + same match target
            const dedupKey = `${command}::${hookName}::${matchTarget}`
            if (this._runHistory.has(dedupKey)) continue
            this._runHistory.add(dedupKey)

            // In browser, shell commands are unsupported; skip with a warning
            if (this._isBrowser || !this._bashRunner) {
                results.push({ command, ok: false, error: 'shell hooks not available in browser' })
                continue
            }

            try {
                const result = await this._bashRunner(command, {
                    timeout: timeout * 1000,
                    env: hookEnv,
                    cwd: context.cwd || process.cwd(),
                })
                results.push({
                    command,
                    ok: result.exitCode === 0,
                    stdout: result.stdout || '',
                    stderr: result.stderr || '',
                    exitCode: result.exitCode,
                })
            } catch (err) {
                // Fail-open: hook failure allows the operation to proceed
                results.push({ command, ok: false, error: err.message })
            }
        }

        return { results }
    }

    /**
     * Test a matcher regex against a target string. Returns false on invalid regex.
     */
    _testMatcher(matcher, target) {
        try {
            return new RegExp(matcher).test(target)
        } catch {
            return false
        }
    }

    /**
     * Build environment variables for hook commands.
     */
    _buildEnv(context) {
        const env = {}
        if (context.name) {
            env.FREDDIE_TOOL_NAME = context.name
        }
        if (context.args) {
            try {
                env.FREDDIE_TOOL_ARGS = JSON.stringify(context.args)
            } catch {
                env.FREDDIE_TOOL_ARGS = String(context.args)
            }
        }
        if (context.sessionKey) {
            env.FREDDIE_SESSION_ID = context.sessionKey
        }
        if (context.cwd) {
            env.FREDDIE_CWD = context.cwd
        } else if (typeof process !== 'undefined') {
            env.FREDDIE_CWD = process.cwd()
        }
        return env
    }

    /** Reset dedup history (for tests / new sessions). */
    reset() { this._runHistory.clear() }

    /** List the kimi hook names that can appear in config. */
    static get KIMI_HOOK_NAMES() { return KIMI_HOOK_NAMES }

    /** Map from kimi config key to freddie internal hook name. */
    static get KIMI_TO_FREDDIE_HOOK() { return KIMI_TO_FREDDIE_HOOK }

    /** Map from freddie internal hook name to kimi config key. */
    static get FREDDIE_TO_KIMI() { return FREDDIE_TO_KIMI }
}