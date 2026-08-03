// PTY witness for the pi-tui interactive surface (src/tui/app.js via
// launchTui). Spawns _verify-tui-child.mjs under node-pty (real TTY, so the
// TUI path — not the readline fallback — is exercised), sends a prompt,
// and asserts: boot chrome (welcome + status bar), busy state during the
// turn, the assistant answer in the transcript, ready state after, and a
// clean Ctrl-C quit with no orphan process.
import pty from 'node-pty'

const COLS = 100
const ROWS = 30
const PROMPT = 'what is 2+2? answer with just the number'
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]|\x1b[>=]|\x1b_pi:c\x07/g, '')

const child = pty.spawn(process.execPath, ['_verify-tui-child.mjs'], {
    name: 'xterm-256color', cols: COLS, rows: ROWS, cwd: process.cwd(), env: process.env,
})

let raw = ''
let exited = null
child.onData(d => { raw += d })
child.onExit(({ exitCode }) => { exited = exitCode })

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
// Poll the stripped output until pred holds or the deadline passes.
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

// 1. Boot: welcome banner + status bar shows ready with session/model.
const booted = await waitFor(s => s.includes('ready') && s.includes('session') && /Welcome to Freddie|Mono\.|Slate ready|Forge with Ares/.test(s), 30000, 'boot chrome')
check('boot: welcome + status bar (ready | session | model)', booted)

// 2. Send a prompt through the editor (Enter submits).
child.write(PROMPT + '\r')
const echoSeen = await waitFor(s => s.includes(PROMPT), 10000, 'prompt echo')
check('transcript echoes the user prompt', echoSeen)

// 3. Busy state while the turn runs (status bar flips, loader shows).
const busySeen = await waitFor(s => s.includes('busy'), 20000, 'busy state')
check('status bar shows busy during the turn', busySeen)

// 4. The assistant answer lands in the transcript (streamed deltas).
// Assert a line that is exactly "4" — a looser \D4\D match false-positives
// on the acptoapi chain log's "(4 working)".
const answerSeen = await waitFor(s => /^\s*4\s*$/m.test(s), 90000, 'assistant answer')
check('transcript shows the assistant answer', answerSeen)

// 5. Back to ready after the turn completes.
const readyAgain = await waitFor(s => {
    const t = strip(raw)
    return t.lastIndexOf('ready') > t.indexOf(PROMPT)
}, 60000, 'ready after turn')
check('status bar returns to ready after the turn', readyAgain)

// 6. Ctrl-C quits the TUI cleanly (no turn running), child exits.
child.write('\x03')
const deadline = Date.now() + 15000
while (exited === null && Date.now() < deadline) await sleep(200)
check('ctrl+c quits; child exited', exited !== null)
check('child exit code 0', exited === 0)

if (exited === null) { try { child.kill() } catch { /* already gone */ } }
const failed = results.filter(([, ok]) => !ok)
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nALL CHECKS PASSED')
process.exit(failed.length ? 1 : 0)
