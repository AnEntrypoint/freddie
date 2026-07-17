import { listAllProfiles, createProfile, deleteProfile, switchProfile } from '../../src/commands/profile.js'
import { listSkills } from '../../src/skills/index.js'
import { Gateway } from '../../src/gateway/run.js'
import { makePlatform } from '../../src/gateway/platforms.js'
import { AcpServer } from '../../src/acp/server.js'
import { COMMANDS_BY_CATEGORY } from '../../src/commands/registry.js'
import { getActiveSkin, listBuiltinSkins, setActiveSkin } from '../../src/skin/engine.js'
import { listSessions, getSession, getMessages, deleteSession, search } from '../../src/sessions.js'
import { listAuthProviders, isKnownAuthProvider, envForProvider, hasUsableSecret, getAuthStore, clearProviderAuth, tokenFingerprint } from '../../src/auth.js'
import { listProjects, getActiveProject, createProject, deleteProject, setActiveProject } from '../../src/projects.js'
import { displayFreddieHome, getFreddieHome } from '../../src/home.js'
import { readStdinSecret } from '../../src/cli/stdin_secret.js'

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
        C({ name: 'run', description: 'Interactive REPL (--resume [id] continues a past conversation)', options: [{ flag: '--resume [id]', default: '' }], action: async (opts) => {
            const { interactive } = await import('../../src/cli/interactive.js')
            let callLLM = null
            try { ({ callLLM } = await import('../../src/agent/pi-bridge.js')) } catch {}
            // --resume with no value = continue the most recent session; --resume <id> = that one.
            const resume = opts.resume === true ? true : (opts.resume || null)
            await interactive({ callLLM, resume })
        } })
        C({ name: 'exec', description: 'Run a single prompt through the agent and exit', options: [{ flag: '--prompt <prompt>', required: true }, { flag: '--model <model>', default: '' }, { flag: '--provider <provider>', default: '' }, { flag: '--skill <skill>', default: '' }, { flag: '--cwd <cwd>', default: '' }, { flag: '--timeout <ms>', default: '60000' }, { flag: '--witness <path>', default: '' }], action: async (opts) => {
            const { runTurn } = await import('../../src/agent/machine.js')
            let provider = opts.provider || undefined
            let model = opts.model || undefined
            if (!provider && model && /^[a-z][a-z0-9-]*\//.test(model)) { provider = model.split('/')[0]; model = model.slice(provider.length + 1) }
            const out = await runTurn({ prompt: opts.prompt, provider, model, skill: opts.skill || undefined, cwd: opts.cwd || undefined, timeoutMs: Number(opts.timeout), witnessPath: opts.witness || undefined })
            console.log(out.error ? '' : (out.result || out.messages?.at(-1)?.content || ''))
            if (out.error) console.error('error:', out.error)
            // Tear down cleanly instead of process.exit(): force-closing the
            // process while undici keep-alive sockets and a pending setImmediate
            // are still live makes libuv double-close its async handle and assert
            // UV_HANDLE_CLOSING on Windows. Close the HTTP dispatcher's sockets,
            // then set exitCode and let the event loop drain on its own.
            try { const u = await import('undici'); await u.getGlobalDispatcher()?.close?.() } catch {}
            process.exitCode = out.error ? 1 : 0
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
                if (r.error) console.log(`${p.padEnd(12)} [fail] ${r.error}`)
                else console.log(`${p.padEnd(12)} [ok] ${r.models.length} models - ${r.models.slice(0, 5).join(', ')}${r.models.length > 5 ? ', ...' : ''}`)
            }
        } })
        C({ name: 'dashboard', description: 'Boot web dashboard', options: [{ flag: '--port <port>', default: '0' }, { flag: '--cwd <dir>', default: '' }], action: async (opts) => {
            if (opts.cwd) { const p = process.platform === 'win32' ? opts.cwd.replace(/^\/([a-z])\//i, '$1:/') : opts.cwd; process.chdir(p) }
            const { createDashboard } = await import('../../src/web/server.js')
            const d = await createDashboard({ port: Number(opts.port) })
            console.log('dashboard:', d.url)
            process.on('SIGINT', async () => { await d.stop(); process.exit(0) })
        } })

        // --- Key management: `freddie auth list|set|rm|test|show` ---------------
        C({ name: 'auth', description: 'Manage provider API keys (list|set <provider>|rm <provider>|test [provider]|show)', args: [{ name: 'action', default: 'list' }, { name: 'provider' }], action: async (action, provider) => {
            const known = (p) => { if (!isKnownAuthProvider(p)) { console.error(`unknown provider: ${p}\nknown: ${listAuthProviders().join(', ')}`); process.exit(1) } }
            if (action === 'list' || action === 'show') {
                for (const p of listAuthProviders()) {
                    const env = envForProvider(p) || ''
                    const inEnv = !!(env && process.env[env])
                    const stored = !inEnv && !!(await getAuthStore().getCredential(env))
                    const src = inEnv ? 'env' : (stored ? 'stored' : 'none')
                    console.log(`${p.padEnd(12)} ${env.padEnd(22)} ${(await hasUsableSecret(p)) ? '[set]' : '[--]'} (${src})`)
                }
                return
            }
            if (action === 'set') {
                known(provider)
                const env = envForProvider(provider)
                const key = await readStdinSecret(`${env} (key, hidden): `)
                if (!key) { console.error('no key provided'); process.exit(1) }
                await getAuthStore().setCredential(env, key)
                console.log(`stored ${env} (${tokenFingerprint(key)})`)
                return
            }
            if (action === 'rm') { known(provider); await clearProviderAuth(provider); console.log(`removed key for ${provider}`); return }
            if (action === 'test') {
                const sdk = await import('acptoapi').catch(() => null)
                const targets = provider ? [provider] : listAuthProviders()
                for (const p of targets) {
                    if (provider) known(p)
                    const has = await hasUsableSecret(p)
                    if (!has) { console.log(`${p.padEnd(12)} [--] no key`); continue }
                    let reachable = true
                    try { if (sdk?.isAvailable) reachable = sdk.isAvailable(p) } catch {}
                    console.log(`${p.padEnd(12)} ${reachable ? '[ok]' : '[backoff]'} key present`)
                }
                return
            }
            console.error('usage: freddie auth [list|set <provider>|rm <provider>|test [provider]|show]'); process.exit(1)
        } })

        // --- Path/workspace management: `freddie project list|create|use|rm|current` ---
        C({ name: 'project', description: 'Manage workspace projects (list|create <name> <path>|use <name>|rm <name>|current)', args: [{ name: 'action', default: 'list' }, { name: 'name' }, { name: 'projectPath' }], action: async (action, name, projectPath) => {
            if (action === 'list') {
                const active = getActiveProject()
                for (const p of listProjects()) console.log(`${p.name === active.name ? '[*]' : '[ ]'} ${p.name.padEnd(16)} ${p.path}\t${(p.created_at || '').slice(0, 10)}`)
                return
            }
            if (action === 'current') { const a = getActiveProject(); console.log(`${a.name}\t${a.path}`); return }
            if (action === 'create') {
                if (!name || !projectPath) { console.error('usage: freddie project create <name> <absolute-path>'); process.exit(1) }
                try { const p = createProject({ name, projectPath }); console.log(`created project ${p.name} -> ${p.path}`) }
                catch (e) { console.error('error:', e.message); process.exit(1) }
                return
            }
            if (action === 'use') {
                if (!name) { console.error('usage: freddie project use <name>'); process.exit(1) }
                try { const p = setActiveProject(name); console.log(`active project: ${p.name} (${p.path})`) }
                catch (e) { console.error('error:', e.message); process.exit(1) }
                return
            }
            if (action === 'rm') {
                if (!name) { console.error('usage: freddie project rm <name>'); process.exit(1) }
                try { deleteProject(name); console.log(`removed project ${name}`) }
                catch (e) { console.error('error:', e.message); process.exit(1) }
                return
            }
            console.error('usage: freddie project [list|create <name> <path>|use <name>|rm <name>|current]'); process.exit(1)
        } })

        // --- Conversation management: `freddie session list|show|rm` -----------
        C({ name: 'session', description: 'Manage conversations (list|show <id>|rm <id>)', args: [{ name: 'action', default: 'list' }, { name: 'id' }], action: async (action, id) => {
            if (action === 'list') {
                const rows = await listSessions()
                if (!rows.length) { console.log('(no conversations yet — run `freddie run`)'); return }
                for (const s of rows) console.log(`${s.id.slice(0, 8)}\t${new Date(s.updated_at).toISOString().slice(0, 16).replace('T', ' ')}\t${s.title || '(untitled)'}`)
                return
            }
            if (action === 'show') {
                if (!id) { console.error('usage: freddie session show <id>'); process.exit(1) }
                const rows = await listSessions(500)
                const target = rows.find(s => s.id === id || s.id.startsWith(id))
                if (!target) { console.error('no session matching:', id); process.exit(1) }
                const s = await getSession(target.id)
                console.log(`# ${s.title || '(untitled)'}  [${s.id.slice(0, 8)}]  ${s.model || ''}  ${new Date(s.created_at).toISOString().slice(0, 16).replace('T', ' ')}`)
                for (const m of await getMessages(target.id)) console.log(`\n${m.role}: ${m.content || (m.tool_calls ? '[tool call]' : '')}`)
                return
            }
            if (action === 'rm') {
                if (!id) { console.error('usage: freddie session rm <id>'); process.exit(1) }
                const rows = await listSessions(500)
                const target = rows.find(s => s.id === id || s.id.startsWith(id))
                if (!target) { console.error('no session matching:', id); process.exit(1) }
                await deleteSession(target.id); console.log(`removed session ${target.id.slice(0, 8)}`)
                return
            }
            console.error('usage: freddie session [list|show <id>|rm <id>]'); process.exit(1)
        } })

        // --- Onboarding: `freddie doctor` one-glance health --------------------
        C({ name: 'doctor', description: 'Health check: keys, active project, conversations, environment', action: async () => {
            const { runDoctor } = await import('../../src/cli/doctor.js')
            console.log('# environment')
            for (const c of await runDoctor()) console.log(`  ${c.ok ? '[ok]' : '[--]'} ${c.name.padEnd(16)} ${c.value || c.fix || ''}`)
            console.log('\n# provider keys')
            let anyKey = false
            for (const p of listAuthProviders()) { const ok = await hasUsableSecret(p); if (ok) anyKey = true; if (ok) console.log(`  [ok] ${p}`) }
            if (!anyKey) console.log('  [--] no provider keys set — run `freddie auth set <provider>` or `freddie setup`')
            const proj = getActiveProject()
            console.log(`\n# workspace\n  active project: ${proj.name}\n  home: ${displayFreddieHome()}  (${getFreddieHome()})`)
            const sessions = await listSessions(500)
            console.log(`\n# conversations\n  ${sessions.length} saved (latest: ${sessions[0] ? (sessions[0].title || sessions[0].id.slice(0, 8)) : 'none'})`)
        } })

        // --- Onboarding: `freddie setup` guided first-run ----------------------
        C({ name: 'setup', description: 'Guided first-run: pick provider, store a key, configure defaults', action: async () => {
            const { setupWizard, getSetupStatus } = await import('../../src/cli/setup.js')
            await setupWizard({})
            const st = getSetupStatus()
            console.log(`\nsetup complete — provider: ${st.provider}, skin: ${st.skin}`)
            console.log('next: `freddie run` to start a conversation, or `freddie doctor` to verify')
        } })

        // --- Contributor onboarding: `freddie contribute` ----------------------
        C({ name: 'contribute', description: 'Find a good-first-issue, print a PRD-row template, run test.js, link the relevant AGENTS.md subsystem row', action: async () => {
            const { execFileSync } = await import('node:child_process')
            const fs = await import('node:fs')
            const path = await import('node:path')

            let owner = null, repo = null
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
                const m = /github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?$/.exec(pkg.repository?.url || pkg.repository || '')
                if (m) { owner = m[1]; repo = m[2] }
            } catch {}
            if (!owner || !repo) {
                try {
                    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim()
                    const m = /github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?$/.exec(remote)
                    if (m) { owner = m[1]; repo = m[2] }
                } catch {}
            }
            if (!owner || !repo) { console.error('could not determine repo owner/name from package.json or git remote'); process.exitCode = 1; return }

            console.log(`# good first issues — ${owner}/${repo}\n`)
            let issues = []
            try {
                const raw = execFileSync('gh', ['issue', 'list', '--repo', `${owner}/${repo}`, '--label', 'good first issue', '--state', 'open', '--json', 'number,title,url,body', '--limit', '10'], { encoding: 'utf8' })
                issues = JSON.parse(raw)
            } catch (e) {
                console.log('(gh CLI unavailable or no access — falling back to the issues URL)')
                console.log(`  https://github.com/${owner}/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22\n`)
            }

            // Subsystem Guide keyword table from AGENTS.md, kept inline since AGENTS.md
            // is prose (not machine-parseable) and this is a best-effort match only.
            const SUBSYSTEM_GUIDE = [
                ['agent loop', 'src/agent/machine.js + @mariozechner/pi-agent-core'],
                ['cli', 'bin/freddie.js (commander) + pi-coding-agent InteractiveMode'],
                ['tool', 'plugins/<name>/{plugin,handler}.js (no src/tools/)'],
                ['toolset', 'src/toolsets.js'],
                ['session', 'src/sessions.js (libsql + FTS5, async API)'],
                ['home', 'src/home.js'], ['profile', 'src/home.js'],
                ['project', 'src/projects.js (isolated FREDDIE_HOME per project)'],
                ['logging', 'src/observability/log.js'], ['observability', 'src/observability/log.js'],
                ['config', 'src/config.js'],
                ['command', 'src/commands/registry.js'],
                ['skin', 'src/skin/engine.js'],
                ['gateway', 'src/gateway/run.js + plugins/platform-*/'], ['platform', 'src/gateway/run.js + plugins/platform-*/'],
                ['acp', 'src/acp/server.js (JSON-RPC stdio)'],
                ['tui', 'substrate (pi-tui + pi-coding-agent)'],
                ['plugin', 'src/plugins/manager.js + src/plugins/memory/provider.js + plugins/memory-*/'],
                ['memory', 'src/plugins/manager.js + src/plugins/memory/provider.js + plugins/memory-*/'],
                ['skill', 'src/skills/index.js — content drops into ~/.freddie/skills/'],
                ['compress', 'src/agent/compress/{tokens,policy,prompt,prune,fallback,compressor,index}.js'],
                ['documentation', 'website/ (flatspace + content/pages/*.yaml + theme.mjs)'], ['website', 'website/ (flatspace + content/pages/*.yaml + theme.mjs)'],
                ['cron', 'src/cron/{scheduler,cron-parse}.js (async API)'],
                ['batch', 'src/batch.js'],
                ['sandbox', 'src/tools/environments/{local,docker,ssh}.js'], ['execution environment', 'src/tools/environments/{local,docker,ssh}.js'],
                ['dashboard', 'src/web/{server,app,state,routes,index.html} — thin mount over anentrypoint-design SDK'], ['gui', 'src/web/{server,app,state,routes,index.html}'],
                ['auth', 'src/auth.js (FileAuthStore) + pi-ai key resolution'], ['key', 'src/auth.js (FileAuthStore) + pi-ai key resolution'],
                ['context', 'src/context/engine.js'],
                ['browser', 'plugins/browser/ (puppeteer-core, lazy)'],
                ['llm', 'src/agent/llm_resolver.js (thin shim over acptoapi.chat)'], ['model', 'src/agent/llm_resolver.js (thin shim over acptoapi.chat)'],
                ['i18n', 'no infra yet — see manifesto items 37-39'], ['locale', 'no infra yet — see manifesto items 37-39'],
                ['test', 'one test.js at root'],
            ]
            const linkSubsystem = (text) => {
                const lower = String(text || '').toLowerCase()
                for (const [kw, loc] of SUBSYSTEM_GUIDE) if (lower.includes(kw)) return loc
                return null
            }

            if (issues.length) {
                for (const it of issues) {
                    console.log(`#${it.number}  ${it.title}`)
                    console.log(`  ${it.url}`)
                    const loc = linkSubsystem(`${it.title} ${it.body || ''}`)
                    if (loc) console.log(`  AGENTS.md subsystem: ${loc}`)
                    console.log(`\n  --- PRD-row template (paste into .gm/prd.yml via the gm skill's prd-add verb) ---`)
                    console.log(`  id: issue-${it.number}-${it.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/-+$/, '')}`)
                    console.log(`  subject: ${it.title}`)
                    console.log(`  status: pending`)
                    console.log(`  description: 'Fixes ${owner}/${repo}#${it.number} — ${it.url}'\n`)
                }
            }

            console.log('# running test.js...')
            try {
                const out = execFileSync(process.execPath, [path.join(process.cwd(), 'test.js')], { encoding: 'utf8', timeout: 120000 })
                console.log(out)
                console.log('[ok] test.js passed — ready to contribute')
            } catch (e) {
                console.log(e.stdout || '')
                console.log(e.stderr || '')
                console.log(`\n[--] test.js failed (exit ${e.status ?? 1}) — fix before opening a PR`)
                process.exitCode = 1
            }
        } })
    },
}
