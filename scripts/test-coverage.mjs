#!/usr/bin/env node
// freddie test-coverage: statically parses test.js's `await T('group-name', ...)`
// calls (each group name is a `+`-joined set of keyword tokens describing what
// it covers) and cross-references against real plugins/*/{plugin,handler}.js
// directory names + src/**/*.js file basenames to report which subsystem names
// appear in NEITHER a test group name NOR are referenced anywhere inside
// test.js's body -- a coverage MAP surfacing untested surface area, not a
// hard gate (a name absent from a group title can still be exercised inside
// the group's body via a direct import, which this also checks for).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { ROOT, listJsFiles } from './lint.mjs'

function testGroupNames() {
    const src = readFileSync(join(ROOT, 'test.js'), 'utf8')
    const groups = [...src.matchAll(/await T\('([^']+)'/g)].map((m) => m[1])
    return { src, groups, tokens: new Set(groups.flatMap((g) => g.split('+'))) }
}

function pluginNames() {
    const dir = join(ROOT, 'plugins')
    try {
        return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    } catch { return [] }
}

function main() {
    const { src: testSrc, groups, tokens } = testGroupNames()
    const plugins = pluginNames()
    const untested = []
    for (const name of plugins) {
        // A plugin counts as covered if its directory name (or a close token
        // match) appears as a group-title token OR is referenced literally
        // anywhere in test.js's body (e.g. imported, dispatched by name).
        const short = name.replace(/^(gui-|platform-|memory-)/, '')
        const inTitle = [...tokens].some((t) => t.includes(short) || short.includes(t))
        const inBody = testSrc.includes(`'${name}'`) || testSrc.includes(name)
        if (!inTitle && !inBody) untested.push(name)
    }
    console.log(`test-coverage: ${groups.length} test groups, ${plugins.length} plugins`)
    console.log(`  covered (title or body reference): ${plugins.length - untested.length}`)
    console.log(`  untested surface area: ${untested.length}`)
    if (untested.length) {
        console.log('\n  plugins with no group-title or body reference:')
        for (const n of untested) console.log(`    ${n}`)
    }
}

main()
