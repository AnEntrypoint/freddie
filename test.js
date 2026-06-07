import assert from 'node:assert/strict'
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'
const TEST_HOME = path.join(os.tmpdir(), 'freddie-test-' + Date.now())
process.env.FREDDIE_HOME = TEST_HOME; process.env.FREDDIE_PROFILES_ROOT = path.join(TEST_HOME, 'profiles'); process.env.FREDDIE_DISABLE_CC_HOOKS = '1'
fs.mkdirSync(path.join(TEST_HOME, 'profiles'), { recursive: true })
const results = []; const T = async (n, fn) => { try { await fn(); results.push([n,'OK']) } catch (e) { results.push([n,'FAIL: '+(e?.stack||e?.message||e)]) } }
await T('home+config+skin', async () => {
    assert.equal((await import('./src/home.js')).getFreddieHome(), TEST_HOME)
    const s = await import('./src/skin/engine.js'); for (const n of ['default','ares','mono','slate']) assert.ok(s.listBuiltinSkins().includes(n))
    s.setActiveSkin('mono'); assert.equal(s.getActiveSkin().name, 'mono')
})
await T('sessions+FTS5', async () => {
    const { createSession, appendMessage, getMessages, getSession, deleteSession, listSessions, search } = await import('./src/sessions.js')
    const sid = await createSession({ platform: 'cli' })
    for (const t of ['banana smoothie', 'sounds delicious', 'recipe please']) await appendMessage(sid, { role: 'user', content: t })
    assert.equal((await getMessages(sid)).length, 3); assert.ok((await search('banana')).length >= 1)
    // title auto-derives from the first user prompt (scannable session list)
    assert.equal((await getSession(sid)).title, 'banana smoothie', 'title auto-derived from first prompt')
    assert.ok((await listSessions()).some(s => s.id === sid))
    // deleteSession removes the row, its messages, and purges the FTS index
    const del = await deleteSession(sid); assert.ok(del.deleted)
    assert.equal(await getSession(sid), null, 'session row gone after delete')
    assert.equal((await getMessages(sid)).length, 0, 'messages gone after delete')
    assert.ok(!(await search('banana')).some(r => r.session_id === sid), 'FTS purged after delete')
})
await T('cli-verbs-smoke', async () => {
    // test.js can pass while the CLI is broken; smoke each new user-facing verb
    // through the real commander entry so a registration/await regression fails here.
    const { spawnSync } = await import('node:child_process')
    const run = (args) => spawnSync(process.execPath, ['bin/freddie.js', ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, FREDDIE_HOME: TEST_HOME } })
    for (const args of [['auth', 'list'], ['project', 'list'], ['project', 'current'], ['session', 'list'], ['doctor'], ['help-all']]) {
        const r = run(args)
        assert.equal(r.status, 0, `freddie ${args.join(' ')} exit ${r.status}: ${(r.stderr || '').slice(0, 200)}`)
    }
    // auth list surfaces a known provider with its env var
    assert.match(run(['auth', 'list']).stdout, /anthropic\s+ANTHROPIC_API_KEY/, 'auth list shows provider+env')
    // project list shows the protected default with an active marker
    assert.match(run(['project', 'list']).stdout, /\[\*\]\s+default/, 'project list marks active default')
    // unknown provider is rejected with the valid list, not a silent no-op
    const bad = run(['auth', 'set', 'no-such-provider']); assert.notEqual(bad.status, 0); assert.match(bad.stderr, /unknown provider/, 'auth set rejects unknown provider')
    // doctor reports the workspace + conversation sections
    assert.match(run(['doctor']).stdout, /# workspace[\s\S]*active project: default/, 'doctor shows active project')
})
await T('host+tools+toolsets', async () => {
    const ccDir = path.join(TEST_HOME, 'cc-plugins', 'demo'); fs.mkdirSync(path.join(ccDir, '.claude-plugin'), { recursive: true }); fs.mkdirSync(path.join(ccDir, 'skills', 'hello'), { recursive: true }); fs.mkdirSync(path.join(ccDir, 'agents'), { recursive: true }); fs.mkdirSync(path.join(ccDir, 'hooks'), { recursive: true }); fs.writeFileSync(path.join(ccDir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'demo', version: '1.0.0' })); fs.writeFileSync(path.join(ccDir, 'skills', 'hello', 'SKILL.md'), '---\ndescription: hi\n---\nhi'); fs.writeFileSync(path.join(ccDir, 'agents', 'rev.md'), '---\nname: rev\ndescription: r\n---\nbody'); const denyScript = path.join(ccDir, 'deny.mjs'); fs.writeFileSync(denyScript, "process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'no'}}))"); fs.writeFileSync(path.join(ccDir, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'bash', hooks: [{ type: 'command', command: `"${process.execPath}" "${denyScript.replace(/\\/g, '/')}"` }] }] } }))
    const { bootHost, resetHostForTests } = await import('./src/host/index.js'); resetHostForTests(); const h = await bootHost()
    assert.ok(h.ccPlugins().some(p => p.manifest.name === 'demo') && h.pi.skills.list().some(s => s.name === 'demo:hello') && h.pi.agentExts.list().some(a => a.name === 'demo:rev'), 'cc-plugin load')
    const gmSkills = h.pi.skills.list().filter(s => s.name === 'gm-skill' || s.name.startsWith('gm:') || s.name.startsWith('gm-')); assert.ok(gmSkills.length === 1 && gmSkills[0].name === 'gm-skill' && !h.ccPlugins().some(p => p.manifest.name === 'gm-cc'), 'gm-skill canonical only: ' + gmSkills.map(s => s.name).join(','))
    const names = h.pi.tools.list().map(t => t.name); assert.ok(names.length >= 50, 'tool count: ' + names.length)
    for (const n of 'bash,read,write,edit,grep,todo,memory,delegate,browser,approval,checkpoint,clarify,code_execution,cronjob,send_message,session_search,terminal,skill_manager,vision,tts,mixture_of_agents,osv_check,schema_sanitizer,mcp_tool,file_operations,patch_parser,tool_output_limits,file_state,skill_usage'.split(',')) assert.ok(names.includes(n), n)
    const { createHost } = await import('./src/host/host.js'); const E = async (fn, re) => { try { await fn() } catch (e) { return re.test(e.message) } return false }
    assert.ok(await E(() => createHost({ surfaces: ['pi','gui'] }).load([{ name:'p', surfaces:'pi', register({gui}){gui.route('GET','/x',()=>{})} }]), /not allowed/), 'surface guard')
    assert.ok(await E(() => createHost({ surfaces:['pi'] }).load([{name:'a',surfaces:'pi',requires:['b'],register(){}},{name:'b',surfaces:'pi',requires:['a'],register(){}}]), /cycle/), 'cycle')
    assert.ok(h.plugins().length >= 100 && h.pi.platforms.list().length >= 18 && h.pi.memory.list().length >= 8, 'plugin counts: ' + JSON.stringify({ p: h.plugins().length, pl: h.pi.platforms.list().length, mm: h.pi.memory.list().length }))
    const D = (n, a) => h.pi.dispatchTool(n, a).then(r => { try { return JSON.parse(r) } catch { return r } }); const tf = path.join(TEST_HOME, 'tf.txt'); const tf2 = path.join(TEST_HOME, 'tf2.txt')
    assert.match((await D('bash', { command: 'echo hi-freddie', timeout_ms: 5000 })).stdout, /hi-freddie/)
    await D('write', { path: tf, content: 'alpha\nbeta\ngamma' }); assert.match(JSON.stringify(await D('read', { path: tf })), /beta/)
    await D('edit', { path: tf, old_string: 'beta', new_string: 'BETA' }); assert.match(JSON.stringify(await D('grep', { pattern: 'BETA', path: TEST_HOME })), /BETA/)
    await D('todo', { action: 'add', content: 'task-x' }); assert.match(JSON.stringify(await D('todo', { action: 'list' })), /task-x/)
    await D('checkpoint', { action: 'save', name: 'cp1', data: { v: 1 } }); assert.equal((await D('checkpoint', { action: 'load', name: 'cp1' })).data.v, 1)
    { const mfact = 'freddie memory smoke fact: the quick brown fox sentinel ' + Date.now(); const ma = await D('memory', { action: 'add', content: mfact, namespace: 'freddie-test' }); assert.ok(ma.key || ma.stored === 'noop', 'memory add: ' + JSON.stringify(ma)); if (ma.key) { const ms = await D('memory', { action: 'search', query: 'quick brown fox sentinel', namespace: 'freddie-test', limit: 3 }); assert.match(JSON.stringify(ms), /quick brown fox sentinel/, 'memory search roundtrip') } }
    await D('file_state', { action: 'record', session_id: 's1', file_path: tf, op: 'write' }); assert.match(JSON.stringify(await D('file_state', { action: 'list', session_id: 's1' })), /tf\.txt/)
    await D('file_operations', { action: 'copy', src: tf, dest: tf2 }); assert.ok(fs.existsSync(tf2)); assert.ok((await D('skill_usage', { action: 'record', name: 'sk' })).recorded)
    const ts = await import('./src/toolsets.js'); assert.ok((await ts.getEnabledToolSchemas(['core'])).length >= ts._FREDDIE_CORE_TOOLS.length)
    const { definePlugin: dp, HookType: HT } = await import('./src/host/contract.js'); const pp = dp({ name: 'sdk-smoke' }); assert.equal(pp.name, 'sdk-smoke'); assert.equal(HT.PRE_TOOL_USE, 'pre_tool_use')
})
await T('agent-machine', async () => {
    const { runTurn } = await import('./src/agent/machine.js')
    const echo = async ({ messages }) => ({ content: 'echo: ' + (messages[messages.length - 1]?.content || ''), tool_calls: [] })
    assert.match((await runTurn({ prompt: 'ping', callLLM: echo, timeoutMs: 5000 })).messages[1].content, /ping/)
    let phase = 0; const callLLM = async () => phase++ === 0 ? { content: '', tool_calls: [{ id: 'c1', name: 'bash', arguments: { command: 'echo loop-ok', timeout_ms: 5000 } }] } : { content: 'done', tool_calls: [] }
    const out = await runTurn({ prompt: 'use tool', callLLM, timeoutMs: 10000 }); assert.equal(out.result, 'done'); assert.match(out.messages.find(m => m.role === 'tool').content, /loop-ok/)
    const { resolveCallLLM, PROVIDER_KEYS, DEFAULTS } = await import('./src/agent/llm_resolver.js')
    const { isReachable } = await import('./src/agent/acptoapi-bridge.js')
    const { markFailed, isAvailable, resetAvailability, getStatus, stopSampler } = (await import('module')).createRequire(import.meta.url)('acptoapi')
    assert.equal(isAvailable('testprov-x'), true); markFailed('testprov-x'); assert.equal(isAvailable('testprov-x'), false)
    for (let i = 0; i < 5; i++) markFailed('testprov-x'); const st = getStatus().find(s => s.provider === 'testprov-x'); assert.ok(st.failCount === 6 && st.nextCheckIn <= 480_000 && st.nextCheckIn > 0); resetAvailability('testprov-x'); assert.equal(isAvailable('testprov-x'), true); stopSampler()
    const md = await import('./src/agent/model-discovery.js'); const kp = md.listKnownProviders(); assert.ok(Object.keys(PROVIDER_KEYS).length >= 15 && DEFAULTS.cerebras && DEFAULTS.google && DEFAULTS.mistral && kp.length >= 17 && kp.includes('claude-cli') && kp.includes('kilo') && kp.includes('opencode'), 'providers: '+kp.length)
    const cv = await import('./src/config.js'); cv.saveConfigValue('agent.model_queues', { test_q: [{ provider: 'no-such-provider', model: 'x' }] }); try { await resolveCallLLM({ model: 'queue/nonexistent' })({ messages: [{ role: 'user', content: 'x' }], tools: [] }) } catch (e) { assert.match(e.message, /queue not found/) }; try { await resolveCallLLM({ model: 'queue/test_q' })({ messages: [{ role: 'user', content: 'x' }], tools: [] }) } catch (e) { assert.match(e.message, /chain (exhausted|empty)/) }; cv.saveConfigValue('agent.model_queues', {})
    const savedKeys = {}; for (const k of Object.values(PROVIDER_KEYS)) { savedKeys[k] = process.env[k]; delete process.env[k] }; try { await resolveCallLLM({})({ messages: [{ role: 'user', content: 'x' }], tools: [] }) } catch (e) { assert.match(e.message, /no LLM backend/) }; for (const [k, v] of Object.entries(savedKeys)) { if (v !== undefined) process.env[k] = v }
    if (await isReachable()) { const r = await resolveCallLLM({ model: 'claude/haiku' })({ messages: [{ role: 'user', content: 'reply with exactly: REAL_OK' }], tools: [] }); assert.match(r.content, /REAL_OK/) }
})
await T('gateway+platforms+hooks', async () => {
    const { Gateway } = await import('./src/gateway/run.js')
    const { makePlatform, listPlatformNames } = await import('./src/gateway/platforms.js')
    const { registerBuiltinHooks } = await import('./src/gateway/builtin_hooks/index.js')
    const wh = await makePlatform('webhook', { port: 0 })
    const gw = new Gateway({ platforms: { webhook: wh } })
    registerBuiltinHooks(gw); assert.ok(gw.hooks.inbound.length >= 4)
    const got = new Promise(r => wh.once('message', () => r()))
    await gw.start()
    const res = await fetch(`http://127.0.0.1:${wh.port}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: 't', text: 'x' }) })
    assert.equal(res.status, 200); await got; await gw.stop()
    const names = await listPlatformNames(); assert.ok(names.length >= 18, 'platforms: ' + names.length)
    for (const s of ['telegram','discord','slack','whatsapp','signal','matrix','mattermost','email','sms','dingtalk','wecom','weixin','feishu','qqbot','bluebubbles','homeassistant']) {
        const inst = await makePlatform(s, {}); assert.ok(Array.isArray(inst.getRequiredEnv()), s)
    }
})
await T('acp-full', async () => {
    const { AcpServer } = await import('./src/acp/server.js'); const { Readable, Writable } = await import('node:stream')
    const out = []; const w = new Writable({ write(c, _, cb) { out.push(c.toString()); cb() } }); const r = new Readable({ read() {} })
    const srv = new AcpServer({ stdin: r, stdout: w }); srv.start()
    r.push(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n')
    r.push(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tool.list' }) + '\n')
    await new Promise(x => setTimeout(x, 300))
    const lines = out.join('').trim().split('\n').map(l => JSON.parse(l))
    assert.equal(lines[0].result.name, 'freddie'); assert.ok(lines[0].result.events.includes('tool.start'))
    assert.ok(lines[1].result.tools.length >= 50); srv.stop()
    const { Events } = await import('./src/acp/events.js')
    const sent = []; Events.toolStart((o) => sent.push(o), { name: 't' }); assert.equal(sent[0].method, 'event/tool.start')
    const { checkPermission, rememberAllow, resetForTests } = await import('./src/acp/permissions.js')
    resetForTests(); assert.equal(checkPermission('s1', 'bash'), 'ask'); rememberAllow('s1', 'bash'); assert.equal(checkPermission('s1', 'bash'), 'allow')
})
await T('machines-resumability', async () => {
    const { createMachine, createActor } = await import('xstate')
    const ss = await import('./src/machines/snapshot-store.js')
    const { createPersistentActor } = await import('./src/machines/persistent-actor.js')
    // load() returns null for missing snapshot — consumers fall back to fresh, never throw.
    assert.equal(await ss.load('agent', 'no-such-key'), null)
    // Persist a mid-state snapshot, simulate restart by rehydrating into a fresh actor.
    const m = createMachine({ id: 'tmach', initial: 'a', context: ({ input }) => ({ n: input?.n || 0 }), states: { a: { on: { GO: 'b' } }, b: { on: { FIN: 'done' } }, done: { type: 'final' } } })
    const pa = await createPersistentActor(m, { kind: 'test', key: 'k1', input: { n: 7 } })
    pa.actor.send({ type: 'GO' }); await pa.flush()
    const row = await ss.load('test', 'k1'); assert.ok(row, 'snapshot persisted')
    const revived = createActor(m, { snapshot: row }); revived.start()
    assert.equal(revived.getSnapshot().value, 'b', 'resumes at same state'); assert.equal(revived.getSnapshot().context.n, 7, 'resumes with same context'); revived.stop()
    // Rehydrating via createPersistentActor sets resumed=true and continues from 'b'.
    const pa2 = await createPersistentActor(m, { kind: 'test', key: 'k1', input: { n: 0 } })
    assert.equal(pa2.resumed, true); assert.equal(pa2.actor.getSnapshot().value, 'b', 'persistent resume at b')
    // Reaching final clears the snapshot — no resurrection on next boot.
    pa2.actor.send({ type: 'FIN' }); await pa2.flush()
    assert.equal(await ss.load('test', 'k1'), null, 'final state cleared snapshot')
    // schema_version mismatch discards stale snapshot on load.
    await ss.persist('test', 'k2', { status: 'active', value: 'x' })
    const { db } = await import('./src/db.js'); await (await db()).prepare(`UPDATE machine_snapshots SET schema_version = 999 WHERE kind='test' AND key='k2'`).run()
    assert.equal(await ss.load('test', 'k2'), null, 'schema mismatch discarded')
    // list() filters by status; sweepDone removes final rows.
    await ss.persist('test', 'k3', { status: 'active', value: 'live' }); await ss.persist('test', 'k4', { status: 'done', value: 'fin' })
    assert.ok((await ss.list({ kind: 'test', status: 'active' })).some(r => r.key === 'k3'))
    await ss.sweepDone(); assert.ok(!(await ss.list({ kind: 'test', status: null })).some(r => r.key === 'k4'), 'sweepDone removed final')
    await ss.clear('test', 'k3')
    // resumeAll runs without throwing on a clean store.
    const { resumeAll } = await import('./src/machines/resume.js'); const sum = await resumeAll(); assert.ok(typeof sum.resumed === 'object' || Array.isArray(sum.resumed))
    // /api/machines route returns census.
    const dash = await (await import('./src/web/server.js')).createDashboard({ port: 0 })
    await ss.persist('agent', 'route-probe', { status: 'active', value: 'prompting' })
    const mr = await (await fetch(dash.url + 'api/machines')).json(); assert.ok(typeof mr.count === 'number' && mr.kinds && Array.isArray(mr.machines), 'machines census')
    assert.ok(mr.machines.some(x => x.kind === 'agent' && x.key === 'route-probe' && x.state === 'prompting'), 'route surfaces snapshot state')
    await ss.clear('agent', 'route-probe'); await dash.stop()
})
await T('step-journal-compute', async () => {
    const { runStep, isStepDone, listSteps, clearSteps } = await import('./src/machines/step-journal.js')
    await clearSteps('s-test')
    let calls = 0; const fn = async () => { calls++; return { v: 42 } }
    const r1 = await runStep('s-test', 'step1', fn); const r2 = await runStep('s-test', 'step1', fn)
    assert.deepEqual(r1, { v: 42 }); assert.deepEqual(r2, { v: 42 }); assert.equal(calls, 1, 'fn ran once (cache hit)')
    assert.equal(await isStepDone('s-test', 'step1'), true); assert.equal(await isStepDone('s-test', 'nope'), false)
    assert.ok((await listSteps('s-test')).some(s => s.step_id === 'step1' && s.status === 'done'), 'listSteps shows done step1')
    let c2 = 0; await runStep('s-test', 'step2', async () => { c2++; return 1 }); await runStep('s-test', 'step2', async () => { c2++; return 1 }); assert.equal(c2, 1); assert.equal(calls, 1, 'no cross-contamination')
    await clearSteps('s-test'); assert.equal((await listSteps('s-test')).length, 0); assert.equal(await isStepDone('s-test', 'step1'), false)
    let c3 = 0; await runStep(null, 'x', async () => { c3++; return 9 }); await runStep(null, 'x', async () => { c3++; return 9 }); assert.equal(c3, 2, 'falsy sessionKey bypasses journaling')
    const { runTurn } = await import('./src/agent/machine.js')
    let llmCalls = 0; const callLLM = async () => { llmCalls++; return llmCalls === 1 ? { content: '', tool_calls: [{ id: 'jc1', name: 'bash', arguments: { command: 'echo journaled', timeout_ms: 5000 } }] } : { content: 'done', tool_calls: [] } }
    const out = await runTurn({ prompt: 'p', callLLM, sessionKey: 'resume-test', timeoutMs: 10000 })
    assert.equal(out.result, 'done'); assert.ok(out.messages.find(m => m.role === 'tool')?.content.includes('journaled'), 'journaling does not break agent loop')
})
await T('plugins+memory', async () => {
    const { createHost } = await import('./src/host/host.js')
    const h = createHost({ surfaces: ['pi', 'gui'] }); let fired = 0
    await h.load([{ name: 'noop', surfaces: 'pi', register({ hooks }) { hooks.on('preToolCall', async p => { fired++; return p?.args?.deny ? { ...p, behavior:'block', reason:'no' } : { ...p, systemMessage:'sm', additionalContext:'ac' } }); for (const n of ['onPreCompact','onPostCompact','onMessageInbound','onMessageOutbound','onSessionStart','onSessionEnd','postToolCall']) hooks.on(n, async p => p) } }])
    const hr = await h.hooks.invoke('preToolCall', { name: 'bash', args: {} }); assert.equal(fired, 1); assert.equal(hr.systemMessage, 'sm'); assert.equal(hr.additionalContext, 'ac'); assert.equal((await h.hooks.invoke('preToolCall', { name: 'bash', args: { deny: true } })).behavior, 'block')
    const { FREDDIE_TO_SDK_HOOK: FS, FREDDIE_TO_NATIVE_HOOK: FN, HOOK_NAMES: HN } = await import('./src/host/contract.js'); for (const n of ['onPreCompact','onPostCompact','onMessageInbound','onMessageOutbound','onSessionStart','onSessionEnd','preToolCall','postToolCall']) assert.ok(HN.includes(n) && FS[n] && FN[n], n)
    const { runTurn, invokeCompactHooks } = await import('./src/agent/machine.js'); const { bootHost: bh } = await import('./src/host/index.js'); const sh = await bh(); sh.hooks.on('preToolCall', async p => p?.args?.deny ? { ...p, behavior:'block', reason:'no' } : p); let bk = 0; const blocked = await runTurn({ prompt: 'p', callLLM: async () => bk++ === 0 ? { content: '', tool_calls: [{ id: 'd1', name: 'bash', arguments: { deny: true } }] } : { content: 'done', tool_calls: [] }, timeoutMs: 10000 }); assert.match(JSON.stringify(blocked.messages), /tool call denied by plugsdk hook/, 'denial chat error'); const ch = await invokeCompactHooks({ trigger:'manual', messages:[{role:'user',content:'x'}] }); assert.ok(ch.pre || ch.skipped, 'compact')
    const { listMemoryProviders, createMemoryProvider } = await import('./src/plugins/memory/provider.js'); for (const n of ['honcho','mem0','holographic','retaindb']) assert.ok(listMemoryProviders().includes(n))
    const holo = createMemoryProvider('holographic', {}); await holo.syncTurn([{ role: 'user', content: 'test' }]); assert.ok((await holo.prefetch('test')).items.length >= 1)
    const { metricsText, inc } = await import('./src/plugins/observability/index.js')
    inc('test_counter', 7); assert.match(metricsText(), /freddie_counter\{name="test_counter"\} 7/)
    const { award, listAchievements } = await import('./src/plugins/achievements/index.js')
    await award('test-award'); assert.ok((await listAchievements()).some(a => a.name === 'test-award'))
})
await T('gm-learn', async () => {
    const gl = await import('./src/learn/gm-learn.js')
    // Empty/whitespace inputs are no-ops without touching the wasm.
    assert.equal(await gl.memorize('   '), null, 'empty memorize -> null')
    assert.deepEqual(await gl.recall(''), [], 'empty recall -> []')
    assert.deepEqual(await gl.prune([]), { pruned: 0 }, 'empty prune -> 0')
    // Semantic roundtrip (best-effort: skips assertion if gm wasm unavailable, never fails).
    const ns = 'freddie-gmlearn-test'
    const fact = 'gm-learn group sentinel: the platypus eats the violet pancake ' + Date.now()
    const key = await gl.memorize(fact, { namespace: ns })
    if (key) {
        assert.ok(typeof key === 'string', 'memorize returns a key')
        const hits = await gl.recall('platypus violet pancake', { limit: 3, namespace: ns })
        assert.ok(hits.length >= 1, 'recall returns the memorized fact')
        assert.ok(hits[0].text.includes('platypus'), 'recall hit content')
        assert.ok(typeof hits[0].score === 'number', 'recall hit has score')
        // Empty-db corner: a never-used namespace recalls cleanly to [].
        const none = await gl.recall('zzz nonexistent query', { limit: 3, namespace: 'freddie-empty-ns-' + Date.now() })
        assert.ok(Array.isArray(none), 'recall on empty namespace returns array')
        // Context engine uses query-aware recall over gm rs-learn.
        const { buildContext } = await import('./src/context/engine.js')
        const blocks = await buildContext({ plugins: ['memory'], message: 'platypus violet pancake', options: { namespace: ns } })
        assert.ok(blocks.some(b => /platypus/.test(b.body)), 'context memory block recalls fact')
        // prune requires an explicit key (never blind similarity-delete).
        const forget = await (await import('./src/host/index.js')).bootHost().then(h => h.pi.dispatchTool('memory', { action: 'forget' }))
        assert.match(JSON.stringify(forget), /key required/, 'forget without key errors')
    } else {
        assert.ok(gl.learnAvailable() === false, 'no key only acceptable when gm rs-learn unavailable')
    }
})
await T('gm-learn-browser', async () => {
    // Exercise the BROWSER learning path WITHOUT the real wasm. gm-learn detects the
    // browser via `typeof window !== 'undefined'`, then routes verbs through a
    // host-provided globalThis.__GM_DISPATCH__ bridge.
    try {
        // Trip _isBrowser + install a mock dispatch BEFORE the (cache-busted) import,
        // so the fresh module instance picks them up on a clean _pk singleton.
        globalThis.window = {}
        globalThis.__GM_DISPATCH__ = (verb, body) => {
            if (verb === 'memorize-fire') return { ok: true, data: { key: 'mem-test-1' } }
            if (verb === 'recall') return { ok: true, data: { hits: [{ text: 'browser fact', score: 0.9, key: 'mem-test-1', namespace: 'ns1' }] } }
            if (verb === 'auto-recall') return { hits: [] }
            if (verb === 'memorize-prune') return { ok: true, data: { pruned: 1 } }
            return { ok: false }
        }
        const gl = await import('./src/learn/gm-learn.js?browsertest=' + Date.now())
        assert.equal(gl.learnAvailable(), true, 'browser bridge makes learn available')
        // memorize routes 'memorize-fire' through the bridge and returns the host key.
        assert.equal(await gl.memorize('x'), 'mem-test-1', 'browser memorize returns host key')
        // recall normalizes the bridge response into a flat hit list.
        const hits = await gl.recall('q')
        assert.equal(hits.length, 1, 'browser recall returns one hit')
        assert.equal(hits[0].text, 'browser fact', 'browser recall hit text')
        assert.equal(hits[0].score, 0.9, 'browser recall hit score')
        // projectNamespace falls back to 'default' when __GM_NAMESPACE__ unset.
        assert.equal(await gl.projectNamespace(), 'default', 'namespace defaults to "default"')
        // ...and resolves a function-valued __GM_NAMESPACE__ when the host sets one.
        globalThis.__GM_NAMESPACE__ = () => 'ns-x'
        assert.equal(await gl.projectNamespace(), 'ns-x', 'namespace resolves host fn')
        delete globalThis.__GM_NAMESPACE__
        // prune routes 'memorize-prune' and surfaces the host's pruned count.
        assert.deepEqual(await gl.prune('mem-test-1'), { pruned: 1 }, 'browser prune returns host count')

        // Graceful no-op: with no bridge wired, a FRESH module instance degrades to
        // empty results and never throws into the agent loop.
        delete globalThis.__GM_DISPATCH__
        const gl2 = await import('./src/learn/gm-learn.js?browsertest=' + Date.now())
        assert.equal(gl2.learnAvailable(), false, 'no bridge -> learn unavailable')
        assert.deepEqual(await gl2.recall('q'), [], 'no-bridge recall -> []')
        assert.equal(await gl2.memorize('x'), null, 'no-bridge memorize -> null')
    } finally {
        delete globalThis.window
        delete globalThis.__GM_DISPATCH__
        delete globalThis.__GM_NAMESPACE__
    }
})
await T('profiles+observability+auth+env+context+cron+batch+slash+skills', async () => {
    const cr = await import('./src/commands/registry.js')
    assert.ok(cr.COMMAND_REGISTRY.length >= 10 && cr.resolveCommand('/bg') === 'background' && cr.gatewayHelpLines().length >= 5 && cr.slackAppManifest().features.slash_commands[0].command.startsWith('/') && cr.discordSkillCommands().length >= 1)
    const cm = await import('./src/cli/completer.js'); assert.ok(new cm.SlashCommandCompleter().suggest('/ba')[0].value === '/background' && new cm.FuzzyMatcher(['anthropic','openrouter','xai']).match('or')[0] === 'openrouter' && typeof cm.createCompleter().suggest === 'function')
    const sd = path.join(TEST_HOME, 'skills', 'fixture'); fs.mkdirSync(sd, { recursive: true })
    fs.writeFileSync(path.join(sd, 'SKILL.md'), '---\nname: fixture\ndescription: t\n---\nbody')
    const { listSkills, findSkill, skillAsUserMessage } = await import('./src/skills/index.js')
    assert.ok(listSkills().find(s => s.name === 'fixture') && findSkill('fixture').description === 't' && /\[skill:fixture\]/.test(skillAsUserMessage('fixture', 'arg').content) && listSkills([path.resolve('skills')]).length >= 3)
    const pm = await import('./src/commands/profile.js')
    pm.createProfile('coder'); pm.renameProfile('coder', 'devops'); assert.ok(pm.listAllProfiles().includes('devops'))
    fs.writeFileSync(path.join(TEST_HOME, 'profiles', 'devops', 'config.yaml'), 'agent:\n  provider: anthropic\n')
    const exp = pm.exportProfile('devops', TEST_HOME); pm.deleteProfile('devops'); pm.importProfile(exp, 'imported'); assert.ok(pm.listAllProfiles().includes('imported')); pm.deleteProfile('imported')
    const ob = await import('./src/observability/debug.js'); (await import('./src/observability/log.js')).log({ subsystem: 'unit', severity: 'info', msg: 'h' })
    ob.registerDebug('unit', () => ({ ok: 1 })); assert.ok(ob.listDebug().includes('unit')); assert.equal(ob.snapshot('unit').ok, 1)
    const au = await import('./src/auth.js')
    await au.getAuthStore().setCredential('test', { key: 'abc' }); assert.equal((await au.getAuthStore().getCredential('test')).value.key, 'abc')
    assert.ok(au.isKnownAuthProvider('anthropic') && au.envForProvider('openai') === 'OPENAI_API_KEY' && au.isExpiring({ expires_at: Math.floor(Date.now() / 1000) - 1 })); assert.match(au.tokenFingerprint('abcdef1234567890'), /abcd…7890/)
    const cv = await import('./src/config.js'); assert.ok(Array.isArray(cv.validateConfigStructure({}))); assert.equal(cv.expandEnvVars('${HOME_X_NA}'), '')
    const sv = await import('./src/gateway/service.js'), oe = await import('./src/agent/oauth_endpoints.js'); assert.ok(sv.getRuntimeSnapshot().serviceName.startsWith('freddie-gateway') && /Environment=K=V/.test(sv.renderSystemdUnit({ execStart: 'x', envVars: { K: 'V' } })) && oe.resolveKimiBaseUrl().includes('moonshot') && oe.resolveZaiBaseUrl({ endpoint: 'https://api.z.ai' }).includes('z.ai') && oe.isCodexAccessTokenExpiring('bad.jwt'))
    const fix = path.join(TEST_HOME, 'fix'); fs.mkdirSync(fix, { recursive: true }); fs.writeFileSync(path.join(fix, '.freddie-context'), 'hello-ctx')
    assert.ok((await (await import('./src/context/engine.js')).buildContext({ plugins: ['file'], options: { cwd: fix } })).find(b => b.body.includes('hello-ctx')))
    const cp = await import('./src/cron/cron-parse.js'); assert.ok(cp.matches(cp.parseCron('* * * * *'), new Date()))
    const sch = await import('./src/cron/scheduler.js'); const id = await sch.createJob({ cron: '*/5 * * * *', prompt: 'tick' }); assert.ok((await sch.listJobs()).some(j => j.id === id)); await sch.deleteJob(id)
    const batchLLM = async ({ messages }) => ({ content: 'b:' + (messages[messages.length - 1]?.content || ''), tool_calls: [] })
    assert.equal((await (await import('./src/batch.js')).runBatch({ prompts: ['a', 'b', 'c'], concurrency: 2, callLLM: batchLLM })).results.length, 3)
})
await T('utils+time+redact+model-meta+agent-helpers', async () => {
    const u = await import('./src/utils.js')
    assert.equal(u.ansiStrip('\x1b[31mhi\x1b[0m'), 'hi'); assert.match(u.redactSecret('Bearer sk-1234567890abcdefghij'), /\[REDACTED\]/)
    let n = 0; assert.equal(await u.retry({ fn: async () => { if (n++ < 1) throw new Error('x'); return 'ok' }, attempts: 3, backoff: 1 }), 'ok')
    assert.equal((await import('./src/time.js')).parseDuration('5m'), 300_000)
    assert.match((await import('./src/agent/redact.js')).redactSensitive('sk-ant-1234567890abcdefghij'), /\[REDACTED\]/)
    const mm = await import('./src/agent/model_metadata.js'); assert.ok(mm.getModelContextLength('claude-opus-4-7') > mm.MINIMUM_CONTEXT_LENGTH)
    assert.equal((await import('./src/agent/image_routing.js')).routeImagesNative([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }] }], 'anthropic')[0].content[0].type, 'image')
    assert.equal((await import('./src/agent/error_classifier.js')).classifyError({ message: 'rate limit 429' }).kind, 'rate_limit')
    assert.ok(!(await import('./src/agent/file_safety.js')).checkFileSafety('/etc/passwd').safe)
    assert.match((await import('./src/agent/title_generator.js')).generateTitle('hello world there'), /Hello/)
    assert.ok((await import('./src/agent/usage_pricing.js')).calculateCost({ model: 'claude-sonnet-4-6', prompt_tokens: 1_000_000, completion_tokens: 0 }) > 0)
    let m = 0; assert.equal(await (await import('./src/agent/retry_utils.js')).retryAsync(async () => { if (m++ < 1) throw new Error('rate limit 429'); return 'done' }, { attempts: 3, backoff: 1 }), 'done')
    const pc = await import('./src/agent/prompt_caching.js'); assert.ok(pc.countBreakpoints(pc.annotateBreakpoints([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }])) >= 1)
    for (const [f, k] of [['anthropic_adapter','chat'],['bedrock_adapter','chat'],['codex_responses_adapter','chat'],['auxiliary_client','call_llm'],['gemini_native_adapter','chat'],['gemini_cloudcode_adapter','chat'],['google_oauth','getToken'],['google_code_assist','complete'],['image_gen_provider','generate'],['image_gen_registry','generateAndRecord']]) assert.equal(typeof (await import('./src/agent/' + f + '.js'))[k], 'function', f)
})
await T('mcp+swe+distributions+account+credpool', async () => {
    const { McpServer } = await import('./src/mcp/server.js'); const { Readable, Writable } = await import('node:stream')
    const out = []; const w = new Writable({ write(c, _, cb) { out.push(c.toString()); cb() } }); const r = new Readable({ read() {} })
    const srv = new McpServer({ stdin: r, stdout: w }); srv.start()
    r.push(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n')
    r.push(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
    await new Promise(x => setTimeout(x, 400))
    const lines = out.join('').trim().split('\n').map(l => JSON.parse(l))
    assert.equal(lines[0].result.serverInfo.name, 'freddie-mcp'); assert.ok(lines[1].result.tools.length >= 50); srv.stop()
    const { runMiniSwe } = await import('./src/swe/runner.js')
    const swe = await runMiniSwe({ task: { prompt: 'hi' }, timeoutMs: 5000, callLLM: async () => ({ content: 'ok', tool_calls: [] }) })
    assert.ok(typeof swe.passed === 'boolean')
    const { listDistributions, getDistribution } = await import('./src/toolset_distributions.js')
    assert.ok(listDistributions().length >= 3); assert.ok(getDistribution('coder').enabledToolsets.includes('core'))
    const { record, totalLifetime } = await import('./src/agent/account_usage.js')
    await record({ sessionId: 't', model: 'm', promptTokens: 10, completionTokens: 5, costUsd: 0.01 })
    assert.ok((await totalLifetime()).prompt >= 10)
    const cp = await import('./src/agent/credential_pool.js')
    cp.resetForTests(); process.env.TESTPROVIDER_API_KEYS = 'k1,k2,k3'
    assert.ok(['k1','k2','k3'].includes(cp.next('testprovider')))
})
await T('compressor+trajectory', async () => {
    const { compress, shouldCompress, SUMMARY_PREFIX } = await import('./src/agent/compress/index.js')
    const long = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'msg-' + i + ' '.repeat(800) }))
    assert.equal(shouldCompress({ messages: long, modelContextLength: 1000 }), true)
    const out = await compress({ messages: long, modelContextLength: 1000, callLLM: async () => ({ content: '## Active Task\nfoo', tool_calls: [] }) })
    assert.equal(out.didCompress, true); assert.ok(out.compressedMessages.some(m => typeof m.content === 'string' && m.content.startsWith(SUMMARY_PREFIX)))
    assert.ok((await import('./src/agent/trajectory.js')).compressTrajectory({ messages: long, maxKeep: 5 }).compressed.length < long.length)
})
await T('env+pi+cli+tui+setup+website+helpers', async () => {
    const envs = await import('./src/tools/environments/index.js'); assert.match((await envs.createEnvironment('local', {}).run('echo env-ok')).stdout, /env-ok/)
    for (const n of ['local','docker','ssh','modal','managed_modal','daytona','singularity','vercel_sandbox']) assert.ok(envs.listEnvironments().includes(n) && typeof envs.syncTo === 'function', n)
    const su = await import('./src/cli/setup.js'); for (const fn of ['setupWizard','setupModelProvider','setupTerminalBackend','setupTts','setupGatewayPlatform','setupAgentSettings','setupSkin','getSetupStatus']) assert.equal(typeof su[fn], 'function', fn)
    for (const m of ['./src/agent/pi-bridge.js','./src/cli/interactive.js','./src/tui/index.js','./src/cli/main.js']) { const mm = await import(m); assert.ok(Object.values(mm).some(v => typeof v === 'function'), m) }
    assert.match((await import('./src/cli/colors.js')).fg.red('hi'), /\x1b\[31m/); assert.equal((await import('./src/cli/model_normalize.js')).normalizeModel('sonnet'), 'claude-sonnet-4-6')
    const wh = await import('./src/gateway/helpers.js'); assert.ok((await import('./src/cli/model_catalog.js')).listCatalog().length >= 5 && (await import('./src/cli/doctor.js')).runDoctor().some(c => c.name === 'node-version') && wh.hmacVerify('s', 'b', wh.hmacSign('s', 'b')))
    assert.ok((await (await import('./src/acp/auth.js')).authenticateRequest({})).ok && (await (await import('./src/acp/tools.js')).listToolsForAcp()).length >= 50)
    const wh2 = fs.readFileSync(path.join('website', 'docs/index.html'), 'utf8'); for (const m of ['ds-hero-title', 'rail-green', 'when do I reach']) assert.ok(wh2.includes(m), m)
    const dash = await (await import('./src/web/server.js')).createDashboard({ port: 0 })
    const G = (p) => fetch(dash.url + p); const gs = async (...ps) => { for (const p of ps) assert.equal((await G(p)).status, 200, p) }; const P = (p, b) => fetch(dash.url + p, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(b) })
    await gs('api/sessions','api/auth','api/tools','api/cron','api/skills','api/config','api/env','api/debug','api/debug-all','api/gateway','api/profiles','api/commands','api/health','api/logs','api/search?q=test','api/tools/detail','api/models/providers','api/models/cached','api/models/queues','api/models/sampler','v1/models')
    // Dashboard key management (gui-auth): set/inspect/remove a provider key.
    const SECRET = 'sk-test-DASHBOARD-KEY-9999'
    // Use a provider whose env var is NOT present in the test process so the
    // stored-source path is exercised deterministically.
    const KP = ['deepseek','zai','kimi','perplexity'].find(p => !process.env[({deepseek:'DEEPSEEK_API_KEY',zai:'ZAI_API_KEY',kimi:'KIMI_API_KEY',perplexity:'PERPLEXITY_API_KEY'})[p]]) || 'deepseek'
    const aset = await P('api/auth', { provider: KP, key: SECRET }); assert.equal(aset.status, 200, 'POST /api/auth set')
    const alist = await (await G('api/auth')).json()
    const mrow = alist.find(r => r.provider === KP); assert.ok(mrow && mrow.set && mrow.source === 'stored', 'auth shows stored key for ' + KP)
    assert.ok(!JSON.stringify(alist).includes(SECRET), 'GET /api/auth never leaks the raw key')
    assert.equal(mrow.fingerprint, SECRET.slice(0,4) + '…' + SECRET.slice(-4), 'fingerprint masks the key')
    const adel = await fetch(dash.url + 'api/auth/' + KP, { method: 'DELETE' }); assert.equal(adel.status, 200)
    assert.ok(!(await (await G('api/auth')).json()).find(r => r.provider === KP).set, 'stored key removed')
    assert.equal((await P('api/auth', { provider: 'bogus', key: 'x' })).status, 400, 'unknown provider -> 400')
    assert.equal((await P('api/auth', { provider: 'mistral', key: '' })).status, 400, 'empty key -> 400')
    // gui-sessions delete + single-get
    const { createSession: _cs, appendMessage: _am } = await import('./src/sessions.js')
    const delSid = await _cs({ platform: 'cli' }); await _am(delSid, { role: 'user', content: 'gui-delete-me' })
    assert.equal((await G('api/sessions/' + delSid)).status, 200, 'GET single session')
    assert.equal((await G('api/sessions/no-such-id')).status, 404, 'missing session -> 404')
    assert.equal((await fetch(dash.url + 'api/sessions/' + delSid, { method: 'DELETE' })).status, 200, 'DELETE session')
    assert.equal((await G('api/sessions/' + delSid)).status, 404, 'session gone after delete')
    const { listKnownProviders, flattenForOpenAI } = await import('./src/agent/model-discovery.js'); assert.ok(listKnownProviders().includes('anthropic') && listKnownProviders().includes('openai') && listKnownProviders().includes('claude-cli') && listKnownProviders().length >= 17)
    const qr = await P('api/models/queues', { name: 'q1', entries: [{ provider: 'groq', model: 'x' }] }); assert.equal(qr.status, 200); const qg = await (await G('api/models/queues')).json(); assert.ok(qg.q1); const qd = await fetch(dash.url + 'api/models/queues/q1', { method: 'DELETE' }); assert.equal(qd.status, 200); assert.ok(Array.isArray(flattenForOpenAI()))
    const v1bad = await P('v1/chat/completions', { messages: [] }); assert.equal(v1bad.status, 400)
    const cj = await (await P('api/cron', { cron: '*/5 * * * *', prompt: 'tick' })).json(); assert.ok(cj.id)
    assert.equal((await fetch(dash.url + 'api/cron/' + cj.id, { method: 'DELETE' })).status, 200); assert.equal((await P('api/config', { key: 'display.skin', value: 'mono' })).status, 200); assert.equal((await P('api/batch', { prompts: [] })).status, 400)
    const pp = path.join('..', 'penguins'); if (fs.existsSync(pp) && fs.existsSync(path.join(pp, 'species.json'))) { assert.ok(JSON.parse(fs.readFileSync(path.join(pp, 'species.json'), 'utf8')).length === 18, 'penguins: 18 species'); assert.ok(JSON.parse(fs.readFileSync(path.join(pp, 'facts.json'), 'utf8')).length >= 60, 'penguins: 60+ facts') }
    assert.ok(fs.existsSync('scripts/validate-llm-providers.js') && fs.existsSync('scripts/build-model-availability.js'), 'validator + matrix-builder scripts exist'); { const av = await G('api/models/availability'); assert.ok([200,404].includes(av.status), 'availability endpoint reachable'); if (av.status === 200) { const j = await av.json(); assert.ok(Array.isArray(j.providers) && j.summary && typeof j.summary.total_models === 'number', 'matrix schema') } }
    if (process.env.LIVE_LLM === '1') { const { spawnSync } = await import('node:child_process'); const r = spawnSync(process.execPath, ['scripts/validate-llm-providers.js'], { encoding: 'utf8', timeout: 180000 }); assert.ok(/REAL_OK/.test(r.stdout || ''), 'LIVE_LLM: at least 1 provider returned REAL_OK') }
    // FREDDIE_PAGES are real renderers (not stubs) and cover every nav route.
    // Parse the SDK source (not the browser bundle — it references HTMLElement
    // at module top-level and cannot import in Node).
    const fSrc = fs.readFileSync(path.join('node_modules','anentrypoint-design','src','components','freddie.js'), 'utf8')
    assert.ok(!/const make = \(label\) => \(props\) => renderPageStub/.test(fSrc), 'freddie.js no longer ships stub renderers')
    assert.ok(/from '\.\/freddie\/runtime\.js'/.test(fSrc), 'freddie.js uses real page runtime')
    const pageKeys = (fSrc.match(/export const ([a-z]+) = makePage\(/g) || []).map(m => m.replace(/export const | = makePage\(/g, ''))
    assert.ok(pageKeys.length >= 16, 'FREDDIE_PAGES has >=16 real makePage renderers, got ' + pageKeys.length)
    for (const k of ['home','chat','sessions','projects','models','config','tools','machines','health','debug']) assert.ok(pageKeys.includes(k), 'page ' + k + ' is a real renderer')
    // Parse ROUTES from state.js source (importing it pulls the browser bundle).
    const stateSrc = fs.readFileSync(path.join('src','web','state.js'), 'utf8')
    const routePaths = (stateSrc.match(/path: '([a-z]+)'/g) || []).map(m => m.replace(/path: '|'/g, ''))
    assert.ok(routePaths.length >= 16, 'ROUTES has >=16 entries, got ' + routePaths.length)
    for (const p of routePaths) assert.ok(pageKeys.includes(p), 'route ' + p + ' has a FREDDIE_PAGES renderer')
    // GUI-validation regression guards (this chain): a11y + UX invariants live in
    // the SDK source so they cannot silently regress on a rebuild.
    const cSrc = fs.readFileSync(path.join('node_modules','anentrypoint-design','src','components','content.js'), 'utf8')
    assert.ok(/rowLabels/.test(cSrc) && /labelFor/.test(cSrc), 'Table supports rowLabels for meaningful row aria-label')
    assert.ok(/e\.key === ' '/.test(cSrc), 'Table clickable rows handle Space key (a11y parity)')
    assert.ok(/SearchInput[\s\S]{0,400}'aria-label'/.test(cSrc), 'SearchInput has aria-label')
    const aSrc = fs.readFileSync(path.join('node_modules','anentrypoint-design','app-shell.css'), 'utf8')
    assert.ok(/tr\.clickable:focus-visible/.test(aSrc), 'clickable table rows have a focus-visible ring')
    assert.ok(/prefers-reduced-motion: reduce/.test(aSrc), 'reduced-motion preference honored')
    assert.ok(/\.skip-link/.test(aSrc), 'skip-link styled')
    const mSrc = fs.readFileSync(path.join('node_modules','anentrypoint-design','community.css'), 'utf8')
    assert.ok(/\.fd-sr-live/.test(mSrc), 'visually-hidden live region class present')
    assert.ok(/refreshBtn/.test(fSrc) && /liveRegion/.test(fSrc) && /stickyScroll/.test(fSrc), 'freddie pages: refresh + live-region + sticky-scroll helpers')
    assert.ok(/voice = makePage[\s\S]{0,400}\/api\/voice/.test(fSrc), 'voice page is presence-aware (probes /api/voice), not a dead empty-state')
    const appSrc = fs.readFileSync(path.join('src','web','app.js'), 'utf8')
    assert.ok(/document\.title = 'freddie · '/.test(appSrc), 'dashboard sets document.title per route')
    assert.ok(/focusMain\(\)/.test(appSrc), 'dashboard moves focus to main on route change')
    await dash.stop()
})

console.log('\n=== test.js results ==='); for (const [n, s] of results) console.log(`  ${s.startsWith('OK') ? '[ok]' : '[FAIL]'} ${n}\t${s}`)
const failed = results.filter(r => !r[1].startsWith('OK'))
try { (await import('./src/sessions.js')).closeDb() } catch {}; try { (await import('./src/observability/log.js')).closeAll() } catch {}
if (failed.length) { console.error(`\n${failed.length} FAILED`); process.exit(1) }; console.log(`\n${results.length} passed`); await new Promise(r => setTimeout(r, 100)); process.exit(0)
