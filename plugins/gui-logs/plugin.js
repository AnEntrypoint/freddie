// WS /api/logs/stream -- tails new lines appended to any *.log file under
// ~/.freddie/logs/ in real time, broadcasting to every connected client.
// Read-side listing already exists at GET /api/logs (subsystem list) + GET
// /api/logs/:subsystem (lines, optional ?max=&severity=) in
// plugins/gui-debug/plugin.js -- this plugin adds only the new live-tail
// capability, not a competing route.
//
// REAL BUG FOUND live (exec_js witness): fs.watch(dir) on this
// Windows/Node runtime fires exactly one 'rename' event when a log file is
// FIRST created via src/observability/log.js's fs.createWriteStream(...,
// {flags:'a'}), but subsequent .write() calls on that SAME open stream never
// emit a further 'change'/'rename' event -- confirmed by writing 3 lines
// through the real logger() and observing only 1 fs.watch event total, even
// though all 3 lines land on disk (readFileSync after the fact shows all
// 3). fs.watch is therefore unreliable as the SOLE trigger for tailing an
// append-mode write stream here; a periodic size-poll is layered on top as
// the correctness-bearing mechanism, with fs.watch kept as a low-latency
// fast path for the (also real, separately confirmed) new-file-created case.
//
// SECOND real bug found live: src/observability/log.js's own log() mirrors
// every severity>=warning record into BOTH <subsystem>.log AND errors.log --
// tailing "every *.log file" therefore delivers the identical record twice
// for any warning/error line (once from its origin file, once from the
// errors mirror). Deduped below by (ts+subsystem+severity+msg) within a
// short rolling window rather than dropping the errors.log mirror from the
// tail entirely, since a client watching only errors.log (future filtering)
// still needs it populated.
import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../src/home.js'

const POLL_MS = 500

function logsDir() { return path.join(getFreddieHome(), 'logs') }

export default {
    name: 'gui-logs',
    surfaces: 'gui',
    register({ gui }) {
        gui.wsRoute('/api/logs/stream', (ws) => {
            const dir = logsDir()
            fs.mkdirSync(dir, { recursive: true })
            const offsets = new Map()
            for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.log'))) {
                try { offsets.set(f, fs.statSync(path.join(dir, f)).size) } catch { offsets.set(f, 0) }
            }
            const recentKeys = []
            const seenRecently = new Set()
            function dedupeKey(rec) { return `${rec.ts}|${rec.subsystem}|${rec.severity}|${rec.msg}` }
            function alreadySent(rec) {
                const k = dedupeKey(rec)
                if (seenRecently.has(k)) return true
                seenRecently.add(k); recentKeys.push(k)
                if (recentKeys.length > 200) seenRecently.delete(recentKeys.shift())
                return false
            }

            function tail(fname) {
                const p = path.join(dir, fname)
                let size
                try { size = fs.statSync(p).size } catch { return }
                const from = offsets.get(fname) || 0
                if (size <= from) { offsets.set(fname, size); return }
                const fd = fs.openSync(p, 'r')
                const buf = Buffer.alloc(size - from)
                fs.readSync(fd, buf, 0, buf.length, from)
                fs.closeSync(fd)
                offsets.set(fname, size)
                for (const raw of buf.toString('utf8').split('\n')) {
                    if (!raw.trim()) continue
                    let rec
                    try { rec = JSON.parse(raw) } catch { continue }
                    if (alreadySent(rec)) continue
                    if (ws.readyState === 1) ws.send(JSON.stringify(rec))
                }
            }

            function pollAll() {
                let files
                try { files = fs.readdirSync(dir).filter(f => f.endsWith('.log')) } catch { return }
                for (const f of files) {
                    if (!offsets.has(f)) offsets.set(f, 0)
                    tail(f)
                }
            }

            const watcher = fs.watch(dir, (_event, filename) => {
                if (!filename || !filename.endsWith('.log')) return
                if (!offsets.has(filename)) offsets.set(filename, 0)
                tail(filename)
            })
            const poller = setInterval(pollAll, POLL_MS)
            ws.on('close', () => { watcher.close(); clearInterval(poller) })
            ws.on('error', () => { watcher.close(); clearInterval(poller) })
        })
    },
}
