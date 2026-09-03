#!/usr/bin/env node
// freddie lint: dependency-free preflight. Validates JS syntax across the
// whole repo (src/, plugins/, bin/, scripts/) and that package.json parses
// and declares the expected shape. Freddie previously had no lint script at
// all -- this is the minimal, genuinely useful floor: it would have caught a
// plugin.js referencing an unimported identifier from its sibling handler.js
// at syntax-check time is NOT guaranteed (that class of bug is a runtime
// ReferenceError, not a syntax error), but a real syntax typo in any plugin
// or CLI file is caught here before it ships. Run: node scripts/lint.mjs
// (or npm run lint).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

export function listJsFiles(root = ROOT) {
  const SCAN_DIRS = ['src', 'plugins', 'bin', 'scripts'].filter((d) => {
    try { return statSync(join(root, d)).isDirectory() } catch { return false }
  })
  const all = SCAN_DIRS.flatMap((d) => walk(join(root, d)))
  return all.filter((p) => ['.js', '.mjs', '.cjs'].includes(extname(p)))
}

const LINE_CAP = 200

export function computeSplitWarnings(jsFiles, root = ROOT) {
  const warnings = []
  for (const f of jsFiles) {
    const src = readFileSync(f, 'utf8')
    const lines = src.split('\n').length
    if (lines <= LINE_CAP) continue
    const exportNames = [...src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)|^export\s+const\s+(\w+)\s*=/gm)]
      .map((m) => m[1] || m[2])
    const groups = new Map()
    for (const name of exportNames) {
      const token = (name.match(/^[a-z]+/) || [name])[0]
      groups.set(token, (groups.get(token) || []).concat(name))
    }
    const file = f.replace(root, '')
    if (groups.size >= 2) {
      const suggestion = [...groups.entries()].map(([tok, names]) => `${tok}*(${names.length}): ${names.join(', ')}`).join('  |  ')
      warnings.push({ file, lines, suggestion })
    } else {
      warnings.push({ file, lines, suggestion: null })
    }
  }
  return warnings
}

// AGENTS.md's "no comments" rule is about self-documenting naming, not a hard
// zero -- the WHY-only exception (hidden constraints, subtle invariants,
// workarounds) means some comments are legitimate. This is a metric, not a
// gate: shebangs (#!) are exempt, everything else counted as a line-comment
// or block-comment occurrence.
export function computeNamingDebt(jsFiles, root = ROOT) {
  const rows = []
  for (const f of jsFiles) {
    const src = readFileSync(f, 'utf8')
    const withoutShebang = src.replace(/^#!.*\n/, '')
    const lineComments = (withoutShebang.match(/(?:^|[^:])\/\/[^\n]*/g) || []).length
    const blockComments = (withoutShebang.match(/\/\*[\s\S]*?\*\//g) || []).length
    const count = lineComments + blockComments
    if (count > 0) rows.push({ file: f.replace(root, ''), count })
  }
  rows.sort((a, b) => b.count - a.count)
  return { total: rows.reduce((s, r) => s + r.count, 0), files_with_comments: rows.length, rows }
}

async function main() {
  const fails = []
  const note = (m) => fails.push(m)
  const jsFiles = listJsFiles()

  for (const f of jsFiles) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }) }
    catch (e) { note(`syntax: ${f.replace(ROOT, '')}\n${String(e.stderr || e).trim()}`) }
  }

  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    if (pkg.type !== 'module') note('package.json: expected "type":"module"')
    if (!pkg.exports) note('package.json: missing exports map')
  } catch (e) { note(`package.json: ${String(e.message || e)}`) }

  const splits = computeSplitWarnings(jsFiles)
  if (splits.length) {
    console.warn(`\n${splits.length} file(s) over the ${LINE_CAP}-line cap:\n`)
    for (const w of splits) console.warn(`  over-cap: ${w.file} (${w.lines} lines) -- ${w.suggestion ? 'possible split by export prefix: ' + w.suggestion : 'no clear split (single export-name cluster)'}`)
  }

  const debt = computeNamingDebt(jsFiles)
  console.log(`\nnaming debt: ${debt.total} comments across ${debt.files_with_comments}/${jsFiles.length} files`)
  for (const r of debt.rows.slice(0, 10)) console.log(`  ${r.count.toString().padStart(3)}  ${r.file}`)

  // Conventional-commit format check on HEAD's own subject line only -- the
  // full existing history has non-conforming commits (merges, pre-convention
  // messages) that would false-fail every run if checked wholesale; this only
  // gates the commit that triggered THIS lint run.
  try {
    const headSubject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: ROOT, encoding: 'utf8' }).trim()
    const isMerge = /^merge\b/i.test(headSubject) || /^chore\(release\)/.test(headSubject)
    if (!isMerge && !/^\w+(\([^)]+\))?!?:\s*.+/.test(headSubject)) {
      note(`commit format: HEAD subject '${headSubject}' does not match conventional-commit format (type(scope): subject)`)
    }
  } catch { /* not in a git repo or no commits yet -- nothing to check */ }

  if (fails.length) {
    console.error(`\nlint FAILED: ${fails.length} issue(s)\n`)
    for (const f of fails) console.error(f + '\n')
    process.exit(1)
  }
  console.log(`\nlint OK: ${jsFiles.length} JS files syntax-checked, package.json valid`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
