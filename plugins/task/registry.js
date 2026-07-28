// In-memory task registry shared by tools/task plugins and bash background mode.
// Browser-compatible: no fs, no node builtins beyond what ESM provides.
// Keyed by task_id; each task is a plain object with {id, status, output, stderr, ...}.
// Persisted to JSONL via store.js when filesystem is available.

import { persistTask, loadTasks, cleanCompleted as storeCleanCompleted, _rewriteAll } from './store.js'
import { notificationManager } from '../../src/agent/notifications.js'

const _tasks = new Map()
let _reconcileInterval = null

function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export function createTask(meta = {}) {
    const id = generateId()
    const task = {
        id,
        status: 'running',
        started: Date.now(),
        output: '',
        stderr: '',
        exitCode: null,
        error: null,
        description: null,
        pid: null,
        sessionId: null,
        _kill: null,
        ...meta,
    }
    _tasks.set(id, task)
    persistTask(task)
    return id
}

export function getTask(id) {
    return _tasks.get(id) || null
}

export function listTasks() {
    return [..._tasks.values()]
        .filter(t => t.status === 'running')
        .map(({ id, status, started, description }) => ({
            id, status, started, description: description || null,
        }))
}

export function listAllTasks() {
    return [..._tasks.values()].map(({ id, status, started, stopped, description, exitCode, error }) => ({
        id,
        status,
        started,
        stopped: stopped || null,
        description: description || null,
        exit_code: exitCode ?? null,
        error: error || null,
    }))
}

export function updateTask(id, updates) {
    const t = _tasks.get(id)
    if (t) {
        Object.assign(t, updates)
        persistTask(t)
        // Notify on terminal state transitions so the LLM learns about
        // background task completion on the next turn.
        if (updates.status && updates.status !== 'running') {
            notificationManager.notify('task_complete', `Background task ${id} completed: ${t.description || 'unnamed task'}`)
        }
    }
}

export function stopTask(id) {
    const t = _tasks.get(id)
    if (!t) return { error: `unknown task_id: ${id}` }
    if (typeof t._kill === 'function') {
        try { t._kill() } catch {}
    }
    t.status = 'stopped'
    t.stopped = Date.now()
    persistTask(t)
    return { task_id: id, stopped: true }
}

export function getTaskOutput(id) {
    const t = _tasks.get(id)
    if (!t) return { error: `unknown task_id: ${id}` }
    return {
        task_id: id,
        status: t.status,
        output: t.output || '',
        stderr: t.stderr || '',
        exit_code: t.exitCode ?? null,
        error: t.error || null,
    }
}

export function awaitTask(id, timeoutMs) {
    const t = _tasks.get(id)
    if (!t) return Promise.resolve({ error: `unknown task_id: ${id}` })
    if (t.status !== 'running') return Promise.resolve(getTaskOutput(id))
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(getTaskOutput(id)), timeoutMs)
        const check = () => {
            if (t.status !== 'running') {
                clearTimeout(timer)
                resolve(getTaskOutput(id))
            } else {
                setTimeout(check, 100)
            }
        }
        setTimeout(check, 100)
    })
}

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
    if (_reconcileInterval) return
    _reconcileInterval = setInterval(() => {
        reconcileTasks()
    }, intervalMs)
    if (typeof _reconcileInterval?.unref === 'function') {
        _reconcileInterval.unref()
    }
}

// Stop the periodic reconciliation interval.
export function stopPeriodicReconciliation() {
    if (_reconcileInterval) {
        clearInterval(_reconcileInterval)
        _reconcileInterval = null
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