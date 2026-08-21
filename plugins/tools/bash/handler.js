import { spawn } from 'node:child_process'
import path from 'node:path'
import { getConfigValue } from '../../../src/config.js'
import { scrubEnv } from '../../../src/host/tool-resources.js'
import { listKnownEnvVars } from '../../../src/auth.js'
import { wasWrittenThisSession } from '../files/lib/turn_writes.js'
import { killTree } from '../../../src/tools/kill_tree.js'
import { registerProcess } from '../process_registry/handler.js'

// Matches a shell redirect/overwrite targeting a file path: `cat > path`,
// `cat >> path`, `echo ... > path`, `tee path`/`tee -a path`. Deliberately
// narrow (false negatives over false positives -- this only needs to catch
// the common "model routes around write/edit via bash" pattern, not every
// possible shell construct) so it never blocks a legitimate command that
// merely happens to contain a `>` character elsewhere (comparisons, heredocs
// targeting a NEW path, etc).
const REDIRECT_TO_FILE_RE = /(?:^|[|;&]|\n)\s*(?:cat|echo|printf)\b[^|;&\n]*?>{1,2}\s*['"]?([^\s'";&|]+)['"]?\s*(?:[|;&]|$)|(?:^|[|;&]|\n)\s*tee\b\s+(?:-a\s+)?['"]?([^\s'";&|]+)['"]?/

export function detectRedirectTarget(command) {
    const m = REDIRECT_TO_FILE_RE.exec(command)
    if (!m) return null
    return m[1] || m[2] || null
}
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
    handler: async (args, ctx = {}) => {
        // Hallucinated-cwd guard: weak models sometimes invent paths that do not
        // exist (witnessed: cwd:"/home/user" on Windows -> spawn ENOENT, the
        // model read it as "environment broken" and gave up). Fall back to the
        // process cwd and SAY so, instead of failing the spawn outright.
        let { command, cwd = process.cwd(), timeout_ms = 60000 } = args

        // write-guard: a model that already wrote/edited a file successfully
        // this turn sometimes routes around the write/edit tool by shelling
        // out to a redirect instead -- live-witnessed with MiniCPM5-1B:
        // `write` produced valid HTML, then a later `bash "cat > index.html"`
        // (no stdin piped in) hung on the missing input until timeout, which
        // truncated the file to 0 bytes. Block the redirect and point the
        // model back at write/edit -- a loud, correctable error beats a
        // silent hang-then-clobber every time (Jidoka: stop rather than pass
        // a defect downstream).
        const redirectTarget = detectRedirectTarget(command)
        if (redirectTarget) {
            const resolvedTarget = ctx.cwd && !path.isAbsolute(redirectTarget) ? path.join(ctx.cwd, redirectTarget) : redirectTarget
            if (wasWrittenThisSession(ctx.sessionKey, resolvedTarget)) {
                return {
                    exitCode: -1,
                    stdout: '',
                    stderr: `blocked: "${redirectTarget}" was already written this turn via the write/edit tool. Use the write tool (to overwrite) or edit tool (to change part of it) instead of a shell redirect -- a bash redirect with no piped stdin will hang and can truncate the file to empty on timeout.`,
                    blocked: true,
                }
            }
        }
        let cwdNote = ''
        try {
            const fs = await import('node:fs')
            if (cwd && !fs.existsSync(cwd)) { cwdNote = ` (note: requested cwd "${cwd}" does not exist — ran in ${process.cwd()} instead)`; cwd = process.cwd() }
        } catch { /* swallow: existsSync failure keeps the requested cwd */ }
        return await new Promise((resolve) => {
            const sh = process.platform === 'win32' ? 'cmd' : 'sh'
            const flag = process.platform === 'win32' ? '/c' : '-c'
            // Non-interactive shells don't source ~/.bashrc, so user aliases
            // silently don't expand. terminal.command_prefix lets a user inject
            // an alias-sourcing (or any other setup) line ahead of every command.
            const prefix = getConfigValue('terminal.command_prefix', '')
            const fullCommand = prefix ? `${prefix}\n${command}` : command
            // Opt-in: strip provider API keys from the subprocess env so a bash
            // tool call doesn't inherit credentials it has no need to see.
            // Off by default (many legitimate commands DO need provider keys,
            // e.g. curl-ing an API directly) -- terminal.scrub_provider_env=true
            // opts in for less-trusted command execution.
            const childEnv = getConfigValue('terminal.scrub_provider_env', false)
                ? scrubEnv(process.env, listKnownEnvVars())
                : process.env
            const child = spawn(sh, [flag, fullCommand], { cwd, env: childEnv })
            // process_registry was always empty in practice (registerProcess
            // exported but never called by any real spawn call site) --
            // wiring it here + code_execution/handler.js makes the
            // `process_registry` tool's list/kill actions actually reflect
            // live freddie-spawned subprocesses instead of always reporting
            // none. Best-effort: registration must never block the actual
            // command from running.
            try { registerProcess('bash-' + Date.now() + '-' + child.pid, child, { tool: 'bash', command: fullCommand.slice(0, 200) }) } catch {}
            let stdout = '', stderr = ''
            // killTree, not bare child.kill: the spawned process on Windows IS
            // cmd.exe, and TerminateProcess against cmd.exe does not propagate to
            // whatever it launched. Live-witnessed: `cmd /c ping -n 30 127.0.0.1`
            // killed via plain child.kill('SIGKILL') left ping.exe running and
            // still visible in tasklist after the parent was gone. taskkill /T
            // recurses the whole process tree; POSIX's process.kill(pid,'SIGKILL')
            // already covers the sh -c case, so killTree degrades to that there.
            const t = setTimeout(() => { killTree(child.pid); resolve({ exitCode: -1, stdout, stderr: stderr + '\n[timeout]', timedOut: true }) }, timeout_ms)
            // ctx.signal is the turn's AbortController signal (machine.js) --
            // fired when the OUTER turn-level timeout elapses, independently of
            // and potentially far sooner than this handler's own timeout_ms.
            // Without this, a turn that reports itself timed out left the real
            // child process running to its own completion with nothing tracking
            // or able to cancel it.
            const onAbort = () => { clearTimeout(t); killTree(child.pid); resolve({ exitCode: -1, stdout, stderr: stderr + '\n[aborted: turn ended]', aborted: true }) }
            if (ctx.signal) {
                if (ctx.signal.aborted) onAbort()
                else ctx.signal.addEventListener('abort', onAbort, { once: true })
            }
            child.stdout?.on('data', d => stdout += d.toString())
            child.stderr?.on('data', d => stderr += d.toString())
            child.on('close', code => {
                clearTimeout(t)
                ctx.signal?.removeEventListener('abort', onAbort)
                const result = { exitCode: code, stdout, stderr: stderr + cwdNote }
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
            child.on('error', e => { clearTimeout(t); ctx.signal?.removeEventListener('abort', onAbort); resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) })
        })
    },
})
