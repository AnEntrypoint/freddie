// Browser compatibility audit for new kimi-cli parity features.
// Checks that no module has top-level node:* imports or require() calls
// that would crash in a browser environment (thebird / pyodide).
//
// Usage: node _verify-browser-compat.mjs
//
// Approach: strip function bodies (anything between { } at column 0),
// then check the remaining module-scope code for node:* imports,
// require() calls, __dirname, __filename, and process.* usage.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Files that MUST be browser-compatible at import time (no top-level node:*
// imports, no top-level require() calls). Dynamic imports and function-body
// require() calls are OK — they're guarded by try/catch or isBrowser() checks.
// ---------------------------------------------------------------------------
const FILES = [
  'plugins/glob/handler.js',
  'plugins/glob/plugin.js',
  'plugins/think/handler.js',
  'plugins/think/plugin.js',
  'plugins/ask_user/handler.js',
  'plugins/task/handler.js',
  'plugins/task/registry.js',
  'plugins/task/plugin.js',
  'plugins/plan_mode/handler.js',
  'plugins/plan_mode/state.js',
  'plugins/plan_mode/plugin.js',
  'plugins/core/approval_state.js',
  'plugins/core/delegate/handler.js',
  'src/agent/dynamic_injection.js',
  'src/agent/agent_specs.js',
  'src/agent/machine.js',
]

// ---------------------------------------------------------------------------
// Strip function/class bodies and block statements from module scope.
// Keeps lines that are at the module scope (indentation depth 0 within
// the stripped region). Lines inside functions/classes/blocks are removed.
// ---------------------------------------------------------------------------
function stripBodies(source) {
  const lines = source.split('\n')
  const result = []
  let depth = 0
  // Track brace depth for lines at the module scope only.
  // A `{` at any indentation increases depth; `}` decreases it.
  // Lines at depth > 0 are inside a block and are removed.
  for (const line of lines) {
    // Count braces in this line (ignoring those inside strings/comments
    // is hard; we use a simple heuristic that works for well-formatted code).
    let open = 0
    let close = 0
    let inString = false
    let inTemplate = false
    let stringChar = ''
    let inComment = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      const next = line[i + 1] || ''

      if (inComment) {
        if (ch === '*' && next === '/') { inComment = false; i++ }
        continue
      }
      if (!inString && !inTemplate) {
        if (ch === '/' && next === '/') break // rest of line is comment
        if (ch === '/' && next === '*') { inComment = true; i++; continue }
        if (ch === '"' || ch === "'" || ch === '`') {
          if (ch === '`') inTemplate = true
          else inString = true
          stringChar = ch
          continue
        }
        if (ch === '{') open++
        if (ch === '}') close++
      } else if (inString) {
        if (ch === '\\') { i++; continue }
        if (ch === stringChar) inString = false
      } else if (inTemplate) {
        if (ch === '\\') { i++; continue }
        if (ch === '`') inTemplate = false
      }
    }

    // Only keep lines at depth 0 (module scope).
    // Also keep the line if it contains a `{` that opens a new block
    // (we strip the body but keep the signature line).
    if (depth === 0) {
      result.push(line)
    }
    depth += open - close
    if (depth < 0) depth = 0 // safety: unbalanced braces
  }
  return result.join('\n')
}

// ---------------------------------------------------------------------------
// Check the stripped source for problematic patterns at module scope.
// ---------------------------------------------------------------------------
function checkTopLevel(source) {
  const issues = []

  // Static imports of node: builtins
  if (/^import\s+.*\s+from\s+['"]node:/m.test(source)) {
    issues.push('top-level static node: import detected')
  }

  // require() calls at module scope
  // We look for `require(` that is not preceded by `import(` or `await import(`
  // and not inside a comment
  const requireLines = source.split('\n').filter(l => {
    const trimmed = l.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false
    return /\brequire\s*\(/.test(trimmed) && !/\bimport\s*\(/.test(trimmed)
  })
  if (requireLines.length > 0) {
    issues.push(`top-level require() call detected: ${requireLines[0].trim().slice(0, 80)}`)
  }

  // __dirname / __filename at module scope
  if (/\b__dirname\b/.test(source) && !/\/\/.*__dirname/.test(source)) {
    issues.push('__dirname usage at module scope')
  }
  if (/\b__filename\b/.test(source) && !/\/\/.*__filename/.test(source)) {
    issues.push('__filename usage at module scope')
  }

  // process.env / process.cwd() / process.platform at module scope
  // (not inside a function body)
  if (/\bprocess\.(env|cwd|platform)\b/.test(source)) {
    issues.push('process.env/cwd/platform at module scope')
  }

  return issues
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const results = []
let failures = 0

for (const rel of FILES) {
  const filePath = path.join(__dirname, rel)
  if (!fs.existsSync(filePath)) {
    results.push({ file: rel, ok: false, issues: ['FILE NOT FOUND'] })
    failures++
    continue
  }

  const source = fs.readFileSync(filePath, 'utf-8')
  const topLevel = stripBodies(source)
  const issues = checkTopLevel(topLevel)

  results.push({
    file: rel,
    ok: issues.length === 0,
    issues,
  })

  if (issues.length > 0) failures++
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\nBrowser compatibility audit — ${FILES.length} files checked\n`)

for (const r of results) {
  const status = r.ok ? '✓' : '✗'
  console.log(`  ${status} ${r.file}`)
  for (const issue of r.issues) {
    console.log(`       ${issue}`)
  }
}

console.log(`\n${results.filter(r => r.ok).length} passed, ${failures} failed`)

if (failures > 0) {
  console.log('\n❌ Some files have browser-incompatible code at import time.')
  console.log('   Fix top-level node:* imports and require() calls above.')
  process.exit(1)
} else {
  console.log('\n✅ All files pass browser compatibility checks.\n')
  process.exit(0)
}