import { runTurn } from '../agent/machine.js'
export async function oneshot({ prompt, model = null, callLLM = null, timeoutMs = 60000 } = {}) {
    if (!prompt) throw new Error('prompt required')
    const out = await runTurn({ prompt, model, callLLM, timeoutMs })
    return { result: out.result || '', error: out.error || null, iterations: out.iterations }
}
