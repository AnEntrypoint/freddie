import { createMachine, createActor, assign, fromPromise } from 'xstate'
import { bootHost } from '../host/index.js'
import { getEnabledToolSchemas } from '../toolsets.js'
import { logger } from '../observability/log.js'
import { resolveCallLLM } from './llm_resolver.js'
import { createPersistentActor } from '../machines/persistent-actor.js'
import { runStep, clearSteps } from '../machines/step-journal.js'
import { randomUUID } from 'node:crypto'

const log = logger('agent')

export function createAgentMachine({ provider, model, maxIterations = 90, callLLM, enabledToolsets = ['core'], disabledToolsets = [], events, sessionKey, toolCtx = null, tool_choice } = {}) {
    const baseLLM = callLLM || resolveCallLLM({ provider, model })
    const llm = events ? async (input) => {
        const t0 = Date.now()
        try {
            const out = await baseLLM(input)
            events.push({ type: 'llm_call', ok: true, durationMs: Date.now() - t0, provider: out?.raw?.provider || provider, model: out?.raw?.model || model, content_length: (out?.content || '').length, tool_calls_count: (out?.tool_calls || []).length, ts: new Date().toISOString() })
            return out
        } catch (e) {
            events.push({ type: 'llm_call', ok: false, durationMs: Date.now() - t0, provider, model, error: String(e?.message || e), stack: e?.stack || null, ts: new Date().toISOString() })
            throw e
        }
    } : baseLLM
    return createMachine({
        id: 'freddie-agent',
        initial: 'idle',
        output: ({ context }) => ({ messages: context.messages, result: context.lastResult, error: context.error, iterations: context.iterations }),
        context: ({ input }) => ({
            messages: input?.messages ? [...input.messages] : [],
            iterations: 0,
            maxIterations,
            interrupt: false,
            lastResult: null,
            error: null,
            provider, model,
            enabledToolsets, disabledToolsets,
            sessionKey,
            // Optional tool_choice policy. A FUNCTION receives the iteration index and
            // returns the tool_choice for that llm call (full caller control). A plain
            // VALUE (e.g. 'required') applies on ITERATION 0 ONLY, then reverts to the
            // model's own choice -- a constant 'required' would make the done
            // transition (which fires only on zero tool_calls) unreachable and exhaust
            // the iteration budget, so first-call-only is the safe value semantics: it
            // nudges a weak model into its first tool call without breaking loop
            // termination. Undefined = model's own choice every call.
            tool_choice,
            // Opaque per-turn context handed to every tool handler (author/role/
            // active-case/store etc.). The agent loop is identity-blind; tools that
            // need who-is-asking read it from here. Null for a plain turn.
            toolCtx,
        }),
        states: {
            idle: {
                on: {
                    SUBMIT: {
                        target: 'prompting',
                        actions: assign({
                            messages: ({ context, event }) => [...context.messages, { role: 'user', content: event.prompt }],
                            iterations: 0, interrupt: false, error: null,
                        }),
                    },
                    INTERRUPT: { actions: assign({ interrupt: true }) },
                },
            },
            prompting: {
                invoke: {
                    src: fromPromise(async ({ input }) => {
                        const schemas = await getEnabledToolSchemas(input.enabledToolsets, input.disabledToolsets)
                        // Resolve the per-iteration tool_choice policy (see context note).
                        const tc = typeof input.tool_choice === 'function'
                            ? input.tool_choice(input.iterations)
                            : (input.iterations === 0 ? input.tool_choice : undefined)
                        return await runStep(input.sessionKey, 'llm:' + input.iterations, () => llm({ messages: input.messages, tools: schemas, model: input.model, provider: input.provider, tool_choice: tc }))
                    }),
                    input: ({ context }) => ({ messages: context.messages, model: context.model, provider: context.provider, enabledToolsets: context.enabledToolsets, disabledToolsets: context.disabledToolsets, sessionKey: context.sessionKey, iterations: context.iterations, tool_choice: context.tool_choice }),
                    onDone: [
                        { guard: ({ event }) => Array.isArray(event.output?.tool_calls) && event.output.tool_calls.length > 0, target: 'tool_calls', actions: assign({ messages: ({ context, event }) => [...context.messages, { role: 'assistant', content: event.output.content || '', tool_calls: event.output.tool_calls }] }) },
                        { target: 'done', actions: assign({ messages: ({ context, event }) => [...context.messages, { role: 'assistant', content: event.output.content || '' }], lastResult: ({ context, event }) => {
                            // Prefer this turn's content, but if the model ended with empty
                            // text (it may have put its answer in an earlier turn alongside a
                            // tool_call), fall back to the last non-empty assistant message so
                            // the caller never gets an empty result after a successful run.
                            if (event.output.content && event.output.content.trim()) return event.output.content;
                            for (let i = context.messages.length - 1; i >= 0; i--) {
                                const m = context.messages[i];
                                if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) return m.content;
                            }
                            return event.output.content || '';
                        } }) },
                    ],
                    onError: { target: 'done', actions: assign({ error: ({ event }) => String(event.error?.message || event.error) }) },
                },
            },
            tool_calls: {
                always: [
                    { guard: ({ context }) => context.iterations >= context.maxIterations, target: 'done', actions: assign({ error: 'iteration budget exhausted' }) },
                    { guard: ({ context }) => context.interrupt, target: 'done', actions: assign({ error: 'interrupted' }) },
                    { target: 'executing_tools' },
                ],
            },
            executing_tools: {
                invoke: {
                    src: fromPromise(async ({ input }) => {
                        const h = await bootHost()
                        const last = input.messages[input.messages.length - 1]
                        const calls = last.tool_calls || []
                        const results = []
                        const extras = []
                        for (const call of calls) {
                            const tname = call.name || call.function?.name
                            const targs = call.arguments || call.function?.arguments || {}
                            const tcid = call.id || call.tool_call_id
                            const ret = await runStep(input.sessionKey, 'tool:' + input.iterations + ':' + tcid, async () => {
                                const callExtras = []
                                const pushExtras = r => { if (r?.systemMessage) callExtras.push({ role: 'system', content: '[hook] ' + r.systemMessage }); if (r?.additionalContext) callExtras.push({ role: 'system', content: r.additionalContext }) }
                                const pre = await h.hooks.invoke('preToolCall', { name: tname, args: targs }); pushExtras(pre)
                                if (pre?.behavior === 'block') { return { content: JSON.stringify({ error: 'tool call denied by plugsdk hook', tool: tname, reason: pre.reason || 'denied' }), extras: callExtras } }
                                const res = await h.pi.dispatchTool(tname, (pre && pre.args) || targs, input.toolCtx || {})
                                pushExtras(await h.hooks.invoke('postToolCall', { name: tname, args: targs, result: res }))
                                return { content: res, extras: callExtras }
                            })
                            results.push({ tool_call_id: tcid, content: ret.content })
                            extras.push(...ret.extras)
                        }
                        return { results, extras }
                    }),
                    input: ({ context }) => ({ messages: context.messages, sessionKey: context.sessionKey, iterations: context.iterations, toolCtx: context.toolCtx }),
                    onDone: { target: 'prompting', actions: assign({
                        messages: ({ context, event }) => [...context.messages, ...event.output.results.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content })), ...event.output.extras],
                        iterations: ({ context }) => context.iterations + 1,
                    }) },
                    onError: { target: 'done', actions: assign({ error: ({ event }) => String(event.error?.message || event.error) }) },
                },
            },
            done: {
                type: 'final',
                output: ({ context }) => ({ messages: context.messages, result: context.lastResult, error: context.error, iterations: context.iterations }),
            },
        },
    })
}

