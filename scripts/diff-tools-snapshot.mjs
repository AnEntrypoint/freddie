#!/usr/bin/env node
// freddie diff-tools-snapshot: reusable equivalence check for `host.pi.tools.list()`
// (the same registry `bin/freddie.js tools` prints from — see plugins/core-cli/plugin.js).
// A prior refactor pass (plugin convention-discovery) verified tools output was
// byte-identical before/after by capturing `node bin/freddie.js tools` at two points
// in time and diffing by hand. This is the reusable version of that check: run it
// once with --save before a refactor to capture a baseline snapshot, then run it
// again (no flag) after to compare and get a pass/fail signal instead of eyeballing
// two terminal dumps.
//
//   node scripts/diff-tools-snapshot.mjs --save     # (re)write the baseline snapshot
//   node scripts/diff-tools-snapshot.mjs            # compare current tools against
//                                                    # the saved baseline; exit 0 if
//                                                    # identical, exit 1 with a
//                                                    # readable diff otherwise
//
// The snapshot is a full-fidelity capture (name, toolset, description, parameters
// schema) of every registered tool, not just the truncated columns `tools list`
// prints to a terminal — so a schema-only change (e.g. a parameter renamed but the
// description untouched) is still caught.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './lint.mjs'
import { bootHost } from '../src/host/index.js'

const SNAPSHOT_PATH = join(ROOT, '.tools-snapshot.json')

async function captureTools() {
    const h = await bootHost()
    const list = h.pi.tools.list()
        .map((t) => ({
            name: t.name,
            toolset: t.toolset || 'core',
            description: t.schema?.description || '',
            parameters: t.schema?.parameters || {},
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    return list
}

function loadSnapshot() {
    if (!existsSync(SNAPSHOT_PATH)) return null
    try { return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) }
    catch (e) { console.error(`diff-tools-snapshot: failed to parse existing snapshot: ${e.message}`); return null }
}

function saveSnapshot(tools) {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify({ capturedAt: new Date().toISOString(), tools }, null, 2) + '\n')
}

// Compare two tool lists by name; report added/removed/changed. `changed` diffs
// toolset/description/parameters (parameters compared by stable JSON string so
// key-order-only churn from a Map/object reshuffle doesn't false-positive).
function diffTools(baseline, current) {
    const byName = (list) => new Map(list.map((t) => [t.name, t]))
    const before = byName(baseline)
    const after = byName(current)
    const added = [...after.keys()].filter((n) => !before.has(n))
    const removed = [...before.keys()].filter((n) => !after.has(n))
    const changed = []
    for (const name of after.keys()) {
        if (!before.has(name)) continue
        const b = before.get(name)
        const a = after.get(name)
        const fields = []
        if (b.toolset !== a.toolset) fields.push({ field: 'toolset', before: b.toolset, after: a.toolset })
        if (b.description !== a.description) fields.push({ field: 'description', before: b.description, after: a.description })
        const bp = JSON.stringify(b.parameters)
        const ap = JSON.stringify(a.parameters)
        if (bp !== ap) fields.push({ field: 'parameters', before: b.parameters, after: a.parameters })
        if (fields.length) changed.push({ name, fields })
    }
    return { added, removed, changed }
}

function printDiff({ added, removed, changed }) {
    if (added.length) {
        console.log(`\nadded (${added.length}):`)
        for (const n of added) console.log(`  + ${n}`)
    }
    if (removed.length) {
        console.log(`\nremoved (${removed.length}):`)
        for (const n of removed) console.log(`  - ${n}`)
    }
    if (changed.length) {
        console.log(`\nchanged (${changed.length}):`)
        for (const { name, fields } of changed) {
            console.log(`  ~ ${name}`)
            for (const f of fields) {
                if (f.field === 'parameters') {
                    console.log(`      parameters: schema differs (see JSON below)`)
                    console.log(`        before: ${JSON.stringify(f.before)}`)
                    console.log(`        after:  ${JSON.stringify(f.after)}`)
                } else {
                    console.log(`      ${f.field}: "${f.before}" -> "${f.after}"`)
                }
            }
        }
    }
}

async function main() {
    const args = process.argv.slice(2)
    const save = args.includes('--save')
    const tools = await captureTools()

    if (save) {
        saveSnapshot(tools)
        console.log(`diff-tools-snapshot: saved baseline (${tools.length} tools) -> ${SNAPSHOT_PATH}`)
        process.exitCode = 0
        return
    }

    const existing = loadSnapshot()
    if (!existing) {
        // No baseline yet: first run with no --save establishes one, same as
        // running --save explicitly, so the very first invocation on a fresh
        // checkout doesn't require the caller to know the flag exists.
        saveSnapshot(tools)
        console.log(`diff-tools-snapshot: no existing snapshot; saved new baseline (${tools.length} tools) -> ${SNAPSHOT_PATH}`)
        process.exitCode = 0
        return
    }

    const result = diffTools(existing.tools, tools)
    const isIdentical = !result.added.length && !result.removed.length && !result.changed.length
    if (isIdentical) {
        console.log(`diff-tools-snapshot: identical (${tools.length} tools, baseline captured ${existing.capturedAt})`)
        process.exitCode = 0
        return
    }

    console.log(`diff-tools-snapshot: MISMATCH vs baseline captured ${existing.capturedAt}`)
    printDiff(result)
    console.log(`\nRun with --save to accept this as the new baseline if the change is intentional.`)
    process.exitCode = 1
}

main().catch((e) => { console.error('diff-tools-snapshot: fatal:', e); process.exitCode = 1 })
