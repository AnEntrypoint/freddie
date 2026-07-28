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

// --- --suggest-refactor: detect files with multiple concerns and suggest split
// points based on co-usage patterns (which functions use which imported domains).
const suggestRefactor = process.argv.includes('--suggest-refactor')

function suggestSplits(fileAbs, relPath, domains) {
    const src = readFileSync(fileAbs, 'utf8')
    // Find function/class declarations and the imports they reference
    const importMap = new Map() // importName -> domain
    const importRe = /import\s+(?:\{([^}]+)\}|(\*\s+as\s+\w+)|\b(\w+))\s+from\s+['"]([^'"]+)['"]/g
    let im
    while ((im = importRe.exec(src))) {
        const names = (im[1] || im[2] || im[3] || '').replace(/\*\s+as\s+/, '').split(',').map(s => s.trim()).filter(Boolean)
        const importPath = im[4]
        const d = domainOf(fileAbs, importPath)
        if (d) for (const n of names) importMap.set(n, d)
    }
    // Default import: `import foo from './bar'`
    const defaultRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g
    while ((im = defaultRe.exec(src))) {
        const d = domainOf(fileAbs, im[2])
        if (d) importMap.set(im[1], d)
    }

    // Find top-level function/class declarations and map them to domains
    const declRe = /(?:export\s+)?(?:async\s+)?(?:function|class)\s+(\w+)/g
    const fnBlocks = []
    let dm
    while ((dm = declRe.exec(src))) {
        const name = dm[1]
        // Find the function body by matching braces
        const startIdx = dm.index
        const bodyStart = src.indexOf('{', startIdx)
        if (bodyStart === -1) continue
        let depth = 0, endIdx = bodyStart
        for (let i = bodyStart; i < src.length; i++) {
            if (src[i] === '{') depth++
            else if (src[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break } }
        }
        const body = src.slice(bodyStart, endIdx)
        // Find which imported names are referenced in this function body
        const usedDomains = new Set()
        for (const [impName, d] of importMap) {
            if (body.includes(impName)) usedDomains.add(d)
        }
        fnBlocks.push({ name, domains: [...usedDomains].sort() })
    }

    // Group functions by their primary domain set
    const groups = new Map()
    for (const fb of fnBlocks) {
        const key = fb.domains.join('|') || '(no-external-imports)'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(fb.name)
    }

    if (groups.size <= 1) return null // no meaningful split
    const suggestions = []
    for (const [key, fns] of groups) {
        const domainList = key === '(no-external-imports)' ? [] : key.split('|')
        suggestions.push({
            functions: fns,
            touches_domains: domainList,
            suggestion: domainList.length
                ? `extract {${fns.join(', ')}} into a new file that owns the ${domainList.join('/')} concern`
                : `{${fns.join(', ')}} are self-contained (no external imports) — candidate for a separate utility module`,
        })
    }
    return { file: relPath, domains, suggestions }
}

if (suggestRefactor) {
    const suggestions = []
    for (const r of flagged) {
        const abs = join(ROOT, r.file)
        const s = suggestSplits(abs, r.file, r.domains)
        if (s) suggestions.push(s)
    }
    console.log(`audit-concerns --suggest-refactor: ${flagged.length} multi-concern files, ${suggestions.length} with split suggestions\n`)
    for (const s of suggestions) {
        console.log(`## ${s.file}  [${s.domains.join(', ')}]`)
        for (const sug of s.suggestions) {
            console.log(`  - ${sug.suggestion}`)
        }
        console.log()
    }
    if (!suggestions.length) console.log('(no split suggestions — multi-concern files have interleaved domain usage that cannot be cleanly separated)')
} else {
    const outDir = join(process.env.FREDDIE_HOME || join(process.env.HOME || process.env.USERPROFILE, '.freddie'), 'audit')
    mkdirSync(outDir, { recursive: true })
    const outFile = join(outDir, 'concerns.json')
    writeFileSync(outFile, JSON.stringify({ generated: new Date().toISOString(), threshold: MULTI_CONCERN_THRESHOLD, total_files: rows.length, flagged_count: flagged.length, rows }, null, 2))

    console.log(`audit-concerns: ${rows.length} files scanned, ${flagged.length} flagged (>=${MULTI_CONCERN_THRESHOLD} distinct subsystem domains)`)
    for (const r of flagged) console.log(`  ${r.file}  [${r.domains.join(', ')}]`)
    console.log(`\nwritten: ${outFile}`)
}
