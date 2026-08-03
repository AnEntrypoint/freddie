// PTY witness for arrow/number-key approval navigation in src/tui/app.js
// (kimi parity: approval accepts up/down+enter and 1/2/3 alongside y/n/a).
//
// approval-grants.json (repo-root-scoped "always" grants) can pre-approve
// bash from an earlier interactive session, which would silently skip the
// gate this test exercises — back it up and clear it for the duration.
import fs from 'node:fs'
import pty from 'node-pty'

const GRANTS_PATH = './approval-grants.json'
const hadGrants = fs.existsSync(GRANTS_PATH)
const grantsBackup = hadGrants ? fs.readFileSync(GRANTS_PATH, 'utf8') : null
if (hadGrants) fs.rmSync(GRANTS_PATH)
const restoreGrants = () => {
    if (hadGrants) fs.writeFileSync(GRANTS_PATH, grantsBackup)
    else { try { fs.rmSync(GRANTS_PATH) } catch { /* never existed */ } }
}
process.on('exit', restoreGrants)

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
        await sleep(200)
    }
    console.error(`TIMEOUT waiting for: ${label}`)
    return false
}

const results = []
const check = (name, ok) => { results.push([name, ok]); console.log(`${ok ? 'ok' : 'FAIL'} — ${name}`) }

const booted = await waitFor(s => s.includes('ready') && s.includes('session'), 30000, 'boot chrome')
check('boot chrome', booted)

// Set 'all' approval mode — gates every tool call, removing dependency on
// the model choosing a specific mutating tool (bash) for a deterministic trigger.
child.write('/approve all\r')
const modeSet = await waitFor(s => s.includes('approval mode'), 8000, 'approve mode ack')
check('/approve mutating acknowledged', modeSet)

// Trigger a mutating tool call — ask the model to run a trivial bash command.
// Poll aggressively (50ms) right after send since the approval window can be
// short-lived once the model decides to call the tool.
child.write('run the shell command: echo hi-from-approval-test\r')
let approvalSeen = false
{
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
        if (exited !== null) break
        if (strip(raw).includes('APPROVAL PENDING')) { approvalSeen = true; break }
        await sleep(50)
    }
}
check('approval prompt appears for bash tool call', approvalSeen)

if (approvalSeen) {
    const beforePendingCount = (strip(raw).match(/APPROVAL PENDING/g) || []).length
    // Navigate with arrow keys: down (n) then down again (wraps to y), then enter.
    // APPROVAL_CHOICES = ['y','n','a']; cursor starts at 0 (y). down -> 1 (n). down -> 2 (a). down -> 0 (y, wrapped).
    child.write('\x1b[B') // down -> n
    await sleep(150)
    child.write('\x1b[B') // down -> a
    await sleep(150)
    child.write('\x1b[B') // down -> y (wrapped)
    await sleep(150)
    child.write('\r')     // enter confirms cursor selection (y)
    // Resolved: the live "APPROVAL PENDING" status line stops being the
    // MOST RECENT status-bar render (a later 'busy'/'ready' render follows).
    const resolved = await waitFor(s => {
        const lastPending = s.lastIndexOf('APPROVAL PENDING')
        const lastBusyOrReady = Math.max(s.lastIndexOf('| busy |'), s.lastIndexOf('busy | session'), s.lastIndexOf('ready | session'))
        return lastBusyOrReady > lastPending
    }, 15000, 'approval resolved via arrow+enter')
    check('arrow-navigate + enter resolves the approval (prompt clears)', resolved)
    check('tool actually ran (echoed output visible)', strip(raw).includes('hi-from-approval-test'))
} else {
    check('arrow-navigate + enter resolves the approval (prompt clears)', false)
}

const readyAgain = await waitFor(s => strip(raw).lastIndexOf('ready') > strip(raw).indexOf('APPROVAL PENDING'), 60000, 'ready after turn')
check('status bar returns to ready after the turn', readyAgain)

child.write('\x03')
const deadline = Date.now() + 15000
while (exited === null && Date.now() < deadline) await sleep(200)
check('ctrl+c quits; child exited', exited !== null)
check('child exit code 0', exited === 0)

if (exited === null) { try { child.kill() } catch { /* already gone */ } }
const failed = results.filter(([, ok]) => !ok)
if (failed.length && process.env.DEBUG_TRANSCRIPT) {
    console.log('\n--- transcript tail ---')
    console.log(strip(raw).slice(-4000))
}
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nALL CHECKS PASSED')
process.exit(failed.length ? 1 : 0)
