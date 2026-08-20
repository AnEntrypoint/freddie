import { db } from '../db.js'
import { parseCron, matches } from './cron-parse.js'
import { runTurn } from '../agent/machine.js'
import { logger } from '../observability/log.js'
import { runStep } from '../machines/step-journal.js'

const log = logger('cron')

async function init() {
    const d = await db()
    await d.exec(`CREATE TABLE IF NOT EXISTS cron_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, cron TEXT NOT NULL, prompt TEXT NOT NULL, model TEXT, last_run INTEGER, created INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1)`)
    return d
}

export async function createJob({ cron, prompt, model = null }) {
    parseCron(cron)
    const d = await init()
    const info = await d.prepare(`INSERT INTO cron_jobs (cron, prompt, model, created, enabled) VALUES (?, ?, ?, ?, 1)`).run(cron, prompt, model, Date.now())
    const id = Number(info.lastInsertRowid)
    log.info('job created', { id, cron })
    return id
}

export async function listJobs() {
    return await (await init()).prepare(`SELECT * FROM cron_jobs ORDER BY id DESC`).all()
}

export async function cancelJob(id) {
    await (await init()).prepare(`UPDATE cron_jobs SET enabled = 0 WHERE id = ?`).run(id)
}

export async function deleteJob(id) {
    await (await init()).prepare(`DELETE FROM cron_jobs WHERE id = ?`).run(id)
}

export async function tick(now = new Date(), { callLLM = null } = {}) {
    const d = await init()
    const jobs = await d.prepare(`SELECT * FROM cron_jobs WHERE enabled = 1`).all()
    const fired = []
    for (const j of jobs) {
        try {
            const parsed = parseCron(j.cron)
            if (!matches(parsed, now)) continue
            const minuteKey = Math.floor(now.getTime() / 60000)
            if (j.last_run && Math.floor(j.last_run / 60000) === minuteKey) continue
            await d.prepare(`UPDATE cron_jobs SET last_run = ? WHERE id = ?`).run(now.getTime(), j.id)
            fired.push(j)
            // runStep makes the fire idempotent within the minute as a second layer
            // atop the last_run guard. Cron step rows accumulate (one per fired
            // minute-key) but are tiny; minute-keys rotate so they don't collide.
            // approvalTimeoutMs:0: cron jobs are detached, nobody can ever
            // answer an approval.request for them, so a gated tool call under
            // agent.approval_mode=mutating/etc should fail fast rather than
            // park for the human-facing 120s default (see src/batch.js's
            // runOne for the same fix + full rationale).
            runStep('cron:' + j.id, 'fire:' + minuteKey, () => runTurn({ prompt: j.prompt, callLLM, approvalTimeoutMs: 0 })).catch(e => log.error('cron run failed', { id: j.id, err: String(e) }))
        } catch (e) { log.error('cron tick failed', { id: j.id, err: String(e) }) }
    }
    return fired
}

let _interval = null
export function startScheduler({ callLLM = null, intervalMs = 30000 } = {}) {
    stopScheduler()
    _interval = setInterval(() => { tick(new Date(), { callLLM }).catch(e => log.error('cron scheduler tick failed', { err: String(e) })) }, intervalMs)
    return _interval
}

export function stopScheduler() {
    if (_interval) { clearInterval(_interval); _interval = null }
}
