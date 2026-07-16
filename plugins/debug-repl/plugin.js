// `freddie debug` — a REPL with full introspection against the LIVE host:
// .plugins, .hooks <name>, .machines, .simulate <prompt>. Real introspection,
// not a mocked shell -- every command reads/dispatches through the actual
// running host object this process booted.
import readline from 'node:readline'
import { list as listSnapshots } from '../../src/machines/snapshot-store.js'
import { runTurn } from '../../src/agent/machine.js'

async function handleDot(line, host, output) {
    const [cmd, ...rest] = line.slice(1).split(/\s+/)
    if (cmd === 'plugins') {
        for (const p of host.plugins()) output.write(`  ${p.name.padEnd(28)} surfaces=${p.surfaces} requires=[${(p.requires || []).join(',')}]\n`)
        return
    }
    if (cmd === 'hooks') {
        const name = rest[0]
        if (!name) { output.write(`known hooks: ${host.hooks.names().join(', ')}\n`); return }
        const listeners = host.hooks.listeners(name)
        output.write(`${name}: ${listeners.length} listener(s)\n`)
        return
    }
    if (cmd === 'machines') {
        const rows = await listSnapshots({ kind: rest[0] || null, status: null })
        if (!rows.length) { output.write('no persisted machine snapshots\n'); return }
        for (const r of rows) output.write(`  kind=${r.kind.padEnd(20)} key=${r.key.padEnd(24)} status=${r.status}\n`)
        return
    }
    if (cmd === 'simulate') {
        const prompt = rest.join(' ')
        if (!prompt) { output.write('usage: .simulate <prompt>\n'); return }
        try {
            const out = await runTurn({ prompt, messages: [], callLLM: undefined, timeoutMs: 30000 })
            output.write(`result: ${out.result || out.error || '(no response)'}\n`)
        } catch (e) { output.write(`error: ${e.message}\n`) }
        return
    }
    if (cmd === 'help' || cmd === '') {
        output.write('  .plugins              list all loaded plugins\n  .hooks [name]          list hook names, or listeners for one\n  .machines [kind]       list persisted machine snapshots\n  .simulate <prompt>     dispatch a real turn through the live agent loop\n  .exit                  quit\n')
        return
    }
    if (cmd === 'exit') return 'exit'
    output.write(`unknown command: .${cmd} (try .help)\n`)
}

export default {
    name: 'debug-repl', surfaces: 'pi',
    register({ pi, host }) {
        pi.cli.register({
            name: 'debug',
            description: 'Open a REPL with full introspection against the live host (.plugins, .hooks, .machines, .simulate)',
            action: async () => {
                const output = process.stdout
                output.write('freddie debug repl -- .help for commands\n')
                const rl = readline.createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY, prompt: 'debug> ' })
                let closed = false
                rl.on('close', () => { closed = true })
                rl.prompt()
                rl.on('line', async (raw) => {
                    const line = raw.trim()
                    if (line.startsWith('.')) {
                        const result = await handleDot(line, host, output)
                        if (result === 'exit') { rl.close(); return }
                    } else if (line) {
                        output.write('input must start with . (try .help)\n')
                    }
                    // A piped/non-interactive stdin can close mid-flight while this
                    // async handler was still awaiting handleDot() -- calling
                    // rl.prompt() on an already-closed interface throws
                    // ERR_USE_AFTER_CLOSE, so guard on the close event firing first.
                    if (!closed) rl.prompt()
                })
                await new Promise((resolve) => rl.on('close', resolve))
            },
        })
    },
}