async function writeTrajectory(out, { prompt, provider, model, skill, cwd, events = [], errorStack = null, witnessPath = null }) {
    try {
        const { getConfigValue } = await import('../config.js')
        if (!getConfigValue('agent.save_trajectories', false) && !witnessPath) return
        const { getFreddieHome } = await import('../home.js')
        const fs = await import('node:fs')
        const path = await import('node:path')
        const dir = path.join(getFreddieHome(), 'trajectories')
        fs.mkdirSync(dir, { recursive: true })
        const states = []
        const toolCalls = []
        const toolResults = []
        let compressorInvocations = 0
        for (const m of out.messages || []) {
            if (m.role === 'assistant' && m.tool_calls?.length) { states.push('EXECUTE'); for (const tc of m.tool_calls) toolCalls.push({ name: tc.name || tc.function?.name, arguments: tc.arguments || tc.function?.arguments || {}, id: tc.id }) }
            else if (m.role === 'user') states.push('PLAN')
            else if (m.role === 'assistant') states.push('COMPLETE')
            else if (m.role === 'tool') { states.push('VERIFY'); toolResults.push({ tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }) }
            if (m.role === 'system' && typeof m.content === 'string' && /\[trajectory\.compressed\]/.test(m.content)) compressorInvocations += 1
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
        const slug = (prompt || 'turn').slice(0, 40).replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
        const llmCalls = events.filter(e => e.type === 'llm_call')
        const streamChunks = events.filter(e => e.type === 'llm_chunk')
        const payload = {
            schema_version: 2, ts, prompt, provider, model, skill, cwd,
            iterations: out.iterations, result: out.result, error: out.error, error_stack: errorStack,
            state_transitions: states, tool_calls: toolCalls, tool_results: toolResults,
            llm_calls: llmCalls, llm_chunks_count: streamChunks.length,
            compressor_invocations: compressorInvocations,
            events, messages: out.messages,
        }
        const file = path.join(dir, `${ts}-${slug}.json`)
        fs.writeFileSync(file, JSON.stringify(payload, null, 2))
        if (witnessPath) {
            const jsonl = [
                JSON.stringify({ event: 'session_start', ts, prompt, provider, model, skill, cwd }),
                ...(out.messages || []).map((m, i) => JSON.stringify({ event: 'message', index: i, role: m.role, content: m.content, tool_calls: m.tool_calls || null, tool_call_id: m.tool_call_id || null })),
                ...llmCalls.map(e => JSON.stringify({ event: 'llm_call', ...e })),
                JSON.stringify({ event: 'session_end', iterations: out.iterations, error: out.error, error_stack: errorStack, compressor_invocations: compressorInvocations }),
            ].join('\n')
            fs.mkdirSync(path.dirname(witnessPath), { recursive: true })
            fs.writeFileSync(witnessPath, jsonl)
        }
    } catch (_) {}
}

function mergeHookExtras(messages, r, tag) {
    if (!r) return messages
    const e = []
    if (r.systemMessage) e.push({ role: 'system', content: '[hook:' + tag + '] ' + r.systemMessage })
    if (r.additionalContext) e.push({ role: 'system', content: r.additionalContext })
    return e.length ? [...messages, ...e] : messages
}

// Drive a started persistent agent actor to its final state, wiring timeout +
// Auto-learn: distill a salient fact from a completed turn and memorize it into gm rs-learn.
// Only fires on substantive, non-error outcomes; dedupes against existing near-identical
// memories so the store does not fill with restatements. Best-effort — never throws.
const AUTOLEARN_MIN_LEN = 40 // skip trivial one-liners
const AUTOLEARN_DEDUPE_COS = 0.92 // a hit this similar means we already know it
async function autoLearnTurn({ prompt, out }) {
    try {
        if (!out || out.error) return
        const result = (out.result || '').toString().trim()
        if (result.length < AUTOLEARN_MIN_LEN) return
        const { memorize, recall, projectNamespace } = await import('../learn/gm-learn.js')
        const namespace = await projectNamespace()
        // Concise salient fact: the user's ask + the outcome, capped to keep recall sharp.
        const fact = `Q: ${(prompt || '').toString().trim().slice(0, 200)}\nA: ${result.slice(0, 600)}`
        const existing = await recall(fact, { limit: 1, namespace })
        if (existing.length && existing[0].score >= AUTOLEARN_DEDUPE_COS) return
        await memorize(fact, { namespace })
    } catch (_) {}
}

// session-end hooks + trajectory. Shared by runTurn (fresh) and resumeTurn
// (rehydrated from a persisted snapshot after a refresh/restart).
async function driveAgentActor({ pa, h, events, prompt, provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey }) {
    const { actor } = pa
    return await new Promise((resolve, reject) => {
        let sub
        const cleanup = () => { try { sub?.unsubscribe() } catch {} ; pa.flush().catch(() => {}).finally(() => { try { actor.stop() } catch {} }) }
        let settled = false
        const t = setTimeout(() => { if (settled) return; settled = true; cleanup(); reject(new Error('agent turn timeout')) }, timeoutMs)
        // Do not let a pending turn-timeout timer keep the event loop alive or fire
        // during process teardown after the awaiting caller has already moved on.
        if (typeof t?.unref === 'function') t.unref()
        sub = actor.subscribe(snap => { if (snap.status !== 'done') return; if (settled) return; settled = true; clearTimeout(t)
            ;(async () => {
                const out = snap.output
                const outbound = await h.hooks.invoke('onMessageOutbound', { content: out?.result || '' })
                if (outbound?.systemMessage || outbound?.additionalContext) out.messages = mergeHookExtras(out.messages || [], outbound, 'onMessageOutbound')
                await h.hooks.invoke('onSessionEnd', { reason: out?.error ? 'error' : 'ok', iterations: out?.iterations })
                const errorStack = out?.error ? (events.find(e => e.type === 'llm_call' && !e.ok)?.stack || null) : null
                await writeTrajectory(out, { prompt, provider, model, skill, cwd, events, errorStack, witnessPath })
                // Auto-learn: memorize a salient summary of this turn into gm rs-learn so
                // freddie learns from each substantive turn. Best-effort, deduped, capped.
                await autoLearnTurn({ prompt, out })
                // Completed turn leaves no step-journal residue.
                await clearSteps(sessionKey)
                // Unsubscribe, flush the final snapshot (persistent-actor clears it on
                // the done state) + stop the actor — a finished actor should not be
                // left running with live subscriptions/handles.
                cleanup()
                resolve(out)
            })().catch(e => { cleanup(); reject(e) })
        })
    })
}

export async function runTurn({ prompt, messages = [], model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 30000, cwd, skill, witnessPath, sessionKey, toolCtx = null, tool_choice } = {}) {
    const events = []; const h = await bootHost()
    await h.hooks.invoke('onSessionStart', { prompt, model, provider, skill, cwd })
    let initMessages = [...messages]; const sysParts = []
    if (cwd) sysParts.push(`Working directory: ${cwd}. Always pass cwd="${cwd}" to bash tool calls. When reading or writing files use paths relative to this directory or absolute paths under it.`)
    if (skill) { const sd = h.pi.skills.get(skill); if (sd?.content) sysParts.push('Skill context:\n' + sd.content) }
    // Auto-recall on turn entry: surface salient learned memories for this prompt from gm
    // rs-learn (freddie's primary learning store). Best-effort; never blocks the turn.
    try {
        const { autoRecall, projectNamespace } = await import('../learn/gm-learn.js')
        const hits = await autoRecall(prompt, { limit: 5, namespace: await projectNamespace() })
        if (hits.length) sysParts.push('Relevant memories (gm rs-learn):\n' + hits.map(h => '- ' + h.text).join('\n'))
    } catch (_) {}
    if (sysParts.length) initMessages.unshift({ role: 'user', content: sysParts.join('\n\n') })
    const inbound = await h.hooks.invoke('onMessageInbound', { content: prompt })
    if (inbound?.behavior === 'block') { await h.hooks.invoke('onSessionEnd', { reason: 'prompt_blocked' }); return { messages: initMessages, result: null, error: 'prompt blocked by plugsdk hook: ' + (inbound.reason || 'denied'), iterations: 0 } }
    initMessages = mergeHookExtras(initMessages, inbound, 'onMessageInbound')
    // Persist the turn snapshot under kind=agent so an interrupted turn (process
    // refresh mid-tool-call) resumes exactly where it stopped via resumeTurn.
    const key = sessionKey || randomUUID()
    const machine = createAgentMachine({ model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations, events, sessionKey: key, toolCtx, tool_choice })
    const pa = await createPersistentActor(machine, { kind: 'agent', key, input: { messages: initMessages } })
    pa.actor.send({ type: 'SUBMIT', prompt })
    return await driveAgentActor({ pa, h, events, prompt, provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey: key })
}

// Rehydrate an interrupted turn from its persisted snapshot and drive it to
// completion. Returns null if no live snapshot exists for the key (already
// completed or never persisted) — caller falls back to a fresh runTurn.
export async function resumeTurn({ sessionKey, model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 30000, cwd, skill, witnessPath, toolCtx = null } = {}) {
    if (!sessionKey) throw new Error('resumeTurn requires sessionKey')
    const events = []; const h = await bootHost()
    const machine = createAgentMachine({ model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations, events, sessionKey, toolCtx })
    // createPersistentActor.load() already handles a missing/stale snapshot and
    // leaves pa.resumed=false, so the prior pre-check load() was a redundant
    // second read that opened a TOCTOU window (a concurrent delete between the two
    // reads made forget() delete a snapshot we had just confirmed). One read only.
    const pa = await createPersistentActor(machine, { kind: 'agent', key: sessionKey, input: { messages: [] } })
    if (!pa.resumed) return null
    return await driveAgentActor({ pa, h, events, prompt: '', provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey })
}

export async function invokeCompactHooks({ trigger = 'auto', messages = [] } = {}) {
    const h = await bootHost()
    const pre = await h.hooks.invoke('onPreCompact', { trigger, messages })
    if (pre?.behavior === 'block') return { skipped: true, reason: pre.reason || 'blocked' }
    return { pre, post: async (summary) => h.hooks.invoke('onPostCompact', { trigger, messages, summary }) }
}

