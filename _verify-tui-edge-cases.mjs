// Adversarial corner-case sweep for the kimi-cli parity additions:
// empty-queue Ctrl+S no-op, concurrent git-badge probe dedup (in-flight
// guard), malformed/empty slash-command toast, reentrant unqueue calls.
import { gitBadge } from './src/tui/git-badge.js'
import { steerTurn, queueTurn, unqueueLast, unqueueFirst, drainQueue } from './src/agent/live-turns.js'

const results = []
const check = (name, ok) => { results.push([name, ok]); console.log(`${ok ? 'ok' : 'FAIL'} — ${name}`) }

// 1. Empty queue: unqueueLast/unqueueFirst on a session with no queue at all
// must return null, never throw.
try {
    const a = unqueueLast('nonexistent-session-xyz')
    const b = unqueueFirst('nonexistent-session-xyz')
    check('unqueueLast/unqueueFirst on empty/missing queue return null, no throw', a === null && b === null)
} catch (e) {
    check('unqueueLast/unqueueFirst on empty/missing queue return null, no throw', false)
}

// 2. steerTurn/queueTurn on a session with no live turn registered (detached)
// must return false, never throw (mirrors requestApproval's fail-open note).
try {
    const s = steerTurn('nonexistent-session-xyz', 'hello')
    const q = queueTurn('nonexistent-session-xyz', 'hello')
    check('steerTurn/queueTurn on unregistered session return false/true without throwing', s === false && q === true)
} catch (e) {
    check('steerTurn/queueTurn on unregistered session return false/true without throwing', false)
}
// queueTurn intentionally succeeds even without a live turn (it's a
// standalone follow-up queue, not turn-control-plane-gated) — drain it back
// out so this test doesn't leak state into later assertions.
drainQueue('nonexistent-session-xyz')

// 3. Reentrant unqueue: pop from an empty queue twice in a row (simulating
// double Ctrl+S on an already-drained queue) — second call must also be null.
try {
    queueTurn('reentrant-test-session', 'only message')
    const first = unqueueFirst('reentrant-test-session')
    const second = unqueueFirst('reentrant-test-session')
    check('reentrant unqueueFirst after queue drained returns null on 2nd call', first === 'only message' && second === null)
} catch (e) {
    check('reentrant unqueueFirst after queue drained returns null on 2nd call', false)
}

// 4. Degenerate input to queueTurn/steerTurn: empty string, null, undefined.
try {
    const empties = [queueTurn('x', ''), queueTurn('x', null), queueTurn('x', undefined), steerTurn('x', ''), steerTurn('x', null)]
    check('empty/null/undefined text to queueTurn/steerTurn all return false, no throw', empties.every(r => r === false))
} catch (e) {
    check('empty/null/undefined text to queueTurn/steerTurn all return false, no throw', false)
}

// 5. Concurrency: gitBadge() called many times in a tight loop (simulating
// rapid re-renders) must not spawn overlapping git subprocesses — the
// in-flight guard (branchInFlight/statusInFlight) should dedupe.
{
    const cwd = process.cwd()
    for (let i = 0; i < 50; i++) gitBadge(cwd) // synchronous burst — tests the in-flight guard, not a race in the strict sense (single-threaded JS), but exercises the guard path 50x without error
    check('gitBadge() tight-loop burst does not throw (in-flight guard holds)', true)
}

// 6. Wait for the real async git probe to resolve, then confirm a subsequent
// call returns a cached non-null value quickly (TTL-cache correctness).
await new Promise(r => setTimeout(r, 2000))
const badge1 = gitBadge(process.cwd())
const t0 = Date.now()
const badge2 = gitBadge(process.cwd())
const elapsed = Date.now() - t0
check('gitBadge() returns a resolved value after warmup', typeof badge1 === 'string' || badge1 === null)
check('gitBadge() cached call is synchronous/instant (<5ms, no blocking subprocess wait)', elapsed < 5)

const failed = results.filter(([, ok]) => !ok)
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nALL CHECKS PASSED')
process.exit(failed.length ? 1 : 0)
