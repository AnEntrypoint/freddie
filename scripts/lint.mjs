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
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const fails = []
const note = (m) => fails.push(m)

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

const SCAN_DIRS = ['src', 'plugins', 'bin', 'scripts'].filter((d) => {
  try { return statSync(join(ROOT, d)).isDirectory() } catch { return false }
})
const all = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
const jsFiles = all.filter((p) => ['.js', '.mjs', '.cjs'].includes(extname(p)))

// 1. JS syntax: node --check every JS/MJS/CJS file under the scanned dirs.
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
  } catch (e) {
    note(`syntax: ${f.replace(ROOT, '')}\n${String(e.stderr || e).trim()}`)
  }
}

// 2. package.json parses and declares the expected shape.
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  if (pkg.type !== 'module') note('package.json: expected "type":"module"')
  if (!pkg.exports) note('package.json: missing exports map')
} catch (e) {
  note(`package.json: ${String(e.message || e)}`)
}

if (fails.length) {
  console.error(`lint FAILED: ${fails.length} issue(s)\n`)
  for (const f of fails) console.error(f + '\n')
  process.exit(1)
}
console.log(`lint OK: ${jsFiles.length} JS files syntax-checked, package.json valid`)
