#!/usr/bin/env node
// freddie generate-changelog: parses `git log <lastTag>..HEAD --format=%s`
// commit subjects, groups by conventional-commit prefix (feat/fix/chore/
// refactor/docs -> features/fixes/other), and PREPENDS a new dated section to
// CHANGELOG.md. Manual invocation only (not CI-wired) -- CHANGELOG.md is
// hand-curated with real prose detail per its own [Unreleased] section, and
// this generator must never overwrite that; it only adds a new section above
// whatever's already there. Run: node scripts/generate-changelog.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './lint.mjs'

const CONVENTIONAL_RE = /^(\w+)(\([^)]+\))?(!)?:\s*(.+)$/

export function classify(subject) {
    const m = CONVENTIONAL_RE.exec(subject)
    if (!m) return { group: 'other', breaking: false, text: subject }
    const [, type, , bang, text] = m
    const breaking = !!bang
    if (type === 'feat') return { group: 'features', breaking, text }
    if (type === 'fix') return { group: 'fixes', breaking, text }
    if (['chore', 'refactor', 'docs', 'test', 'style', 'perf'].includes(type)) return { group: 'other', breaking, text: `${type}: ${text}` }
    return { group: 'other', breaking, text: subject }
}

function lastTag() {
    try { return execFileSync('git', ['describe', '--tags', '--abbrev=0'], { cwd: ROOT, encoding: 'utf8' }).trim() }
    catch { return null }
}

export function buildSection(subjects, dateStr = new Date().toISOString().slice(0, 10)) {
    const groups = { features: [], fixes: [], other: [] }
    let anyBreaking = false
    for (const s of subjects) {
        if (/^chore\(release\)/.test(s)) continue // skip the auto-bump commits themselves
        const c = classify(s)
        if (c.breaking) anyBreaking = true
        groups[c.group].push(c.text)
    }
    const lines = [`## [${dateStr}]`, '']
    if (anyBreaking) lines.push('**Contains breaking changes.**', '')
    if (groups.features.length) { lines.push('### Added'); for (const t of groups.features) lines.push(`- ${t}`); lines.push('') }
    if (groups.fixes.length) { lines.push('### Fixed'); for (const t of groups.fixes) lines.push(`- ${t}`); lines.push('') }
    if (groups.other.length) { lines.push('### Other'); for (const t of groups.other) lines.push(`- ${t}`); lines.push('') }
    return lines.join('\n')
}

function main() {
    const allFlag = process.argv.includes('--all')
    const sinceArg = process.argv.find((a) => a.startsWith('--since='))
    const tag = sinceArg ? sinceArg.slice('--since='.length) : lastTag()
    if (!tag && !allFlag) {
        console.log('generate-changelog: no git tag found. Pass --since=<ref> to scope the range, or --all to use the entire history (large, rarely what you want on an untagged repo).')
        process.exitCode = 1
        return
    }
    const range = tag ? `${tag}..HEAD` : 'HEAD'
    const log = execFileSync('git', ['log', range, '--format=%s'], { cwd: ROOT, encoding: 'utf8' })
    const subjects = log.split('\n').filter(Boolean)
    if (!subjects.filter((s) => !/^chore\(release\)/.test(s)).length) {
        console.log(`generate-changelog: no non-release commits since ${tag || 'repo start'}`)
        return
    }
    const section = buildSection(subjects)
    const changelogPath = join(ROOT, 'CHANGELOG.md')
    const existing = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : ''
    writeFileSync(changelogPath, section + '\n' + existing)
    console.log(`generate-changelog: prepended a new section (${subjects.length} commits since ${tag || 'repo start'}) to CHANGELOG.md`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
