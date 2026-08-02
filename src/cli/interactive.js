import readline from 'node:readline'
import { exec } from 'node:child_process'
import { runTurn } from '../agent/machine.js'
import { subscribeTurn, cancelTurn, resolveApproval, steerTurn } from '../agent/live-turns.js'
import { getConfigValue } from '../config.js'
import { resolveCommand, COMMANDS_BY_CATEGORY } from '../commands/registry.js'
import { getActiveSkin } from '../skin/engine.js'
import { createSession, appendMessage, listSessions, getMessages } from '../sessions.js'
import { listAllProfiles, switchProfile } from '../commands/profile.js'
import { listAuthProviders, hasUsableSecret, envForProvider } from '../auth.js'
import { listProjects, getActiveProject, setActiveProject } from '../projects.js'

// Tools disabled in plan mode (read-only turn): mutation-capable tools are
// hidden from the model so it can inspect (bash/read/grep stay) but not
// change anything — kimi's plan-mode enforcement, toolset-level.
const PLAN_DISABLED = ['write', 'edit', 'file_operations', 'code_execution']

const summarizeArgs = (args) => {
    try { const s = typeof args === 'string' ? args : JSON.stringify(args); return s.length > 120 ? s.slice(0, 117) + '...' : s } catch { return '' }
}

// REPL slash-command handlers. Each returns a string to print (or sets
// state.exit / mutates state for resume). Handlers may be async — the line
// loop awaits them.
const HANDLERS = {
    help: () => {
        const out = []
        for (const [cat, cmds] of Object.entries(COMMANDS_BY_CATEGORY)) {
            out.push(`\n# ${cat}`)
            for (const c of cmds) out.push(`  /${c.name}${c.args_hint ? ' ' + c.args_hint : ''}\t${c.description}`)
        }
        out.push('\n# Conversation\n  /sessions\tList recent conversations\n  /resume <id>\tContinue a past conversation\n  /keys\tShow which provider keys are set\n  /project [name]\tShow or switch active project\n  /approve [off|mutating|all]\tShow or set the approval mode for this REPL\n  /plan\tToggle plan mode (read-only turns)\n  /cancel\tInterrupt the running turn\n  !<cmd>\tRun a local shell command')
        return out.join('\n')
    },
    quit: (state) => { state.exit = true; return 'bye.' },
    profile: (_s, args) => {
        if (!args[0] || args[0] === 'list') return listAllProfiles().join('\n')
        if (args[0] === 'switch' && args[1]) { switchProfile(args[1]); return 'switched: ' + args[1] }
        return 'usage: /profile [list|switch <name>]'
    },
    sessions: async () => {
        const rows = await listSessions(20)
        if (!rows.length) return '(no sessions yet)'
        return rows.map(s => `  ${s.id.slice(0, 8)}  ${new Date(s.updated_at).toISOString().slice(0, 16).replace('T', ' ')}  ${s.title || '(untitled)'}`).join('\n')
    },
    resume: async (state, args) => {
        const wanted = args[0]
        const rows = await listSessions(50)
        if (!rows.length) return '(no sessions to resume)'
        const target = wanted
            ? rows.find(s => s.id === wanted || s.id.startsWith(wanted))
            : rows[0]
        if (!target) return `no session matching: ${wanted}`
        const msgs = await getMessages(target.id)
        state.session = target.id
        state.messages = msgs.map(m => ({ role: m.role, content: m.content, tool_calls: m.tool_calls || undefined, tool_call_id: m.tool_call_id || undefined }))
        return `resumed ${target.id.slice(0, 8)} (${msgs.length} messages) — ${target.title || '(untitled)'}`
    },
    keys: async () => {
        const lines = []
        for (const p of listAuthProviders()) {
            const ok = await hasUsableSecret(p)
            lines.push(`  ${p.padEnd(12)} ${envForProvider(p) || ''}\t${ok ? '[set]' : '[--]'}`)
        }
        return lines.join('\n')
    },
    project: (_s, args) => {
        if (!args[0]) {
            const active = getActiveProject()
            return listProjects().map(p => `  ${p.name === active.name ? '[*]' : '[ ]'} ${p.name.padEnd(16)} ${p.path}`).join('\n')
        }
        try { const p = setActiveProject(args[0]); return `switched to project: ${p.name} (${p.path})\nrestart the REPL to load this project's plugins` }
        catch (e) { return 'error: ' + e.message }
    },
    clear: (state) => { state.messages = []; return 'cleared.' },
    approve: (state, args) => {
        const mode = args[0]
        if (!mode) return `approval mode: ${state.approvalMode || getConfigValue('agent.approval_mode', 'off')} (usage: /approve off|mutating|all)`
        if (!['off', 'mutating', 'all'].includes(mode)) return 'usage: /approve off|mutating|all'
        state.approvalMode = mode
        return `approval mode for this REPL: ${mode}${mode === 'off' ? '' : ' — gated tool calls will ask before running'}`
    },
    plan: (state) => {
        state.planMode = !state.planMode
        return `plan mode ${state.planMode ? 'ON — mutation tools hidden (' + PLAN_DISABLED.join(', ') + ')' : 'OFF'}`
    },
    cancel: (state) => {
        if (!state.turnActive) return 'no turn running'
        return cancelTurn(state.session) ? 'cancel requested (takes effect at the next step boundary)' : 'no live turn found for this session'
    },
}

