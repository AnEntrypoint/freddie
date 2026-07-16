#!/usr/bin/env node
// freddie audit-concerns: maps each src/plugins file to its imported-module
// "domains" (the top two path segments of each relative import target) as a
// proxy for how many distinct subsystems a file touches. A file importing
// from many unrelated domains is a multi-concern smell -- this is a coarse,
// honest heuristic (no AST-level call-graph analysis), not a hard verdict.
// Run: node scripts/audit-concerns.mjs
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, extname, dirname, relative, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MULTI_CONCERN_THRESHOLD = 4

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const p = join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) walk(p, out)
        else out.push(p)
    }
    return out
}

function domainOf(fromFile, importPath) {
    if (!importPath.startsWith('.')) return null // external package, not a freddie subsystem
    const resolved = normalize(join(dirname(fromFile), importPath))
    const rel = relative(ROOT, resolved).replace(/\\/g, '/')
    const parts = rel.split('/').filter(Boolean)
    return parts.slice(0, 2).join('/')
}

function importsOf(src) {
    const out = []
    const re = /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
    let m
    while ((m = re.exec(src))) out.push(m[1])
    return out
}

const scanDirs = ['src', 'plugins'].filter((d) => { try { return statSync(join(ROOT, d)).isDirectory() } catch { return false } })
const files = scanDirs.flatMap((d) => walk(join(ROOT, d))).filter((f) => ['.js', '.mjs'].includes(extname(f)))

const rows = []
for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const domains = new Set()
    for (const imp of importsOf(src)) {
        const d = domainOf(f, imp)
        if (d) domains.add(d)
    }
    const rel = relative(ROOT, f).replace(/\\/g, '/')
    const selfDomain = rel.split('/').slice(0, 2).join('/')
    domains.delete(selfDomain) // importing siblings in your own dir isn't a multi-concern signal
    rows.push({ file: rel, domains: [...domains].sort(), multi_concern: domains.size >= MULTI_CONCERN_THRESHOLD })
}

const flagged = rows.filter((r) => r.multi_concern)
const outDir = join(process.env.FREDDIE_HOME || join(process.env.HOME || process.env.USERPROFILE, '.freddie'), 'audit')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, 'concerns.json')
writeFileSync(outFile, JSON.stringify({ generated: new Date().toISOString(), threshold: MULTI_CONCERN_THRESHOLD, total_files: rows.length, flagged_count: flagged.length, rows }, null, 2))

console.log(`audit-concerns: ${rows.length} files scanned, ${flagged.length} flagged (>=${MULTI_CONCERN_THRESHOLD} distinct subsystem domains)`)
for (const r of flagged) console.log(`  ${r.file}  [${r.domains.join(', ')}]`)
console.log(`\nwritten: ${outFile}`)
