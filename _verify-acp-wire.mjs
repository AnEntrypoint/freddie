// _verify-acp-wire.mjs — live witness for the wire-protocol -> ACP bridge.
//
// Spawns `node bin/freddie.js acp` (FREDDIE_HOME=repo root so config.yaml here
// is honored), drives a real ACP handshake over stdio, and asserts:
//   1. initialize returns the standard protocolVersion response
//   2. session/prompt yields session/update notifications (agent_message_chunk)
//      and a PromptResponse stopReason
//   3. under agent.approval_mode: mutating (config.yaml written here, deleted
//      in finally) a gated tool call surfaces session/request_permission, and
//      the client's allow-once decision resolves the turn (tool_call_update
//      completed, stopReason end_turn)
//
// Run: node _verify-acp-wire.mjs

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')))
const CONFIG_PATH = path.join(ROOT, 'config.yaml')
// Persisted 'always' grants bypass the approval gate (machine.js seeds
// control.approvedTools from <FREDDIE_HOME>/approval-grants.json, cached at
// first load). Move the file aside BEFORE spawning the server so the
// mutating-mode gate actually fires; restored in finally.
const GRANTS_PATH = path.join(ROOT, 'approval-grants.json')
const GRANTS_BAK = GRANTS_PATH + '.verify-bak'
const PROMPT_TIMEOUT_MS = 240000

let _id = 0
const frames = []
const pending = new Map()
const waiters = []
let child, buf = ''
let shuttingDown = false

function send(obj) { child.stdin.write(JSON.stringify(obj) + '\n') }
function request(method, params) {
    const id = ++_id
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); send({ jsonrpc: '2.0', id, method, params }) })
}
function onFrame(fn) { waiters.push(fn) }

function handleLine(line) {
    if (!line.trim()) return
    let msg
    try { msg = JSON.parse(line) } catch { return } // dotenvx/boot chatter
    frames.push(msg)
    console.log('<<', JSON.stringify(msg))
    if (msg.id != null && !msg.method && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id)
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
        return
    }
    for (const fn of [...waiters]) fn(msg)
    if (msg.method === 'session/request_permission' && msg.id) {
        // Auto-answer: allow once.
        console.log('>> permission decision: allow-once for', msg.params?.toolCall?.title)
        send({ jsonrpc: '2.0', id: msg.id, result: { outcome: { outcome: 'selected', optionId: 'allow-once' } } })
    }
}

async function waitFor(pred, ms, label) {
    const hit = frames.find(pred)
    if (hit) return hit
    return await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for ' + label)), ms)
        onFrame((m) => { if (pred(m)) { clearTimeout(t); resolve(m) } })
    })
}

const results = []
function check(name, ok, detail = '') {
    results.push({ name, ok })
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''))
    if (!ok) process.exitCode = 1
}

