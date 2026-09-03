import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getFreddieHome } from '../home.js'

// Matches pi-tui's Editor.addToHistory's own in-memory cap (editor.js:
// `if (this.history.length > 100) this.history.pop()`) -- keeping this
// number different would mean every app.js startup seeds up to 1000 lines
// through a method that only ever keeps the most recent 100, wasting 900
// calls for nothing every single launch. readline's own `history` option
// (interactive.js, the separate non-TTY fallback REPL) has no such cap of
// its own, so this number is this module's one authoritative bound either
// way.
const MAX_HISTORY_LINES = 100

function historyPath(cwd = process.cwd()) {
    const abs = path.resolve(cwd)
    const slug = crypto.createHash('sha256').update(abs).digest('hex').slice(0, 16)
    return path.join(getFreddieHome(), 'repl-history', `${slug}.json`)
}

export function loadHistory(cwd = process.cwd()) {
    const p = historyPath(cwd)
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
        return Array.isArray(raw) ? raw.slice(0, MAX_HISTORY_LINES) : []
    } catch { return [] }
}

export function saveHistory(lines, cwd = process.cwd()) {
    const p = historyPath(cwd)
    try {
        fs.mkdirSync(path.dirname(p), { recursive: true })
        // Write-to-temp-then-rename: a direct writeFileSync to the final path
        // left a partially-written file readable by loadHistory if the
        // process died mid-write (e.g. killed between the write's syscalls),
        // and JSON.parse on a truncated file throws, discarding the WHOLE
        // history rather than just the write that was in flight. rename is
        // atomic on both POSIX and NTFS for a same-directory move.
        const tmp = `${p}.${process.pid}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(lines.slice(0, MAX_HISTORY_LINES)))
        fs.renameSync(tmp, p)
    } catch { /* history persistence is best-effort */ }
}
