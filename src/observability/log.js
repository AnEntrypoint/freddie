import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
import { redactSecrets } from '../auth.js'

const SEVERITIES = { debug: 10, info: 20, warning: 30, error: 40 }

// A safety net every subsystem's log file gets automatically, not an opt-in
// -- live-witnessed a subsystem growing to 240MB with no rotation ever
// having fired (see persistent-actor.js's own fix for what was CAUSING that
// specific case; this cap is the general backstop so a DIFFERENT subsystem
// hitting the same unbounded-growth shape for a different reason still gets
// caught). One rotated generation (<name>.log.1) is kept -- bounds total
// disk use per subsystem to ~2x this threshold rather than growing forever,
// without the complexity of a full generational scheme no consumer here needs.
const ROTATE_AT_BYTES = 25 * 1024 * 1024

let _streams = new Map()

function streamFor(name) {
    if (_streams.has(name)) return _streams.get(name)
    const dir = path.join(getFreddieHome(), 'logs')
    try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    const filePath = path.join(dir, `${name}.log`)
    let s
    if (typeof fs.createWriteStream === 'function') {
        // Track size in-memory rather than fs.statSync-ing before every
        // write -- a real subsystem can log at high volume, and a syscall
        // per line is real overhead a byte counter avoids. Seeded from the
        // file's actual on-disk size at stream-open time (the try/catch
        // covers a brand-new log with nothing to stat yet) so a process
        // restart doesn't reset the counter and let the file grow past the
        // threshold again before the next rotation check.
        // Rotation genuinely needs a fresh stream on a fresh path -- renaming
        // a file out from under an open write stream does NOT redirect that
        // stream to whatever new file later exists at the vacated path; the
        // stream's fd stays bound to the renamed file forever (live-verified:
        // an earlier draft assumed otherwise and it silently kept appending
        // to the ROTATED .1 file post-rotation, so the next rotation's own
        // unlinkSync of that same .1 path deleted the file still in use --
        // real, reproduced data loss). Close-then-reopen is therefore the
        // only correct approach; the two things that make it safe are a
        // BOUNDED pending-write buffer (an earlier draft's buffer had no cap
        // and could grow unboundedly during the close/rename/reopen window
        // under a write burst -- caught by adversarial review) and an error
        // listener + timeout on the new stream's open (so a failed open
        // can't leave `rotating` stuck true forever, which would hang
        // end()'s own drain-and-retry loop at process-shutdown time --
        // also caught by adversarial review). Both fixed below.
        let bytesWritten = 0
        try { bytesWritten = fs.statSync(filePath).size } catch {}
        let stream = fs.createWriteStream(filePath, { flags: 'a' })
        let rotating = false
        // Cap, not unbounded: past this many buffered lines mid-rotation,
        // drop the oldest rather than let a write burst turn the very
        // mechanism meant to bound memory into an unbounded buffer itself.
        // A drop here is lossy but bounded and rare (the rotation window is
        // normally well under this many writes); losing a handful of log
        // lines during a rotation is an acceptable tradeoff against the
        // alternative (unbounded growth) this whole file exists to prevent.
        const PENDING_CAP = 2000
        let pending = []
        let droppedWhileRotating = 0
        function beginRotation() {
            if (rotating) return
            rotating = true
            const finishedStream = stream
            // If the new stream never becomes usable (disk full, permission
            // denied, AV lock) neither 'open' nor 'error' firing would leave
            // `rotating` stuck true forever with the old code's naive retry
            // -- bound it with a hard timeout so end()'s rotating-check can
            // never hang process shutdown indefinitely.
            const failSafe = setTimeout(() => finishRotation(), 2000)
            let renamed = false
            function finishRotation() {
                clearTimeout(failSafe)
                if (!rotating) return // already finished via the other path
                rotating = false
                // Only zero the counter when the rename actually happened --
                // a failed rename (a real, reachable case on Windows: an AV
                // scanner or a tail-style reader holding the file open) falls
                // through to reopening the SAME still-oversized file below,
                // so the byte count must reflect that file's REAL size, not
                // pretend it shrank. Getting this wrong silently desyncs the
                // counter from reality: rotation would stop firing at the
                // intended threshold and only re-trigger after ANOTHER full
                // threshold's worth of growth stacks on top of the already-
                // oversized file -- the exact unbounded-growth failure mode
                // this whole mechanism exists to prevent, reintroduced via
                // the one path the happy-path tests never exercise.
                if (renamed) bytesWritten = 0
                else { try { bytesWritten = fs.statSync(filePath).size } catch { bytesWritten = 0 } }
                const flush = pending
                pending = []
                if (droppedWhileRotating > 0) {
                    flush.unshift(JSON.stringify({ ts: new Date().toISOString(), subsystem: name, severity: 'warning', msg: `log rotation buffer dropped ${droppedWhileRotating} line(s)` }) + '\n')
                    droppedWhileRotating = 0
                }
                for (const line of flush) { bytesWritten += Buffer.byteLength(line); stream.write(line) }
            }
            finishedStream.end(() => {
                try {
                    const rotatedPath = filePath + '.1'
                    try { fs.unlinkSync(rotatedPath) } catch {}
                    fs.renameSync(filePath, rotatedPath)
                    renamed = true
                } catch {
                    // Rename failed -- fall through and open a fresh stream
                    // on the SAME path regardless (appending to whatever is
                    // still there rather than losing the ability to log at
                    // all); the next threshold crossing retries rotation.
                }
                stream = fs.createWriteStream(filePath, { flags: 'a' })
                stream.once('error', finishRotation)
                stream.once('open', finishRotation)
            })
        }
        s = {
            write(line) {
                if (rotating) {
                    if (pending.length >= PENDING_CAP) { pending.shift(); droppedWhileRotating++ }
                    pending.push(line)
                    return
                }
                stream.write(line)
                bytesWritten += Buffer.byteLength(line)
                if (bytesWritten >= ROTATE_AT_BYTES) beginRotation()
            },
            end() {
                if (rotating) { setImmediate(() => this.end()); return }
                try { stream.end() } catch {}
            },
        }
    } else {
        // Browser fs shim without createWriteStream — fall back to console.
        s = { write(line) { try { console.log('[' + name + ']', line.trim()) } catch {} }, end() {} }
    }
    _streams.set(name, s)
    return s
}

