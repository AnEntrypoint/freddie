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
            const absWitnessPath = path.resolve(witnessPath)
            const witnessDir = path.dirname(absWitnessPath)
            // Windows fs.mkdirSync(..., {recursive:true}) can throw EEXIST on an
            // already-existing directory when given a relative path (the recursive
            // walk doesn't uniformly no-op on a pre-existing leaf on win32) --
            // resolving to an absolute path avoids the trigger; the explicit EEXIST
            // swallow is defense in depth so an existing dir never aborts the write.
            try { fs.mkdirSync(witnessDir, { recursive: true }) }
            catch (e) { if (e?.code !== 'EEXIST') throw e }
            fs.writeFileSync(absWitnessPath, jsonl)
        }
    } catch (e) { if (process.env.FREDDIE_DEBUG_TRAJECTORY) console.error('[writeTrajectory]', e) }
}

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

export { writeTrajectory, autoLearnTurn, AUTOLEARN_MIN_LEN, AUTOLEARN_DEDUPE_COS }
