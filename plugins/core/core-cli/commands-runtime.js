import { Gateway } from '../../../src/gateway/run.js'
import { makePlatform } from '../../../src/gateway/platforms.js'
import { AcpServer } from '../../../src/acp/server.js'
import { McpServer } from '../../../src/mcp/server.js'

export function registerRuntimeCommands(C) {
    C({ name: 'gateway', description: 'Start messaging gateway', options: [{ flag: '--port <port>', default: '0' }], action: async (opts) => {
        const webhook = await makePlatform('webhook', { port: Number(opts.port) })
        const api = await makePlatform('api_server', { port: 0 })
        const gw = new Gateway({ platforms: { webhook, api_server: api } })
        await gw.start()
        console.log('webhook port:', webhook.port, '\napi_server port:', api.port)
        process.on('SIGINT', async () => { await gw.stop(); process.exit(0) })
    } })
    C({ name: 'acp', description: 'Start ACP json-rpc stdio server', action: () => { new AcpServer().start() } })
    C({ name: 'mcp-serve', description: 'Start MCP json-rpc stdio server, exposing every registered freddie tool (including gm_dispatch) to any MCP client', action: () => { new McpServer().start() } })
    C({ name: 'run', description: 'Interactive REPL (--print for non-interactive stdout output)', options: [{ flag: '--resume [id]', default: '' }, { flag: '--print', default: false }, { flag: '--prompt <prompt>', default: '' }, { flag: '--model <model>', default: '' }, { flag: '--provider <provider>', default: '' }, { flag: '--cwd <cwd>', default: '' }, { flag: '--timeout <ms>', default: '60000' }], action: async (opts) => {
        if (opts.print) {
            if (!opts.prompt) { console.error('--prompt is required with --print'); process.exit(1) }
            const { runPrintModeAndExit } = await import('../../../src/cli/print_mode.js')
            await runPrintModeAndExit({ prompt: opts.prompt, model: opts.model || undefined, provider: opts.provider || undefined, cwd: opts.cwd || undefined, timeout: Number(opts.timeout) })
            return
        }
        const { launchTui } = await import('../../../src/tui/index.js')
        // --resume with no value = continue the most recent session; --resume <id> = that one.
        const resume = opts.resume === true ? true : (opts.resume || null)
        await launchTui({ resume })
        const { teardownAndExit } = await import('../../../src/cli/process_teardown.js')
        await teardownAndExit(0)
    } })
    C({ name: 'exec', description: 'Run a single prompt through the agent and exit (--print for non-interactive stdout output)', options: [{ flag: '--prompt <prompt>', required: true }, { flag: '--model <model>', default: '' }, { flag: '--provider <provider>', default: '' }, { flag: '--skill <skill>', default: '' }, { flag: '--cwd <cwd>', default: '' }, { flag: '--timeout <ms>', default: '60000' }, { flag: '--witness <path>', default: '' }, { flag: '--print', default: false }], action: async (opts) => {
        if (opts.print) {
            const { runPrintModeAndExit } = await import('../../../src/cli/print_mode.js')
            let provider = opts.provider || undefined
            let model = opts.model || undefined
            if (!provider && model && /^[a-z][a-z0-9-]*\//.test(model)) { provider = model.split('/')[0]; model = model.slice(provider.length + 1) }
            await runPrintModeAndExit({ prompt: opts.prompt, model, provider, cwd: opts.cwd || undefined, timeout: Number(opts.timeout) })
            return
        }
        const { runTurn } = await import('../../../src/agent/machine.js')
        const { getConfigValue } = await import('../../../src/config.js')
        let provider = opts.provider || undefined
        let model = opts.model || undefined
        if (!provider && model && /^[a-z][a-z0-9-]*\//.test(model)) { provider = model.split('/')[0]; model = model.slice(provider.length + 1) }
        // toolsets.enabled/disabled (set via `freddie toolsets <distribution>` /
        // applyDistribution()) was previously write-only -- exec always ran the
        // runTurn/createAgentMachine hardcoded ['core'] default regardless of a
        // saved distribution, so e.g. the 'coder' distribution's ['core','browse']
        // (which includes web_fetch) never actually reached the agent loop from
        // this command. undefined here (config unset) still falls through to
        // runTurn's own ['core'] default, unchanged behavior for the common case.
        const enabledToolsets = getConfigValue('toolsets.enabled', undefined)
        const disabledToolsets = getConfigValue('toolsets.disabled', undefined)
        const out = await runTurn({ prompt: opts.prompt, provider, model, skill: opts.skill || undefined, cwd: opts.cwd || process.cwd(), timeoutMs: Number(opts.timeout), witnessPath: opts.witness || undefined, enabledToolsets, disabledToolsets })
        console.log(out.error ? '' : (out.result || out.messages?.at(-1)?.content || ''))
        if (out.error) console.error('error:', out.error)
        const { teardownAndExit } = await import('../../../src/cli/process_teardown.js')
        await teardownAndExit(out.error ? 1 : 0)
    } })
    C({ name: 'cron', description: 'Manage cron jobs (list|add <cron> <prompt>|cancel <id>|delete <id>|tick)', args: [{ name: 'action', default: 'list' }, { name: 'a1' }, { name: 'a2' }], action: async (action, a1, a2) => {
        const { listJobs, createJob, cancelJob, deleteJob, tick } = await import('../../../src/cron/scheduler.js')
        if (action === 'list') { for (const j of await listJobs()) console.log(`${j.id}\t${j.cron}\t${j.enabled ? 'on ' : 'off'}\t${j.prompt.slice(0, 60)}`); return }
        if (action === 'add') {
            if (!a1) { console.error('usage: freddie cron add <cron-expr> <prompt>'); process.exit(1) }
            if (!a2) { console.error('usage: freddie cron add <cron-expr> <prompt>'); process.exit(1) }
            try {
                const result = await createJob({ cron: a1, prompt: a2 })
                console.log('created:', result)
            } catch (e) {
                console.error('error:', e.message)
                process.exit(1)
            }
            return
        }
        if (action === 'cancel') {
            if (!a1) { console.error('usage: freddie cron cancel <id>'); process.exit(1) }
            await cancelJob(Number(a1)); console.log('cancelled:', a1); return
        }
        if (action === 'delete') {
            if (!a1) { console.error('usage: freddie cron delete <id>'); process.exit(1) }
            await deleteJob(Number(a1)); console.log('deleted:', a1); return
        }
        if (action === 'tick') { console.log('fired:', (await tick()).length); return }
        console.error('usage: freddie cron [list|add <cron> <prompt>|cancel <id>|delete <id>|tick]'); process.exit(1)
    } })
    C({ name: 'batch', description: 'Run prompts in parallel from file', args: [{ name: 'file', required: true }], options: [{ flag: '--concurrency <n>', default: '4' }, { flag: '--model <model>', default: '' }], action: async (file, opts) => {
        const fs = await import('node:fs')
        if (!fs.existsSync(file)) { console.error('error: file not found:', file); process.exit(1) }
        const { runBatch } = await import('../../../src/batch.js')
        const raw = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
        if (!raw.length) { console.error(`error: no lines in file: ${file}`); process.exit(1) }
        const prompts = raw.map(l => { try { return JSON.parse(l).prompt || JSON.parse(l) } catch { return l } }).filter(Boolean)
        if (!prompts.length) { console.error(`error: no prompts parsed from ${file}`); process.exit(1) }
        const out = await runBatch({ prompts, concurrency: Number(opts.concurrency), model: opts.model })
        console.log('batch:', out.id, '\nfile:', out.file, '\nresults:', out.results.length)
    } })
    C({ name: 'models', description: 'Discover working models per provider key', args: [{ name: 'action', default: 'discover' }, { name: 'provider' }], action: async (action, provider) => {
        const { discoverAndPersist, listKnownProviders } = await import('../../../src/models/discovery.js')
        if (action === 'providers') { for (const p of listKnownProviders()) console.log(p); return }
        const result = await discoverAndPersist({ provider })
        for (const [p, r] of Object.entries(result)) {
            if (r.error) console.log(`${p.padEnd(12)} [fail] ${r.error}`)
            else console.log(`${p.padEnd(12)} [ok] ${r.models.length} models - ${r.models.slice(0, 5).join(', ')}${r.models.length > 5 ? ', ...' : ''}`)
        }
    } })
    C({ name: 'dashboard', description: 'Boot web dashboard', options: [{ flag: '--port <port>', default: '0' }, { flag: '--host <host>', default: '127.0.0.1' }, { flag: '--cwd <dir>', default: '' }], action: async (opts) => {
        if (opts.cwd) { const p = process.platform === 'win32' ? opts.cwd.replace(/^\/([a-z])\//i, '$1:/') : opts.cwd; process.chdir(p) }
        const { createDashboard } = await import('../../../src/web/server.js')
        // --host defaults to loopback: every gui-* /api/* route (including
        // POST /api/terminal/exec, an unauthenticated shell) has no built-in
        // auth, so binding wider than localhost by default would expose them.
        const d = await createDashboard({ port: Number(opts.port), host: opts.host })
        console.log('dashboard:', d.url)
        process.on('SIGINT', async () => { await d.stop(); process.exit(0) })
    } })
}
