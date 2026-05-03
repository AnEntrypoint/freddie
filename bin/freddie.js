#!/usr/bin/env node
import { Command } from 'commander'
import { bootHost } from '../src/host/index.js'
import { listAllProfiles, createProfile, deleteProfile, switchProfile } from '../src/commands/profile.js'
import { listSkills } from '../src/skills/index.js'
import { Gateway } from '../src/gateway/run.js'
import { makePlatform } from '../src/gateway/platforms.js'
import { AcpServer } from '../src/acp/server.js'
import { COMMAND_REGISTRY, COMMANDS_BY_CATEGORY } from '../src/commands/registry.js'
import { getActiveSkin, listBuiltinSkins, setActiveSkin } from '../src/skin/engine.js'
import { listSessions, search } from '../src/sessions.js'

const program = new Command()
program.name('freddie').version('0.1.0').description('Freddie — JS port of hermes-agent built on pi-mono')

program.command('tools')
    .description('List/inspect tools')
    .argument('[action]', 'list | get', 'list')
    .argument('[name]')
    .action(async (action, name) => {
        const h = await bootHost()
        if (action === 'get' && name) { console.log(JSON.stringify(h.pi.tools.get(name)?.schema, null, 2)); return }
        for (const t of h.pi.tools.list()) console.log(`${(t.toolset || 'core').padEnd(10)} ${t.name}\t${(t.schema?.description || '').slice(0, 60)}`)
    })

program.command('skills')
    .description('List skills')
    .argument('[action]', 'list', 'list')
    .action(() => {
        for (const s of listSkills()) console.log(`${s.name}\t${s.description.slice(0, 80)}`)
    })

program.command('profile')
    .argument('[action]', 'list | create | switch | delete', 'list')
    .argument('[name]')
    .action((action, name) => {
        if (action === 'list') { for (const p of listAllProfiles()) console.log(p); return }
        if (action === 'create') { createProfile(name); console.log('created:', name); return }
        if (action === 'delete') { deleteProfile(name); console.log('deleted:', name); return }
        if (action === 'switch') { switchProfile(name); console.log('switched:', name || 'default'); return }
    })

program.command('skin')
    .argument('[name]')
    .action((name) => {
        if (!name) { console.log('active:', getActiveSkin().name); console.log('available:', listBuiltinSkins().join(', ')); return }
        setActiveSkin(name); console.log('switched to:', name)
    })

program.command('sessions').action(async () => { for (const s of await listSessions()) console.log(`${s.id}\t${s.platform}\t${new Date(s.updated_at).toISOString()}\t${s.title || ''}`) })
program.command('search').argument('<query>').action(async (q) => { for (const r of await search(q)) console.log(`${r.session_id}\t${(r.content || '').slice(0, 100)}`) })

program.command('gateway')
    .option('--port <port>', 'webhook port', '0')
    .action(async (opts) => {
        const webhook = await makePlatform('webhook', { port: Number(opts.port) })
        const api = await makePlatform('api_server', { port: 0 })
        const gw = new Gateway({ platforms: { webhook, api_server: api } })
        await gw.start()
        console.log('webhook port:', webhook.port, '\napi_server port:', api.port)
        process.on('SIGINT', async () => { await gw.stop(); process.exit(0) })
    })

program.command('acp').action(() => { const s = new AcpServer(); s.start() })

program.command('help-all').action(() => {
    for (const [cat, cmds] of Object.entries(COMMANDS_BY_CATEGORY)) {
        console.log(`\n# ${cat}`)
        for (const c of cmds) console.log(`  /${c.name}${c.args_hint ? ' ' + c.args_hint : ''}\t${c.description}`)
    }
})

program.command('run').description('Run interactive REPL').action(async () => {
    const { interactive } = await import('../src/cli/interactive.js')
    let callLLM = null
    try { ({ callLLM } = await import('../src/agent/pi-bridge.js')) } catch {}
    await interactive({ callLLM })
})

program.command('cron')
    .argument('[action]', 'list | add | cancel | delete | tick', 'list')
    .argument('[arg1]')
    .argument('[arg2]')
    .action(async (action, a1, a2) => {
        const { listJobs, createJob, cancelJob, deleteJob, tick } = await import('../src/cron/scheduler.js')
        if (action === 'list') { for (const j of await listJobs()) console.log(`${j.id}\t${j.cron}\t${j.enabled ? 'on ' : 'off'}\t${j.prompt.slice(0, 60)}`); return }
        if (action === 'add') { const id = await createJob({ cron: a1, prompt: a2 }); console.log('created:', id); return }
        if (action === 'cancel') { await cancelJob(Number(a1)); console.log('cancelled:', a1); return }
        if (action === 'delete') { await deleteJob(Number(a1)); console.log('deleted:', a1); return }
        if (action === 'tick') { console.log('fired:', (await tick()).length); return }
    })

program.command('batch')
    .argument('<file>', 'JSONL or TXT prompts file')
    .option('--concurrency <n>', '', '4')
    .option('--model <model>', '', '')
    .action(async (file, opts) => {
        const fs = await import('node:fs')
        const { runBatch } = await import('../src/batch.js')
        const raw = fs.readFileSync(file, 'utf8').trim().split('\n')
        const prompts = raw.map(l => { try { return JSON.parse(l).prompt || JSON.parse(l) } catch { return l } }).filter(Boolean)
        const out = await runBatch({ prompts, concurrency: Number(opts.concurrency), model: opts.model })
        console.log('batch:', out.id, '\nfile:', out.file, '\nresults:', out.results.length)
    })

program.command('dashboard')
    .option('--port <port>', '', '0')
    .action(async (opts) => {
        const { createDashboard } = await import('../src/web/server.js')
        const d = await createDashboard({ port: Number(opts.port) })
        console.log('dashboard:', d.url)
        process.on('SIGINT', async () => { await d.stop(); process.exit(0) })
    })

program.parseAsync(process.argv).catch(e => { console.error(e); process.exit(1) })
