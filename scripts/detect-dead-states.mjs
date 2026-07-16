#!/usr/bin/env node
// freddie detect-dead-states: for each xstate machine definition (src/machines/*
// and files using createMachine/setup().createMachine), lists the top-level
// state keys under `states: {` and flags any state with zero `target: 'name'`
// references anywhere else in the same file, excluding states explicitly
// marked `type: 'final'`. This is regex-based (no AST), so it is a WARNING
// surface for a human to double-check, not a hard verdict -- real xstate
// machines route through dynamic guards/actions that a text scan can't fully
// resolve, and a state reached only via an external actor send() rather than
// an in-file `target:` would false-positive here.
import { readFileSync } from 'node:fs'
import { listJsFiles, ROOT } from './lint.mjs'

function extractStatesBlock(src) {
    const idx = src.indexOf('states:')
    if (idx === -1) return null
    const braceStart = src.indexOf('{', idx)
    if (braceStart === -1) return null
    let depth = 0, i = braceStart
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') { depth--; if (depth === 0) break }
    }
    return src.slice(braceStart, i + 1)
}

function topLevelStateNames(statesBlock) {
    // Top-level keys of the outer {...}: track brace depth, only accept a
    // `key: {` or `key: {...}` at depth 1 (immediately inside the outer brace).
    const names = []
    let depth = 0
    const re = /(\w+)\s*:\s*\{/g
    let m
    while ((m = re.exec(statesBlock))) {
        // depth at this key's position = number of unmatched '{' before it
        const before = statesBlock.slice(0, m.index)
        const opens = (before.match(/\{/g) || []).length
        const closes = (before.match(/\}/g) || []).length
        if (opens - closes === 1) names.push(m[1]) // depth 1 == directly inside outer {
    }
    return names
}

export function findDeadStates(file) {
    const src = readFileSync(file, 'utf8')
    if (!/createMachine|setup\s*\(/.test(src)) return null
    const statesBlock = extractStatesBlock(src)
    if (!statesBlock) return null
    const names = topLevelStateNames(statesBlock)
    if (!names.length) return null
    const targets = new Set([
        ...[...src.matchAll(/target\s*:\s*'([^']+)'/g)].map((m) => m[1]),
        // xstate's shorthand transition syntax: `EVENT: 'targetState'` (no
        // explicit `target:` key) inside an `on: {...}` block -- e.g.
        // `stopped: { on: { START: 'starting' } }`. Any bare quoted string
        // immediately after a colon that isn't itself a known xstate reserved
        // key (on/always/invoke/entry/exit/type/actions/guard/target/src/id)
        // is treated as a shorthand target reference.
        ...[...src.matchAll(/\b(\w+)\s*:\s*'([^']+)'/g)]
            .filter((m) => !['on', 'always', 'invoke', 'entry', 'exit', 'type', 'actions', 'guard', 'target', 'src', 'id', 'initial'].includes(m[1]))
            .map((m) => m[2]),
        // initial: 'name' -- the machine's starting state is always reachable.
        ...[...src.matchAll(/initial\s*:\s*'([^']+)'/g)].map((m) => m[1]),
    ])
    const finals = new Set()
    for (const name of names) {
        const stateRe = new RegExp(`\\b${name}\\s*:\\s*\\{([^{}]|\\{[^{}]*\\})*type\\s*:\\s*'final'`, 's')
        if (stateRe.test(statesBlock)) finals.add(name)
    }
    const dead = names.filter((n) => !targets.has(n) && !finals.has(n))
    return { states: names, dead }
}

async function main() {
    const files = listJsFiles()
    const flagged = []
    for (const f of files) {
        const result = findDeadStates(f)
        if (result && result.dead.length) flagged.push({ file: f.replace(ROOT, ''), ...result })
    }
    if (!flagged.length) { console.log('detect-dead-states: no unreachable states found'); return }
    console.log(`detect-dead-states: ${flagged.length} file(s) with possibly-dead states (regex heuristic -- verify before removing):\n`)
    for (const r of flagged) console.log(`  ${r.file}  states=[${r.states.join(',')}]  dead=[${r.dead.join(',')}]`)
}

main()
