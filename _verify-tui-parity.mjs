// PTY witness for the kimi-cli parity additions in src/tui/app.js:
// Ctrl+S immediate-steer, Enter-mid-turn queue + toast for blocked slash
// commands, and status bar reflecting queued-message count. Spawns the real
// TUI (via launchTui) under node-pty exactly like _verify-tui-pty.mjs.
import pty from 'node-pty'

const COLS = 100
const ROWS = 30
const PROMPT = 'count slowly from 1 to 5, one number per line, waiting a beat between each'
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
        await sleep(200)
    }
    console.error(`TIMEOUT waiting for: ${label}`)
    return false
}

const results = []
const check = (name, ok) => { results.push([name, ok]); console.log(`${ok ? 'ok' : 'FAIL'} — ${name}`) }

// 1. Boot.
const booted = await waitFor(s => s.includes('ready') && s.includes('session'), 30000, 'boot chrome')
check('boot chrome', booted)

// 2. Start a long-ish turn.
child.write(PROMPT + '\r')
const busy = await waitFor(s => s.includes('busy'), 20000, 'busy state')
check('turn goes busy', busy)

// 3. Mid-turn: type a slash command that IS a real registered command and
// press Enter — must be blocked with a toast, never silently queued.
await sleep(500)
child.write('/help\r')
const toastSeen = await waitFor(s => s.includes('not available during streaming'), 5000, 'toast on blocked slash command')
check('slash command mid-turn shows toast, not queued', toastSeen)

// 4. Mid-turn: type plain text and press Enter — queues (status bar shows
// "queued 1"), not steered immediately.
child.write('remember this for later' + '\r')
const queuedSeen = await waitFor(s => s.includes('queued 1'), 5000, 'status bar shows queued count')
check('plain text mid-turn queues (status bar shows queued 1)', queuedSeen)

// 5. Ctrl+S on empty buffer with one queued message: pops and steers it —
// status bar's queued count drops back to not showing "queued 1", and the
// steered marker appears in the transcript.
child.write('\x13') // Ctrl+S
const steeredSeen = await waitFor(s => s.includes('(steered)'), 8000, 'ctrl+s steers queued message')
check('ctrl+s on empty buffer steers oldest queued message', steeredSeen)

// 6. Wait for turn to finish, back to ready.
const readyAgain = await waitFor(s => {
    const t = strip(raw)
    return t.lastIndexOf('ready') > t.indexOf('(steered)')
}, 60000, 'ready after turn')
check('status bar returns to ready after the turn', readyAgain)

// 7. Clean quit.
child.write('\x03')
const deadline = Date.now() + 15000
while (exited === null && Date.now() < deadline) await sleep(200)
check('ctrl+c quits; child exited', exited !== null)
check('child exit code 0', exited === 0)

if (exited === null) { try { child.kill() } catch { /* already gone */ } }
const failed = results.filter(([, ok]) => !ok)
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nALL CHECKS PASSED')
process.exit(failed.length ? 1 : 0)
