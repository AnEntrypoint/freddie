#!/usr/bin/env node
// freddie validate-prd: checks .gm/prd.yml rows against the REAL fields the
// gm plugkit gate actually enforces (witnessed live this session: id is
// mandatory and NEVER auto-generated as item-<ms> -- a row without an id and
// without a slugifiable subject/title/name/task/goal/description/notes is
// hard-rejected at prd-add time). Flags rows that are missing a real
// referenceable id, missing both subject and description, or have a status
// value outside the known set.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { ROOT } from './lint.mjs'

const KNOWN_STATUSES = new Set(['pending', 'completed', 'witnessed', 'resolved', 'unknown'])

export function validatePrdRows(rows) {
    const problems = []
    for (const [i, row] of rows.entries()) {
        if (!row.id || typeof row.id !== 'string' || !row.id.trim()) {
            problems.push({ row: i, id: row.id || null, issue: 'missing or empty id -- unreferenceable by later prd-resolve/recall' })
        }
        // subject/description/title are the documented fields; `text` is a
        // real field found in-the-wild across many historical rows in this
        // repo's own .gm/prd.yml (accepted by an earlier plugkit version) --
        // treated as equally valid here rather than false-flagging real,
        // already-resolved history.
        if (!row.subject && !row.description && !row.title && !row.text) {
            problems.push({ row: i, id: row.id || null, issue: 'missing subject/description/title/text -- no human-readable intent' })
        }
        if (row.status && !KNOWN_STATUSES.has(row.status)) {
            problems.push({ row: i, id: row.id || null, issue: `status '${row.status}' is not one of ${[...KNOWN_STATUSES].join(',')}` })
        }
        if (row.blockedBy && !Array.isArray(row.blockedBy)) {
            problems.push({ row: i, id: row.id || null, issue: 'blockedBy must be an array' })
        }
    }
    return problems
}

function main() {
    const prdPath = join(ROOT, '.gm', 'prd.yml')
    if (!existsSync(prdPath)) { console.log('validate-prd: no .gm/prd.yml found'); return }
    const rows = yaml.load(readFileSync(prdPath, 'utf8')) || []
    const problems = validatePrdRows(rows)
    console.log(`validate-prd: ${rows.length} rows checked, ${problems.length} problem(s)`)
    for (const p of problems) console.log(`  row[${p.row}] ${p.id ? 'id=' + p.id : '(no id)'}: ${p.issue}`)
    if (problems.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
