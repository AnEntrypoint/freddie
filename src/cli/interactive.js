import readline from 'node:readline'
import { runTurn } from '../agent/machine.js'
import { resolveCommand, COMMAND_REGISTRY, COMMANDS_BY_CATEGORY } from '../commands/registry.js'
import { getActiveSkin } from '../skin/engine.js'
import { createSession, appendMessage } from '../sessions.js'
import { listAllProfiles, switchProfile } from '../commands/profile.js'

const HANDLERS = {
    help: () => {
        const out = []
        for (const [cat, cmds] of Object.entries(COMMANDS_BY_CATEGORY)) {
            out.push(`\n# ${cat}`)
            for (const c of cmds) out.push(`  /${c.name}${c.args_hint ? ' ' + c.args_hint : ''}\t${c.description}`)
        }
        return out.join('\n')
    },
    quit: (state) => { state.exit = true; return 'bye.' },
    profile: (_s, args) => {
        if (!args[0] || args[0] === 'list') return listAllProfiles().join('\n')
        if (args[0] === 'switch' && args[1]) { switchProfile(args[1]); return 'switched: ' + args[1] }
        return 'usage: /profile [list|switch <name>]'
    },
    sessions: () => 'Use the CLI: freddie sessions',
    clear: (state) => { state.messages = []; return 'cleared.' },
}

export async function interactive({ callLLM, input = process.stdin, output = process.stdout } = {}) {
    const skin = getActiveSkin()
    const state = { messages: [], session: createSession({ platform: 'cli' }), exit: false }
    output.write(`${skin.branding.welcome}\n`)
    const rl = readline.createInterface({ input, output, terminal: input.isTTY })
    const prompt = () => { if (!state.exit) rl.setPrompt(skin.branding.prompt_symbol); rl.prompt() }
    rl.on('line', async (raw) => {
        const line = raw.trim()
        if (!line) return prompt()
        if (line.startsWith('/')) {
            const parts = line.slice(1).split(/\s+/)
            const name = resolveCommand('/' + parts[0])
            const handler = HANDLERS[name]
            if (!handler) { output.write(`unknown command: /${parts[0]}\n`); return prompt() }
            output.write(handler(state, parts.slice(1)) + '\n')
            if (state.exit) rl.close()
            else prompt()
            return
        }
        appendMessage(state.session, { role: 'user', content: line })
        try {
            const out = await runTurn({ prompt: line, messages: state.messages, callLLM, timeoutMs: 60000 })
            state.messages = out.messages
            const reply = out.result || out.error || '(no response)'
            output.write(`${skin.branding.response_label}${reply}\n`)
            appendMessage(state.session, { role: 'assistant', content: reply })
        } catch (e) {
            output.write(`error: ${e.message}\n`)
        }
        prompt()
    })
    rl.on('close', () => {})
    prompt()
    return new Promise(resolve => rl.on('close', resolve))
}
