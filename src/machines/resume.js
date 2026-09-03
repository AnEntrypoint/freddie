// Boot-time resumability driver.
//
// resumeAll() is invoked on process boot (CLI + dashboard server start). It walks
// every non-final persisted machine snapshot and rehydrates the ones that can be
// driven to completion headlessly — interrupted agent turns and unfinished
// batches. Lifecycle snapshots (gateway/acp) and in-flight message markers are
// reported but not auto-driven, since they require their live host process (open
// sockets / stdio) to resume meaningfully; resumeAll() surfaces them so the host
// can decide.
import { list, sweepDone } from './snapshot-store.js'
import { logger } from '../observability/log.js'

const log = logger('resume')

export async function resumeAll({ driveAgents = true, driveBatches = true } = {}) {
    // Drop any final snapshots first so they never resurrect.
    await sweepDone()
    const active = await list({ status: 'active' })
    const summary = { agent: 0, batch: 0, cron: 0, gateway: 0, acp: 0, 'gateway-msg': 0, 'acp-prompt': 0, resumed: [], surfaced: [] }

    for (const row of active) {
        summary[row.kind] = (summary[row.kind] || 0) + 1
        try {
            if (row.kind === 'agent' && driveAgents) {
                const { resumeTurn } = await import('../agent/machine.js')
                resumeTurn({ sessionKey: row.key }).then(() => log.info('agent turn resumed to completion', { key: row.key })).catch(e => log.error('agent resume failed', { key: row.key, err: String(e) }))
                summary.resumed.push({ kind: 'agent', key: row.key })
            } else if (row.kind === 'batch' && driveBatches) {
                const { resumeBatch } = await import('../batch.js')
                resumeBatch({ batchId: row.key }).then(() => log.info('batch resumed to completion', { key: row.key })).catch(e => log.error('batch resume failed', { key: row.key, err: String(e) }))
                summary.resumed.push({ kind: 'batch', key: row.key })
            } else {
                // Lifecycle + in-flight markers: surfaced for the host to act on.
                summary.surfaced.push({ kind: row.kind, key: row.key, status: row.status })
            }
        } catch (e) {
            log.error('resume dispatch failed', { kind: row.kind, key: row.key, err: String(e) })
        }
    }
    log.info('resumeAll complete', { active: active.length, resumed: summary.resumed.length, surfaced: summary.surfaced.length })
    return summary
}