export async function interactive({ callLLM, resume = null, input = process.stdin, output = process.stdout } = {}) {
    const skin = getActiveSkin()
    const state = { messages: [], session: null, exit: false, planMode: false, approvalMode: null, turnActive: false }
    // Resume a prior conversation when requested (--resume [id]); otherwise start
    // a fresh session. createSession/listSessions are async (libsql) and MUST be
    // awaited — a bare call silently wraps in a rejecting Promise so the row is
    // never persisted and history is lost.
    if (resume !== null && resume !== false) {
        const msg = await HANDLERS.resume(state, typeof resume === 'string' ? [resume] : [])
        output.write(msg + '\n')
    }
    if (!state.session) state.session = await createSession({ platform: 'cli' })
    output.write(`${skin.branding.welcome}\n`)
    const rl = readline.createInterface({ input, output, terminal: input.isTTY })
    const prompt = () => { if (!state.exit) rl.setPrompt(skin.branding.prompt_symbol); rl.prompt() }

    // Ctrl-C interrupts the running turn (kimi's cancel) instead of killing
    // the REPL; with no turn active it exits as before.
    rl.on('SIGINT', () => {
        if (state.turnActive && cancelTurn(state.session)) {
            output.write('\n(cancel requested — turn will stop at the next step boundary)\n')
        } else {
            rl.close()
        }
    })

    rl.on('line', async (raw) => {
        const line = raw.trim()
        if (!line) return prompt()

        // Shell escape (kimi's Ctrl-X shell mode, readline-style): run a local
        // command without leaving the REPL.
        if (line.startsWith('!')) {
            const cmd = line.slice(1).trim()
            if (!cmd) return prompt()
            exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (stdout) output.write(stdout)
                if (stderr) output.write(stderr)
                if (err && !stdout && !stderr) output.write(`(exit ${err.code ?? 'error'})\n`)
                prompt()
            })
            return
        }

        if (line.startsWith('/')) {
            const parts = line.slice(1).split(/\s+/)
            const name = resolveCommand('/' + parts[0]) || parts[0]
            const handler = HANDLERS[name]
            if (!handler) { output.write(`unknown command: /${parts[0]}\n`); return prompt() }
            try { output.write((await handler(state, parts.slice(1))) + '\n') }
            catch (e) { output.write(`error: ${e.message}\n`) }
            if (state.exit) rl.close()
            else prompt()
            return
        }

        // Mid-turn input: an open approval question owns the line (its own
        // once-listener consumes it); anything else STEERS the running turn
        // (kimi's steering) instead of starting a parallel one.
        if (state.turnActive) {
            if (state.answeringApproval) return
            if (steerTurn(state.session, line)) output.write('  [steer queued — injected at the next step boundary]\n')
            else output.write('(no live turn found for this session)\n')
            return
        }

        await appendMessage(state.session, { role: 'user', content: line })
        // Live turn surface: tool progress lines as they happen, approval
        // prompts answered inline — the REPL is just another wire client.
        const askApproval = (data) => {
            state.answeringApproval = true
            rl.question(`  [approval] ${data.name} ${summarizeArgs(data.args)}\n  approve? [y]es / [n]o / [a]lways: `, (ans) => {
                state.answeringApproval = false
                const a = (ans || '').trim().toLowerCase()
                const approved = a === 'y' || a === 'yes' || a === 'a' || a === 'always'
                resolveApproval(state.session, { id: data.id, approved, always: a === 'a' || a === 'always', feedback: approved ? null : 'rejected in REPL' }).catch(() => {})
            })
        }
        const unsub = subscribeTurn(state.session, (env) => {
            if (env.event === 'tool.start') output.write(`  [tool] ${env.data.name} ${summarizeArgs(env.data.args)}\n`)
            else if (env.event === 'tool.end') output.write(env.data.denied ? `  [tool denied] ${env.data.name}\n` : `  [tool done] ${env.data.name}\n`)
            else if (env.event === 'approval.request') askApproval(env.data)
            else if (env.event === 'steer.append') output.write(`  [steer] ${env.data.text}\n`)
            else if (env.event === 'assistant.delta') { state.sawDelta = true; output.write(env.data.text || '') }
        })
        state.turnActive = true
        state.sawDelta = false
        try {
            const out = await runTurn({
                prompt: line,
                messages: state.messages,
                callLLM,
                timeoutMs: 600000,
                sessionKey: state.session,
                approvalMode: state.approvalMode,
                disabledToolsets: state.planMode ? PLAN_DISABLED : undefined,
            })
            state.messages = out.messages
            const reply = out.result || out.error || '(no response)'
            // Deltas already streamed the reply live; only print it whole when
            // the turn took the non-streaming path.
            output.write(state.sawDelta ? '\n' : `${skin.branding.response_label}${reply}\n`)
            await appendMessage(state.session, { role: 'assistant', content: reply })
        } catch (e) {
            output.write(`error: ${e.message}\n`)
        } finally {
            state.turnActive = false
            try { unsub() } catch { /* swallow: listener already gone */ }
        }
        prompt()
    })
    rl.on('close', () => {})
    prompt()
    return new Promise(resolve => rl.on('close', resolve))
}
