// Task CRUD: create/get/list/update/awaitTask.
import { persistTask } from './store.js'
import { notificationManager } from '../../src/agent/notifications.js'
import { _tasks, generateId } from './state.js'

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
