import { listAllProfiles, createProfile, deleteProfile, switchProfile } from '../../src/commands/profile.js'
import { listSkills } from '../../src/skills/index.js'
import { Gateway } from '../../src/gateway/run.js'
import { makePlatform } from '../../src/gateway/platforms.js'
import { AcpServer } from '../../src/acp/server.js'
import { COMMANDS_BY_CATEGORY } from '../../src/commands/registry.js'
import { getActiveSkin, listBuiltinSkins, setActiveSkin } from '../../src/skin/engine.js'
import { listSessions, search } from '../../src/sessions.js'

export default {
    name: 'core-cli', surfaces: 'pi',
    register({ pi, host }) {
        const C = pi.cli.register.bind(pi.cli)
        C({ name: 'tools', description: 'List/inspect tools', args: [{ name: 'action', default: 'list' }, { name: 'name' }], action: async (action, name) => {
            if (action === 'get' && name) { console.log(JSON.stringify(host.pi.tools.get(name)?.schema, null, 2)); return }
            for (const t of host.pi.tools.list()) console.log(`${(t.toolset || 'core').padEnd(10)} ${t.name}\t${(t.schema?.description || '').slice(0, 60)}`)
        } })
        C({ name: 'skills', description: 'List/show skills (filesystem + registered via pi.skills)', args: [{ name: 'action', default: 'list' }, { name: 'name' }], action: (action, name) => {
            const fsSkills = listSkills().map(s => ({ name: s.name, description: s.description || '', source: 'fs', body: s.body, file: s.file }))
            const piSkills = host.pi.skills.list().map(s => ({ name: s.name, description: s.description || '', source: s.source || 'pi', body: s.content || s.body || '', file: s.file }))
            const seen = new Set(); const all = []
            for (const s of [...piSkills, ...fsSkills]) { if (seen.has(s.name)) continue; seen.add(s.name); all.push(s) }
            if (action === 'show' && name) { const s = all.find(x => x.name === name); if (!s) { console.error('skill not found:', name); process.exit(1) } console.log(s.body); return }
            for (const s of all) console.log(`${(s.source || 'fs').padEnd(8)} ${s.name}\t${s.description.slice(0, 80)}`)
        } })
        C({ name: 'profile', description: 'Manage profiles', args: [{ name: 'action', default: 'list' }, { name: 'name' }], action: (action, name) => {
            if (action === 'list') { for (const p of listAllProfiles()) console.log(p); return }
            if (action === 'create') { createProfile(name); console.log('created:', name); return }
            if (action === 'delete') { deleteProfile(name); console.log('deleted:', name); return }
            if (action === 'switch') { switchProfile(name); console.log('switched:', name || 'default'); return }
        } })
        C({ name: 'skin', description: 'Switch UI skin', args: [{ name: 'name' }], action: (name) => {
            if (!name) { console.log('active:', getActiveSkin().name); console.log('available:', listBuiltinSkins().join(', ')); return }
            setActiveSkin(name); console.log('switched to:', name)
        } })
        C({ name: 'sessions', description: 'List recent sessions', action: async () => { for (const s of await listSessions()) console.log(`${s.id}\t${s.platform}\t${new Date(s.updated_at).toISOString()}\t${s.title || ''}`) } })
        C({ name: 'search', description: 'FTS search across messages', args: [{ name: 'query', required: true }], action: async (q) => { for (const r of await search(q)) console.log(`${r.session_id}\t${(r.content || '').slice(0, 100)}`) } })
        C({ name: 'gateway', description: 'Start messaging gateway', options: [{ flag: '--port <port>', default: '0' }], action: async (opts) => {
            const webhook = await makePlatform('webhook', { port: Number(opts.port) })
            const api = await makePlatform('api_server', { port: 0 })
            const gw = new Gateway({ platforms: { webhook, api_server: api } })
            await gw.start()
            console.log('webhook port:', webhook.port, '\napi_server port:', api.port)
            process.on('SIGINT', async () => { await gw.stop(); process.exit(0) })
        } })
        C({ name: 'acp', description: 'Start ACP json-rpc stdio server', action: () => { new AcpServer().start() } })
        C({ name: 'help-all', description: 'Print all slash commands', action: () => {
            for (const [cat, cmds] of Object.entries(COMMANDS_BY_CATEGORY)) {
                console.log(`\n# ${cat}`)
                for (const c of cmds) console.log(`  /${c.name}${c.args_hint ? ' ' + c.args_hint : ''}\t${c.description}`)
            }
        } })
        C({ name: 'run', description: 'Interactive REPL', action: async () => {
            const { interactive } = await import('../../src/cli/interactive.js')
            let callLLM = null
            try { ({ callLLM } = await import('../../src/agent/pi-bridge.js')) } catch {}
            await interactive({ callLLM })
        } })
        C({ name: 'exec', description: 'Run a single prompt through the agent and exit', options: [{ flag: '--prompt <prompt>', required: true }, { flag: '--model <model>', default: '' }, { flag: '--provider <provider>', default: '' }, { flag: '--skill <skill>', default: '' }, { flag: '--cwd <cwd>', default: '' }, { flag: '--timeout <ms>', default: '60000' }, { flag: '--witness <path>', default: '' }], action: async (opts) => {
            const { runTurn } = await import('../../src/agent/machine.js')
            let provider = opts.provider || undefined
            let model = opts.model || undefined
            if (!provider && model && /^[a-z][a-z0-9-]*\//.test(model)) { provider = model.split('/')[0]; model = model.slice(provider.length + 1) }
            const out = await runTurn({ prompt: opts.prompt, provider, model, skill: opts.skill || undefined, cwd: opts.cwd || undefined, timeoutMs: Number(opts.timeout), witnessPath: opts.witness || undefined })
            if (out.error) { console.error('error:', out.error); process.exit(1) }
            console.log(out.result || out.messages?.at(-1)?.content || '')
            process.exit(0)
        } })
        C({ name: 'cron', description: 'Manage cron jobs', args: [{ name: 'action', default: 'list' }, { name: 'a1' }, { name: 'a2' }], action: async (action, a1, a2) => {
            const { listJobs, createJob, cancelJob, deleteJob, tick } = await import('../../src/cron/scheduler.js')
            if (action === 'list') { for (const j of await listJobs()) console.log(`${j.id}\t${j.cron}\t${j.enabled ? 'on ' : 'off'}\t${j.prompt.slice(0, 60)}`); return }
            if (action === 'add') { console.log('created:', await createJob({ cron: a1, prompt: a2 })); return }
            if (action === 'cancel') { await cancelJob(Number(a1)); console.log('cancelled:', a1); return }
            if (action === 'delete') { await deleteJob(Number(a1)); console.log('deleted:', a1); return }
            if (action === 'tick') { console.log('fired:', (await tick()).length); return }
        } })
        C({ name: 'batch', description: 'Run prompts in parallel from file', args: [{ name: 'file', required: true }], options: [{ flag: '--concurrency <n>', default: '4' }, { flag: '--model <model>', default: '' }], action: async (file, opts) => {
            const fs = await import('node:fs')
            const { runBatch } = await import('../../src/batch.js')
            const raw = fs.readFileSync(file, 'utf8').trim().split('\n')
            const prompts = raw.map(l => { try { return JSON.parse(l).prompt || JSON.parse(l) } catch { return l } }).filter(Boolean)
            const out = await runBatch({ prompts, concurrency: Number(opts.concurrency), model: opts.model })
            console.log('batch:', out.id, '\nfile:', out.file, '\nresults:', out.results.length)
        } })
        C({ name: 'models', description: 'Discover working models per provider key', args: [{ name: 'action', default: 'discover' }, { name: 'provider' }], action: async (action, provider) => {
            const { discoverAndPersist, listKnownProviders } = await import('../../src/agent/model-discovery.js')
            if (action === 'providers') { for (const p of listKnownProviders()) console.log(p); return }
            const result = await discoverAndPersist({ provider })
            for (const [p, r] of Object.entries(result)) {
                if (r.error) console.log(`${p.padEnd(12)} ✗ ${r.error}`)
                else console.log(`${p.padEnd(12)} ✓ ${r.models.length} models — ${r.models.slice(0, 5).join(', ')}${r.models.length > 5 ? ', …' : ''}`)
            }
        } })
        C({ name: 'dashboard', description: 'Boot web dashboard', options: [{ flag: '--port <port>', default: '0' }, { flag: '--cwd <dir>', default: '' }], action: async (opts) => {
            if (opts.cwd) { const p = process.platform === 'win32' ? opts.cwd.replace(/^\/([a-z])\//i, '$1:/') : opts.cwd; process.chdir(p) }
            const { createDashboard } = await import('../../src/web/server.js')
            const d = await createDashboard({ port: Number(opts.port) })
            console.log('dashboard:', d.url)
            process.on('SIGINT', async () => { await d.stop(); process.exit(0) })
        } })
    },
}
