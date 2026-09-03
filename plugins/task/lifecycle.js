// Task lifecycle: restore/reconcile/cleanup/reset/clean + periodic reconciliation.
import { persistTask, loadTasks, cleanCompleted as storeCleanCompleted } from './store.js'
import { notificationManager } from '../../src/agent/notifications.js'
import { _tasks, _reconcileState } from './state.js'

// Restore persisted tasks from the JSONL store into the in-memory map.
// Called once on plugin load. Only restores non-terminal tasks (running) since
// completed/failed/timed_out/stopped tasks are historical and shouldn't be
// brought back as active.
// When sessionId is provided, only restores tasks for that session.
export async function restoreTasks(sessionId) {
    const stored = await loadTasks()
    const filtered = sessionId ? stored.filter(s => s.session_id === sessionId) : stored
    for (const s of filtered) {
        if (_tasks.has(s.id)) continue
        // Only restore tasks that were running at last shutdown — terminal
        // tasks are historical records, not live processes.
        if (s.status !== 'running') continue
        _tasks.set(s.id, {
            id: s.id,
            status: 'stopped', // no longer running after restart
            started: s.started,
            stopped: Date.now(),
            output: s.output_preview || '',
            stderr: '',
            exitCode: s.exit_code,
            error: s.error || 'task was interrupted by freddie restart',
            description: s.description,
            sessionId: s.session_id || null,
            pid: null,
            _kill: null,
        })
    }
    // Reconcile restored tasks so any stale entries are detected.
    reconcileTasks()
}

// Reconcile task state: detect stale tasks (process died), publish terminal
// notifications, and mark timed-out tasks. Browser-compatible: PID checking is
// Node-only; in the browser only timeout-based checks apply.
export function reconcileTasks() {
    const now = Date.now()
    const MAX_RUNNING_MS = 24 * 60 * 60 * 1000 // 24 hours
    let reconciled = 0
    let lost = 0
    let timedOut = 0

    for (const [id, t] of _tasks) {
        if (t.status !== 'running') continue

        // Check if the process is still alive (Node-only)
        let processDead = false
        if (t.pid != null) {
            try {
                // process.kill with signal 0 only checks existence, doesn't kill
                process.kill(t.pid, 0)
            } catch {
                processDead = true
            }
        }

        // Check timeout
        const runningMs = now - t.started
        const isTimedOut = runningMs > MAX_RUNNING_MS

        if (processDead) {
            t.status = 'lost'
            t.stopped = now
            t.error = 'process died unexpectedly'
            persistTask(t)
            notificationManager.notify('task_lost',
                `Background task ${id.slice(0, 8)} (${t.description || 'unnamed'}) was lost: the underlying process died.`)
            reconciled++
            lost++
        } else if (isTimedOut) {
            t.status = 'timed_out'
            t.stopped = now
            t.error = 'task exceeded 24 hour maximum runtime'
            persistTask(t)
            notificationManager.notify('task_timed_out',
                `Background task ${id.slice(0, 8)} (${t.description || 'unnamed'}) timed out after 24 hours.`)
            reconciled++
            timedOut++
        }
    }

    return { reconciled, lost, timed_out: timedOut }
}

// Remove tasks older than maxAgeHours (default 7 days) that are in terminal
// states. Running tasks are never cleaned up regardless of age.
export function cleanupStaleTasks(maxAgeHours = 168) {
    const now = Date.now()
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000
    const terminalStates = new Set(['completed', 'failed', 'lost', 'timed_out', 'stopped'])
    let cleaned = 0

    for (const [id, t] of _tasks) {
        if (!terminalStates.has(t.status)) continue
        if ((now - t.started) > maxAgeMs) {
            _tasks.delete(id)
            cleaned++
        }
    }

    return { cleaned }
}

// Start periodic reconciliation (default every 5 minutes).
// The interval is unref'd so it doesn't keep the process alive.
export function startPeriodicReconciliation(intervalMs = 5 * 60 * 1000) {
    if (_reconcileState.interval) return
    _reconcileState.interval = setInterval(() => {
        reconcileTasks()
    }, intervalMs)
    if (typeof _reconcileState.interval?.unref === 'function') {
        _reconcileState.interval.unref()
    }
}

// Stop the periodic reconciliation interval.
export function stopPeriodicReconciliation() {
    if (_reconcileState.interval) {
        clearInterval(_reconcileState.interval)
        _reconcileState.interval = null
    }
}

// Reset the registry to empty state (for testing).
export function reset() {
    _tasks.clear()
    stopPeriodicReconciliation()
}

// Remove completed and failed tasks from the in-memory map and persistent store.
export async function cleanCompleted() {
    const kept = []
    for (const [id, t] of _tasks) {
        if (t.status === 'completed' || t.status === 'failed' || t.status === 'timed_out' || t.status === 'stopped') {
            _tasks.delete(id)
        } else {
            kept.push(t)
        }
    }
    await storeCleanCompleted(kept)
}
