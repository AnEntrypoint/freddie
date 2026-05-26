import fs from 'node:fs'
import path from 'node:path'
import { runTurn } from './agent/machine.js'
import { getFreddieHome } from './home.js'
import { randomUUID } from 'node:crypto'
import { createMachine, assign, fromPromise } from 'xstate'
import { createPersistentActor } from './machines/persistent-actor.js'
import { load } from './machines/snapshot-store.js'

// Run one prompt and append its result to the batch jsonl file.
async function runOne({ job, model, callLLM, file }) {
    let rec
    try {
        const out = await runTurn({ prompt: job.p, model, callLLM, timeoutMs: 60000 })
        rec = { i: job.i, prompt: job.p, result: out.result, error: out.error }
    } catch (e) {
        rec = { i: job.i, prompt: job.p, error: String(e?.message || e) }
    }
    fs.appendFileSync(file, JSON.stringify(rec) + '\n')
    return rec
}

// xstate batch machine. Context tracks done[] (indices completed) + results so a
// refreshed batch resumes only the unfinished prompts. running -> running until
// every index is done, then -> complete (final). The persisted snapshot is keyed
// by kind=batch key=<batchId>.
export function createBatchMachine({ prompts, concurrency, model, callLLM, file } = {}) {
    return createMachine({
        id: 'freddie-batch',
        initial: 'running',
        output: ({ context }) => ({ id: context.id, file: context.file, results: context.results }),
        context: ({ input }) => ({
            id: input.id, file: input.file, model: input.model, concurrency: input.concurrency,
            prompts: input.prompts, done: input.done || [], results: input.results || new Array(input.prompts.length).fill(null),
        }),
        states: {
            running: {
                always: { guard: ({ context }) => context.done.length >= context.prompts.length, target: 'complete' },
                invoke: {
                    src: fromPromise(async ({ input }) => {
                        const { context } = input
                        const pending = context.prompts
                            .map((p, i) => ({ i, p }))
                            .filter(({ i }) => !context.done.includes(i))
                            .slice(0, context.concurrency)
                        return await Promise.all(pending.map(job => runOne({ job, model: context.model, callLLM, file: context.file })))
                    }),
                    input: ({ context }) => ({ context }),
                    onDone: {
                        target: 'running',
                        reenter: true,
                        actions: assign({
                            done: ({ context, event }) => [...context.done, ...event.output.map(r => r.i)],
                            results: ({ context, event }) => { const r = [...context.results]; for (const rec of event.output) r[rec.i] = rec; return r },
                        }),
                    },
                },
            },
            complete: { type: 'final', output: ({ context }) => ({ id: context.id, file: context.file, results: context.results }) },
        },
    })
}

export async function runBatch({ prompts = [], concurrency = 4, model, callLLM, batchId } = {}) {
    if (!Array.isArray(prompts) || prompts.length === 0) throw new Error('prompts required')
    const id = batchId || randomUUID()
    const dir = path.join(getFreddieHome(), 'batches')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, id + '.jsonl')
    const machine = createBatchMachine({ model, callLLM })
    const pa = await createPersistentActor(machine, { kind: 'batch', key: id, input: { id, file, model, concurrency, prompts } })
    return await driveBatch(pa)
}

// Resume an interrupted batch from its persisted snapshot — only the prompts not
// yet in context.done get re-run. Returns null if no live snapshot for the id.
export async function resumeBatch({ batchId, model, callLLM } = {}) {
    if (!batchId) throw new Error('resumeBatch requires batchId')
    if (!(await load('batch', batchId))) return null
    const machine = createBatchMachine({ model, callLLM })
    const pa = await createPersistentActor(machine, { kind: 'batch', key: batchId, input: { id: batchId, file: '', model, concurrency: 4, prompts: [] } })
    if (!pa.resumed) { await pa.forget(); return null }
    return await driveBatch(pa)
}

function driveBatch(pa) {
    const { actor } = pa
    return new Promise((resolve, reject) => {
        const sub = actor.subscribe(snap => {
            if (snap.status !== 'done') return
            const out = snap.output
            pa.flush().catch(() => {}).finally(() => { try { sub.unsubscribe() } catch {}; try { actor.stop() } catch {}; resolve(out) })
        })
        actor.subscribe({ error: (e) => { try { sub.unsubscribe() } catch {}; reject(e) } })
    })
}