// Every record written through this sink is redacted the same way every
// other durable-write boundary in this codebase already is (wire events,
// trajectory files, the approval classifier's LLM prompt, telemetry) --
// log.js is the one general-purpose sink every subsystem's logger() funnels
// through, so making it structurally safe here means no future call site
// needs to remember to pre-redact. redactSecrets never throws on its own
// (pure structural walk), so no best-effort guard is needed around it.
export function log({ subsystem = 'app', severity = 'info', msg = '', ...rest }) {
    const ts = new Date().toISOString()
    const redactedRest = redactSecrets(rest)
    const redactedMsg = typeof msg === 'string' ? redactSecrets(msg) : msg
    const rec = { ts, subsystem, severity, msg: redactedMsg, ...redactedRest }
    let line
    try {
        line = JSON.stringify(rec) + '\n'
    } catch (e) {
        line = JSON.stringify({ ts, subsystem, severity, msg: redactedMsg, logSerializationError: String(e?.message || e) }) + '\n'
    }
    streamFor(subsystem).write(line)
    if (SEVERITIES[severity] >= 30) streamFor('errors').write(line)
}

export function logger(subsystem) {
    return {
        debug: (msg, e = {}) => log({ subsystem, severity: 'debug', msg, ...e }),
        info: (msg, e = {}) => log({ subsystem, severity: 'info', msg, ...e }),
        warn: (msg, e = {}) => log({ subsystem, severity: 'warning', msg, ...e }),
        error: (msg, e = {}) => log({ subsystem, severity: 'error', msg, ...e }),
    }
}

export function closeAll() {
    for (const s of _streams.values()) s.end()
    _streams.clear()
}
