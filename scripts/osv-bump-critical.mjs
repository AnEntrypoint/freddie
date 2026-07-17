#!/usr/bin/env node
// Reads a CRITICAL-findings JSON file (produced by
// `node scripts/osv-scan-lockfile.mjs --json <path>`) and bumps each flagged
// package to its patched version via `npm install <pkg>@<fixedVersion>
// --package-lock-only`, mirroring sync-upstream.mjs's install pattern. Does
// NOT open the PR itself — that's peter-evans/create-pull-request@v6 in the
// wiring workflow, same action AGENTS.md documents sync-upstream.yml uses.
// Usage: node scripts/osv-bump-critical.mjs <findings.json> [--dry-run]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dryRun = process.argv.includes('--dry-run')
const findingsPath = process.argv.slice(2).find(a => !a.startsWith('--'))

if (!findingsPath) {
    console.error('usage: node scripts/osv-bump-critical.mjs <findings.json> [--dry-run]')
    process.exitCode = 1
    process.exit()
}

const data = JSON.parse(readFileSync(resolve(findingsPath), 'utf8'))
const findings = data.findings || []

if (!findings.length) {
    console.log('no CRITICAL findings — nothing to bump')
    process.exit(0)
}

// A vuln can list the same package multiple times (multiple ranges/ids) —
// bump each package once, to the highest fixed version any finding named.
const byPkg = new Map()
for (const f of findings) {
    if (!f.fixedVersion) { console.log(`! ${f.pkg}@${f.version} (${f.id}): CRITICAL but no fixed version published yet — cannot auto-bump`); continue }
    const existing = byPkg.get(f.pkg)
    if (!existing || compareSemver(f.fixedVersion, existing) > 0) byPkg.set(f.pkg, f.fixedVersion)
}

function compareSemver(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0)
        if (d) return d
    }
    return 0
}

if (!byPkg.size) {
    console.log('all CRITICAL findings lack a published fix — nothing to bump')
    process.exit(0)
}

console.log(`bumping ${byPkg.size} package(s) to their patched version:`)
for (const [name, version] of byPkg) console.log(`  ${name} -> ${version}`)

if (dryRun) { console.log('\n--dry-run: not running npm install'); process.exit(0) }

const specs = [...byPkg.entries()].map(([name, version]) => `${name}@${version}`)
try {
    execFileSync('npm', ['install', ...specs, '--package-lock-only'], { stdio: 'inherit', shell: true })
} catch (e) {
    console.error('! npm install failed:', e.message)
    process.exitCode = 1
    process.exit()
}

console.log('\ndone — package-lock.json updated, review before committing')
