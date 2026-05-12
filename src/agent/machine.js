import { createMachine, createActor, assign, fromPromise } from 'xstate'
import { bootHost } from '../host/index.js'
import { getEnabledToolSchemas } from '../toolsets.js'
import { logger } from '../observability/log.js'
import { resolveCallLLM } from './llm_resolver.js'

const log = logger('agent')

export function createAgentMachine({ provider, model, maxIterations = 90, callLLM, enabledToolsets = ['core'], disabledToolsets = [], events } = {}) {
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
                        return llm({ messages: input.messages, tools: schemas, model: input.model, provider: input.provider })
                    }),
                    input: ({ context }) => ({ messages: context.messages, model: context.model, provider: context.provider, enabledToolsets: context.enabledToolsets, disabledToolsets: context.disabledToolsets }),
                    onDone: [
                        { guard: ({ event }) => Array.isArray(event.output?.tool_calls) && event.output.tool_calls.length > 0, target: 'tool_calls', actions: assign({ messages: ({ context, event }) => [...context.messages, { role: 'assistant', content: event.output.content || '', tool_calls: event.output.tool_calls }] }) },
                        { target: 'done', actions: assign({ messages: ({ context, event }) => [...context.messages, { role: 'assistant', content: event.output.content || '' }], lastResult: ({ event }) => event.output.content || '' }) },
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
                        for (const call of calls) {
                            const res = await h.pi.dispatchTool(call.name || call.function?.name, call.arguments || call.function?.arguments || {})
                            results.push({ tool_call_id: call.id || call.tool_call_id, content: res })
                        }
                        return results
                    }),
                    input: ({ context }) => ({ messages: context.messages }),
                    onDone: { target: 'prompting', actions: assign({
                        messages: ({ context, event }) => [...context.messages, ...event.output.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content }))],
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

export async function runTurn({ prompt, messages = [], model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 30000, cwd, skill, witnessPath } = {}) {
    const events = []
    const initMessages = [...messages]
    const systemParts = []
    if (cwd) systemParts.push(`Working directory: ${cwd}. Always pass cwd="${cwd}" to bash tool calls. When reading or writing files use paths relative to this directory or absolute paths under it.`)
    if (skill) {
        const h = await bootHost()
        const skillDef = h.pi.skills.get(skill)
        if (skillDef?.content) systemParts.push('Skill context:\n' + skillDef.content)
    }
    if (systemParts.length > 0) initMessages.unshift({ role: 'user', content: systemParts.join('\n\n') })
    const machine = createAgentMachine({ model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations, events })
    const actor = createActor(machine, { input: { messages: initMessages } })
    actor.start()
    actor.send({ type: 'SUBMIT', prompt })
    return await new Promise((resolve, reject) => {
        const t = setTimeout(() => { try { actor.stop() } catch {} reject(new Error('agent turn timeout')) }, timeoutMs)
        actor.subscribe(snap => {
            if (snap.status === 'done') {
                clearTimeout(t)
                const errorStack = snap.output?.error ? (events.find(e => e.type === 'llm_call' && !e.ok)?.stack || null) : null
                writeTrajectory(snap.output, { prompt, provider, model, skill, cwd, events, errorStack, witnessPath }).finally(() => resolve(snap.output))
            }
        })
    })
}

