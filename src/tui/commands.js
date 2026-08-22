import { getConfigValue } from '../config.js'
import { COMMANDS_BY_CATEGORY } from '../commands/registry.js'
import { listSessions, getMessages } from '../sessions.js'
import { listAllProfiles, switchProfile } from '../commands/profile.js'
import { listAuthProviders, hasUsableSecret, envForProvider } from '../auth.js'
import { listProjects, getActiveProject, setActiveProject } from '../projects.js'
import { cancelTurn, steerTurn } from '../agent/live-turns.js'
import { goalCommand } from '../commands/goal.js'
import { skillsListCommand, resolveSkillInvocation } from '../commands/skills_command.js'

// Tools disabled in plan mode (read-only turn): mutation-capable tools are
// hidden from the model so it can inspect (bash/read/grep stay) but not
// change anything — kimi's plan-mode enforcement, toolset-level.
export const PLAN_DISABLED = ['write', 'edit', 'file_operations', 'code_execution']

// Slash-command handlers for the TUI. These MIRROR the REPL's HANDLERS in
// src/cli/interactive.js — that module doesn't export them, so they can't
// be imported; both surfaces call the same underlying libs (sessions,
// profile, auth, projects, live-turns) so behavior stays shared. If
// interactive.js ever exports its HANDLERS, delete this mirror and import.
// Each handler takes (state, args) and returns a string to print (or sets
// state.exit / mutates state for resume). Handlers may be async.
export const HANDLERS = {
    help: () => {
        const out = []
        for (const [cat, cmds] of Object.entries(COMMANDS_BY_CATEGORY)) {
            out.push(`\n# ${cat}`)
            for (const c of cmds) out.push(`  /${c.name}${c.args_hint ? ' ' + c.args_hint : ''}\t${c.description}`)
        }
        out.push('\n# Conversation\n  /sessions\tList recent conversations\n  /resume <id>\tContinue a past conversation\n  /keys\tShow which provider keys are set\n  /project [name]\tShow or switch active project\n  /approve [off|mutating|all]\tShow or set the approval mode for this session\n  /plan\tToggle plan mode (read-only turns)\n  /cancel\tInterrupt the running turn\n  /steer <text>\tInject a message into the running turn (plain text mid-turn queues for after it)\n  !<cmd>\tRun a local shell command')
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
        try { const p = setActiveProject(args[0]); return `switched to project: ${p.name} (${p.path})\nrestart to load this project's plugins` }
        catch (e) { return 'error: ' + e.message }
    },
    clear: (state) => { state.messages = []; return 'cleared.' },
    approve: (state, args) => {
        const mode = args[0]
        if (!mode) return `approval mode: ${state.approvalMode || getConfigValue('agent.approval_mode', 'off')} (usage: /approve off|mutating|classifier|all)`
        if (!['off', 'mutating', 'classifier', 'all'].includes(mode)) return 'usage: /approve off|mutating|classifier|all'
        state.approvalMode = mode
        return `approval mode for this session: ${mode}${mode === 'off' ? '' : ' — gated tool calls will ask before running (y/n/a keys)'}`
    },
    plan: (state) => {
        state.planMode = !state.planMode
        return `plan mode ${state.planMode ? 'ON — mutation tools hidden (' + PLAN_DISABLED.join(', ') + ')' : 'OFF'}`
    },
    cancel: (state) => {
        if (!state.turnActive) return 'no turn running'
        return cancelTurn(state.session) ? 'cancel requested (takes effect at the next step boundary)' : 'no live turn found for this session'
    },
    steer: (state, args) => {
        const text = args.join(' ')
        if (!text) return 'usage: /steer <text> — inject a message into the running turn'
        if (!state.turnActive) return 'no turn running (plain text while a turn runs queues for after it)'
        return steerTurn(state.session, text) ? 'steer injected at the next step boundary' : 'no live turn found for this session'
    },
    goal: (state, args) => goalCommand(state.session, args),
    skills: () => skillsListCommand(),
    skill: async (state, args) => {
        const { error, message } = resolveSkillInvocation(args)
        if (error) return error
        await state.runPrompt(message.content)
        return ''
    },
}

// Short descriptions for the editor's slash-command autocomplete
// (CombinedAutocompleteProvider takes {name, description} entries).
export const SLASH_COMMAND_DOCS = {
    help: 'Show all commands',
    quit: 'Exit',
    profile: 'List or switch profiles',
    sessions: 'List recent conversations',
    resume: 'Continue a past conversation',
    keys: 'Show which provider keys are set',
    project: 'Show or switch active project',
    clear: 'Clear conversation context',
    approve: 'Show or set approval mode',
    plan: 'Toggle plan mode (read-only turns)',
    cancel: 'Interrupt the running turn',
    steer: 'Inject a message into the running turn',
    goal: 'Show or set this session\'s goal',
    skills: 'List available skills',
    skill: 'Run a skill by name',
}
