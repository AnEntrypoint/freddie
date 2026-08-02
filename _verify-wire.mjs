// _verify-wire.mjs — live-code-path verification for the freddie wire protocol
// (src/agent/events.js, src/agent/live-turns.js, machine approvals/steering/
// repeat-protection). Project doctrine: no test framework — this drives the
// REAL machine with a scripted callLLM stub (no network) and asserts the
// observable event stream. Run: node _verify-wire.mjs
//
// Exit 0 = all checks passed. Exit 1 = first failure (labeled).

import { createAgentMachine } from './src/agent/machine.js'
import { createActor } from 'xstate'
import { emitTurnEvent, onTurnEvent, readWireLog, wireLogPath } from './src/agent/events.js'
import { registerTurn, unregisterTurn, steerTurn, cancelTurn, requestApproval, resolveApproval } from './src/agent/live-turns.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'

let failures = 0
function check(label, cond) {
    if (cond) { console.log('  ok  ' + label) }
    else { failures++; console.error('FAIL  ' + label) }
}

// Drive a machine directly (bypasses runTurn's host boot for speed where the
// host isn't needed) with a scripted LLM. script = array of llm outputs, OR
// pass callLLM directly for full control (infinite loops, artificial latency).
function driveScripted({ script, callLLM: customLLM, delayMs = 0, control, sessionKey, timeoutMs = 15000 }) {
    const events = []
    const callLLM = customLLM || (async () => {
        if (delayMs) await new Promise(r => setTimeout(r, delayMs))
        if (!script.length) return { content: 'done', tool_calls: [] }
        return script.shift()
    })
    const machine = createAgentMachine({ callLLM, enabledToolsets: [], events, sessionKey, control })
    const actor = createActor(machine, { input: { messages: [] } })
    registerTurn(sessionKey, { actor, control, pendingApproval: null, startedAt: Date.now() })
    return new Promise((resolve) => {
        const t = setTimeout(() => { try { actor.stop() } catch { /* swallow: actor may already be stopped */ } ; resolve({ error: 'driver timeout', events }) }, timeoutMs)
        actor.subscribe(snap => {
            if (snap.status !== 'done') return
            clearTimeout(t)
            unregisterTurn(sessionKey)
            resolve({ output: snap.output, events })
        })
        actor.start()
        actor.send({ type: 'SUBMIT', prompt: 'verify' })
    })
}

function mkControl(overrides = {}) {
    return {
        steers: [],
        approvalPolicy: 'off',
        approvalTimeoutMs: 3000,
        mutatingTools: new Set(['bash', 'write', 'edit']),
        approvedTools: new Set(),
        lastSig: null, streak: 0,
        ...overrides,
    }
}

const TC = (id, name, args) => [{ id, name, arguments: args }]

// --- 1. event envelope + wire log -------------------------------------------
{
    const sid = 'verify-' + randomUUID().slice(0, 8)
    const seen = []
    const unsub = onTurnEvent(sid, (e) => seen.push(e))
    const env = emitTurnEvent(sid, 'session.start', { prompt: 'x' })
    unsub()
    check('envelope shape {v,event,sessionId,ts,data}', env.v === 1 && env.event === 'session.start' && env.sessionId === sid && typeof env.ts === 'string' && env.data.prompt === 'x')
    check('live listener received envelope', seen.length === 1 && seen[0].event === 'session.start')
    const logged = readWireLog(sid)
    check('wire log persisted + read back', logged.length === 1 && logged[0].data.prompt === 'x')
    try { fs.unlinkSync(wireLogPath(sid)) } catch { /* swallow: test-log cleanup is best-effort */ }
}

// --- 2. plain turn completes; events fire in order --------------------------
{
    const sid = 'verify-' + randomUUID().slice(0, 8)
    const seen = []
    onTurnEvent(sid, (e) => seen.push(e.event))
    const { output } = await driveScripted({
        sessionKey: sid, control: mkControl(),
        script: [{ content: 'hello world', tool_calls: [] }],
    })
    check('simple turn completes with result', output?.result === 'hello world' && !output?.error)
    check('message.append emitted for assistant reply', seen.includes('message.append'))
    try { fs.unlinkSync(wireLogPath(sid)) } catch { /* swallow: test-log cleanup is best-effort */ }
}

// --- 3. repeat protection force-stops a looping model -----------------------
{
    const sid = 'verify-' + randomUUID().slice(0, 8)
    // Every llm call returns the SAME tool call; dispatch returns error content
    // (tool not registered — enabledToolsets []) and the loop repeats until the
    // streak logic trips.
    const control = mkControl()
    const { output } = await driveScripted({
        sessionKey: sid, control,
        callLLM: async () => ({ content: '', tool_calls: TC('tc1', 'bash', { cmd: 'same' }) }),
        timeoutMs: 30000,
    })
    check('repeat protection force-stops at streak 12', String(output?.error || '').includes('tool_call_repeat'))
    check('streak reached 12', control.streak >= 12)
    try { fs.unlinkSync(wireLogPath(sid)) } catch { /* swallow: test-log cleanup is best-effort */ }
}

