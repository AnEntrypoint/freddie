// PTY witness for the git branch badge in the TUI status line (src/tui/git-badge.js).
import pty from 'node-pty'
import { execSync } from 'node:child_process'

const COLS = 100
const ROWS = 30
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]|\x1b[>=]|\x1b_pi:c\x07/g, '')

const expectedBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim()
if (!expectedBranch) { console.log('no current branch (detached HEAD?) — skipping'); process.exit(0) }

const child = pty.spawn(process.execPath, ['_verify-tui-child.mjs'], {
    name: 'xterm-256color', cols: COLS, rows: ROWS, cwd: process.cwd(), env: process.env,
})

let raw = ''
let exited = null
child.onData(d => { raw += d })
child.onExit(({ exitCode }) => { exited = exitCode })

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function waitFor(pred, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (exited !== null) return false
        if (pred(strip(raw))) return true
        await sleep(200)
    }
    console.error(`TIMEOUT waiting for: ${label}`)
    return false
}

const results = []
const check = (name, ok) => { results.push([name, ok]); console.log(`${ok ? 'ok' : 'FAIL'} — ${name}`) }

const booted = await waitFor(s => s.includes('ready') && s.includes('session'), 30000, 'boot chrome')
check('boot chrome', booted)

// git-badge.js probes async on a 5s TTL from first statusText() call — wait
// past that window for the branch subprocess to resolve and land in the bar.
const badgeSeen = await waitFor(s => s.includes(expectedBranch), 10000, `branch badge "${expectedBranch}" in status bar`)
check(`status bar shows current branch "${expectedBranch}"`, badgeSeen)

child.write('\x03')
const deadline = Date.now() + 15000
while (exited === null && Date.now() < deadline) await sleep(200)
check('ctrl+c quits; child exited', exited !== null)
check('child exit code 0', exited === 0)

if (exited === null) { try { child.kill() } catch { /* already gone */ } }
const failed = results.filter(([, ok]) => !ok)
if (failed.length) {
    console.log('\n--- transcript tail ---')
    console.log(strip(raw).slice(-2000))
}
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nALL CHECKS PASSED')
process.exit(failed.length ? 1 : 0)
