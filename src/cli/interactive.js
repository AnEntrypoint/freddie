import readline from 'node:readline'
import { runTurn } from '../agent/machine.js'
import { resolveCommand, COMMANDS_BY_CATEGORY } from '../commands/registry.js'
import { getActiveSkin } from '../skin/engine.js'
import { createSession, appendMessage, listSessions, getMessages } from '../sessions.js'
import { listAllProfiles, switchProfile } from '../commands/profile.js'
import { listAuthProviders, hasUsableSecret, envForProvider } from '../auth.js'
import { listProjects, getActiveProject, setActiveProject } from '../projects.js'

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
        out.push('\n# Conversation\n  /sessions\tList recent conversations\n  /resume <id>\tContinue a past conversation\n  /keys\tShow which provider keys are set\n  /project [name]\tShow or switch active project')
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
}

export async function interactive({ callLLM, resume = null, input = process.stdin, output = process.stdout } = {}) {
    const skin = getActiveSkin()
    const state = { messages: [], session: null, exit: false }
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
    rl.on('line', async (raw) => {
        const line = raw.trim()
        if (!line) return prompt()
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
        await appendMessage(state.session, { role: 'user', content: line })
        try {
            const out = await runTurn({ prompt: line, messages: state.messages, callLLM, timeoutMs: 60000 })
            state.messages = out.messages
            const reply = out.result || out.error || '(no response)'
            output.write(`${skin.branding.response_label}${reply}\n`)
            await appendMessage(state.session, { role: 'assistant', content: reply })
        } catch (e) {
            output.write(`error: ${e.message}\n`)
        }
        prompt()
    })
    rl.on('close', () => {})
    prompt()
    return new Promise(resolve => rl.on('close', resolve))
}
