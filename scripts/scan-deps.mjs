// Dispatches gm's scan_deps verb (rs-plugkit's HiddenSpawn-class dropper
// detector: byte-size/line-count disproportion + \uXXXX identifier-escape
// density, survives literal C2/IP/cipher variance across samples) over the
// exec-spool file-drop protocol and exits non-zero on a real hit.
//
// Wired as `postinstall` so a freshly installed/updated node_modules tree
// is scanned before any build/dev command runs against it -- freddie's own
// vite.browser.config.js was compromised via this exact attack class twice
// (2026-08-09/10, then reinfected by 2026-08-14) through an unidentified
// node_modules install-time vector; this catches a reinfection the moment
// it happens instead of surfacing only when someone later notices a
// bloated file in a diff.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SESSION_ID = 'postinstall-scan-' + Date.now() + '-' + process.pid
const SPOOL_IN = path.join(ROOT, '.gm', 'exec-spool', 'in', 'scan_deps')
const SPOOL_OUT = path.join(ROOT, '.gm', 'exec-spool', 'out')
const TASK = `${SESSION_ID}-1`
const IN_FILE = path.join(SPOOL_IN, `${TASK}.txt`)
const OUT_FILE = path.join(SPOOL_OUT, `scan_deps-${TASK}.json`)
const TIMEOUT_MS = 120000
const POLL_MS = 500

const FULL = process.argv.includes('--full')

function skip(reason) {
    console.log(`[scan-deps] skipped: ${reason}`)
    process.exit(0)
}

function fail(reason) {
    console.error(`[scan-deps] FAILED (not skipped): ${reason}`)
    console.error('[scan-deps] a scanner that cannot run is not evidence the tree is clean -- fix the daemon/spool and rerun before trusting this install')
    process.exit(1)
}

if (!fs.existsSync(path.join(ROOT, '.gm'))) skip('no .gm/ directory -- gm not installed in this project')

fs.mkdirSync(SPOOL_IN, { recursive: true })
fs.mkdirSync(SPOOL_OUT, { recursive: true })
try { fs.unlinkSync(OUT_FILE) } catch { /* fresh run */ }
fs.writeFileSync(IN_FILE, JSON.stringify({ SESSION_ID, full: FULL }))

const deadline = Date.now() + TIMEOUT_MS
while (!fs.existsSync(OUT_FILE)) {
    if (Date.now() > deadline) fail('gm daemon did not respond within timeout -- watcher may not be running')
    await new Promise(r => setTimeout(r, POLL_MS))
}

const resp = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'))
const data = resp.data || {}
const { failCount = 0, warnCount = 0, blockedCount = 0, failing = [], blocked = [], nodeModulesTruncated = false } = data

if (warnCount > 0) {
    console.log(`[scan-deps] ${warnCount} size-ratio warning(s) -- usually legitimate minified/bundled deps, not blocking`)
}
if (nodeModulesTruncated) {
    console.log('[scan-deps] node_modules scan hit its bound -- not fully covered this pass, pass --full for an exhaustive sweep')
}
if (failCount > 0 || blockedCount > 0) {
    console.error(`[scan-deps] REAL HIT: failCount=${failCount} blockedCount=${blockedCount}`)
    for (const f of failing) console.error(`  fail: ${f.path} -- ${f.detail || ''}`)
    for (const b of blocked) console.error(`  blocked: ${b.path} -- ${b.detail || ''}`)
    console.error('[scan-deps] a blocked read is the AV/OS itself already flagging the file -- treat as evidence, not noise')
    process.exit(1)
}

console.log('[scan-deps] clean')
