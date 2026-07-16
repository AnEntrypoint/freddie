// One-shot migration: legacy local-SQLite memory (memory_local table) -> gm rs-learn.
// freddie's learning store is now gm rs-learn; this drains any rows left in the old
// memory_local table into rs-learn via the in-process gm-learn client, then is safe to
// run repeatedly (already-migrated rows dedupe on recall similarity).
//
// Usage: node scripts/migrate-memory-to-gm.mjs [namespace]
import { db } from '../src/db.js'
import { memorize, recall, learnAvailable } from '../src/learn/gm-learn.js'

const namespace = process.argv[2] || 'default'

async function main() {
    const d = await db()
    let rows = []
    try {
        rows = await d.prepare('SELECT id, content, ts FROM memory_local ORDER BY id ASC').all()
    } catch (_) {
        console.log('no legacy memory_local table — nothing to migrate')
        return
    }
    if (!rows.length) { console.log('memory_local is empty — nothing to migrate'); return }
    // Force-init the gm client and verify it is live before draining.
    await recall('probe', { limit: 1, namespace })
    if (!learnAvailable()) { console.error('gm rs-learn unavailable — aborting (no rows migrated)'); process.exit(1) }
    let migrated = 0, skipped = 0
    for (const r of rows) {
        const text = (r.content || '').toString().trim()
        if (!text) { skipped++; continue }
        const existing = await recall(text, { limit: 1, namespace })
        if (existing.length && existing[0].score >= 0.95) { skipped++; continue }
        const key = await memorize(text, { namespace })
        if (key) migrated++; else skipped++
    }
    console.log(`migrated ${migrated} memory_local rows into gm rs-learn (namespace=${namespace}); ${skipped} skipped (empty/duplicate)`)
    console.log('legacy memory_local rows left in place; drop the table manually once verified.')
}

main().catch(e => { console.error('migration failed:', e && e.message); process.exit(1) })