// --- 4. approval gate pauses, reject feeds back to the model -----------------
{
    const sid = 'verify-' + randomUUID().slice(0, 8)
    const seen = []
    onTurnEvent(sid, (e) => seen.push(e))
    const control = mkControl({ approvalPolicy: 'mutating' })
    const drive = driveScripted({
        sessionKey: sid, control,
        script: [
            { content: '', tool_calls: TC('tc1', 'bash', { cmd: 'rm -rf /' }) },
            { content: 'understood, not doing that', tool_calls: [] },
        ],
    })
    // The approval request arrives asynchronously once executing_tools runs.
    let approved = null
    for (let i = 0; i < 100 && !approved; i++) {
        await new Promise(r => setTimeout(r, 50))
        const req = seen.find(e => e.event === 'approval.request')
        if (req) {
            approved = req
            await resolveApproval(sid, { id: req.data.id, approved: false, feedback: 'never run rm' })
        }
    }
    const { output } = await drive
    check('approval.request emitted with tool name + args', !!approved && approved.data.name === 'bash' && approved.data.args.cmd === 'rm -rf /')
    check('approval.resolved emitted', seen.some(e => e.event === 'approval.resolved' && e.data.approved === false))
    const denial = (output?.messages || []).find(m => m.role === 'tool' && typeof m.content === 'string' && m.content.includes('denied by user'))
    check('rejection fed back as tool result with feedback', !!denial && denial.content.includes('never run rm'))
    check('turn completed after denial', output?.result === 'understood, not doing that')
    try { fs.unlinkSync(wireLogPath(sid)) } catch { /* swallow: test-log cleanup is best-effort */ }
}

// --- 5. approval timeout auto-rejects ---------------------------------------
{
    const sid = 'verify-' + randomUUID().slice(0, 8)
    const control = mkControl({ approvalPolicy: 'all', approvalTimeoutMs: 500 })
    const { output } = await driveScripted({
        sessionKey: sid, control,
        script: [
            { content: '', tool_calls: TC('tc1', 'read', { path: 'x' }) },
            { content: 'stopped asking', tool_calls: [] },
        ],
        timeoutMs: 20000,
    })
    const denial = (output?.messages || []).find(m => m.role === 'tool' && typeof m.content === 'string' && m.content.includes('timed out'))
    check('unanswered approval auto-rejects on timeout', !!denial)
    try { fs.unlinkSync(wireLogPath(sid)) } catch { /* swallow: test-log cleanup is best-effort */ }
}

// --- 6. steering injects a user message at the step boundary -----------------
{
    const sid = 'verify-' + randomUUID().slice(0, 8)
    const control = mkControl()
    // Slow first prompting so the steer lands while the turn is still live.
    const drive = driveScripted({
        sessionKey: sid, control, delayMs: 700,
        script: [
            { content: '', tool_calls: TC('tc1', 'nonexistent_tool', { a: 1 }) },
            { content: 'final answer', tool_calls: [] },
        ],
    })
    await new Promise(r => setTimeout(r, 300))
    const ok = steerTurn(sid, 'btw prefer typescript')
    const { output } = await drive
    check('steerTurn accepted for live turn', ok === true)
    const steered = (output?.messages || []).find(m => m.role === 'user' && m.content === 'btw prefer typescript')
    check('steer drained into transcript at step boundary', !!steered)
    try { fs.unlinkSync(wireLogPath(sid)) } catch { /* swallow: test-log cleanup is best-effort */ }
}

// --- 7. cancel (INTERRUPT) reaches a busy turn -------------------------------
{
    const sid = 'verify-' + randomUUID().slice(0, 8)
    const control = mkControl()
    // Slow prompting so the cancel lands mid-turn.
    const drive = driveScripted({
        sessionKey: sid, control, delayMs: 700,
        script: [
            { content: '', tool_calls: TC('tc1', 'nonexistent_tool', { a: 1 }) },
            { content: 'should not get here cleanly', tool_calls: [] },
        ],
    })
    await new Promise(r => setTimeout(r, 300))
    const ok = cancelTurn(sid)
    const { output } = await drive
    check('cancelTurn accepted for live turn', ok === true)
    check('interrupt surfaces as turn error', String(output?.error || '').includes('interrupted'))
    try { fs.unlinkSync(wireLogPath(sid)) } catch { /* swallow: test-log cleanup is best-effort */ }
}

console.log(failures === 0 ? '\nALL WIRE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
