import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RUNTIME = fileURLToPath(new URL('..', import.meta.url))
const work = join((await import('node:os')).tmpdir(), 'parity-bypass-' + process.pid)
mkdirSync(work, { recursive: true })
const aliases = JSON.parse(readFileSync(join(RUNTIME, 'src/aliases.json'), 'utf8'))
const specifierOf = Object.fromEntries(Object.entries(aliases).filter(([name]) => name.startsWith('node:')).map(([name, row]) => [row.seam, name]))
const missing = {}
const subpaths = {}
for (const [seam, specifier] of Object.entries(specifierOf)) {
  try {
    const namespace = await import(specifier)
    subpaths[seam] = seam === 'process' ? { ...namespace, process: namespace.default } : namespace
  } catch (error) {
    missing[specifier] = String(error?.message ?? error).slice(0, 200)
    subpaths[seam] = new Proxy({}, { get: (_, key) => { if (key === 'then') return undefined; throw new Error('missing module ' + specifier) } })
  }
}
globalThis.parityBypassSubpaths = subpaths
writeFileSync(join(work, 'subpaths.js'), 'export const subpaths = globalThis.parityBypassSubpaths\n')
copyFileSync(join(RUNTIME, 'test/parity-cases.js'), join(work, 'parity-cases.js'))
copyFileSync(join(RUNTIME, 'test/parity-expected.js'), join(work, 'parity-expected.js'))
const cases = await import(pathToFileURL(join(work, 'parity-cases.js')).href)
const timeoutMs = Number(process.env.CASE_TIMEOUT_MS ?? 20000)
let timedOut = []
for (const entry of cases.sharedCases) {
  const run = entry.run
  entry.run = () => Promise.race([Promise.resolve().then(run), new Promise((_, reject) => setTimeout(() => { timedOut.push(entry.name); reject(new Error('case timed out after ' + timeoutMs + ' ms')) }, timeoutMs).unref?.())])
}
let mismatches = []
let line = ''
const log = console.log
console.log = (...args) => { line = args.join(' '); log(...args) }
try {
  await cases.runParity(process.env.PARITY_LABEL ?? 'bypass', false)
} catch (error) {
  const text = String(error.message)
  const at = text.indexOf('parity failed: ')
  if (at < 0) { log('HARNESS_ERROR ' + text.slice(0, 500)); }
  else mismatches = JSON.parse(text.slice(at + 15)).mismatches
}
const byModule = {}
for (const { name } of mismatches) { const key = name.split(/[ .]/)[0]; byModule[key] = (byModule[key] ?? 0) + 1 }
const result = { runtime: process.versions, shared: cases.sharedCases.length, passed: cases.sharedCases.length - mismatches.length, failed: mismatches.length, missingModules: missing, failuresByModule: byModule, timedOut, mismatches: mismatches.map((m) => ({ name: m.name, got: JSON.stringify(m.got), expected: JSON.stringify(m.expected) })) }
writeFileSync(process.env.RESULT_FILE ?? join(work, 'result.json'), JSON.stringify(result, null, 1))
log('BYPASS_SUMMARY ' + JSON.stringify({ shared: result.shared, passed: result.passed, failed: result.failed, missing: Object.keys(missing), byModule }))
rmSync(work, { recursive: true, force: true })
process.exit(0)
