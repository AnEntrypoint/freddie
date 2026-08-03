// Adversarial degenerate-input sweep for the TUI's onLine()/toast() path:
// bare "/" with nothing after it, "/" followed only by whitespace, an
// unknown command typed mid-turn (must toast the SAME as a known one — no
// crash on resolveCommand returning null).
import pty from 'node-pty'

const COLS = 100
const ROWS = 30
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]|\x1b[>=]|\x1b_pi:c\x07/g, '')

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
        await sleep(150)
    }
    console.error(`TIMEOUT waiting for: ${label}`)
    return false
}

const results = []
const check = (name, ok) => { results.push([name, ok]); console.log(`${ok ? 'ok' : 'FAIL'} — ${name}`) }

const booted = await waitFor(s => s.includes('ready') && s.includes('session'), 30000, 'boot chrome')
check('boot chrome', booted)

// Start a turn so we're in the mid-turn toast path.
child.write('count slowly from 1 to 5, one number per line, waiting a beat between each\r')
const busy = await waitFor(s => s.includes('busy'), 20000, 'busy state')
check('turn goes busy', busy)
await sleep(500)

// Bare "/" — resolveCommand('/') should return null; line.slice(1).split(/\s+/)[0]
// is '' — toast text becomes "/ is not available during streaming". Must not crash.
child.write('/\r')
await sleep(500)
check('bare "/" mid-turn does not crash the process', exited === null)

// "/" + whitespace only.
child.write('/   \r')
await sleep(500)
check('"/" + whitespace-only mid-turn does not crash the process', exited === null)

// Unknown command mid-turn — must still toast, not throw.
child.write('/definitelynotarealcommand\r')
const toastSeen = await waitFor(s => s.includes('not available during streaming'), 5000, 'toast on unknown command')
check('unknown slash command mid-turn still shows the block toast (no crash)', toastSeen)
check('process still alive after all degenerate inputs', exited === null)

// Let the turn finish, then clean quit.
await waitFor(s => strip(raw).lastIndexOf('ready') > strip(raw).indexOf('busy'), 60000, 'ready after turn')
child.write('\x03')
const deadline = Date.now() + 15000
while (exited === null && Date.now() < deadline) await sleep(200)
check('ctrl+c quits cleanly after degenerate-input sweep', exited === 0)

if (exited === null) { try { child.kill() } catch { /* already gone */ } }
const failed = results.filter(([, ok]) => !ok)
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nALL CHECKS PASSED')
process.exit(failed.length ? 1 : 0)
