import { execFile } from 'node:child_process'

// Cached, non-blocking git branch + dirty/ahead/behind badge for the TUI
// status line — kimi's _get_git_branch/_get_git_status/_format_git_badge
// (ui/shell/prompt.py) ported to the async-poll-cache pattern: a spawned
// subprocess is fire-and-forget, its result cached for TTL_MS, and a stale
// cache is served immediately while a fresh probe runs in the background.
// Never blocks status bar rendering on subprocess latency.
const BRANCH_TTL_MS = 5000
const STATUS_TTL_MS = 15000

let branch = null
let branchAt = 0
let branchInFlight = false

let dirty = false
let ahead = 0
let behind = 0
let statusAt = 0
let statusInFlight = false

function refreshBranch(cwd) {
    if (branchInFlight) return
    branchInFlight = true
    execFile('git', ['branch', '--show-current'], { cwd, timeout: 3000 }, (err, stdout) => {
        branchInFlight = false
        branchAt = Date.now()
        if (!err) branch = stdout.trim() || null
    })
}

function refreshStatus(cwd) {
    if (statusInFlight) return
    statusInFlight = true
    execFile('git', ['status', '--porcelain', '-b'], { cwd, timeout: 3000 }, (err, stdout) => {
        statusInFlight = false
        statusAt = Date.now()
        if (err) return
        let d = false, a = 0, b = 0
        for (const line of stdout.split('\n')) {
            if (line.startsWith('## ')) {
                const m = /\[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\]/.exec(line)
                if (m) { a = parseInt(m[1] || '0', 10); b = parseInt(m[2] || '0', 10) }
            } else if (line.trim()) d = true
        }
        dirty = d; ahead = a; behind = b
    })
}

// Returns the current cached badge text (e.g. "main [± ↑2]") or null before
// the first probe resolves. Triggers a background refresh when the cache
// entry is stale — caller should call this every status-bar render.
export function gitBadge(cwd) {
    const now = Date.now()
    if (now - branchAt > BRANCH_TTL_MS) refreshBranch(cwd)
    if (now - statusAt > STATUS_TTL_MS) refreshStatus(cwd)
    if (!branch) return null
    const parts = []
    if (dirty) parts.push('±')
    let sync = ''
    if (ahead) sync += `↑${ahead}`
    if (behind) sync += `↓${behind}`
    if (sync) parts.push(sync)
    return parts.length ? `${branch} [${parts.join(' ')}]` : branch
}