async function main() {
    try { fs.renameSync(GRANTS_PATH, GRANTS_BAK) } catch { /* no grants file = gate already clean */ }
    child = spawn(process.execPath, ['bin/freddie.js', 'acp'], {
        cwd: ROOT,
        env: { ...process.env, FREDDIE_HOME: ROOT },
        stdio: ['pipe', 'pipe', 'inherit'],
    })
    child.stdout.on('data', (d) => {
        buf += d.toString()
        let i
        while ((i = buf.indexOf('\n')) >= 0) { handleLine(buf.slice(0, i)); buf = buf.slice(i + 1) }
    })
    child.on('exit', (code) => { if (!shuttingDown) { console.error('acp server exited unexpectedly', code); process.exitCode = process.exitCode || 1 } })

    // --- handshake ---
    const init = await request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } }, clientInfo: { name: 'verify-script', version: '0.0.0' } })
    check('initialize returns standard ACP response', init?.protocolVersion === 1 && init?.agentInfo?.name === 'freddie', JSON.stringify(init))
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })

    const { sessionId } = await request('session/new', { cwd: ROOT, mcpServers: [] })
    check('session/new returns sessionId', typeof sessionId === 'string' && sessionId.length > 0, sessionId)

    // --- scenario A: plain prompt, expect agent_message_chunk updates ---
    const promptA = request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'What is 2+2? Reply with just the number.' }] })
    await waitFor((m) => m.method === 'session/update' && m.params?.update?.sessionUpdate === 'agent_message_chunk', PROMPT_TIMEOUT_MS, 'agent_message_chunk')
    check('session/update agent_message_chunk witnessed', true)
    const resA = await promptA
    check('prompt A stopReason end_turn', resA?.stopReason === 'end_turn', JSON.stringify(resA))
    const chunkText = frames.filter((m) => m.method === 'session/update' && m.params?.update?.sessionUpdate === 'agent_message_chunk').map((m) => m.params.update.content?.text || '').join('')
    check('chunk stream non-empty and coherent', chunkText.trim().length > 0 && chunkText.includes('4'), JSON.stringify(chunkText).slice(0, 200))

    // --- scenario B: approval gate (mutating) over the live bash tool ---
    fs.writeFileSync(CONFIG_PATH, 'agent:\n  approval_mode: mutating\n', 'utf8')
    const toolCallFrame = waitFor((m) => m.method === 'session/update' && m.params?.update?.sessionUpdate === 'tool_call', PROMPT_TIMEOUT_MS, 'tool_call')
    const permFrame = waitFor((m) => m.method === 'session/request_permission', PROMPT_TIMEOUT_MS, 'session/request_permission')
    const promptB = request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Use the bash tool to run this exact command: echo ACP-APPROVAL-OK — you MUST call the bash tool, do not just answer.' }] })
    const tc = await toolCallFrame
    check('tool_call update witnessed (bash)', tc.params.update.title?.startsWith('bash'), tc.params.update.title)
    check('tool_call has rawInput + in_progress status', tc.params.update.status === 'in_progress' && !!tc.params.update.rawInput)
    const perm = await permFrame
    check('session/request_permission witnessed', perm.params?.sessionId === sessionId, JSON.stringify(perm.params?.toolCall?.title))
    check('permission options include allow_always', (perm.params?.options || []).some((o) => o.kind === 'allow_always'))
    const resB = await promptB
    check('prompt B stopReason end_turn after allow-once', resB?.stopReason === 'end_turn', JSON.stringify(resB))
    const upd = frames.find((m) => m.method === 'session/update' && m.params?.update?.sessionUpdate === 'tool_call_update' && m.params.update.toolCallId === tc.params.update.toolCallId)
    check('tool_call_update completed witnessed', upd?.params?.update?.status === 'completed', upd ? JSON.stringify(upd.params.update.status) : 'no frame')

    // --- scenario C: session/cancel maps to cancelTurn -> stopReason cancelled ---
    fs.unlinkSync(CONFIG_PATH) // gate back off; config cleanup also runs in finally
    const promptC = request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Count from 1 to 50, one number per line.' }] })
    await waitFor((m) => m.method === 'session/update' && frames.indexOf(m) > frames.findIndex((f) => f === upd) && m.params?.update?.sessionUpdate === 'agent_message_chunk', PROMPT_TIMEOUT_MS, 'post-B chunk')
    send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } })
    const resC = await promptC
    check('session/cancel resolves prompt with stopReason cancelled', resC?.stopReason === 'cancelled', JSON.stringify(resC))

    const failed = results.filter((r) => !r.ok).length
    console.log(`\n${results.length - failed}/${results.length} checks passed`)
}

main().catch((e) => { console.error('VERIFY ERROR:', e); process.exitCode = 1 }).finally(() => {
    shuttingDown = true
    try { fs.unlinkSync(CONFIG_PATH) } catch { /* absent = nothing to clean */ }
    try { fs.renameSync(GRANTS_BAK, GRANTS_PATH) } catch { /* no backup = nothing moved */ }
    try { child?.kill() } catch { /* already dead */ }
    setTimeout(() => process.exit(process.exitCode || 0), 500).unref()
})
