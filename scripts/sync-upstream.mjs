#!/usr/bin/env node
// Bump sibling-package deps to latest registry version.
// Usage: node scripts/sync-upstream.mjs [--dry-run] [pkg1 pkg2 ...]
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const filter = process.argv.slice(2).filter(a => !a.startsWith('--'))

const SIBLINGS = new Set(['plugsdk', 'acptoapi', 'anentrypoint-design', 'freddie', 'gm-cc'])

const pkgPath = resolve(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
const targets = Object.keys(deps).filter(n => SIBLINGS.has(n) && (!filter.length || filter.includes(n)) && n !== pkg.name)

if (!targets.length) {
    console.log('no sibling deps to sync')
    process.exit(0)
}

const changes = []
for (const name of targets) {
    const cur = (pkg.dependencies || {})[name] || (pkg.devDependencies || {})[name]
    if (cur && cur.startsWith('file:')) { console.log(`skip ${name}: file: dep (local-dev pattern)`); continue }
    let latest
    try { latest = execFileSync('npm', ['view', name, 'version'], { encoding: 'utf8', shell: true }).trim() }
    catch (e) { console.error(`! ${name}: npm view failed: ${e.message.split('\n')[0]}`); continue }
    const want = `^${latest}`
    if (cur === want) { console.log(`= ${name} ${cur}`); continue }
    changes.push({ name, from: cur, to: want })
    if (pkg.dependencies?.[name] !== undefined) pkg.dependencies[name] = want
    if (pkg.devDependencies?.[name] !== undefined) pkg.devDependencies[name] = want
    console.log(`~ ${name}: ${cur} -> ${want}`)
}

if (!changes.length) { console.log('nothing to update'); process.exit(0) }
if (dryRun) { console.log('--dry-run: not writing package.json'); process.exit(0) }

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
try { execFileSync('npm', ['install', '--package-lock-only'], { cwd: ROOT, stdio: 'inherit', shell: true }) }
catch (e) { console.error('! npm install --package-lock-only failed:', e.message); process.exit(1) }

console.log('\nsummary:')
for (const c of changes) console.log(`  ${c.name}: ${c.from} -> ${c.to}`)
