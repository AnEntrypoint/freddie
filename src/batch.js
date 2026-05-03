import fs from 'node:fs'
import path from 'node:path'
import { runTurn } from './agent/machine.js'
import { getFreddieHome } from './home.js'
import { randomUUID } from 'node:crypto'

export async function runBatch({ prompts = [], concurrency = 4, model, callLLM } = {}) {
    if (!Array.isArray(prompts) || prompts.length === 0) throw new Error('prompts required')
    const id = randomUUID()
    const dir = path.join(getFreddieHome(), 'batches')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, id + '.jsonl')
    const stream = fs.createWriteStream(file, { flags: 'a' })
    const queue = prompts.map((p, i) => ({ i, p }))
    const results = new Array(prompts.length)
    const workers = Array.from({ length: Math.min(concurrency, prompts.length) }, async () => {
        while (queue.length) {
            const job = queue.shift()
            if (!job) break
            try {
                const out = await runTurn({ prompt: job.p, model, callLLM, timeoutMs: 60000 })
                results[job.i] = { i: job.i, prompt: job.p, result: out.result, error: out.error }
            } catch (e) {
                results[job.i] = { i: job.i, prompt: job.p, error: String(e?.message || e) }
            }
            stream.write(JSON.stringify(results[job.i]) + '\n')
        }
    })
    await Promise.all(workers)
    await new Promise(r => stream.end(r))
    return { id, file, results }
}
