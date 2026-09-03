#!/usr/bin/env node
// Bump dependencies to latest registry version.
// Usage: node scripts/sync-upstream.mjs [--dry-run] [--siblings-only] [--force-major] [pkg1 pkg2 ...]
//
// By default bumps ALL dependencies in dependencies and devDependencies.
//   --siblings-only  Only bump the hardcoded SIBLINGS set (old behavior).
//   --force-major    Allow major version bumps (skipped by default with a warning).
//   --dry-run        Show what would change without writing.
//
// Major version guard: when a bump would cross a major version boundary,
// the package is skipped with a warning unless --force-major is set.
// Major bumps need manual API-compat review before landing.
//
// After a successful bump, runs osv-scan-lockfile.mjs if it exists.
//
// DEPENDENCY ORDER for multi-repo bumps:
//   plugsdk / gm / acptoapi / anentrypoint-design push to main first,
//   then freddie's npm install picks up the new commits.
//   thebird vendors freddie via scripts/sync-upstream.mjs — it runs last.
//   When bumping a dep that cascades through all repos, push in this order:
//     1. plugsdk  (no intra-stack deps)
//     2. gm       (depends on plugsdk)
//     3. acptoapi (depends on plugsdk)
//     4. anentrypoint-design (no intra-stack deps)
//     5. freddie  (depends on plugsdk, acptoapi, anentrypoint-design, gm-cc)
//     6. thebird  (vendors freddie)
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const siblingsOnly = process.argv.includes('--siblings-only')
const forceMajor = process.argv.includes('--force-major')
const filter = process.argv.slice(2).filter(a => !a.startsWith('--'))

const SIBLINGS = new Set(['plugsdk', 'acptoapi', 'anentrypoint-design', 'freddie', 'gm-cc'])

const pkgPath = resolve(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }

// Determine target set
const allNames = Object.keys(deps)
const candidates = siblingsOnly
    ? allNames.filter(n => SIBLINGS.has(n) && n !== pkg.name)
    : allNames
const targets = filter.length
    ? candidates.filter(n => filter.includes(n))
    : candidates

if (!targets.length) {
    console.log(siblingsOnly ? 'no sibling deps to sync' : 'no deps to sync')
    process.exit(0)
}

function majorOf(version) {
    const cleaned = String(version).replace(/^[~^>=<]*/, '')
    const v = cleaned.split('.')[0]
    return v && /^\d+$/.test(v) ? parseInt(v, 10) : null
}

const changes = []
const skipped = []
const githubDepsToRefresh = []
for (const name of targets) {
    const cur = (pkg.dependencies || {})[name] || (pkg.devDependencies || {})[name]
    if (!cur) continue
    if (cur.startsWith('file:')) { console.log(`skip ${name}: file: dep (local-dev pattern)`); continue }

    if (cur.startsWith('github:')) {
        if (cur.includes('#')) { console.log(`skip ${name}: github: dep is ref-pinned (${cur}) — not an always-latest spec`); continue }
        console.log(`~ ${name}: ${cur} — will re-resolve default-branch HEAD via npm update`)
        githubDepsToRefresh.push(name)
        continue
    }

    if (cur === 'latest') { console.log(`skip ${name}: already tracks the latest dist-tag`); continue }

    let latest
    try { latest = execFileSync('npm', ['view', name, 'version'], { encoding: 'utf8', shell: true }).trim() }
    catch (e) { console.error(`! ${name}: npm view failed: ${e.message.split('\n')[0]}`); continue }

    const want = `^${latest}`
    if (cur === want) { console.log(`= ${name} ${cur}`); continue }

    // Major version guard
    const curMajor = majorOf(cur)
    const latestMajor = majorOf(latest)
    if (curMajor !== null && latestMajor !== null && curMajor !== latestMajor) {
        if (forceMajor) {
            console.log(`~ ${name}: ${cur} -> ${want}  [major bump — force-major enabled]`)
        } else {
            console.log(`! ${name}: ${cur} -> ${want}  [SKIPPED: major version bump (${curMajor} -> ${latestMajor}) — pass --force-major to override]`)
            skipped.push({ name, from: cur, to: want, reason: `major bump ${curMajor} -> ${latestMajor}` })
            continue
        }
    } else {
        console.log(`~ ${name}: ${cur} -> ${want}`)
    }

    changes.push({ name, from: cur, to: want })
    if (pkg.dependencies?.[name] !== undefined) pkg.dependencies[name] = want
    if (pkg.devDependencies?.[name] !== undefined) pkg.devDependencies[name] = want
}

if (skipped.length) {
    console.log(`\n${skipped.length} major bump(s) skipped (pass --force-major to override):`)
    for (const s of skipped) console.log(`  ${s.name}: ${s.from} -> ${s.to}  (${s.reason})`)
}

if (!changes.length && !githubDepsToRefresh.length) { console.log('nothing to update'); process.exit(0) }
if (dryRun) { console.log('--dry-run: not writing package.json / not refreshing lockfile'); process.exit(0) }

if (changes.length) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
try { execFileSync('npm', ['install', '--package-lock-only'], { cwd: ROOT, stdio: 'inherit', shell: true }) }
catch (e) { console.error('! npm install --package-lock-only failed:', e.message); process.exit(1) }

if (githubDepsToRefresh.length) {
    try { execFileSync('npm', ['update', ...githubDepsToRefresh], { cwd: ROOT, stdio: 'inherit', shell: true }) }
    catch (e) { console.error('! npm update (github deps) failed:', e.message); process.exit(1) }
}

console.log('\nsummary:')
for (const c of changes) console.log(`  ${c.name}: ${c.from} -> ${c.to}`)
for (const g of githubDepsToRefresh) console.log(`  ${g}: lockfile SHA re-resolved to current default-branch HEAD`)

// Run osv.dev vulnerability scan on the updated lockfile
const osvScript = resolve(ROOT, 'scripts', 'osv-scan-lockfile.mjs')
if (existsSync(osvScript)) {
    console.log('\n--- osv-scan-lockfile ---')
    try {
        // process.execPath is a real binary (node.exe), not a shell shim like
        // npm.cmd above -- shell:true here concatenates argv into one string
        // for cmd.exe without quoting, breaking on any space in the install
        // path (e.g. Windows' default "C:\Program Files\nodejs\node.exe").
        // execFileSync's argv array already avoids that with shell:false.
        execFileSync(process.execPath, [osvScript], { cwd: ROOT, stdio: 'inherit' })
    } catch (e) {
        console.error('! osv-scan-lockfile exited non-zero:', e.message)
        process.exitCode = 1
    }
} else {
    console.log('\n[note] scripts/osv-scan-lockfile.mjs not found — skipping vulnerability scan')
}