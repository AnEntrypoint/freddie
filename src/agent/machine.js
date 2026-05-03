import { createMachine, createActor, assign, fromPromise } from 'xstate'
import { registry } from '../tools/registry.js'
import { getEnabledToolSchemas } from '../toolsets.js'
import { logger } from '../observability/log.js'
import { resolveCallLLM } from './llm_resolver.js'

const log = logger('agent')

export function createAgentMachine({ provider, model, maxIterations = 90, callLLM, enabledToolsets = ['core'], disabledToolsets = [] } = {}) {
    const llm = callLLM || resolveCallLLM({ provider, model })
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
                        const last = input.messages[input.messages.length - 1]
                        const calls = last.tool_calls || []
                        const results = []
                        for (const call of calls) {
                            const res = await registry.dispatch(call.name || call.function?.name, call.arguments || call.function?.arguments || {})
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

export async function runTurn({ prompt, messages = [], model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 30000 } = {}) {
    const machine = createAgentMachine({ model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations })
    const actor = createActor(machine, { input: { messages } })
    actor.start()
    actor.send({ type: 'SUBMIT', prompt })
    return await new Promise((resolve, reject) => {
        const t = setTimeout(() => { try { actor.stop() } catch {} reject(new Error('agent turn timeout')) }, timeoutMs)
        actor.subscribe(snap => {
            if (snap.status === 'done') {
                clearTimeout(t)
                resolve(snap.output)
            }
        })
    })
}

