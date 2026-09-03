import fs from 'node:fs'
import path from 'node:path'
import { runTurn } from '../agent/machine.js'
import { logger } from '../observability/log.js'

const log = logger('swe')

export async function runMiniSwe({ task, model = null, callLLM = null, env = {}, timeoutMs = 600_000 } = {}) {
    if (!task || !task.prompt) throw new Error('task.prompt required')
    log.info('mini-swe start', { task: task.id || 'anon' })
    const out = await runTurn({ prompt: task.prompt, model, callLLM, timeoutMs })
    const passed = !out.error && (task.expect ? checkExpect(out.result, task.expect) : true)
    log.info('mini-swe done', { passed })
    return { passed, result: out.result, error: out.error, iterations: out.iterations, messages: out.messages }
}
function checkExpect(result, expect) {
    if (typeof expect === 'string') return String(result || '').includes(expect)
    if (expect instanceof RegExp) return expect.test(String(result || ''))
    if (typeof expect === 'function') return Boolean(expect(result))
    return true
}
export function loadTask(file) {
    const txt = fs.readFileSync(file, 'utf8')
    if (file.endsWith('.json')) return JSON.parse(txt)
    return { id: path.basename(file, path.extname(file)), prompt: txt }
}
